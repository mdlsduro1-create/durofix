// Enrutador, cabecera, sesión y control de inactividad.
import { h, mount, star, initTips, toast, loading } from "./ui.js";
import { sb, rpc } from "./sb.js";
import { configured, CONFIG } from "./config.js";

const routes = {
  "/": () => import("./pages/landing.js").then((m) => m.landing),
  "/privacidad": () => import("./pages/landing.js").then((m) => m.privacy),
  "/ingresar": () => import("./pages/auth.js").then((m) => m.login),
  "/registro/institucion": () => import("./pages/auth.js").then((m) => m.registerInstitution),
  "/registro/estudiante": () => import("./pages/auth.js").then((m) => m.registerStudent),
  "/registro/personal": () => import("./pages/auth.js").then((m) => m.registerStaff),
  "/plataforma/registro": () => import("./pages/auth.js").then((m) => m.registerOwner),
  "/app": () => import("./pages/app.js").then((m) => m.app),
};

const main = () => document.getElementById("main");
export const state = { session: null, ctx: null };

export function go(path, replace = false) {
  if (location.pathname + location.search !== path) {
    history[replace ? "replaceState" : "pushState"]({}, "", path);
  }
  render();
}

async function render() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const load = routes[path];
  window.scrollTo(0, 0);
  const root = main();
  if (!load) {
    mount(root, h("section", { class: "view status-screen" },
      h("div", { class: "icon" }, star()), h("h1", { class: "sm" }, "Esta página no existe"),
      h("p", { class: "lede mt" }, "Revisa la dirección o vuelve al inicio."),
      h("p", { class: "mt-l" }, h("a", { class: "btn", href: "/", "data-link": "" }, "Ir al inicio"))));
    document.title = "PULSO";
    return;
  }
  mount(root, loading());
  try {
    const view = await load();
    await view(root);
  } catch (e) {
    console.error(e);
    mount(root, h("section", { class: "view status-screen" },
      h("div", { class: "icon" }, star()), h("h1", { class: "sm" }, "No se pudo cargar"),
      h("p", { class: "lede mt" }, "Revisa tu conexión y vuelve a intentarlo."),
      h("p", { class: "mt-l" }, h("button", { class: "btn", type: "button", onclick: () => render() }, "Reintentar"))));
  }
  paintNav();
  root.focus({ preventScroll: true });
}

export function paintNav() {
  const nav = document.getElementById("nav");
  const path = location.pathname;
  const a = (href, text) => h("a", { class: "nav-a", href, "data-link": "", "aria-current": path === href ? "page" : null }, text);
  if (state.session) {
    mount(nav,
      state.ctx && state.ctx.institution ? h("span", { class: "chip", title: state.ctx.institution.name }, state.ctx.institution.name) : null,
      a("/app", "Mi panel"),
      h("button", { class: "nav-a", type: "button", onclick: () => logout() }, "Salir"));
  } else {
    mount(nav, a("/", "Inicio"), a("/ingresar", "Ingresar"),
      h("a", { class: "btn sm", href: "/registro/institucion", "data-link": "" }, "Registrar institución"));
  }
}

export async function logout(reason) {
  try { await sb().auth.signOut({ scope: "local" }); } catch { /* sin conexión: igual se limpia */ }
  try { sessionStorage.removeItem("pulso.sesion"); } catch { }
  state.session = null; state.ctx = null;
  stopIdle();
  go(reason ? "/ingresar?motivo=" + reason : "/ingresar", true);
}

export async function loadContext() {
  state.ctx = await rpc("my_context");
  return state.ctx;
}

// Cierre de sesión por inactividad
let idleTimer = null;
const IDLE_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"];
function bump() {
  clearTimeout(idleTimer);
  const staff = state.ctx && state.ctx.role !== "estudiante";
  const min = staff ? CONFIG.IDLE_MINUTES_STAFF : CONFIG.IDLE_MINUTES_STUDENT;
  idleTimer = setTimeout(() => { if (state.session) logout("inactividad"); }, min * 60000);
}
export function startIdle() { IDLE_EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true })); bump(); }
function stopIdle() { clearTimeout(idleTimer); IDLE_EVENTS.forEach((e) => window.removeEventListener(e, bump)); }

// Arranque
document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest("a[data-link]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank") return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  e.preventDefault();
  if (url.hash && url.pathname === location.pathname) {
    const t = document.getElementById(url.hash.slice(1));
    if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  go(url.pathname + url.search + url.hash);
  if (url.hash) setTimeout(() => { const t = document.getElementById(url.hash.slice(1)); if (t) t.scrollIntoView({ block: "start" }); }, 120);
});
window.addEventListener("popstate", render);
initTips();

(async function boot() {
  if (configured()) {
    try {
      const { data } = await sb().auth.getSession();
      state.session = data.session;
      sb().auth.onAuthStateChange((ev, session) => {
        state.session = session;
        if (ev === "SIGNED_OUT") { state.ctx = null; paintNav(); }
      });
      if (state.session) startIdle();
    } catch (e) { console.error(e); }
  } else {
    toast("Modo vista previa: la base de datos aún no está conectada");
  }
  render();
})();
