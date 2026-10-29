// Panel de administración de la institución.
import { h, mount, eyebrow, tabs, loading, errBox, showErr, busy, toast, field, input, select, dateTime, copy, confirmInline } from "../ui.js";
import { rpc, errMsg } from "../sb.js";
import { panelHead } from "./app.js";
import { kpi } from "./course.js";
import { semaforo, tendencia, correlacion } from "./pro.js";
import { schedules, resources } from "./plan.js";

const ROLE = { estudiante: "Estudiante", docente: "Docente", profesional: "Profesional", admin: "Administración" };
const STATUS = { activa: ["Activa", "p-dark"], pendiente: ["Pendiente", "p-line"], suspendida: ["Suspendida", "p-mid"], rechazada: ["Rechazada", "p-soft"] };
const ACTION = {
  institucion_registrada: "Registró la institución", institucion_activa: "La plataforma aprobó la institución",
  institucion_suspendida: "La plataforma suspendió la institución", institucion_rechazada: "La plataforma rechazó la institución",
  personal_registrado: "Activó una invitación", miembro_activa: "Aprobó o reactivó una cuenta", miembro_suspendida: "Suspendió una cuenta",
  miembro_rechazada: "Rechazó una cuenta", miembro_pendiente: "Dejó una cuenta pendiente", curso_cambiado: "Cambió de curso a un estudiante",
  curso_creado: "Creó un curso", codigo_curso_rotar: "Cambió el código de un curso", codigo_curso_abrir: "Abrió la inscripción de un curso",
  codigo_curso_cerrar: "Cerró la inscripción de un curso", invitacion_creada: "Creó una invitación", docente_asignado: "Asignó un curso a un docente",
  docente_retirado: "Retiró un curso a un docente", ajustes_actualizados: "Cambió los ajustes", asistencia_cargada: "Cargó asistencia",
  contrasena_restablecida: "Restableció una contraseña", programacion_creada: "Programó una actividad", programacion_editada: "Editó una programación",
  programacion_pausar: "Pausó una programación", programacion_activar: "Activó una programación", programacion_borrar: "Borró una programación",
  recurso_guardado: "Publicó o editó un recurso", recurso_borrado: "Borró un recurso", chat_activado: "Activó el chat", chat_desactivado: "Desactivó el chat", datos_borrados: "Borró todos los datos", solicitud_actualizada: "Actualizó una solicitud",
};
const origin = () => location.origin;

export async function admin(root, ctx) {
  document.title = "Administración · PULSO";
  const box = h("div", { class: "mt" });
  const views = { resumen, cursos, miembros, invitaciones, programacion: schedules, recursos: resources, semaforo, tendencia, asistencia: correlacion, bitacora, ajustes };
  const t = tabs([["resumen", "Resumen"], ["cursos", "Cursos"], ["miembros", "Miembros"], ["invitaciones", "Invitaciones"],
    ["programacion", "Programación"], ["recursos", "Recursos"],
    ["semaforo", "Semáforo"], ["tendencia", "Tendencia"], ["asistencia", "Asistencia"], ["bitacora", "Bitácora"], ["ajustes", "Ajustes"]],
  (k) => views[k](box, ctx, go), "resumen");
  function go(k) { t.set(k); }
  mount(root, h("div", { class: "view" },
    panelHead(ctx, ctx.institution.name, "Cursos, cuentas, invitaciones y ajustes de tu institución."),
    t.el, box));
  resumen(box, ctx, go);
}

