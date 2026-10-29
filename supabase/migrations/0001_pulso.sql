-- =====================================================================
-- PULSO · Esquema de base de datos
-- Plataforma institucional de detección temprana de ansiedad escolar.
--
-- Modelo de seguridad (resumen; detalle en SECURITY.md):
--   * Ninguna tabla es accesible directamente desde la API: RLS activado
--     sin políticas y privilegios revocados para anon y authenticated.
--   * Todo acceso pasa por funciones SECURITY DEFINER que verifican la
--     sesión, el rol, el estado de la cuenta, el estado de la institución
--     y el segundo factor (AAL2) cuando el rol lo exige.
--   * Los registros emocionales se guardan sin el id del estudiante, con
--     una huella HMAC que cambia cada día y cuya clave vive en un esquema
--     privado que la API no expone.
--   * Los promedios solo se entregan cuando hay al menos k respuestas.
--
-- Ejecutar una sola vez, completo, en el SQL Editor de Supabase.
-- =====================================================================

begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema private from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on schema private from authenticated'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Secretos (solo legibles por funciones SECURITY DEFINER)
-- ---------------------------------------------------------------------
create table private.secrets (
  k text primary key,
  v text not null
);
insert into private.secrets (k, v)
values ('token_key', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (k) do nothing;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.inst_status as enum ('pendiente', 'activa', 'suspendida', 'rechazada');
create type public.user_role   as enum ('owner', 'admin', 'profesional', 'docente', 'estudiante');
create type public.acct_status as enum ('pendiente', 'activa', 'suspendida', 'rechazada');
create type public.req_status  as enum ('pendiente', 'conversacion', 'derivada', 'cerrada');

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table public.institutions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 3 and 160),
  slug          text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$'),
  city          text not null check (char_length(city) between 2 and 80),
  department    text check (department is null or char_length(department) between 2 and 40),
  sie_code      text check (sie_code is null or sie_code ~ '^[0-9]{6,10}$'),
  kind          text not null check (kind in ('fiscal', 'particular', 'convenio')),
  contact_name  text not null check (char_length(contact_name) between 3 and 120),
  contact_role  text not null check (char_length(contact_role) between 2 and 80),
  contact_phone text check (contact_phone is null or contact_phone ~ '^[0-9 +()-]{6,20}$'),
  status        public.inst_status not null default 'pendiente',
  min_k         smallint not null default 5 check (min_k between 3 and 15),
  help_name     text not null default 'Familia Segura, UNICEF Bolivia' check (char_length(help_name) <= 80),
  help_line     text not null default '800 11 30 40' check (char_length(help_line) <= 30),
  help_wa       text not null default '77797667' check (char_length(help_wa) <= 30),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid,
  review_note   text check (review_note is null or char_length(review_note) <= 300)
);

create table public.courses (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name           text not null check (char_length(name) between 2 and 40),
  join_code      text not null unique,
  join_open      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (institution_id, name)
);

create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  institution_id       uuid references public.institutions(id) on delete cascade,
  role                 public.user_role not null,
  status               public.acct_status not null default 'pendiente',
  display_name         text check (display_name is null or char_length(display_name) between 2 and 120),
  username             text check (username is null or username ~ '^[a-z0-9._]{3,24}$'),
  course_id            uuid references public.courses(id) on delete set null,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now(),
  approved_at          timestamptz,
  approved_by          uuid,
  unique (institution_id, username),
  check (role = 'owner' or institution_id is not null)
);
create index profiles_inst_idx on public.profiles (institution_id, role, status);

create table public.staff_invites (
  code_hash      text primary key,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  role           public.user_role not null check (role in ('admin', 'profesional', 'docente')),
  course_id      uuid references public.courses(id) on delete cascade,
  created_by     uuid not null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '7 days',
  used_by        uuid,
  used_at        timestamptz
);

create table public.teacher_courses (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete cascade,
  primary key (teacher_id, course_id)
);

-- Registro diario: sin id de estudiante y sin hora, solo el día.
create table public.checkins (
  token          text primary key,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course_id      uuid not null references public.courses(id) on delete cascade,
  day            date not null,
  value          smallint not null check (value between 1 and 5)
);
create index checkins_inst_day_idx on public.checkins (institution_id, day);
create index checkins_course_day_idx on public.checkins (course_id, day);

-- GAD-7: solo el puntaje total, por quincena, sin id ni hora.
create table public.gad_results (
  token          text primary key,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course_id      uuid not null references public.courses(id) on delete cascade,
  period         integer not null,
  score          smallint not null check (score between 0 and 21)
);
create index gad_inst_period_idx on public.gad_results (institution_id, period);

