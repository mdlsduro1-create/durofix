// Utilidades de interfaz. Todo el texto entra con textContent: nunca se inserta HTML de datos.

export function h(tag, attrs, ...kids) {
  const svgTags = h.SVG.has(tag);
  const el = svgTags ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.setAttribute("class", v);
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "value" && !svgTags) el.value = v;
      else if (k === "checked" || k === "disabled" || k === "selected") { el[k] = !!v; if (v) el.setAttribute(k, ""); }
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(el, kids);
  return el;
}
h.SVG = new Set(["svg", "path", "circle", "line", "polyline", "polygon", "rect", "text", "g", "title"]);

function append(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const mount = (el, ...kids) => { clear(el); append(el, kids); return el; };

// Estrella de cuatro puntas
export const STAR = "M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z";
export const star = (cls) => h("svg", { viewBox: "0 0 24 24", class: cls, "aria-hidden": "true" }, h("path", { d: STAR }));

// Íconos de trazo (24x24)
const ICONS = {
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M11 18h2",
  shield: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z M9 12l2 2 4-4",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  chat: "M4 4h16v12H8l-4 4z",
  lock: "M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4",
  key: "M15 7a4 4 0 1 1-3.5 6H9v2H7v2H4v-3l6.5-6.5A4 4 0 0 1 15 7z",
  eyeoff: "M3 3l18 18 M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3 3.4 M6.3 7.8C4.2 9.4 3 12 3 12s4 6 9 6a8.6 8.6 0 0 0 3.6-.8",
  log: "M5 3h11l3 3v15H5z M8 9h8 M8 13h8 M8 17h5",
  clock: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z M12 7v5l3 2",
  wind: "M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h8",
  hand: "M8 13V5a1.5 1.5 0 0 1 3 0v6 M11 11V4a1.5 1.5 0 0 1 3 0v7 M14 11V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7s-5-2-6.5-4.5L3 13a1.6 1.6 0 0 1 2.6-1.8L8 14",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  building: "M4 21V5l8-3 8 3v16 M9 21v-5h6v5 M8 9h2 M14 9h2 M8 13h2 M14 13h2",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2 21c0-4 3-6 7-6s7 2 7 6 M16 4a3.5 3.5 0 0 1 0 7 M18 15c2.5.5 4 2.5 4 6",
  chart: "M3 3v18h18 M7 15l4-4 3 3 5-6",
};
export const icon = (name, cls = "ico") =>
  h("svg", { viewBox: "0 0 24 24", class: cls, "aria-hidden": "true", "stroke-linecap": "round", "stroke-linejoin": "round" },
    h("path", { d: ICONS[name] || ICONS.grid }));

// Avisos breves
let toastTimer;
export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

export const loading = (msg = "Cargando") => h("div", { class: "loading", role: "status" }, h("i"), msg);

export const eyebrow = (text) => h("p", { class: "eyebrow" }, star(), text);

export function field(label, input, hint) {
  const id = input.id || "f" + Math.random().toString(36).slice(2, 9);
  input.id = id;
  return h("label", { class: "f", for: id }, label, input, hint ? h("span", { class: "hint" }, hint) : null);
}

export const input = (attrs) => h("input", { class: "input", ...attrs });

export function select(options, attrs = {}, value) {
  return h("select", { class: "input", ...attrs },
    options.map(([v, t]) => h("option", { value: v, selected: String(v) === String(value ?? "") }, t)));
}

export const errBox = () => h("p", { class: "err", role: "alert", hidden: true });
export function showErr(box, msg) { box.textContent = msg || ""; box.hidden = !msg; }

// Botón que se deshabilita mientras dura la acción
export async function busy(btn, fn) {
  if (btn.disabled) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Un momento";
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = label; }
}

// Fechas y números en español de Bolivia
const fmtDay = new Intl.DateTimeFormat("es-BO", { weekday: "short", timeZone: "UTC" });
const fmtDM = new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtFull = new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/La_Paz" });
export const asDate = (s) => new Date(String(s).slice(0, 10) + "T00:00:00Z");
export const dayName = (s) => fmtDay.format(asDate(s)).replace(".", "");
export const dayMonth = (s) => fmtDM.format(asDate(s)).replace(".", "");
export const dateTime = (s) => fmtFull.format(new Date(s));
export const dec = (v, d = 2) => (v === null || v === undefined ? "–" : Number(v).toFixed(d).replace(".", ","));

export function ago(s) {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 2) return "hace un momento";
  if (m < 60) return "hace " + m + " min";
  const hh = Math.round(m / 60);
  if (hh < 24) return "hace " + hh + " h";
  const d = Math.round(hh / 24);
  return d === 1 ? "ayer" : "hace " + d + " días";
}

export const LEVEL = {
  estable: { t: "Estable", d: "Promedio de 3,5 o más" },
  atencion: { t: "Atención", d: "Promedio entre 2,7 y 3,5" },
  alerta: { t: "Alerta", d: "Promedio menor a 2,7" },
  protegido: { t: "Protegido", d: "Menos respuestas que el mínimo, no se muestra" },
  vacio: { t: "Sin datos", d: "Aún no hay respuestas" },
};
export const levelOf = (v) => (v === null || v === undefined ? null : v >= 3.5 ? "estable" : v >= 2.7 ? "atencion" : "alerta");

export function legend() {
  return h("div", { class: "legend" },
    ["estable", "atencion", "alerta", "protegido"].map((k) => h("span", null, h("i", { class: "lv-" + k }), LEVEL[k].t)));
}

// Descarga de un texto como archivo (sin abrir ventanas nuevas)
export function download(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Copiado"); }
  catch { toast("No se pudo copiar, selecciónalo a mano"); }
}

// Tooltip con data-tip, sin HTML
export function initTips() {
  const tip = document.getElementById("tip");
  document.addEventListener("pointermove", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (!t) { tip.classList.remove("on"); return; }
    tip.textContent = t.getAttribute("data-tip");
    tip.classList.add("on");
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 10);
    tip.style.left = x + "px";
    tip.style.top = (e.clientY + 16) + "px";
  });
}

// Pestañas accesibles: devuelve { el, set(key) }
export function tabs(items, onChange, initial) {
  let cur = initial ?? items[0][0];
  const btns = items.map(([k, t]) => h("button", {
    type: "button", role: "tab", "aria-selected": String(k === cur),
    onclick: () => set(k),
  }, t));
  const el = h("div", { class: "tabs", role: "tablist" }, btns);
  function set(k) {
    cur = k;
    btns.forEach((b, i) => b.setAttribute("aria-selected", String(items[i][0] === k)));
    onChange(k);
  }
  return { el, set, get: () => cur };
}

export function confirmInline(container, message, confirmLabel, onConfirm) {
  const box = h("div", { class: "card flat stack tight mt" },
    h("p", { class: "small" }, message),
    h("div", { class: "row end" },
      h("button", { class: "btn soft sm", type: "button", onclick: () => box.remove() }, "Cancelar"),
      h("button", { class: "btn danger sm", type: "button", onclick: async (e) => { await busy(e.currentTarget, onConfirm); box.remove(); } }, confirmLabel)));
  container.appendChild(box);
  return box;
}