// ---------------------------------------------------------------- resumen
async function resumen(box, ctx, go) {
  mount(box, loading());
  let o;
  let nSched = 0;
  try { [o, nSched] = await Promise.all([rpc("admin_overview"), rpc("sched_list").then((l) => l.length)]); } catch (e) { mount(box, h("p", { class: "err" }, errMsg(e))); return; }
  const c = o.counts;
  const steps = [
    [true, "Verificación en dos pasos activada", null],
    [o.courses.length > 0, "Crear los cursos", "cursos"],
    [c.staff > 1, "Invitar a la profesional en salud mental y a los docentes", "invitaciones"],
    [c.students_active > 0, "Compartir los códigos de curso y aprobar al alumnado", "miembros"],
    [nSched > 0, "Programar cuándo responde cada curso (o pedírselo a la profesional)", "programacion"],
  ];
  mount(box, h("div", { class: "stack" },
    h("div", { class: "kpis" },
      kpi(c.students_active, "Estudiantes activos"),
      kpi(c.students_pending, "Esperan aprobación", c.students_pending ? "Revísalos en Miembros" : "Todo al día"),
      kpi(c.staff, "Personal activo"),
      kpi(o.courses.length, "Cursos"),
      kpi(c.checkins, "Registros diarios", "Sin identidad"),
      kpi(c.requests, "Solicitudes de ayuda", "Solo las ve la profesional")),
    h("div", { class: "grid-2" },
      h("div", { class: "card stack" },
        eyebrow("Puesta en marcha"),
        h("h3", null, "Pasos para empezar"),
        steps.map(([ok, t, k]) => h("div", { class: "row between" },
          h("span", { class: ok ? "" : "ink2" }, (ok ? "● " : "○ ") + t),
          !ok && k ? h("button", { class: "btn soft sm", type: "button", onclick: () => go(k) }, "Ir") : null))),
      h("div", { class: "card stack" },
        eyebrow("Para compartir"),
        h("h3", null, "Código de institución"),
        h("p", { class: "codebox" }, o.institution.slug),
        h("p", { class: "small ink2" }, "El alumnado lo usa para ingresar, junto con su usuario y contraseña. Para crear su cuenta, en cambio, usa el código de su curso."),
        h("button", { class: "btn soft sm", type: "button", onclick: () => copy(o.institution.slug) }, "Copiar")))));
  if (c.students_pending) toast(`${c.students_pending} estudiantes esperan aprobación`);
}

// ---------------------------------------------------------------- cursos
async function cursos(box) {
  mount(box, loading());
  let o;
  try { o = await rpc("admin_overview"); } catch (e) { mount(box, h("p", { class: "err" }, errMsg(e))); return; }
  const name = input({ maxlength: 40, placeholder: "Por ejemplo, 4.º de secundaria B" });
  const err = errBox();
  const add = h("button", { class: "btn", type: "submit" }, "Crear curso");
  const form = h("form", {
    class: "card stack", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      busy(add, async () => {
        showErr(err, "");
        if (name.value.trim().length < 2) return showErr(err, "Escribe el nombre del curso.");
        try { await rpc("admin_create_course", { p_name: name.value.trim() }); toast("Curso creado"); cursos(box); }
        catch (x) { showErr(err, errMsg(x)); }
      });
    },
  }, h("h3", null, "Nuevo curso"), h("div", { class: "row" }, h("div", { class: "grow" }, field("Nombre", name)), add), err);

  const card = (c) => {
    const act = async (a) => {
      try { await rpc("admin_course_code", { p_course: c.id, p_action: a }); toast(a === "rotar" ? "Código cambiado" : a === "abrir" ? "Inscripción abierta" : "Inscripción cerrada"); cursos(box); }
      catch (x) { toast(errMsg(x)); }
    };
    const text = `PULSO · ${o.institution.name}\nCrea tu cuenta en ${origin()}/registro/estudiante\nCódigo de tu curso (${c.name}): ${c.join_code}\nPara ingresar después, el código de institución es: ${o.institution.slug}`;
    const holder = h("div");
    return h("div", { class: "card stack" },
      h("div", { class: "row between" }, h("h3", null, c.name), h("span", { class: "pill " + (c.join_open ? "p-dark" : "p-soft") }, c.join_open ? "Inscripción abierta" : "Inscripción cerrada")),
      h("p", { class: "codebox" }, c.join_code),
      h("p", { class: "small ink2" }, `${c.students} estudiantes activos · Docentes: ${c.teachers.length ? c.teachers.join(", ") : "ninguno"}`),
      h("div", { class: "row" },
        h("button", { class: "btn soft sm", type: "button", onclick: () => copy(text) }, "Copiar instrucciones"),
        h("button", { class: "btn soft sm", type: "button", onclick: () => act(c.join_open ? "cerrar" : "abrir") }, c.join_open ? "Cerrar inscripción" : "Abrir inscripción"),
        h("button", { class: "btn soft sm", type: "button", onclick: () => confirmInline(holder, "El código actual dejará de funcionar. Las cuentas ya creadas no se afectan.", "Cambiar código", () => act("rotar")) }, "Cambiar código")),
      holder);
  };
  mount(box, h("div", { class: "stack" },
    form,
    h("p", { class: "note" }, "Comparte el código solo con el curso correspondiente. Cuando todos se hayan inscrito, cierra la inscripción; si el código se filtra, cámbialo."),
    o.courses.length ? h("div", { class: "grid-2" }, o.courses.map(card)) : h("div", { class: "empty" }, "Todavía no hay cursos.")));
}

