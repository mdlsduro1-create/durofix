// Panel de la profesional en salud mental (y piezas que reutiliza la administración).
import { h, mount, eyebrow, tabs, dec, LEVEL, legend, loading, errBox, showErr, busy, toast, field, select, ago, dateTime, download } from "../ui.js";
import { rpc, errMsg } from "../sb.js";
import { lineChart, scatter, pearson, strength } from "../charts.js";
import { panelHead } from "./app.js";
import { courseDetail, kpi } from "./course.js";

export async function pro(root, ctx) {
  document.title = "Semáforo · PULSO";
  const box = h("div", { class: "mt" });
  const t = tabs([["semaforo", "Semáforo"], ["tendencia", "Tendencia"], ["solicitudes", "Solicitudes"], ["asistencia", "Asistencia y correlación"]],
    (k) => ({ semaforo, tendencia, solicitudes, asistencia: correlacion })[k](box), "semaforo");
  mount(root, h("div", { class: "view" },
    panelHead(ctx, "Semáforo de la institución", "Qué cursos necesitan atención, cómo cambian y quién pidió conversar."),
    t.el, box));
  semaforo(box);
}

// ---------------------------------------------------------------- semáforo
export async function semaforo(box) {
  mount(box, loading());
  let o;
  try { o = await rpc("pro_overview"); } catch (e) { mount(box, h("p", { class: "err" }, errMsg(e))); return; }
  const detail = h("div", { class: "card mt", hidden: true });
  const lvOf = (c) => c.avg7 !== null && c.avg7 !== undefined ? (c.avg7 >= 3.5 ? "estable" : c.avg7 >= 2.7 ? "atencion" : "alerta") : (c.n7 || c.prot_days || c.today_n) ? "protegido" : "vacio";
  const counts = { estable: 0, atencion: 0, alerta: 0, protegido: 0, vacio: 0 };
  o.courses.forEach((c) => counts[lvOf(c)]++);
  const gadFlag = o.courses.filter((c) => c.gad_high !== null && c.gad_high !== undefined && c.gad_n && c.gad_high / c.gad_n >= 0.25).length;

  const list = h("div", { class: "courses" }, o.courses.map((c) => {
    const lv = lvOf(c);
    const today = c.today_n === 0 ? "Hoy: sin respuestas" : c.today_level ? "Hoy: " + LEVEL[c.today_level].t : `Hoy: protegido (${c.today_n})`;
    return h("button", {
      class: "course lv-" + lv, type: "button", "aria-pressed": "false",
      "data-tip": `${c.name} · ${LEVEL[lv].t} · ${c.n7} respuestas en 7 días · ${c.enrolled} estudiantes`,
      onclick: (e) => {
        list.querySelectorAll(".course").forEach((b) => b.setAttribute("aria-pressed", "false"));
        e.currentTarget.setAttribute("aria-pressed", "true");
        detail.hidden = false;
        courseDetail(detail, c.id).then(() => detail.scrollIntoView({ behavior: "smooth", block: "start" }));
      },
    },
      h("span", { class: "dots", "aria-hidden": "true" }, [0, 1, 2, 3, 4].map((i) => h("i", { class: i < Math.min(5, c.ok_days) ? "on" : "" }))),
      h("h4", null, c.name),
      h("p", { class: "lv" }, LEVEL[lv].t),
      h("p", { class: "av" }, c.avg7 !== null && c.avg7 !== undefined ? dec(c.avg7) : "–"),
      h("p", { class: "today" }, today));
  }));

  mount(box, h("div", { class: "stack" },
    h("div", { class: "kpis" },
      kpi(counts.alerta, "Cursos en alerta", "Promedio de 7 días menor a 2,7"),
      kpi(counts.atencion, "Cursos en atención", "Entre 2,7 y 3,5"),
      kpi(o.pending_requests, "Solicitudes nuevas", "Esperan tu respuesta"),
      kpi(gadFlag, "Cursos con señal GAD-7", "25 % o más con puntaje de 10 o más")),
    h("div", { class: "card" },
      h("div", { class: "row between" }, h("h3", null, "Cursos, últimos siete días cerrados"), h("span", { class: "tiny muted" }, `Mínimo para mostrar: ${o.k} respuestas`)),
      o.courses.length ? h("div", { class: "mt" }, list) : h("div", { class: "empty mt" }, "Aún no hay cursos. La administración debe crearlos."),
      legend(),
      h("p", { class: "tiny muted mt-s" }, "Los puntos indican cuántos de los últimos días tuvieron respuestas suficientes. Toca un curso para ver su detalle.")),
    detail));
}