-- Solicitudes: el único lugar donde aparece un estudiante, porque él lo decidió.
create table public.help_requests (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course_id      uuid references public.courses(id) on delete set null,
  student_id     uuid not null references public.profiles(id) on delete cascade,
  message        text check (message is null or char_length(message) <= 280),
  contact        text check (contact is null or char_length(contact) <= 120),
  status         public.req_status not null default 'pendiente',
  derived_to     text check (derived_to is null or char_length(derived_to) <= 80),
  note           text check (note is null or char_length(note) <= 400),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index help_inst_idx on public.help_requests (institution_id, status, created_at desc);

create table public.attendance (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course_id      uuid not null references public.courses(id) on delete cascade,
  week_start     date not null check (extract(isodow from week_start) = 1),
  pct            numeric(5, 2) not null check (pct between 0 and 100),
  primary key (course_id, week_start)
);

create table public.audit_log (
  id             bigserial primary key,
  at             timestamptz not null default now(),
  actor          uuid,
  institution_id uuid,
  action         text not null,
  detail         jsonb not null default '{}'::jsonb
);
create index audit_inst_idx on public.audit_log (institution_id, at desc);

-- RLS activado en todas las tablas, sin políticas: denegación por defecto.
alter table public.institutions    enable row level security;
alter table public.courses         enable row level security;
alter table public.profiles        enable row level security;
alter table public.staff_invites   enable row level security;
alter table public.teacher_courses enable row level security;
alter table public.checkins        enable row level security;
alter table public.gad_results     enable row level security;
alter table public.help_requests   enable row level security;
alter table public.attendance      enable row level security;
alter table public.audit_log       enable row level security;

-- ---------------------------------------------------------------------
-- Utilidades privadas
-- ---------------------------------------------------------------------
create or replace function private.today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/La_Paz')::date
$$;

create or replace function private.period(d date) returns integer
language sql immutable set search_path = '' as $$
  select floor((d - date '2026-01-05') / 14.0)::integer
$$;

create or replace function private.tok(kind text, uid uuid, scope text) returns text
language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(kind || ':' || uid::text || ':' || scope,
                (select v from private.secrets where k = 'token_key'), 'sha256'), 'hex')
$$;

create or replace function private.rand_code(n integer) returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(n);
  out text := '';
begin
  for i in 0 .. n - 1 loop
    out := out || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return out;
end $$;

create or replace function private.new_join_code() returns text
language plpgsql volatile set search_path = '' as $$
declare c text;
begin
  loop
    c := private.rand_code(4) || '-' || private.rand_code(4);
    exit when not exists (select 1 from public.courses where join_code = c);
  end loop;
  return c;
end $$;

create or replace function private.temp_password() returns text
language sql volatile set search_path = '' as $$
  select lower(private.rand_code(4)) || '-' || lower(private.rand_code(4)) || '-' || lower(private.rand_code(4))
$$;

create or replace function private.sha(t text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(t, 'sha256'), 'hex')
$$;

