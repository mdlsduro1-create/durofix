// Programación de actividades por curso y recursos de bienestar.
// Lo usan la administración y la profesional en salud mental.
import { h, mount, eyebrow, field, input, select, errBox, showErr, busy, toast, loading, confirmInline, dayMonth } from "../ui.js";
import { rpc, errMsg } from "../sb.js";

const KIND = { animo: "Registro de ánimo", gad7: "Cuestionario GAD-7" };
const DAYS = [[1, "L"], [2, "M"], [3, "X"], [4, "J"], [5, "V"], [6, "S"], [7, "D"]];
const DAY_NAMES = { 1: "lunes", 2: "martes", 3: "miércoles", 4: "jueves", 5: "viernes", 6: "sábado", 7: "domingo" };

export const todayLP = (plusDays = 0) => {
  const d = new Date(Date.now() + plusDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};
const nowLP = (plusMin = 0) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hour12: false })
  .format(new Date(Date.now() + plusMin * 60000));

function describe(s) {
  const hours = `de ${s.from} a ${s.to}`;
  if (s.mode === "unica") return `El ${dayMonth(s.starts_on)}, ${hours}`;
  const d = [...s.days].sort();
  const days = d.join(",") === "1,2,3,4,5" ? "De lunes a viernes" : d.length === 7 ? "Todos los días" : "Los " + d.map((x) => DAY_NAMES[x]).join(", ");
  return `${days}, ${hours}, desde el ${dayMonth(s.starts_on)}${s.ends_on ? " hasta el " + dayMonth(s.ends_on) : ""}`;
}

