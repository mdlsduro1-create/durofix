// Gráficos en SVG construidos con nodos (sin HTML de texto).
import { h, dayMonth, dec } from "./ui.js";

export function pearson(pts) {
  const n = pts.length;
  if (n < 3) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pts) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
  if (!sxx || !syy) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export function strength(r) {
  const a = Math.abs(r);
  const s = a < 0.1 ? "nula" : a < 0.3 ? "débil" : a < 0.5 ? "moderada" : a < 0.7 ? "fuerte" : "muy fuerte";
  return s + (a < 0.1 ? "" : r > 0 ? ", positiva" : ", negativa");
}

// Línea semanal del promedio de bienestar (escala 1 a 5)
export function lineChart(rows, { label = "Promedio" } = {}) {
  const W = 640, H = 240, m = { l: 36, r: 16, t: 16, b: 34 };
  const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Tendencia semanal del bienestar" });
  const Y = (v) => m.t + (H - m.t - m.b) * (1 - (v - 1) / 4);
  const ax = h("g", { class: "ax" });
  for (let v = 1; v <= 5; v++) {
    ax.appendChild(h("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }));
    ax.appendChild(h("text", { x: m.l - 10, y: Y(v) + 4, "text-anchor": "end" }, String(v)));
  }
  // Bandas de umbral
  ax.appendChild(h("line", { x1: m.l, x2: W - m.r, y1: Y(3.5), y2: Y(3.5), "stroke-dasharray": "4 4" }));
  ax.appendChild(h("line", { x1: m.l, x2: W - m.r, y1: Y(2.7), y2: Y(2.7), "stroke-dasharray": "4 4" }));
  svg.appendChild(ax);
  if (!rows.length) return svg;
  const X = (i) => rows.length === 1 ? (m.l + W - m.r) / 2 : m.l + 10 + (W - m.l - m.r - 20) * (i / (rows.length - 1));
  const pts = rows.map((r, i) => `${X(i).toFixed(1)},${Y(Number(r.avg)).toFixed(1)}`).join(" ");
  svg.appendChild(h("polyline", { points: pts, fill: "none", stroke: "currentColor", "stroke-width": 2.2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  rows.forEach((r, i) => {
    svg.appendChild(h("circle", { cx: X(i), cy: Y(Number(r.avg)), r: 4.5, fill: "currentColor" }));
    svg.appendChild(h("circle", { cx: X(i), cy: Y(Number(r.avg)), r: 14, fill: "transparent",
      "data-tip": `Semana del ${dayMonth(r.week)} · ${label} ${dec(r.avg)} · ${r.n} respuestas` }));
    svg.appendChild(h("text", { class: "chart-label", x: X(i), y: H - 12, "text-anchor": "middle" }, dayMonth(r.week)));
  });
  return svg;
}

// Dispersión bienestar (x) contra asistencia (y)
export function scatter(pts) {
  const W = 640, H = 300, m = { l: 46, r: 16, t: 16, b: 40 };
  const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Relación entre bienestar y asistencia" });
  const ys = pts.map((p) => p.y);
  const y0 = Math.max(0, Math.floor((Math.min(...ys, 80) - 2) / 5) * 5), y1 = 100;
  const X = (v) => m.l + (W - m.l - m.r) * ((v - 1) / 4);
  const Y = (v) => m.t + (H - m.t - m.b) * (1 - (v - y0) / (y1 - y0));
  const ax = h("g", { class: "ax" });
  for (let v = y0; v <= y1; v += 5) {
    ax.appendChild(h("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }));
    ax.appendChild(h("text", { x: m.l - 8, y: Y(v) + 4, "text-anchor": "end" }, v + "%"));
  }
  for (let v = 1; v <= 5; v++) ax.appendChild(h("text", { x: X(v), y: H - 16, "text-anchor": "middle" }, String(v)));
  ax.appendChild(h("text", { x: (W + m.l) / 2, y: H - 2, "text-anchor": "middle" }, "Bienestar promedio de la semana"));
  svg.appendChild(ax);
  // Recta de mínimos cuadrados
  if (pts.length >= 3) {
    const n = pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
    const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    if (sxx) {
      const b = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx, a0 = my - b * mx;
      const xa = Math.min(...pts.map((p) => p.x)), xb = Math.max(...pts.map((p) => p.x));
      const clampY = (v) => Math.max(y0, Math.min(y1, v));
      svg.appendChild(h("line", { x1: X(xa), y1: Y(clampY(a0 + b * xa)), x2: X(xb), y2: Y(clampY(a0 + b * xb)),
        stroke: "currentColor", "stroke-width": 1.5, "stroke-dasharray": "6 5", opacity: .55 }));
    }
  }
  for (const p of pts) {
    svg.appendChild(h("circle", { cx: X(p.x), cy: Y(p.y), r: 5.5, fill: "currentColor", opacity: .82 }));
    svg.appendChild(h("circle", { cx: X(p.x), cy: Y(p.y), r: 13, fill: "transparent",
      "data-tip": `${p.c} · semana del ${dayMonth(p.w)} · bienestar ${dec(p.x)} · asistencia ${dec(p.y, 1)}%` }));
  }
  return svg;
}