create or replace function private.slugify(t text) returns text
language plpgsql stable set search_path = '' as $$
declare base text; s text; n integer := 1;
begin
  base := lower(translate(t, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := trim(both '-' from base);
  base := regexp_replace(base, '^(unidad-educativa|u-e|colegio)-', '');
  base := left(base, 26);
  base := trim(both '-' from base);
  if char_length(base) < 3 then base := 'inst-' || lower(private.rand_code(4)); end if;
  s := base;
  while exists (select 1 from public.institutions where slug = s) loop
    n := n + 1;
    s := base || '-' || n;
  end loop;
  return s;
end $$;

create or replace function private.audit(p_actor uuid, p_inst uuid, p_action text, p_detail jsonb default '{}'::jsonb)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.audit_log (actor, institution_id, action, detail) values (p_actor, p_inst, p_action, coalesce(p_detail, '{}'::jsonb))
$$;

-- Verificación central de acceso. Lanza un error con un código legible
-- por la aplicación si algo no se cumple.
create or replace function private.require(p_roles public.user_role[])
returns public.profiles
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles;
  inst public.inst_status;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado' using errcode = '28000';
  end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then
    raise exception 'sin_perfil' using errcode = '42501';
  end if;
  if p.status <> 'activa' then
    raise exception 'cuenta_%', p.status using errcode = '42501';
  end if;
  if not (p.role = any (p_roles)) then
    raise exception 'rol_no_permitido' using errcode = '42501';
  end if;
  if p.role <> 'owner' then
    select status into inst from public.institutions where id = p.institution_id;
    if inst is distinct from 'activa' then
      raise exception 'institucion_%', coalesce(inst::text, 'inexistente') using errcode = '42501';
    end if;
  end if;
  if p.role in ('owner', 'admin', 'profesional') and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'mfa_requerido' using errcode = '42501';
  end if;
  if p.must_change_password then
    raise exception 'cambio_contrasena' using errcode = '42501';
  end if;
  return p;
end $$;

-- Nivel cualitativo (el día en curso solo se informa así, sin número,
-- para que comparar dos lecturas del mismo día no revele una respuesta).
create or replace function private.level(v numeric) returns text
language sql immutable set search_path = '' as $$
  select case when v is null then null when v >= 3.5 then 'estable' when v >= 2.7 then 'atencion' else 'alerta' end
$$;

create or replace function private.kmin(p_inst uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select min_k from public.institutions where id = p_inst
$$;

-- Días de un curso con su conteo; el promedio solo si n >= k.
create or replace function private.course_days(p_course uuid, p_from date, p_to date, p_k integer)
returns table (day date, n integer, avg numeric, shown boolean)
language sql stable security definer set search_path = '' as $$
  select c.day, count(*)::integer,
         case when count(*) >= p_k then round(avg(c.value)::numeric, 2) end,
         count(*) >= p_k
  from public.checkins c
  where c.course_id = p_course and c.day between p_from and p_to
  group by c.day
  order by c.day
$$;

-- ---------------------------------------------------------------------
-- Alta de cuentas: trigger sobre auth.users
-- ---------------------------------------------------------------------
create or replace function private.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  intent text := m ->> 'intent';
  v_inst uuid;
  v_course public.courses;
  v_inv public.staff_invites;
  v_inst_status public.inst_status;
  v_user text;
begin
  if intent = 'institucion' then
    insert into public.institutions (name, slug, city, department, sie_code, kind, contact_name, contact_role, contact_phone)
    values (
      trim(m ->> 'inst_name'),
      private.slugify(m ->> 'inst_name'),
      trim(m ->> 'city'),
      nullif(trim(m ->> 'department'), ''),
      nullif(regexp_replace(coalesce(m ->> 'sie_code', ''), '\s', '', 'g'), ''),
      m ->> 'kind',
      trim(m ->> 'contact_name'),
      trim(m ->> 'contact_role'),
      nullif(trim(m ->> 'contact_phone'), '')
    ) returning id into v_inst;
    insert into public.profiles (id, institution_id, role, status, display_name)
    values (new.id, v_inst, 'admin', 'pendiente', trim(m ->> 'contact_name'));
    perform private.audit(new.id, v_inst, 'institucion_registrada', jsonb_build_object('nombre', m ->> 'inst_name'));

  elsif intent = 'estudiante' then
    select * into v_course from public.courses where join_code = upper(trim(m ->> 'join_code'));
    if not found or not v_course.join_open then
      raise exception 'codigo_curso_invalido';
    end if;
    select status into v_inst_status from public.institutions where id = v_course.institution_id;
    if v_inst_status <> 'activa' then
      raise exception 'institucion_no_activa';
    end if;
    v_user := lower(trim(m ->> 'username'));
    if v_user !~ '^[a-z0-9._]{3,24}$' then
      raise exception 'usuario_invalido';
    end if;
    if exists (select 1 from public.profiles where institution_id = v_course.institution_id and username = v_user) then
      raise exception 'usuario_en_uso';
    end if;
    insert into public.profiles (id, institution_id, role, status, username, course_id)
    values (new.id, v_course.institution_id, 'estudiante', 'pendiente', v_user, v_course.id);

  elsif intent = 'personal' then
    select * into v_inv from public.staff_invites
    where code_hash = private.sha(upper(trim(m ->> 'invite_code')))
    for update;
    if not found or v_inv.used_by is not null or v_inv.expires_at < now() then
      raise exception 'invitacion_invalida';
    end if;
    select status into v_inst_status from public.institutions where id = v_inv.institution_id;
    if v_inst_status <> 'activa' then
      raise exception 'institucion_no_activa';
    end if;
    insert into public.profiles (id, institution_id, role, status, display_name, approved_at, approved_by)
    values (new.id, v_inv.institution_id, v_inv.role, 'activa', trim(m ->> 'display_name'), now(), v_inv.created_by);
    update public.staff_invites set used_by = new.id, used_at = now() where code_hash = v_inv.code_hash;
    if v_inv.role = 'docente' and v_inv.course_id is not null then
      insert into public.teacher_courses (teacher_id, course_id) values (new.id, v_inv.course_id) on conflict do nothing;
    end if;
    perform private.audit(new.id, v_inv.institution_id, 'personal_registrado', jsonb_build_object('rol', v_inv.role));

  elsif intent = 'propietario' then
    -- Queda pendiente: solo se activa desde el SQL Editor con private.activate_owner().
    insert into public.profiles (id, role, status, display_name)
    values (new.id, 'owner', 'pendiente', trim(m ->> 'display_name'));

  else
    raise exception 'registro_no_permitido';
  end if;
  return new;
end $$;

drop trigger if exists pulso_on_auth_user_created on auth.users;
create trigger pulso_on_auth_user_created
  after insert on auth.users
  for each row execute function private.on_auth_user_created();

-- Al cambiar la contraseña, se levanta la obligación de cambiarla.
create or replace function private.on_auth_password_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.profiles set must_change_password = false where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists pulso_on_auth_password_changed on auth.users;
create trigger pulso_on_auth_password_changed
  after update of encrypted_password on auth.users
  for each row execute function private.on_auth_password_changed();

-- Activación del propietario de la plataforma. Solo desde el SQL Editor.
create or replace function private.activate_owner(p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    return 'No existe una cuenta con ese correo.';
  end if;
  update public.profiles set status = 'activa', approved_at = now() where id = v_id and role = 'owner';
  if not found then
    return 'La cuenta existe, pero no se registró como propietario.';
  end if;
  perform private.audit(v_id, null, 'propietario_activado');
  return 'Propietario activado.';
end $$;

-- ---------------------------------------------------------------------
-- API pública (anon): validación de códigos antes del registro
-- ---------------------------------------------------------------------
create or replace function public.check_join(p_code text, p_username text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record; u text := lower(trim(coalesce(p_username, '')));
begin
  select c.name as course, i.name as institution, i.slug
    into r
  from public.courses c join public.institutions i on i.id = c.institution_id
  where c.join_code = upper(trim(coalesce(p_code, ''))) and c.join_open and i.status = 'activa';
  if not found then
    return jsonb_build_object('valid', false);
  end if;
  return jsonb_build_object(
    'valid', true, 'course', r.course, 'institution', r.institution, 'slug', r.slug,
    'username_ok', case when u = '' then null
                        else u ~ '^[a-z0-9._]{3,24}$'
                             and not exists (select 1 from public.profiles p join public.institutions i on i.id = p.institution_id
                                             where i.slug = r.slug and p.username = u) end
  );
end $$;

create or replace function public.check_invite(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select s.role, i.name as institution, c.name as course
    into r
  from public.staff_invites s
  join public.institutions i on i.id = s.institution_id
  left join public.courses c on c.id = s.course_id
  where s.code_hash = private.sha(upper(trim(coalesce(p_code, ''))))
    and s.used_by is null and s.expires_at > now() and i.status = 'activa';
  if not found then
    return jsonb_build_object('valid', false);
  end if;
  return jsonb_build_object('valid', true, 'role', r.role, 'institution', r.institution, 'course', r.course);
end $$;

-- ---------------------------------------------------------------------
-- Contexto de la sesión (funciona incluso con la cuenta pendiente)
-- ---------------------------------------------------------------------
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
                                              'min_k', i.min_k, 'help_name', i.help_name, 'help_line', i.help_line, 'help_wa', i.help_wa)
                    from public.institutions i where i.id = p.institution_id)
  )
  from public.profiles p where p.id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Estudiante
-- ---------------------------------------------------------------------
create or replace function public.student_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; d date := private.today();
begin
  me := private.require(array['estudiante']::public.user_role[]);
  return jsonb_build_object(
    'today', d,
    'today_value', (select value from public.checkins where token = private.tok('ci', me.id, d::text)),
    'gad_done', exists (select 1 from public.gad_results where token = private.tok('gad', me.id, private.period(d)::text)),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'created_at', r.created_at) order by r.created_at desc)
                          from public.help_requests r where r.student_id = me.id and r.created_at > now() - interval '60 days'), '[]'::jsonb)
  );