// ---------------------------------------------------------------- programación
export async function schedules(box) {
  mount(box, loading());
  let courses, list;
  try {
    const [ov, sl] = await Promise.all([rpc("pro_overview"), rpc("sched_list")]);
    courses = ov.courses.map((c) => ({ id: c.id, name: c.name }));
    list = sl;
  } catch (e) { mount(box, h("p", { class: "err" }, errMsg(e))); return; }

  let editing = null;
  const kind = select(Object.entries(KIND));
  const prompt = input({ maxlength: 140, placeholder: "¿Cómo te sientes hoy?" });
  const promptF = field("Pregunta para el alumnado (opcional)", prompt, "Por ejemplo: ¿Cómo llegas al examen de hoy?");
  kind.addEventListener("change", () => { promptF.hidden = kind.value !== "animo"; });

  const selCourses = new Set();
  const courseBox = h("div", { class: "chips" });
  const paintCourses = () => mount(courseBox,
    h("button", { type: "button", class: "chip-t", "aria-pressed": String(selCourses.size === courses.length && courses.length > 0), onclick: () => {
      if (selCourses.size === courses.length) selCourses.clear(); else courses.forEach((c) => selCourses.add(c.id));
      paintCourses();
    } }, "Todos"),
    courses.map((c) => h("button", { type: "button", class: "chip-t", "aria-pressed": String(selCourses.has(c.id)), onclick: () => {
      selCourses.has(c.id) ? selCourses.delete(c.id) : selCourses.add(c.id); paintCourses();
    } }, c.name)));

  const mode = select([["recurrente", "Se repite"], ["unica", "Una sola vez"]]);
  const date = input({ type: "date", value: todayLP() });
  const until = input({ type: "date" });
  const untilF = field("Hasta (opcional)", until);
  const dateF = field("Desde", date);
  const selDays = new Set([1, 2, 3, 4, 5]);
  const dayBox = h("div", { class: "chips" });
  const paintDays = () => mount(dayBox, DAYS.map(([n, t]) => h("button", {
    type: "button", class: "chip-t day-t", "aria-pressed": String(selDays.has(n)), "aria-label": DAY_NAMES[n],
    onclick: () => { selDays.has(n) ? selDays.delete(n) : selDays.add(n); paintDays(); },
  }, t)));
  const daysF = h("div", { class: "f" }, "Días", dayBox);
  const syncMode = () => {
    const once = mode.value === "unica";
    untilF.hidden = once; daysF.hidden = once;
    dateF.firstChild.textContent = once ? "Fecha" : "Desde";
  };
  mode.addEventListener("change", syncMode);
  const from = input({ type: "time", value: "07:45" });
  const to = input({ type: "time", value: "08:15" });
  const err = errBox();
  const save = h("button", { class: "btn", type: "submit" }, "Programar");
  const cancel = h("button", { class: "btn soft", type: "button", hidden: true, onclick: () => resetForm() }, "Cancelar edición");
  const title = h("h3", null, "Nueva actividad");

  function resetForm() {
    editing = null; title.textContent = "Nueva actividad"; save.textContent = "Programar"; cancel.hidden = true;
    courseBox.parentElement.hidden = false;
    prompt.value = ""; kind.value = "animo"; mode.value = "recurrente"; date.value = todayLP(); until.value = "";
    from.value = "07:45"; to.value = "08:15"; selDays.clear(); [1, 2, 3, 4, 5].forEach((d) => selDays.add(d));
    promptF.hidden = false; syncMode(); paintDays(); showErr(err, "");
  }
  function edit(s) {
    editing = s; title.textContent = "Editar actividad · " + s.course; save.textContent = "Guardar cambios"; cancel.hidden = false;
    courseBox.parentElement.hidden = true;
    kind.value = s.kind; prompt.value = s.prompt || ""; mode.value = s.mode; date.value = String(s.starts_on).slice(0, 10);
    until.value = s.ends_on ? String(s.ends_on).slice(0, 10) : ""; from.value = s.from; to.value = s.to;
    selDays.clear(); s.days.forEach((d) => selDays.add(d));
    promptF.hidden = s.kind !== "animo"; syncMode(); paintDays();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const preset = (label, fn) => h("button", { type: "button", class: "btn soft sm", onclick: fn }, label);
  const presets = h("div", { class: "row" },
    preset("Ahora, por 30 minutos", () => {
      mode.value = "unica"; date.value = todayLP(); from.value = nowLP();
      to.value = nowLP(30) > nowLP() ? nowLP(30) : "23:59"; syncMode();
    }),
    preset("Al entrar, de lunes a viernes", () => {
      mode.value = "recurrente"; selDays.clear(); [1, 2, 3, 4, 5].forEach((d) => selDays.add(d));
      from.value = "07:45"; to.value = "08:15"; syncMode(); paintDays();
    }),
    preset("GAD-7 en el recreo de hoy", () => {
      kind.value = "gad7"; promptF.hidden = true; mode.value = "unica"; date.value = todayLP();
      from.value = "10:00"; to.value = "10:30"; syncMode();
    }));

  const form = h("form", {
    class: "card stack", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      busy(save, async () => {
        showErr(err, "");
        if (!editing && !selCourses.size) return showErr(err, "Elige al menos un curso.");
        if (!date.value) return showErr(err, "Elige la fecha.");
        if (!from.value || !to.value || to.value <= from.value) return showErr(err, "La hora de cierre debe ser posterior a la de inicio.");
        if (mode.value === "recurrente" && !selDays.size) return showErr(err, "Elige al menos un día.");
        if (mode.value === "recurrente" && until.value && until.value < date.value) return showErr(err, "La fecha final no puede ser anterior a la inicial.");
        try {
          const r = await rpc("sched_save", {
            p_id: editing ? editing.id : null, p_courses: editing ? null : [...selCourses], p_kind: kind.value,
            p_prompt: kind.value === "animo" ? prompt.value : null, p_mode: mode.value, p_starts: date.value,
            p_ends: mode.value === "recurrente" && until.value ? until.value : null, p_days: [...selDays], p_from: from.value, p_to: to.value,
          });
          toast(editing ? "Cambios guardados" : `Programada en ${r.saved} ${r.saved === 1 ? "curso" : "cursos"}`);
          schedules(box);
        } catch (x) { showErr(err, errMsg(x)); }
      });
    },
  },
    title,
    h("p", { class: "small ink2" }, "El alumnado solo puede responder dentro del horario que definas. Fuera de él, la actividad no aparece."),
    h("div", null, h("p", { class: "tiny muted" }, "Atajos"), presets),
    h("div", { class: "grid-2" }, field("Actividad", kind), field("Frecuencia", mode)),
    promptF,
    h("div", { class: "f" }, "Cursos", courseBox),
    h("div", { class: "grid-2" }, dateF, untilF),
    daysF,
    h("div", { class: "grid-2" }, field("Abre a las", from), field("Cierra a las", to)),
    err, h("div", { class: "row between" }, cancel, save));

  const byCourse = new Map();
  list.forEach((s) => { if (!byCourse.has(s.course)) byCourse.set(s.course, []); byCourse.get(s.course).push(s); });
  const item = (s) => {
    const holder = h("div");
    const act = async (a) => { try { await rpc("sched_set", { p_id: s.id, p_action: a }); toast(a === "borrar" ? "Programación borrada" : a === "pausar" ? "Pausada" : "Activada"); schedules(box); } catch (x) { toast(errMsg(x)); } };
    return h("div", { class: "req" },
      h("div", { class: "req-head" },
        h("b", null, KIND[s.kind]),
        h("span", { class: "pill " + (!s.active ? "p-soft" : s.open_now ? "p-dark" : "p-line") }, !s.active ? "Pausada" : s.open_now ? "Abierta ahora" : "Programada")),
      h("p", { class: "small ink2" }, describe(s)),
      s.prompt ? h("p", { class: "small" }, "“" + s.prompt + "”") : null,
      h("div", { class: "row" },
        h("button", { class: "btn soft sm", type: "button", onclick: () => edit(s) }, "Editar"),
        h("button", { class: "btn soft sm", type: "button", onclick: (e) => busy(e.currentTarget, () => act(s.active ? "pausar" : "activar")) }, s.active ? "Pausar" : "Activar"),
        h("button", { class: "btn soft sm", type: "button", onclick: () => confirmInline(holder, "Se borra esta programación. Las respuestas ya guardadas no se pierden.", "Borrar", () => act("borrar")) }, "Borrar")),
      holder);
  };

  mount(box, h("div", { class: "stack" },
    h("div", { class: "grid-2" },
      form,
      h("div", { class: "stack" },
        h("div", { class: "card flat stack tight" },
          eyebrow("Cómo funciona"),
          h("p", { class: "small ink2" }, "Registro de ánimo: una pregunta con cinco caras. Puedes cambiar la pregunta en cada programación."),
          h("p", { class: "small ink2" }, "Cuestionario GAD-7: siete preguntas validadas sobre ansiedad. Cada estudiante lo responde una vez por cada apertura."),
          h("p", { class: "small ink2" }, "Si un curso no tiene nada programado, el alumnado no ve ninguna actividad, solo sus recursos y herramientas.")),
        byCourse.size ? [...byCourse.entries()].map(([c, items]) => h("div", { class: "card stack tight" }, h("h3", null, c), items.map(item)))
          : h("div", { class: "empty" }, "Todavía no hay actividades programadas. Mientras tanto, el alumnado no puede registrar nada.")))));
  paintCourses(); paintDays(); syncMode();
}

