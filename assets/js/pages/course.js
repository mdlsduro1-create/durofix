// Vista de un curso, compartida por docente, profesional y administración.
import { h, mount, eyebrow, dec, dayName, dayMonth, asDate, LEVEL, legend, loading, toast } from "../ui.js";
import { rpc, errMsg } from "../sb.js";
import { lineChart } from "../charts.js";

export async function courseDetail(box, courseId) {
  mount(box, loading());
  let v;
  try { v = await rpc("course_view", { p_course: courseId }); }
  catch (e) { mount(box, h("p", { class: "err" }, errMsg(e))); return; }

  // Calendario de días hábiles de las últimas tres semanas
  const byDay = new Map(v.days.map((d) => [String(d.day).slice(0, 10), d]));
  const today = asDate(v.today);
  const cal = [];
  for (let i = 20; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const dow = d.getUTCDay();
    const key = d.toISOString().slice(0, 10);
    if ((dow === 0 || dow === 6) && !byDay.has(key)) continue;
    cal.push(byDay.get(key) || { day: key, n: 0, shown: false, is_today: i === 0, avg: null, level: null });
  }
  const tile = (d) => {
    const lv = d.n === 0 ? "vacio" : !d.shown ? "protegido" : d.level;
    const val = d.n === 0 ? "–" : !d.shown ? "·" : d.is_today ? LEVEL[lv].t : dec(d.avg, 1);
    const tip = d.n === 0 ? "Sin respuestas"
      : !d.shown ? `Protegido: ${d.n} de ${v.k} respuestas mínimas`
        : d.is_today ? `Hoy: ${LEVEL[lv].t}. El promedio se muestra al cerrar el día.` : `Promedio ${dec(d.avg)} · ${d.n} respuestas`;
    return h("div", { class: "day lv-" + lv, "data-tip": tip },
      h("b", null, d.is_today ? "Hoy" : dayName(d.day)), h("span", null, val), h("small", null, dayMonth(d.day)));
  };

  const todayRow = cal.find((d) => d.is_today);
  const tLv = !todayRow || todayRow.n === 0 ? "vacio" : !todayRow.shown ? "protegido" : todayRow.level;
  const last = v.weeks.length ? v.weeks[v.weeks.length - 1] : null;

  mount(box, h("div", { class: "stack" },
    h("div", { class: "row between" },
      h("div", null, eyebrow("Curso"), h("h2", null, v.course.name)),
      h("span", { class: "state lv-" + tLv }, "Hoy: " + LEVEL[tLv].t)),
    h("div", { class: "kpis" },
      kpi(v.enrolled, "Estudiantes activos"),
      kpi(todayRow ? todayRow.n : 0, "Respuestas hoy", `Mínimo para mostrar: ${v.k}`),
      kpi(last ? dec(last.avg) : "–", "Última semana cerrada", last ? `${last.n} respuestas` : "Sin datos suficientes")),
    h("div", { class: "card flat" },
      h("h3", null, "Últimas tres semanas"),
      h("p", { class: "tiny muted mt-s" }, "El día de hoy solo muestra un nivel; el número aparece al cerrar el día, para que nadie pueda deducir una respuesta individual."),
      h("div", { class: "strip mt" }, cal.map(tile)), legend()),
    h("div", { class: "card flat" },
      h("h3", null, "Promedio por semana"),
      v.weeks.length
        ? h("div", { class: "chart-box mt" }, lineChart(v.weeks))
        : h("div", { class: "empty mt" }, "Aún no hay semanas con suficientes respuestas."))));
}

export const kpi = (v, k, d) => h("div", { class: "card kpi" }, h("div", { class: "v" }, String(v)), h("div", { class: "k" }, k), d ? h("div", { class: "d" }, d) : null);

export function safe(fn) {
  return async (...a) => { try { return await fn(...a); } catch (e) { toast(errMsg(e)); } };
}