end $$;

create or replace function public.student_checkin(p_value integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; d date := private.today();
begin
  me := private.require(array['estudiante']::public.user_role[]);
  if p_value is null or p_value not between 1 and 5 then
    raise exception 'valor_invalido';
  end if;
  if me.course_id is null then
    raise exception 'sin_curso';
  end if;
  insert into public.checkins (token, institution_id, course_id, day, value)
  values (private.tok('ci', me.id, d::text), me.institution_id, me.course_id, d, p_value)
  on conflict (token) do update set value = excluded.value;
  return jsonb_build_object('ok', true, 'low', p_value <= 2);
end $$;

create or replace function public.student_gad(p_answers integer[])
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; d date := private.today(); s integer := 0; x integer;
begin
  me := private.require(array['estudiante']::public.user_role[]);
  if p_answers is null or array_length(p_answers, 1) <> 7 then
    raise exception 'respuestas_invalidas';
  end if;
  foreach x in array p_answers loop
    if x is null or x not between 0 and 3 then raise exception 'respuestas_invalidas'; end if;
    s := s + x;
  end loop;
  insert into public.gad_results (token, institution_id, course_id, period, score)
  values (private.tok('gad', me.id, private.period(d)::text), me.institution_id, me.course_id, private.period(d), s)
  on conflict (token) do nothing;
  if not found then
    raise exception 'gad_ya_respondido';
  end if;
  -- Nunca se devuelve el puntaje: solo si conviene sugerir una conversación.
  return jsonb_build_object('ok', true, 'suggest_talk', s >= 10);
end $$;

create or replace function public.student_request_help(p_message text default null, p_contact text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['estudiante']::public.user_role[]);
  if (select count(*) from public.help_requests where student_id = me.id and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'limite_solicitudes';
  end if;
  insert into public.help_requests (institution_id, course_id, student_id, message, contact)
  values (me.institution_id, me.course_id, me.id, nullif(left(trim(coalesce(p_message, '')), 280), ''), nullif(left(trim(coalesce(p_contact, '')), 120), ''));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- Docente
-- ---------------------------------------------------------------------
create or replace function public.teacher_courses_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['docente']::public.user_role[]);
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
                   from public.teacher_courses tc join public.courses c on c.id = tc.course_id
                   where tc.teacher_id = me.id), '[]'::jsonb);
end $$;

