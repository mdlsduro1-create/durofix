-- =====================================================================
-- PULSO 0002: programación de actividades por curso, recursos de
-- bienestar y chat con la profesional en salud mental.
-- Mismo modelo de seguridad que 0001: tablas sin privilegios para la
-- API, todo pasa por funciones que validan rol, estado y MFA.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Programación de actividades (cuándo se puede responder, por curso)
-- ---------------------------------------------------------------------
create table if not exists public.schedules (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course_id      uuid not null references public.courses(id) on delete cascade,
  kind           text not null check (kind in ('animo', 'gad7')),
  prompt         text check (prompt is null or char_length(prompt) between 3 and 140),
  mode           text not null check (mode in ('unica', 'recurrente')),
  starts_on      date not null,
  ends_on        date,
  days           smallint[] not null default '{1,2,3,4,5}',
  time_from      time not null,
  time_to        time not null,
  active         boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (time_to > time_from),
  check (ends_on is null or ends_on >= starts_on),
  check (days <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(days) between 1 and 7)
);
create index if not exists schedules_course_idx on public.schedules (course_id, kind) where active;
alter table public.schedules enable row level security;

-- GAD-7: ahora cada respuesta pertenece a una aplicación programada y a un día.
alter table public.gad_results add column if not exists day date;
alter table public.gad_results add column if not exists schedule_id uuid references public.schedules(id) on delete set null;
update public.gad_results set day = date '2026-01-05' + period * 14 where day is null;
alter table public.gad_results alter column day set default private.today();
alter table public.gad_results alter column day set not null;
create index if not exists gad_inst_day_idx on public.gad_results (institution_id, day);

-- Ahora en La Paz (hora local)
create or replace function private.now_local() returns timestamp
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/La_Paz')
$$;

-- ¿Aplica una programación en una fecha dada?
create or replace function private.sched_on(s public.schedules, d date) returns boolean
language sql immutable set search_path = '' as $$
  select s.active and case
    when s.mode = 'unica' then d = s.starts_on
    else d >= s.starts_on and (s.ends_on is null or d <= s.ends_on)
         and extract(isodow from d)::smallint = any (s.days)
  end
$$;

-- Ventana abierta ahora para un curso y tipo de actividad
create or replace function private.open_schedule(p_course uuid, p_kind text) returns public.schedules
language sql stable security definer set search_path = '' as $$
  select s.* from public.schedules s
  where s.course_id = p_course and s.kind = p_kind
    and private.sched_on(s, private.now_local()::date)
    and private.now_local()::time between s.time_from and s.time_to
  order by s.time_to
  limit 1
$$;