// ---------------------------------------------------------------- miembros
async function miembros(box) {
  let filter = "pendientes";
  const list = h("div", { class: "stack" });
  const ft = tabs([["pendientes", "Pendientes"], ["estudiantes", "Estudiantes"], ["personal", "Personal"], ["todos", "Todos"]], (k) => { filter = k; paint(); }, filter);
  mount(box, h("div", { class: "stack" }, ft.el, list));
  let courses = [];

  async function paint() {
    mount(list, loading());
    let rows;
    try {
      const [m, o] = await Promise.all([rpc("admin_members", { p_filter: filter }), rpc("admin_overview")]);
      rows = m; courses = o.courses;
    } catch (e) { mount(list, h("p", { class: "err" }, errMsg(e))); return; }
    if (!rows.length) return mount(list, h("div", { class: "empty" }, filter === "pendientes" ? "No hay cuentas pendientes." : "No hay cuentas en esta lista."));
    const pend = rows.filter((r) => r.status === "pendiente" && r.role === "estudiante");
    mount(list,
      pend.length > 1 ? h("div", { class: "row end" }, h("button", { class: "btn sm", type: "button", onclick: (e) => busy(e.currentTarget, async () => {
        for (const r of pend) { try { await rpc("admin_set_member_status", { p_id: r.id, p_status: "activa" }); } catch (x) { toast(errMsg(x)); } }
        toast(`${pend.length} cuentas aprobadas`); paint();
      }) }, `Aprobar a los ${pend.length} estudiantes`)) : null,
      h("div", { class: "card t-wrap" }, h("table", { class: "t" },
        h("thead", null, h("tr", null, ["Cuenta", "Rol", "Curso", "Estado", "Alta", "Acciones"].map((x) => h("th", null, x)))),
        h("tbody", null, rows.map(row)))));
  }

  function row(r) {
    const holder = h("div");
    const set = (s) => async () => { try { await rpc("admin_set_member_status", { p_id: r.id, p_status: s }); toast("Listo"); paint(); } catch (x) { toast(errMsg(x)); } };
    const btn = (t, fn, cls = "btn soft sm") => h("button", { class: cls, type: "button", onclick: (e) => busy(e.currentTarget, fn) }, t);
    const acts = [];
    if (!r.is_me) {
      if (r.status === "pendiente") acts.push(btn("Aprobar", set("activa"), "btn sm"), btn("Rechazar", set("rechazada")));
      if (r.status === "activa") acts.push(h("button", { class: "btn soft sm", type: "button", onclick: () => confirmInline(holder, "La persona perderá el acceso de inmediato y se cerrarán sus sesiones abiertas.", "Suspender", set("suspendida")) }, "Suspender"));
      if (r.status === "suspendida" || r.status === "rechazada") acts.push(btn("Reactivar", set("activa")));
      if (r.status === "activa" && ["estudiante", "docente", "profesional"].includes(r.role)) {
        acts.push(h("button", { class: "btn soft sm", type: "button", onclick: () => confirmInline(holder, "Se generará una contraseña temporal, se cerrarán sus sesiones y deberá cambiarla al ingresar. Entrégasela en persona.", "Restablecer", async () => {
          try {
            const res = await rpc("admin_reset_password", { p_id: r.id });
            mount(holder, h("div", { class: "card flat stack tight mt" },
              h("p", { class: "small" }, "Contraseña temporal. Se muestra una sola vez:"),
              h("p", { class: "codebox" }, res.temp_password),
              h("div", { class: "row" }, h("button", { class: "btn soft sm", type: "button", onclick: () => copy(res.temp_password) }, "Copiar"),
                h("button", { class: "btn soft sm", type: "button", onclick: () => mount(holder) }, "Ocultar"))));
          } catch (x) { toast(errMsg(x)); }
        }) }, "Restablecer contraseña"));
      }
    }
    if (r.role === "estudiante" && courses.length) {
      const sel = select(courses.map((c) => [c.id, c.name]), { "aria-label": "Curso" }, r.course_id);
      sel.addEventListener("change", async () => {
        try { await rpc("admin_set_member_course", { p_id: r.id, p_course: sel.value }); toast("Curso actualizado"); } catch (x) { toast(errMsg(x)); }
      });
      acts.push(sel);
    }
    if (r.role === "docente" && r.status === "activa") {
      acts.push(h("button", { class: "btn soft sm", type: "button", onclick: () => teacherCourses(holder, r) }, "Cursos asignados"));
    }
    return [h("tr", null,
      h("td", null, h("b", null, r.username || r.display_name || "–"), r.is_me ? h("span", { class: "tiny muted" }, " (tú)") : null),
      h("td", null, ROLE[r.role] || r.role),
      h("td", null, r.role === "docente" ? (r.courses || []).join(", ") || "–" : r.course || "–"),
      h("td", null, h("span", { class: "pill " + STATUS[r.status][1] }, STATUS[r.status][0])),
      h("td", { class: "small muted" }, dateTime(r.created_at)),
      h("td", null, h("div", { class: "row" }, acts))),
    h("tr", null, h("td", { colspan: 6 }, holder))];
  }

  function teacherCourses(holder, r) {
    const mine = new Set(r.courses || []);
    mount(holder, h("div", { class: "card flat stack tight mt" },
      h("p", { class: "small" }, "Marca los cursos que puede ver " + (r.display_name || "este docente") + ":"),
      h("div", { class: "grid-4" }, courses.map((c) => {
        const cb = h("input", { type: "checkbox", checked: mine.has(c.name) });
        cb.addEventListener("change", async () => {
          try { await rpc("admin_assign_teacher", { p_teacher: r.id, p_course: c.id, p_on: cb.checked }); toast("Guardado"); }
          catch (x) { cb.checked = !cb.checked; toast(errMsg(x)); }
        });
        return h("label", { class: "check" }, cb, h("span", null, c.name));
      })),
      h("div", { class: "row end" }, h("button", { class: "btn soft sm", type: "button", onclick: () => paint() }, "Listo"))));
  }
  paint();
}