create or replace function public.course_view(p_course uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me public.profiles; k integer; d date := private.today(); mon date; c public.courses; res jsonb;
begin
  me := private.require(array['docente', 'profesional', 'admin']::public.user_role[]);
  select * into c from public.courses where id = p_course and institution_id = me.institution_id;
  if not found then raise exception 'curso_no_encontrado'; end if;
  if me.role = 'docente' and not exists (select 1 from public.teacher_courses where teacher_id = me.id and course_id = p_course) then
    raise exception 'curso_no_asignado';
  end if;
  k := private.kmin(me.institution_id);
  mon := d - (extract(isodow from d)::integer - 1);
  select jsonb_build_object(
    'course', jsonb_build_object('id', c.id, 'name', c.name),
    'k', k,
    'today', d,
    'enrolled', (select count(*) from public.profiles where course_id = c.id and role = 'estudiante' and status = 'activa'),
    'days', coalesce((select jsonb_agg(jsonb_build_object(
                        'day', x.day, 'n', x.n, 'shown', x.shown, 'is_today', x.day = d,
                        'avg', case when x.day = d then null else x.avg end,
                        'level', private.level(x.avg)) order by x.day)
                      from private.course_days(c.id, d - 20, d, k) x where extract(isodow from x.day) < 6 or x.day = d), '[]'::jsonb),
    'week_start', mon,
    'weeks', coalesce((select jsonb_agg(w order by w ->> 'week') from (
                        select jsonb_build_object('week', date_trunc('week', x.day)::date,
                                                  'avg', round(sum(x.avg * x.n) / nullif(sum(x.n), 0), 2),
                                                  'n', sum(x.n)) as w
                        from private.course_days(c.id, d - 55, d - 1, k) x where x.shown
                        group by date_trunc('week', x.day)) q), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- ---------------------------------------------------------------------
-- Profesional en salud mental (y administración, solo agregados)
-- ---------------------------------------------------------------------
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
    select course_id, count(*) as gn, count(*) filter (where score >= 10) as gh
    from public.gad_results
    where institution_id = me.institution_id and period = private.period(d)
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
        'gad_n', coalesce(g.gn, 0),
        'gad_high', case when coalesce(g.gn, 0) >= k then g.gh end
      ) order by co.name), '[]'::jsonb),
    'pending_requests', (select count(*) from public.help_requests where institution_id = me.institution_id and status = 'pendiente')
  ) into res
  from public.courses co
  left join win w on w.course_id = co.id
  left join g on g.course_id = co.id
  left join st on st.course_id = co.id
  where co.institution_id = me.institution_id;
  return res;
end $$;

create or replace function public.pro_weeks(p_weeks integer default 8)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; k integer; d date := private.today(); w integer := least(greatest(coalesce(p_weeks, 8), 2), 26);
begin
  me := private.require(array['profesional', 'admin']::public.user_role[]);
  k := private.kmin(me.institution_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('week', wk, 'avg', round(s::numeric / n, 2), 'n', n) order by wk)
    from (
      select date_trunc('week', day)::date as wk, sum(n) as n, sum(s) as s
      from (
        select c.course_id, c.day, count(*) as n, sum(c.value) as s
        from public.checkins c
        where c.institution_id = me.institution_id and c.day > d - (w * 7) and c.day < d
        group by 1, 2
        having count(*) >= k
      ) ok
      group by 1
    ) q), '[]'::jsonb);
end $$;

create or replace function public.pro_correlation(p_lag integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; k integer; d date := private.today(); v_lag integer := case when p_lag = 1 then 1 else 0 end;
begin
  me := private.require(array['profesional', 'admin']::public.user_role[]);
  k := private.kmin(me.institution_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('course', co.name, 'week', q.wk, 'avg', round(q.s::numeric / q.n, 2), 'pct', a.pct) order by co.name, q.wk)
    from (
      select course_id, date_trunc('week', day)::date as wk, sum(n) as n, sum(s) as s
      from (
        select c.course_id, c.day, count(*) as n, sum(c.value) as s
        from public.checkins c
        where c.institution_id = me.institution_id and c.day > d - 182 and c.day < d
        group by 1, 2
        having count(*) >= k
      ) ok
      group by 1, 2
    ) q
    join public.attendance a on a.course_id = q.course_id and a.week_start = q.wk + (v_lag * 7)
    join public.courses co on co.id = q.course_id
  ), '[]'::jsonb);
end $$;

create or replace function public.pro_requests()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['profesional']::public.user_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'username', p.username, 'course', c.name, 'message', r.message, 'contact', r.contact,
      'status', r.status, 'derived_to', r.derived_to, 'note', r.note, 'created_at', r.created_at, 'updated_at', r.updated_at
    ) order by (r.status = 'cerrada'), r.created_at desc)
    from public.help_requests r
    join public.profiles p on p.id = r.student_id
    left join public.courses c on c.id = r.course_id
    where r.institution_id = me.institution_id and r.created_at > now() - interval '120 days'
  ), '[]'::jsonb);
end $$;

create or replace function public.pro_update_request(p_id uuid, p_status public.req_status, p_derived_to text default null, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['profesional']::public.user_role[]);
  update public.help_requests
     set status = p_status,
         derived_to = case when p_status = 'derivada' then nullif(left(trim(coalesce(p_derived_to, '')), 80), '') else derived_to end,
         note = nullif(left(trim(coalesce(p_note, '')), 400), ''),
         updated_at = now()
   where id = p_id and institution_id = me.institution_id;
  if not found then raise exception 'solicitud_no_encontrada'; end if;
  perform private.audit(me.id, me.institution_id, 'solicitud_actualizada', jsonb_build_object('estado', p_status));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- Administración de la institución