-- ---------------------------------------------------------------------
-- Recursos de bienestar publicados por la institución
-- ---------------------------------------------------------------------
create table if not exists public.resources (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course_id      uuid references public.courses(id) on delete cascade,
  kind           text not null check (kind in ('lectura', 'recomendacion', 'enlace')),
  title          text not null check (char_length(title) between 3 and 100),
  body           text check (body is null or char_length(body) <= 2000),
  url            text check (url is null or (url ~ '^https://[^\s<>"]+$' and char_length(url) <= 300)),
  pinned         boolean not null default false,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
alter table public.resources enable row level security;

-- ---------------------------------------------------------------------
-- Chat con la profesional (solo si ella lo activa)
-- ---------------------------------------------------------------------
alter table public.institutions add column if not exists chat_enabled boolean not null default false;
alter table public.institutions add column if not exists chat_hours text not null default '' check (char_length(chat_hours) <= 120);

create table if not exists public.chat_threads (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references public.institutions(id) on delete cascade,
  student_id       uuid not null references public.profiles(id) on delete cascade,
  status           text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  created_at       timestamptz not null default now(),
  last_at          timestamptz not null default now(),
  student_read_at  timestamptz not null default now(),
  staff_read_at    timestamptz not null default 'epoch'
);
create unique index if not exists chat_one_open on public.chat_threads (student_id) where status = 'abierta';
alter table public.chat_threads enable row level security;

create table if not exists public.chat_messages (
  id           bigint generated always as identity primary key,
  thread_id    uuid not null references public.chat_threads(id) on delete cascade,
  from_student boolean not null,
  sender_id    uuid references public.profiles(id) on delete set null,
  body         text not null check (char_length(body) between 1 and 1000),
  created_at   timestamptz not null default now()
);
create index if not exists chat_messages_thread_idx on public.chat_messages (thread_id, id);
alter table public.chat_messages enable row level security;

-- =====================================================================
-- Funciones
-- =====================================================================

-- Contexto: se agrega si el chat está activo
create or replace function public.my_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'role', p.role,
    'status', p.status,
    'must_change_password', p.must_change_password,
    'username', p.username,
    'display_name', p.display_name,
    'mfa_required', p.role in ('owner', 'admin', 'profesional'),
    'course', (select jsonb_build_object('id', c.id, 'name', c.name) from public.courses c where c.id = p.course_id),
    'institution', (select jsonb_build_object('id', i.id, 'name', i.name, 'slug', i.slug, 'status', i.status, 'city', i.city,
                                              'min_k', i.min_k, 'help_name', i.help_name, 'help_line', i.help_line, 'help_wa', i.help_wa,
                                              'chat_enabled', i.chat_enabled, 'chat_hours', i.chat_hours)
                    from public.institutions i where i.id = p.institution_id)
  )
  from public.profiles p where p.id = auth.uid()
$$;

-- ---------------------------------------------------------------- estudiante
create or replace function public.student_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; d date := private.today(); t time := private.now_local()::time;
begin
  me := private.require(array['estudiante']::public.user_role[]);
  return jsonb_build_object(
    'today', d,
    'now', to_char(t, 'HH24:MI'),
    'open', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'prompt', s.prompt, 'until', to_char(s.time_to, 'HH24:MI'),
        'done', case when s.kind = 'animo'
                     then exists (select 1 from public.checkins where token = private.tok('ci', me.id, d::text))
                     else exists (select 1 from public.gad_results where token = private.tok('gad', me.id, s.id::text || ':' || d::text)) end,
        'value', case when s.kind = 'animo' then (select value from public.checkins where token = private.tok('ci', me.id, d::text)) end
      ) order by s.time_to)
      from public.schedules s
      where s.course_id = me.course_id and private.sched_on(s, d) and t between s.time_from and s.time_to), '[]'::jsonb),
    'upcoming', coalesce((
      select jsonb_agg(x order by x ->> 'date', x ->> 'from') from (
        select distinct on (dd.dday, s.kind)
               jsonb_build_object('kind', s.kind, 'date', dd.dday, 'from', to_char(s.time_from, 'HH24:MI'), 'to', to_char(s.time_to, 'HH24:MI')) as x
        from public.schedules s
        cross join lateral (select (d + g)::date as dday from generate_series(0, 7) g) dd
        where s.course_id = me.course_id and private.sched_on(s, dd.dday)
          and (dd.dday > d or s.time_from > t)
        order by dd.dday, s.kind, s.time_from
      ) q), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'created_at', r.created_at) order by r.created_at desc)
                          from public.help_requests r where r.student_id = me.id and r.created_at > now() - interval '60 days'), '[]'::jsonb)
  );
end $$;