// ---------------------------------------------------------------- recursos
const RKIND = { lectura: "Lectura", recomendacion: "Recomendación", enlace: "Enlace" };

export async function resources(box) {
  mount(box, loading());
  let list, courses;
  try {
    const [rl, ov] = await Promise.all([rpc("res_list"), rpc("pro_overview")]);
    list = rl; courses = ov.courses;
  } catch (e) { mount(box, h("p", { class: "err" }, errMsg(e))); return; }
  let editing = null;
  const kind = select(Object.entries(RKIND));
  const title = input({ maxlength: 100, placeholder: "Por ejemplo: Cómo preparar un examen sin agobiarte" });
  const body = h("textarea", { class: "input", maxlength: 2000, rows: 6, placeholder: "Texto que verá el alumnado" });
  const url = input({ type: "url", maxlength: 300, placeholder: "https://" });
  const course = select([["", "Todos los cursos"], ...courses.map((c) => [c.id, c.name])]);
  const pinned = h("input", { type: "checkbox" });
  const err = errBox();
  const save = h("button", { class: "btn", type: "submit" }, "Publicar");
  const head = h("h3", null, "Nuevo recurso");
  const cancel = h("button", { class: "btn soft", type: "button", hidden: true, onclick: () => resources(box) }, "Cancelar edición");
  const form = h("form", {
    class: "card stack", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      busy(save, async () => {
        showErr(err, "");
        if (title.value.trim().length < 3) return showErr(err, "Escribe un título.");
        if (url.value.trim() && !/^https:\/\/\S+$/.test(url.value.trim())) return showErr(err, "El enlace debe empezar con https://");
        if (kind.value === "enlace" && !url.value.trim()) return showErr(err, "Agrega el enlace.");
        try {
          await rpc("res_save", { p_id: editing, p_kind: kind.value, p_title: title.value, p_body: body.value, p_url: url.value, p_course: course.value || null, p_pinned: pinned.checked });
          toast(editing ? "Recurso actualizado" : "Recurso publicado");
          resources(box);
        } catch (x) { showErr(err, errMsg(x)); }
      });
    },
  }, head,
    h("div", { class: "grid-2" }, field("Tipo", kind), field("Para", course)),
    field("Título", title), field("Texto", body), field("Enlace (opcional)", url, "Solo enlaces seguros que empiecen con https://"),
    h("label", { class: "check" }, pinned, h("span", null, "Fijar arriba en el panel del alumnado")),
    err, h("div", { class: "row between" }, cancel, save));

  const item = (r) => {
    const holder = h("div");
    return h("div", { class: "req" },
      h("div", { class: "req-head" }, h("b", null, r.title), h("span", { class: "pill p-line" }, RKIND[r.kind]),
        r.pinned ? h("span", { class: "pill p-dark" }, "Fijado") : null, h("span", null, r.course || "Todos los cursos")),
      r.body ? h("p", { class: "small ink2 clamp" }, r.body) : null,
      r.url ? h("p", { class: "tiny mono" }, r.url) : null,
      h("div", { class: "row" },
        h("button", { class: "btn soft sm", type: "button", onclick: () => {
          editing = r.id; head.textContent = "Editar recurso"; save.textContent = "Guardar cambios"; cancel.hidden = false;
          kind.value = r.kind; title.value = r.title; body.value = r.body || ""; url.value = r.url || ""; course.value = r.course_id || ""; pinned.checked = r.pinned;
          form.scrollIntoView({ behavior: "smooth", block: "start" });
        } }, "Editar"),
        h("button", { class: "btn soft sm", type: "button", onclick: () => confirmInline(holder, "El recurso dejará de verse en el panel del alumnado.", "Borrar", async () => {
          try { await rpc("res_delete", { p_id: r.id }); toast("Recurso borrado"); resources(box); } catch (x) { toast(errMsg(x)); }
        }) }, "Borrar")),
      holder);
  };
  mount(box, h("div", { class: "grid-2" },
    form,
    h("div", { class: "stack" },
      h("p", { class: "note" }, "El alumnado ya tiene una biblioteca básica de lecturas y juegos. Lo que publiques aquí aparece primero, con el nombre de tu institución."),
      list.length ? h("div", { class: "card stack tight" }, h("h3", null, `Publicados (${list.length})`), list.map(item))
        : h("div", { class: "empty" }, "Todavía no publicaste recursos."))));
}