// ---------------------------------------------------------------- tendencia
export async function tendencia(box) {
  mount(box, loading());
  let rows;
  try { rows = await rpc("pro_weeks", { p_weeks: 12 }); } catch (e) { mount(box, h("p", { class: "err" }, errMsg(e))); return; }
  const first = rows[0], last = rows[rows.length - 1];
  const delta = rows.length >= 2 ? last.avg - first.avg : null;
  mount(box, h("div", { class: "stack" },
    h("div", { class: "kpis" },
      kpi(last ? dec(last.avg) : "–", "Última semana cerrada", last ? `${last.n} respuestas` : "Sin datos suficientes"),
      kpi(delta === null ? "–" : (delta > 0 ? "+" : "") + dec(delta), "Cambio en el periodo", "Desde la primera semana con datos"),
      kpi(rows.reduce((a, r) => a + Number(r.n), 0), "Respuestas consideradas", "Solo días con el mínimo cumplido")),
    h("div", { class: "card" },
      h("h3", null, "Bienestar promedio de la institución, por semana"),
      h("p", { class: "tiny muted mt-s" }, "Las líneas punteadas marcan los umbrales de atención (3,5) y de alerta (2,7)."),
      rows.length ? h("div", { class: "chart-box mt" }, lineChart(rows)) : h("div", { class: "empty mt" }, "Aún no hay semanas con suficientes respuestas."))));
}

// ---------------------------------------------------------------- solicitudes
const REQ = { pendiente: "Pendiente", conversacion: "En conversación", derivada: "Derivada", cerrada: "Cerrada" };
const REQ_PILL = { pendiente: "p-dark", conversacion: "p-mid", derivada: "p-line", cerrada: "p-soft" };

async function solicitudes(box) {
  mount(box, loading());
  let rows;
  try { rows = await rpc("pro_requests"); } catch (e) { mount(box, h("p", { class: "err" }, errMsg(e))); return; }
  const open = rows.filter((r) => r.status !== "cerrada");
  const closed = rows.filter((r) => r.status === "cerrada");
  const item = (r) => {
    const st = select(Object.entries(REQ), {}, r.status);
    const der = h("input", { class: "input", maxlength: 80, value: r.derived_to || "", placeholder: "Servicio o institución" });
    const derF = field("Derivada a", der);
    derF.hidden = r.status !== "derivada";
    st.addEventListener("change", () => { derF.hidden = st.value !== "derivada"; });
    const note = h("input", { class: "input", maxlength: 400, value: r.note || "", placeholder: "Solo la ves tú" });
    const err = errBox();
    const save = h("button", { class: "btn sm", type: "button", onclick: (e) => busy(e.currentTarget, async () => {
      showErr(err, "");
      if (st.value === "derivada" && !der.value.trim()) return showErr(err, "Indica a dónde se derivó.");
      try {
        await rpc("pro_update_request", { p_id: r.id, p_status: st.value, p_derived_to: der.value, p_note: note.value });
        toast("Solicitud actualizada");
        solicitudes(box);
      } catch (x) { showErr(err, errMsg(x)); }
    }) }, "Guardar");
    return h("article", { class: "req" },
      h("div", { class: "req-head" },
        h("span", { class: "mono" }, r.username || "estudiante"), h("span", null, r.course || "Sin curso"),
        h("span", { "data-tip": dateTime(r.created_at) }, ago(r.created_at)),
        h("span", { class: "pill " + REQ_PILL[r.status] }, REQ[r.status])),
      r.message ? h("p", { class: "small" }, "“" + r.message + "”") : h("p", { class: "small muted" }, "Sin mensaje."),
      r.contact ? h("p", { class: "small ink2" }, "Prefiere: " + r.contact) : null,
      h("div", { class: "req-actions" }, field("Estado", st), derF, field("Nota privada", note), save), err);
  };
  mount(box, h("div", { class: "stack" },
    h("div", { class: "note" }, "Estas solicitudes son la única información identificable de PULSO, y solo tú las ves. Ninguna acción sobre ellas queda en la bitácora de la administración."),
    h("div", { class: "card stack" }, h("h3", null, `Abiertas (${open.length})`),
      open.length ? open.map(item) : h("div", { class: "empty" }, "No hay solicitudes abiertas.")),
    closed.length ? h("details", { class: "card" }, h("summary", null, `Cerradas (${closed.length})`), h("div", { class: "stack mt" }, closed.map(item))) : null));
}