-- ---------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles; i public.institutions;
begin
  me := private.require(array['admin']::public.user_role[]);
  select * into i from public.institutions where id = me.institution_id;
  return jsonb_build_object(
    'institution', jsonb_build_object('name', i.name, 'slug', i.slug, 'city', i.city, 'min_k', i.min_k,
                                      'help_name', i.help_name, 'help_line', i.help_line, 'help_wa', i.help_wa),
    'counts', jsonb_build_object(
      'students_active',  (select count(*) from public.profiles where institution_id = i.id and role = 'estudiante' and status = 'activa'),
      'students_pending', (select count(*) from public.profiles where institution_id = i.id and role = 'estudiante' and status = 'pendiente'),
      'staff',            (select count(*) from public.profiles where institution_id = i.id and role in ('admin', 'profesional', 'docente') and status = 'activa'),
      'checkins',         (select count(*) from public.checkins where institution_id = i.id),
      'gad',              (select count(*) from public.gad_results where institution_id = i.id),
      'requests',         (select count(*) from public.help_requests where institution_id = i.id)
    ),
    'courses', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', c.id, 'name', c.name, 'join_code', c.join_code, 'join_open', c.join_open,
                  'students', (select count(*) from public.profiles p where p.course_id = c.id and p.role = 'estudiante' and p.status = 'activa'),
                  'teachers', coalesce((select jsonb_agg(coalesce(p.display_name, 'Docente')) from public.teacher_courses tc join public.profiles p on p.id = tc.teacher_id where tc.course_id = c.id), '[]'::jsonb)
                ) order by c.name) from public.courses c where c.institution_id = i.id), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_members(p_filter text default 'todos')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['admin']::public.user_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'role', p.role, 'status', p.status, 'username', p.username, 'display_name', p.display_name,
      'course_id', p.course_id, 'course', c.name, 'created_at', p.created_at, 'is_me', p.id = me.id,
      'courses', case when p.role = 'docente' then coalesce((select jsonb_agg(cc.name order by cc.name) from public.teacher_courses tc join public.courses cc on cc.id = tc.course_id where tc.teacher_id = p.id), '[]'::jsonb) end
    ) order by (p.status = 'pendiente') desc, p.role, coalesce(p.username, p.display_name))
    from public.profiles p
    left join public.courses c on c.id = p.course_id
    where p.institution_id = me.institution_id
      and (p_filter = 'todos'
           or (p_filter = 'pendientes' and p.status = 'pendiente')
           or (p_filter = 'estudiantes' and p.role = 'estudiante')
           or (p_filter = 'personal' and p.role in ('admin', 'profesional', 'docente')))
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_set_member_status(p_id uuid, p_status public.acct_status)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; t public.profiles;
begin
  me := private.require(array['admin']::public.user_role[]);
  select * into t from public.profiles where id = p_id and institution_id = me.institution_id;
  if not found then raise exception 'miembro_no_encontrado'; end if;
  if t.id = me.id then raise exception 'no_puedes_modificarte'; end if;
  update public.profiles
     set status = p_status,
         approved_at = case when p_status = 'activa' then now() else approved_at end,
         approved_by = case when p_status = 'activa' then me.id else approved_by end
   where id = p_id;
  if p_status in ('suspendida', 'rechazada') then
    delete from auth.sessions where user_id = p_id;
  end if;
  perform private.audit(me.id, me.institution_id, 'miembro_' || p_status::text,
                        jsonb_build_object('rol', t.role, 'usuario', coalesce(t.username, t.display_name)));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_set_member_course(p_id uuid, p_course uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['admin']::public.user_role[]);
  if not exists (select 1 from public.courses where id = p_course and institution_id = me.institution_id) then
    raise exception 'curso_no_encontrado';
  end if;
  update public.profiles set course_id = p_course where id = p_id and institution_id = me.institution_id and role = 'estudiante';
  if not found then raise exception 'miembro_no_encontrado'; end if;
  perform private.audit(me.id, me.institution_id, 'curso_cambiado', jsonb_build_object('miembro', p_id));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_create_course(p_name text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; c public.courses;
begin
  me := private.require(array['admin']::public.user_role[]);
  if (select count(*) from public.courses where institution_id = me.institution_id) >= 80 then
    raise exception 'limite_cursos';
  end if;
  insert into public.courses (institution_id, name, join_code)
  values (me.institution_id, trim(p_name), private.new_join_code())
  returning * into c;
  perform private.audit(me.id, me.institution_id, 'curso_creado', jsonb_build_object('curso', c.name));
  return jsonb_build_object('id', c.id, 'name', c.name, 'join_code', c.join_code);
exception when unique_violation then
  raise exception 'curso_duplicado';
end $$;

create or replace function public.admin_course_code(p_course uuid, p_action text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; c public.courses;
begin
  me := private.require(array['admin']::public.user_role[]);
  if p_action = 'rotar' then
    update public.courses set join_code = private.new_join_code() where id = p_course and institution_id = me.institution_id returning * into c;
  elsif p_action = 'abrir' then
    update public.courses set join_open = true where id = p_course and institution_id = me.institution_id returning * into c;
  elsif p_action = 'cerrar' then
    update public.courses set join_open = false where id = p_course and institution_id = me.institution_id returning * into c;
  else
    raise exception 'accion_invalida';
  end if;
  if c.id is null then raise exception 'curso_no_encontrado'; end if;
  perform private.audit(me.id, me.institution_id, 'codigo_curso_' || p_action, jsonb_build_object('curso', c.name));
  return jsonb_build_object('id', c.id, 'join_code', c.join_code, 'join_open', c.join_open);
end $$;

create or replace function public.admin_create_invite(p_role public.user_role, p_course uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; code text;
begin
  me := private.require(array['admin']::public.user_role[]);
  if p_role not in ('admin', 'profesional', 'docente') then raise exception 'rol_invalido'; end if;
  if p_course is not null and not exists (select 1 from public.courses where id = p_course and institution_id = me.institution_id) then
    raise exception 'curso_no_encontrado';
  end if;
  if (select count(*) from public.staff_invites where institution_id = me.institution_id and used_by is null and expires_at > now()) >= 30 then
    raise exception 'limite_invitaciones';
  end if;
  code := 'INV-' || private.rand_code(4) || '-' || private.rand_code(4) || '-' || private.rand_code(4);
  insert into public.staff_invites (code_hash, institution_id, role, course_id, created_by)
  values (private.sha(code), me.institution_id, p_role, p_course, me.id);
  perform private.audit(me.id, me.institution_id, 'invitacion_creada', jsonb_build_object('rol', p_role));
  -- El código en claro solo se devuelve aquí, una vez.
  return jsonb_build_object('code', code, 'role', p_role, 'expires_at', now() + interval '7 days');
end $$;

create or replace function public.admin_assign_teacher(p_teacher uuid, p_course uuid, p_on boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['admin']::public.user_role[]);
  if not exists (select 1 from public.profiles where id = p_teacher and institution_id = me.institution_id and role = 'docente') then
    raise exception 'miembro_no_encontrado';
  end if;
  if not exists (select 1 from public.courses where id = p_course and institution_id = me.institution_id) then
    raise exception 'curso_no_encontrado';
  end if;
  if p_on then
    insert into public.teacher_courses (teacher_id, course_id) values (p_teacher, p_course) on conflict do nothing;
  else
    delete from public.teacher_courses where teacher_id = p_teacher and course_id = p_course;
  end if;
  perform private.audit(me.id, me.institution_id, case when p_on then 'docente_asignado' else 'docente_retirado' end, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_update_settings(p_min_k integer, p_help_name text, p_help_line text, p_help_wa text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['admin']::public.user_role[]);
  update public.institutions
     set min_k = least(greatest(coalesce(p_min_k, 5), 3), 15),
         help_name = left(coalesce(nullif(trim(p_help_name), ''), help_name), 80),
         help_line = left(coalesce(nullif(trim(p_help_line), ''), help_line), 30),
         help_wa = left(coalesce(nullif(trim(p_help_wa), ''), help_wa), 30)
   where id = me.institution_id;
  perform private.audit(me.id, me.institution_id, 'ajustes_actualizados', jsonb_build_object('min_k', p_min_k));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_set_attendance(p_rows jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; r jsonb; n integer := 0; bad integer := 0; v_course uuid; v_week date; v_pct numeric;
begin
  me := private.require(array['admin', 'profesional']::public.user_role[]);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then raise exception 'datos_invalidos'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      select id into v_course from public.courses where institution_id = me.institution_id and lower(name) = lower(trim(r ->> 'course'));
      v_week := (r ->> 'week_start')::date;
      v_week := v_week - (extract(isodow from v_week)::integer - 1);
      v_pct := (r ->> 'pct')::numeric;
      if v_course is null or v_pct is null or v_pct < 0 or v_pct > 100 then
        bad := bad + 1;
      else
        insert into public.attendance (institution_id, course_id, week_start, pct) values (me.institution_id, v_course, v_week, v_pct)
        on conflict (course_id, week_start) do update set pct = excluded.pct;
        n := n + 1;
      end if;
    exception when others then
      bad := bad + 1;
    end;
  end loop;
  perform private.audit(me.id, me.institution_id, 'asistencia_cargada', jsonb_build_object('filas', n, 'ignoradas', bad));
  return jsonb_build_object('ok', true, 'rows', n, 'bad', bad);
end $$;

create or replace function public.admin_reset_password(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; t public.profiles; pwd text := private.temp_password();
begin
  me := private.require(array['admin']::public.user_role[]);
  select * into t from public.profiles where id = p_id and institution_id = me.institution_id;
  if not found then raise exception 'miembro_no_encontrado'; end if;
  if t.role not in ('estudiante', 'docente', 'profesional') then raise exception 'rol_no_permitido'; end if;
  update auth.users set encrypted_password = extensions.crypt(pwd, extensions.gen_salt('bf', 10)), updated_at = now() where id = p_id;
  update public.profiles set must_change_password = true where id = p_id;
  delete from auth.sessions where user_id = p_id;
  perform private.audit(me.id, me.institution_id, 'contrasena_restablecida',
                        jsonb_build_object('rol', t.role, 'usuario', coalesce(t.username, t.display_name)));
  return jsonb_build_object('temp_password', pwd);
end $$;

create or replace function public.admin_purge_data()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles; a integer; b integer; c integer; d integer;
begin
  me := private.require(array['admin']::public.user_role[]);
  delete from public.checkins where institution_id = me.institution_id; get diagnostics a = row_count;
  delete from public.gad_results where institution_id = me.institution_id; get diagnostics b = row_count;
  delete from public.help_requests where institution_id = me.institution_id; get diagnostics c = row_count;
  delete from public.attendance where institution_id = me.institution_id; get diagnostics d = row_count;
  perform private.audit(me.id, me.institution_id, 'datos_borrados',
                        jsonb_build_object('registros', a, 'cuestionarios', b, 'solicitudes', c, 'asistencia', d));
  return jsonb_build_object('checkins', a, 'gad', b, 'requests', c, 'attendance', d);
end $$;

create or replace function public.admin_audit(p_limit integer default 60)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['admin']::public.user_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object('at', l.at, 'action', l.action, 'detail', l.detail,
                                        'actor', coalesce(p.display_name, p.username, 'Sistema'), 'actor_role', p.role) order by l.at desc)
    from (select * from public.audit_log where institution_id = me.institution_id order by at desc limit least(greatest(coalesce(p_limit, 60), 1), 200)) l
    left join public.profiles p on p.id = l.actor
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Propietario de la plataforma
-- ---------------------------------------------------------------------
create or replace function public.owner_institutions(p_status text default 'pendiente')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['owner']::public.user_role[]);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'name', i.name, 'slug', i.slug, 'city', i.city, 'department', i.department, 'sie_code', i.sie_code,
      'kind', i.kind, 'contact_name', i.contact_name, 'contact_role', i.contact_role, 'contact_phone', i.contact_phone,
      'contact_email', (select u.email from public.profiles p join auth.users u on u.id = p.id
                        where p.institution_id = i.id and p.role = 'admin' order by p.created_at limit 1),
      'status', i.status, 'created_at', i.created_at, 'reviewed_at', i.reviewed_at, 'review_note', i.review_note,
      'students', (select count(*) from public.profiles p where p.institution_id = i.id and p.role = 'estudiante' and p.status = 'activa'),
      'courses', (select count(*) from public.courses c where c.institution_id = i.id)
    ) order by i.created_at desc)
    from public.institutions i
    where p_status = 'todas' or i.status::text = p_status
  ), '[]'::jsonb);