// ---------------------------------------------------------------- invitaciones
async function invitaciones(box) {
  mount(box, loading());
  let o;
  try { o = await rpc("admin_overview"); } catch (e) { mount(box, h("p", { class: "err" }, errMsg(e))); return; }
  const role = select([["profesional", "Profesional en salud mental"], ["docente", "Docente"], ["admin", "Administración"]]);
  const course = select([["", "Sin curso por ahora"], ...o.courses.map((c) => [c.id, c.name])]);
  const courseF = field("Curso inicial (opcional)", course);
  courseF.hidden = true;
  role.addEventListener("change", () => { courseF.hidden = role.value !== "docente"; });
  const out = h("div");
  const err = errBox();
  const btn = h("button", { class: "btn", type: "submit" }, "Generar invitación");
  mount(box, h("div", { class: "grid-2" },
    h("form", {
      class: "card stack", novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        busy(btn, async () => {
          showErr(err, "");
          try {
            const r = await rpc("admin_create_invite", { p_role: role.value, p_course: role.value === "docente" && course.value ? course.value : null });
            const text = `Invitación a PULSO · ${o.institution.name}\nActiva tu cuenta en ${origin()}/registro/personal\nCódigo (un solo uso, vence en 7 días): ${r.code}`;
            mount(out, h("div", { class: "card ink stack" },
              eyebrow("Se muestra una sola vez"),
              h("p", { class: "codebox" }, r.code),
              h("p", { class: "small" }, "Entrégala por un canal privado. Quien la use quedará activo con el rol elegido."),
              h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: () => copy(text) }, "Copiar mensaje"))));
          } catch (x) { showErr(err, errMsg(x)); }
        });
      },
    },
      h("h3", null, "Invitar al personal"),
      h("p", { class: "small ink2" }, "Cada invitación es de un solo uso y vence en siete días. Solo se guarda su huella: si se pierde, genera otra."),
      field("Rol", role), courseF, err, btn),
    h("div", { class: "stack" }, out,
      h("div", { class: "card flat stack tight" },
        h("h3", null, "Qué puede hacer cada rol"),
        h("p", { class: "small ink2" }, "Profesional en salud mental: semáforo, solicitudes de ayuda y correlación. Usa verificación en dos pasos."),
        h("p", { class: "small ink2" }, "Docente: el clima de los cursos que le asignes. No ve solicitudes ni cuestionarios."),
        h("p", { class: "small ink2" }, "Administración: todo lo de esta pantalla, sin acceso a las solicitudes de ayuda. Invita a otra persona de administración para no depender de una sola cuenta.")))));
}