// ---------------------------------------------------------------- asistencia y correlación
export async function correlacion(box) {
  let lag = 0;
  const chart = h("div");
  const ta = h("textarea", { class: "input mono", rows: 6, spellcheck: "false", placeholder: "curso,semana,asistencia\n4.º B,2026-11-16,92.5\n4.º B,2026-11-23,88" });
  const err = errBox();
  const up = h("button", { class: "btn", type: "button", onclick: (e) => busy(e.currentTarget, async () => {
    showErr(err, "");
    const rows = parseCsv(ta.value);
    if (!rows.length) return showErr(err, "No se encontraron filas válidas. Usa el formato curso, semana (AAAA-MM-DD), asistencia en porcentaje.");
    try {
      const r = await rpc("admin_set_attendance", { p_rows: rows });
      toast(`${r.rows} filas guardadas${r.bad ? ", " + r.bad + " ignoradas" : ""}`);
      if (r.bad) showErr(err, `${r.bad} filas no se guardaron: revisa que el nombre del curso sea exacto y el porcentaje esté entre 0 y 100.`);
      ta.value = "";
      paintChart();
    } catch (x) { showErr(err, errMsg(x)); }
  }) }, "Cargar asistencia");

  async function paintChart() {
    mount(chart, loading());
    let rows;
    try { rows = await rpc("pro_correlation", { p_lag: lag }); } catch (e) { mount(chart, h("p", { class: "err" }, errMsg(e))); return; }
    const pts = rows.map((r) => ({ x: Number(r.avg), y: Number(r.pct), c: r.course, w: r.week }));
    const r = pearson(pts);
    const lagTabs = tabs([["0", "Misma semana"], ["1", "Semana siguiente"]], (k) => { lag = Number(k); paintChart(); }, String(lag));
    mount(chart, h("div", { class: "stack" },
      h("div", { class: "row between" }, h("h3", null, "Bienestar contra asistencia"), lagTabs.el),
      h("div", { class: "kpis" },
        kpi(r === null ? "–" : dec(r), "Coeficiente r de Pearson", r === null ? "Se necesitan al menos 3 semanas" : "Relación " + strength(r)),
        kpi(r === null ? "–" : dec(r * r * 100, 0) + " %", "Coeficiente de determinación", "Parte de la variación compartida"),
        kpi(pts.length, "Pares curso y semana", "Solo semanas con el mínimo de respuestas")),
      pts.length ? h("div", { class: "chart-box" }, scatter(pts)) : h("div", { class: "empty" }, "Carga la asistencia semanal para ver la relación."),
      h("p", { class: "tiny muted" }, "Una correlación no demuestra que una cosa cause la otra. Con pocas semanas el valor es inestable: interprétalo con cautela.")));
  }

  mount(box, h("div", { class: "stack" },
    h("div", { class: "card" }, chart),
    h("div", { class: "card stack" },
      h("h3", null, "Cargar asistencia semanal"),
      h("p", { class: "small ink2" }, "Pega filas con el nombre exacto del curso, el lunes de la semana y el porcentaje de asistencia. Puedes copiarlas desde una hoja de cálculo; si una semana ya existe, se actualiza."),
      field("Datos", ta), err,
      h("div", { class: "row between" },
        h("button", { class: "btn soft sm", type: "button", onclick: () => download("plantilla_asistencia.csv", "curso,semana,asistencia\n4.º B,2026-11-16,92.5\n", "text/csv") }, "Descargar plantilla"),
        up))));
  paintChart();
}

function parseCsv(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    // Admite coma, punto y coma o tabulación; el porcentaje puede usar coma decimal si el separador no es coma.
    let cells = line.includes("\t") ? line.split("\t") : line.includes(";") ? line.split(";") : line.split(",");
    cells = cells.map((s) => s.trim());
    if (cells.length > 3 && !line.includes("\t") && !line.includes(";")) cells = [cells[0], cells[1], cells.slice(2).join(".")];
    if (cells.length < 3 || /^curso$/i.test(cells[0])) continue;
    const pct = Number(String(cells[2]).replace("%", "").replace(",", "."));
    if (!cells[0] || !/^\d{4}-\d{2}-\d{2}$/.test(cells[1]) || !isFinite(pct)) continue;
    out.push({ course: cells[0], week_start: cells[1], pct });
  }
  return out.slice(0, 2000);
}