create or replace function public.student_checkin(p_value integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; d date := private.today(); s public.schedules;
begin
  me := private.require(array['estudiante']::public.user_role[]);
  if p_value is null or p_value not between 1 and 5 then raise exception 'valor_invalido'; end if;
  if me.course_id is null then raise exception 'sin_curso'; end if;
  s := private.open_schedule(me.course_id, 'animo');
  if s.id is null then raise exception 'fuera_de_horario'; end if;
  insert into public.checkins (token, institution_id, course_id, day, value)
  values (private.tok('ci', me.id, d::text), me.institution_id, me.course_id, d, p_value)
  on conflict (token) do update set value = excluded.value;
  return jsonb_build_object('ok', true, 'low', p_value <= 2);
end $$;

create or replace function public.student_gad(p_answers integer[])
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; d date := private.today(); s integer := 0; x integer; sc public.schedules;
begin
  me := private.require(array['estudiante']::public.user_role[]);
  if p_answers is null or array_length(p_answers, 1) <> 7 then raise exception 'respuestas_invalidas'; end if;
  foreach x in array p_answers loop
    if x is null or x not between 0 and 3 then raise exception 'respuestas_invalidas'; end if;
    s := s + x;
  end loop;
  if me.course_id is null then raise exception 'sin_curso'; end if;
  sc := private.open_schedule(me.course_id, 'gad7');
  if sc.id is null then raise exception 'fuera_de_horario'; end if;
  insert into public.gad_results (token, institution_id, course_id, period, score, day, schedule_id)
  values (private.tok('gad', me.id, sc.id::text || ':' || d::text), me.institution_id, me.course_id, private.period(d), s, d, sc.id)
  on conflict (token) do nothing;
  if not found then raise exception 'gad_ya_respondido'; end if;
  return jsonb_build_object('ok', true, 'suggest_talk', s >= 10);
end $$;

create or replace function public.student_resources()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['estudiante']::public.user_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'title', r.title, 'body', r.body, 'url', r.url, 'pinned', r.pinned, 'created_at', r.created_at)
                     order by r.pinned desc, r.created_at desc)
    from public.resources r
    where r.institution_id = me.institution_id and (r.course_id is null or r.course_id = me.course_id)), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- programación (administración y profesional)
create or replace function public.sched_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['admin', 'profesional']::public.user_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'course_id', s.course_id, 'course', c.name, 'kind', s.kind, 'prompt', s.prompt, 'mode', s.mode,
      'starts_on', s.starts_on, 'ends_on', s.ends_on, 'days', s.days,
      'from', to_char(s.time_from, 'HH24:MI'), 'to', to_char(s.time_to, 'HH24:MI'), 'active', s.active,
      'open_now', private.sched_on(s, private.today()) and private.now_local()::time between s.time_from and s.time_to,
      'by', coalesce(p.display_name, 'Personal')
    ) order by c.name, s.kind, s.time_from)
    from public.schedules s join public.courses c on c.id = s.course_id
    left join public.profiles p on p.id = s.created_by
    where s.institution_id = me.institution_id), '[]'::jsonb);
end $$;