end $$;

create or replace function public.owner_review(p_id uuid, p_decision public.inst_status, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.profiles;
begin
  me := private.require(array['owner']::public.user_role[]);
  update public.institutions
     set status = p_decision, reviewed_at = now(), reviewed_by = me.id, review_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
   where id = p_id;
  if not found then raise exception 'institucion_no_encontrada'; end if;
  if p_decision = 'activa' then
    update public.profiles set status = 'activa', approved_at = now(), approved_by = me.id
     where institution_id = p_id and role = 'admin' and status = 'pendiente';
  elsif p_decision in ('suspendida', 'rechazada') then
    delete from auth.sessions where user_id in (select id from public.profiles where institution_id = p_id);
  end if;
  perform private.audit(me.id, p_id, 'institucion_' || p_decision::text, jsonb_build_object('nota', p_note));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- Privilegios: nada directo sobre tablas; solo las funciones listadas.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;
revoke all on all functions in schema public from public;
revoke all on all functions in schema private from public;
revoke all on all tables in schema private from public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke all on all functions in schema private from %I', r);
      execute format('revoke all on all tables in schema private from %I', r);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.check_join(text, text) to anon;
    grant execute on function public.check_invite(text) to anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function
      public.check_join(text, text),
      public.check_invite(text),
      public.my_context(),
      public.student_state(),
      public.student_checkin(integer),
      public.student_gad(integer[]),
      public.student_request_help(text, text),
      public.teacher_courses_list(),
      public.course_view(uuid),
      public.pro_overview(),
      public.pro_weeks(integer),
      public.pro_correlation(integer),
      public.pro_requests(),
      public.pro_update_request(uuid, public.req_status, text, text),
      public.admin_overview(),
      public.admin_members(text),
      public.admin_set_member_status(uuid, public.acct_status),
      public.admin_set_member_course(uuid, uuid),
      public.admin_create_course(text),
      public.admin_course_code(uuid, text),
      public.admin_create_invite(public.user_role, uuid),
      public.admin_assign_teacher(uuid, uuid, boolean),
      public.admin_update_settings(integer, text, text, text),
      public.admin_set_attendance(jsonb),
      public.admin_reset_password(uuid),
      public.admin_purge_data(),
      public.admin_audit(integer),
      public.owner_institutions(text),
      public.owner_review(uuid, public.inst_status, text)
    to authenticated;
  end if;
end $$;

-- Funciones creadas en el futuro tampoco quedan abiertas por defecto.
alter default privileges in schema public revoke execute on functions from public;

commit;