// ---------------------------------------------------------------- bitácora
async function bitacora(box) {
  mount(box, loading());
  let rows;
  try { rows = await rpc("admin_audit", { p_limit: 150 }); } catch (e) { mount(box, h("p", { class: "err" }, errMsg(e))); return; }
  const detail = (d) => {
    if (!d || typeof d !== "object") return "";
    return Object.entries(d).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ");
  };
  mount(box, h("div", { class: "card t-wrap" },
    h("p", { class: "small ink2" }, "Registro de las acciones administrativas de tu institución. No se puede editar ni borrar desde la aplicación."),
    rows.length ? h("table", { class: "t mt" },
      h("thead", null, h("tr", null, ["Fecha", "Quién", "Acción", "Detalle"].map((x) => h("th", null, x)))),
      h("tbody", null, rows.map((r) => h("tr", null,
        h("td", { class: "small" }, dateTime(r.at)),
        h("td", null, r.actor, r.actor_role ? h("span", { class: "tiny muted" }, " · " + (ROLE[r.actor_role] || r.actor_role)) : null),
        h("td", null, ACTION[r.action] || r.action),
        h("td", { class: "small muted" }, detail(r.detail))))))
      : h("div", { class: "empty mt" }, "Sin movimientos todavía.")));
}

// ---------------------------------------------------------------- ajustes
async function ajustes(box, ctx) {
  mount(box, loading());
  let o;
  try { o = await rpc("admin_overview"); } catch (e) { mount(box, h("p", { class: "err" }, errMsg(e))); return; }
  const i = o.institution;
  const k = input({ type: "number", min: 3, max: 15, value: i.min_k });
  const hn = input({ maxlength: 80, value: i.help_name });
  const hl = input({ maxlength: 30, value: i.help_line });
  const hw = input({ maxlength: 30, value: i.help_wa });
  const err = errBox();
  const save = h("button", { class: "btn", type: "submit" }, "Guardar ajustes");
  const confirmIn = input({ autocapitalize: "none", spellcheck: "false", placeholder: i.slug });
  const perr = errBox();
  const purge = h("button", { class: "btn danger", type: "button", onclick: (e) => busy(e.currentTarget, async () => {
    showErr(perr, "");
    if (confirmIn.value.trim() !== i.slug) return showErr(perr, "Escribe el código de institución exactamente para confirmar.");
    try {
      const r = await rpc("admin_purge_data");
      confirmIn.value = "";
      toast(`Se borraron ${r.checkins} registros, ${r.gad} cuestionarios, ${r.requests} solicitudes y ${r.attendance} filas de asistencia`);
    } catch (x) { showErr(perr, errMsg(x)); }
  }) }, "Borrar todos los datos");
  mount(box, h("div", { class: "grid-2" },
    h("form", {
      class: "card stack", novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        busy(save, async () => {
          showErr(err, "");
          const kv = Number(k.value);
          if (!Number.isInteger(kv) || kv < 3 || kv > 15) return showErr(err, "El mínimo de respuestas debe estar entre 3 y 15.");
          try {
            await rpc("admin_update_settings", { p_min_k: kv, p_help_name: hn.value, p_help_line: hl.value, p_help_wa: hw.value });
            toast("Ajustes guardados");
          } catch (x) { showErr(err, errMsg(x)); }
        });
      },
    },
      h("h3", null, "Privacidad y ayuda"),
      field("Respuestas mínimas para mostrar un curso", k, "Entre 3 y 15. Más alto es más privado, pero el semáforo tarda más en encenderse."),
      field("Servicio de ayuda externo", hn), h("div", { class: "grid-2" }, field("Línea", hl), field("WhatsApp", hw)),
      err, save),
    h("div", { class: "card stack" },
      eyebrow("Zona delicada"),
      h("h3", null, "Borrar los datos de la institución"),
      h("p", { class: "small ink2" }, "Elimina para siempre todos los registros diarios, cuestionarios, solicitudes de ayuda y asistencia de tu institución. Las cuentas y los cursos se conservan. Recomendado al terminar un piloto."),
      field("Escribe " + i.slug + " para confirmar", confirmIn), perr, purge)));
  void ctx;
}