create or replace function public.sched_save(
  p_id uuid, p_courses uuid[], p_kind text, p_prompt text, p_mode text,
  p_starts date, p_ends date, p_days integer[], p_from text, p_to text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; c uuid; n integer := 0; v_from time; v_to time; v_days smallint[];
begin
  me := private.require(array['admin', 'profesional']::public.user_role[]);
  if p_kind not in ('animo', 'gad7') or p_mode not in ('unica', 'recurrente') then raise exception 'datos_invalidos'; end if;
  begin
    v_from := p_from::time; v_to := p_to::time;
  exception when others then raise exception 'datos_invalidos';
  end;
  if v_to <= v_from or p_starts is null or (p_ends is not null and p_ends < p_starts) then raise exception 'datos_invalidos'; end if;
  if p_mode = 'unica' then v_days := array[extract(isodow from p_starts)::smallint];
  else
    select array_agg(distinct x::smallint order by x::smallint) into v_days from unnest(coalesce(p_days, '{}')) x where x between 1 and 7;
    if v_days is null then raise exception 'datos_invalidos'; end if;
  end if;
  if p_id is not null then
    update public.schedules
       set kind = p_kind, prompt = nullif(left(trim(coalesce(p_prompt, '')), 140), ''), mode = p_mode,
           starts_on = p_starts, ends_on = case when p_mode = 'unica' then null else p_ends end,
           days = v_days, time_from = v_from, time_to = v_to
     where id = p_id and institution_id = me.institution_id;
    if not found then raise exception 'programacion_no_encontrada'; end if;
    perform private.audit(me.id, me.institution_id, 'programacion_editada', jsonb_build_object('tipo', p_kind));
    return jsonb_build_object('ok', true, 'saved', 1);
  end if;
  if p_courses is null or cardinality(p_courses) = 0 then raise exception 'datos_invalidos'; end if;
  if (select count(*) from public.schedules where institution_id = me.institution_id) + cardinality(p_courses) > 400 then
    raise exception 'limite_programaciones';
  end if;
  foreach c in array p_courses loop
    if not exists (select 1 from public.courses where id = c and institution_id = me.institution_id) then
      raise exception 'curso_no_encontrado';
    end if;
    insert into public.schedules (institution_id, course_id, kind, prompt, mode, starts_on, ends_on, days, time_from, time_to, created_by)
    values (me.institution_id, c, p_kind, nullif(left(trim(coalesce(p_prompt, '')), 140), ''), p_mode, p_starts,
            case when p_mode = 'unica' then null else p_ends end, v_days, v_from, v_to, me.id);
    n := n + 1;
  end loop;
  perform private.audit(me.id, me.institution_id, 'programacion_creada', jsonb_build_object('tipo', p_kind, 'cursos', n));
  return jsonb_build_object('ok', true, 'saved', n);
end $$;

create or replace function public.sched_set(p_id uuid, p_action text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['admin', 'profesional']::public.user_role[]);
  if p_action = 'pausar' then
    update public.schedules set active = false where id = p_id and institution_id = me.institution_id;
  elsif p_action = 'activar' then
    update public.schedules set active = true where id = p_id and institution_id = me.institution_id;
  elsif p_action = 'borrar' then
    delete from public.schedules where id = p_id and institution_id = me.institution_id;
  else raise exception 'accion_invalida';
  end if;
  if not found then raise exception 'programacion_no_encontrada'; end if;
  perform private.audit(me.id, me.institution_id, 'programacion_' || p_action, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- recursos (administración y profesional)
create or replace function public.res_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['admin', 'profesional']::public.user_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'title', r.title, 'body', r.body, 'url', r.url, 'pinned', r.pinned,
                                        'course_id', r.course_id, 'course', c.name, 'created_at', r.created_at, 'by', coalesce(p.display_name, 'Personal'))
                     order by r.pinned desc, r.created_at desc)
    from public.resources r left join public.courses c on c.id = r.course_id left join public.profiles p on p.id = r.created_by
    where r.institution_id = me.institution_id), '[]'::jsonb);
end $$;

create or replace function public.res_save(p_id uuid, p_kind text, p_title text, p_body text, p_url text, p_course uuid, p_pinned boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; v_url text := nullif(trim(coalesce(p_url, '')), '');
begin
  me := private.require(array['admin', 'profesional']::public.user_role[]);
  if p_kind not in ('lectura', 'recomendacion', 'enlace') or char_length(trim(coalesce(p_title, ''))) < 3 then raise exception 'datos_invalidos'; end if;
  if v_url is not null and v_url !~ '^https://[^\s<>"]+$' then raise exception 'enlace_invalido'; end if;
  if p_course is not null and not exists (select 1 from public.courses where id = p_course and institution_id = me.institution_id) then
    raise exception 'curso_no_encontrado';
  end if;
  if p_id is null then
    if (select count(*) from public.resources where institution_id = me.institution_id) >= 300 then raise exception 'limite_recursos'; end if;
    insert into public.resources (institution_id, course_id, kind, title, body, url, pinned, created_by)
    values (me.institution_id, p_course, p_kind, left(trim(p_title), 100), nullif(left(trim(coalesce(p_body, '')), 2000), ''), v_url, coalesce(p_pinned, false), me.id);
  else
    update public.resources set course_id = p_course, kind = p_kind, title = left(trim(p_title), 100),
           body = nullif(left(trim(coalesce(p_body, '')), 2000), ''), url = v_url, pinned = coalesce(p_pinned, false)
     where id = p_id and institution_id = me.institution_id;
    if not found then raise exception 'recurso_no_encontrado'; end if;
  end if;
  perform private.audit(me.id, me.institution_id, 'recurso_guardado', jsonb_build_object('titulo', left(trim(p_title), 100)));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.res_delete(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['admin', 'profesional']::public.user_role[]);
  delete from public.resources where id = p_id and institution_id = me.institution_id;
  if not found then raise exception 'recurso_no_encontrado'; end if;
  perform private.audit(me.id, me.institution_id, 'recurso_borrado', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- chat
-- Nada del contenido del chat se registra en la bitácora.
create or replace function public.student_chat_state()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; i public.institutions; th public.chat_threads;
begin
  me := private.require(array['estudiante']::public.user_role[]);
  select * into i from public.institutions where id = me.institution_id;
  select * into th from public.chat_threads where student_id = me.id order by (status = 'abierta') desc, last_at desc limit 1;
  if th.id is not null then
    update public.chat_threads set student_read_at = now() where id = th.id;
  end if;
  return jsonb_build_object(
    'enabled', i.chat_enabled, 'hours', i.chat_hours,
    'thread', case when th.id is null then null else jsonb_build_object('id', th.id, 'status', th.status) end,
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'mine', m.from_student, 'body', m.body, 'at', m.created_at) order by m.id)
                          from (select * from public.chat_messages where thread_id = th.id order by id desc limit 150) m), '[]'::jsonb));
end $$;

create or replace function public.student_chat_send(p_body text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; v_body text := left(trim(coalesce(p_body, '')), 1000); th uuid;
begin
  me := private.require(array['estudiante']::public.user_role[]);
  if not (select chat_enabled from public.institutions where id = me.institution_id) then raise exception 'chat_inactivo'; end if;
  if v_body = '' then raise exception 'mensaje_vacio'; end if;
  if (select count(*) from public.chat_messages m join public.chat_threads t on t.id = m.thread_id
      where t.student_id = me.id and m.from_student and m.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'limite_mensajes';
  end if;
  select id into th from public.chat_threads where student_id = me.id and status = 'abierta';
  if th is null then
    insert into public.chat_threads (institution_id, student_id) values (me.institution_id, me.id) returning id into th;
  end if;
  insert into public.chat_messages (thread_id, from_student, sender_id, body) values (th, true, me.id, v_body);
  update public.chat_threads set last_at = now(), student_read_at = now() where id = th;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pro_chat_settings(p_enabled boolean, p_hours text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['profesional']::public.user_role[]);
  update public.institutions set chat_enabled = coalesce(p_enabled, false), chat_hours = left(trim(coalesce(p_hours, '')), 120)
   where id = me.institution_id;
  perform private.audit(me.id, me.institution_id, case when p_enabled then 'chat_activado' else 'chat_desactivado' end, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pro_chat_threads()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['profesional']::public.user_role[]);
  return jsonb_build_object(
    'enabled', (select chat_enabled from public.institutions where id = me.institution_id),
    'hours', (select chat_hours from public.institutions where id = me.institution_id),
    'threads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'username', p.username, 'course', c.name, 'status', t.status, 'last_at', t.last_at,
        'unread', (select count(*) from public.chat_messages m where m.thread_id = t.id and m.from_student and m.created_at > t.staff_read_at),
        'preview', (select left(m.body, 80) from public.chat_messages m where m.thread_id = t.id order by m.id desc limit 1)
      ) order by (t.status = 'abierta') desc, t.last_at desc)
      from public.chat_threads t join public.profiles p on p.id = t.student_id left join public.courses c on c.id = p.course_id
      where t.institution_id = me.institution_id and t.last_at > now() - interval '120 days'), '[]'::jsonb));
end $$;

create or replace function public.pro_chat_messages(p_thread uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; th public.chat_threads;
begin
  me := private.require(array['profesional']::public.user_role[]);
  select * into th from public.chat_threads where id = p_thread and institution_id = me.institution_id;
  if th.id is null then raise exception 'conversacion_no_encontrada'; end if;
  update public.chat_threads set staff_read_at = now() where id = th.id;
  return jsonb_build_object(
    'id', th.id, 'status', th.status,
    'username', (select username from public.profiles where id = th.student_id),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'mine', not m.from_student, 'body', m.body, 'at', m.created_at,
                                                                'who', case when m.from_student then null else coalesce(p.display_name, 'Profesional') end) order by m.id)
                          from (select * from public.chat_messages where thread_id = th.id order by id desc limit 300) m
                          left join public.profiles p on p.id = m.sender_id), '[]'::jsonb));
end $$;

create or replace function public.pro_chat_send(p_thread uuid, p_body text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; v_body text := left(trim(coalesce(p_body, '')), 1000);
begin
  me := private.require(array['profesional']::public.user_role[]);
  if v_body = '' then raise exception 'mensaje_vacio'; end if;
  if not exists (select 1 from public.chat_threads where id = p_thread and institution_id = me.institution_id and status = 'abierta') then
    raise exception 'conversacion_no_encontrada';
  end if;
  insert into public.chat_messages (thread_id, from_student, sender_id, body) values (p_thread, false, me.id, v_body);
  update public.chat_threads set last_at = now(), staff_read_at = now() where id = p_thread;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pro_chat_status(p_thread uuid, p_status text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; v_student uuid;
begin
  me := private.require(array['profesional']::public.user_role[]);
  if p_status not in ('abierta', 'cerrada') then raise exception 'accion_invalida'; end if;
  select student_id into v_student from public.chat_threads where id = p_thread and institution_id = me.institution_id;
  if v_student is null then raise exception 'conversacion_no_encontrada'; end if;
  if p_status = 'abierta' and exists (select 1 from public.chat_threads where student_id = v_student and status = 'abierta' and id <> p_thread) then
    raise exception 'accion_invalida';
  end if;
  update public.chat_threads set status = p_status where id = p_thread;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- semáforo con GAD-7 por días cerrados
create or replace function public.pro_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; k integer; d date := private.today(); res jsonb;
begin
  me := private.require(array['profesional', 'admin']::public.user_role[]);
  k := private.kmin(me.institution_id);
  with days as (
    select c.course_id, c.day, count(*) as n, sum(c.value) as s
    from public.checkins c
    where c.institution_id = me.institution_id and c.day between d - 7 and d
    group by 1, 2
  ), win as (
    select course_id,
           sum(n) filter (where n >= k and day < d) as n_ok,
           sum(s) filter (where n >= k and day < d) as s_ok,
           count(*) filter (where n >= k and day < d) as ok_days,
           count(*) filter (where n < k and day < d) as prot_days,
           max(n) filter (where day = d) as today_n,
           max(case when day = d and n >= k then private.level(s::numeric / n) end) as today_level
    from days group by 1
  ), g as (
    -- Últimos 14 días cerrados: el día en curso no se cuenta (antidiferenciación)
    select course_id, count(*) as gn, count(*) filter (where score >= 10) as gh
    from public.gad_results
    where institution_id = me.institution_id and day between d - 14 and d - 1
    group by 1
  ), st as (
    select course_id, count(*) as enrolled from public.profiles
    where institution_id = me.institution_id and role = 'estudiante' and status = 'activa'
    group by 1
  )
  select jsonb_build_object(
    'k', k, 'today', d,
    'courses', coalesce(jsonb_agg(jsonb_build_object(
        'id', co.id, 'name', co.name,
        'enrolled', coalesce(st.enrolled, 0),
        'today_n', coalesce(w.today_n, 0),
        'today_level', w.today_level,
        'avg7', case when coalesce(w.n_ok, 0) > 0 then round(w.s_ok::numeric / w.n_ok, 2) end,
        'n7', coalesce(w.n_ok, 0),
        'ok_days', coalesce(w.ok_days, 0),
        'prot_days', coalesce(w.prot_days, 0),
        'gad_n', case when coalesce(g.gn, 0) >= k then g.gn else 0 end,
        'gad_high', case when coalesce(g.gn, 0) >= k then g.gh end,
        'scheduled_today', exists (select 1 from public.schedules s where s.course_id = co.id and private.sched_on(s, d))
      ) order by co.name), '[]'::jsonb),
    'pending_requests', (select count(*) from public.help_requests where institution_id = me.institution_id and status = 'pendiente'),
    'unread_chats', case when me.role = 'profesional' then (
        select count(*) from public.chat_threads t where t.institution_id = me.institution_id and t.status = 'abierta'
           and exists (select 1 from public.chat_messages m where m.thread_id = t.id and m.from_student and m.created_at > t.staff_read_at)) end
  ) into res
  from public.courses co
  left join win w on w.course_id = co.id
  left join g on g.course_id = co.id
  left join st on st.course_id = co.id
  where co.institution_id = me.institution_id;
  return res;
end $$;

-- ---------------------------------------------------------------- borrado total incluye chats
create or replace function public.admin_purge_data()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; a integer; b integer; c integer; d integer; e integer;
begin
  me := private.require(array['admin']::public.user_role[]);
  delete from public.checkins where institution_id = me.institution_id; get diagnostics a = row_count;
  delete from public.gad_results where institution_id = me.institution_id; get diagnostics b = row_count;
  delete from public.help_requests where institution_id = me.institution_id; get diagnostics c = row_count;
  delete from public.attendance where institution_id = me.institution_id; get diagnostics d = row_count;
  delete from public.chat_threads where institution_id = me.institution_id; get diagnostics e = row_count;
  perform private.audit(me.id, me.institution_id, 'datos_borrados',
                        jsonb_build_object('registros', a, 'cuestionarios', b, 'solicitudes', c, 'asistencia', d, 'conversaciones', e));
  return jsonb_build_object('checkins', a, 'gad', b, 'requests', c, 'attendance', d, 'chats', e);
end $$;

-- =====================================================================
-- Privilegios
-- =====================================================================
revoke all on public.schedules, public.resources, public.chat_threads, public.chat_messages from public;
revoke all on all sequences in schema public from public;
revoke all on all functions in schema public from public;
revoke all on all functions in schema private from public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.schedules, public.resources, public.chat_threads, public.chat_messages from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke all on all functions in schema private from %I', r);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.check_join(text, text), public.check_invite(text) to anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function
      public.check_join(text, text), public.check_invite(text), public.my_context(),
      public.student_state(), public.student_checkin(integer), public.student_gad(integer[]),
      public.student_request_help(text, text), public.student_resources(),
      public.student_chat_state(), public.student_chat_send(text),
      public.teacher_courses_list(), public.course_view(uuid),
      public.pro_overview(), public.pro_weeks(integer), public.pro_correlation(integer),
      public.pro_requests(), public.pro_update_request(uuid, public.req_status, text, text),
      public.pro_chat_settings(boolean, text), public.pro_chat_threads(), public.pro_chat_messages(uuid),
      public.pro_chat_send(uuid, text), public.pro_chat_status(uuid, text),
      public.sched_list(), public.sched_save(uuid, uuid[], text, text, text, date, date, integer[], text, text), public.sched_set(uuid, text),
      public.res_list(), public.res_save(uuid, text, text, text, text, uuid, boolean), public.res_delete(uuid),
      public.admin_overview(), public.admin_members(text), public.admin_set_member_status(uuid, public.acct_status),
      public.admin_set_member_course(uuid, uuid), public.admin_create_course(text), public.admin_course_code(uuid, text),
      public.admin_create_invite(public.user_role, uuid), public.admin_assign_teacher(uuid, uuid, boolean),
      public.admin_update_settings(integer, text, text, text), public.admin_set_attendance(jsonb),
      public.admin_reset_password(uuid), public.admin_purge_data(), public.admin_audit(integer),
      public.owner_institutions(text), public.owner_review(uuid, public.inst_status, text)
    to authenticated;
  end if;
end $$;
