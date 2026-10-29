// Puerta de acceso a la aplicación: estado de la cuenta, verificación en dos pasos,
// cambio obligatorio de contraseña y despacho al panel de cada rol.
import { h, mount, star, eyebrow, field, input, errBox, showErr, busy, toast, loading } from "../ui.js";
import { sb, errMsg } from "../sb.js";
import { state, go, logout, loadContext, paintNav } from "../main.js";
import { pwBlock } from "./auth.js";

const PANELS = {
  estudiante: () => import("./student.js").then((m) => m.student),
  docente: () => import("./teacher.js").then((m) => m.teacher),
  profesional: () => import("./pro.js").then((m) => m.pro),
  admin: () => import("./admin.js").then((m) => m.admin),
  owner: () => import("./owner.js").then((m) => m.owner),
};
export const ROLE_NAME = { estudiante: "Estudiante", docente: "Docente", profesional: "Profesional en salud mental", admin: "Administración", owner: "Plataforma" };

export async function app(root) {
  document.title = "Mi panel · PULSO";
  const { data } = await sb().auth.getSession();
  state.session = data.session;
  if (!state.session) return go("/ingresar", true);

  let ctx;
  try { ctx = await loadContext(); }
  catch (e) {
    if (/JWT|session|no_autenticado/i.test(String(e.message))) return logout();
    throw e;
  }
  paintNav();
  if (!ctx) return statusScreen(root, "Cuenta sin perfil", "Esta cuenta no pertenece a ninguna institución de PULSO. Si crees que es un error, escribe a la administración de tu colegio.");

  // 1. Estado de la cuenta
  if (ctx.status !== "activa") {
    if (ctx.role === "owner") return statusScreen(root, "Cuenta de plataforma en espera",
      "La cuenta se creó, pero solo se activa desde el editor SQL de la base de datos. Hasta entonces no tiene ningún permiso.");
    if (ctx.status === "pendiente" && ctx.role === "admin" && ctx.institution && ctx.institution.status === "pendiente")
      return statusScreen(root, "Solicitud recibida", `Recibimos la solicitud de ${ctx.institution.name}. La revisaremos y, al aprobarla, podrás ingresar con este mismo correo y contraseña. Nadie puede ver datos mientras tanto.`);
    if (ctx.status === "pendiente") return statusScreen(root, "Tu cuenta espera aprobación",
      `La administración de ${ctx.institution ? ctx.institution.name : "tu colegio"} debe aprobar tu cuenta. Cuando lo haga, entra otra vez con tu usuario y contraseña.` +
      (ctx.role === "estudiante" && ctx.institution ? ` Tu código de institución es ${ctx.institution.slug}.` : ""));
    if (ctx.status === "suspendida") return statusScreen(root, "Cuenta suspendida", "Tu acceso está suspendido. Si crees que es un error, habla con la administración de tu colegio.");
    return statusScreen(root, "Solicitud rechazada", "La solicitud de esta cuenta fue rechazada.");
  }
  if (ctx.role !== "owner" && (!ctx.institution || ctx.institution.status !== "activa")) {
    const st = ctx.institution && ctx.institution.status;
    return statusScreen(root, st === "suspendida" ? "Institución suspendida" : st === "rechazada" ? "Solicitud no aprobada" : "Institución en revisión",
      st === "suspendida" ? "El acceso de esta institución está suspendido. La dirección debe comunicarse con el equipo de PULSO."
        : st === "rechazada" ? "La solicitud de esta institución no fue aprobada."
          : "La institución todavía no fue habilitada.");
  }

  // 2. Verificación en dos pasos para roles con datos sensibles
  if (ctx.mfa_required) {
    const { data: aal } = await sb().auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aal || aal.currentLevel !== "aal2") {
      const { data: f } = await sb().auth.mfa.listFactors();
      const verified = (f && f.totp || []).filter((x) => x.status === "verified");
      return verified.length ? mfaChallenge(root, verified[0]) : mfaEnroll(root, ctx);
    }
  }

  // 3. Contraseña temporal
  if (ctx.must_change_password) return changePassword(root, ctx, true);

  // 4. Panel del rol
  const load = PANELS[ctx.role];
  if (!load) return statusScreen(root, "Rol desconocido", "Esta cuenta tiene un rol que la aplicación no reconoce.");
  mount(root, loading());
  const panel = await load();
  await panel(root, ctx);
}

function statusScreen(root, title, text) {
  mount(root, h("section", { class: "view status-screen" },
    h("div", { class: "icon" }, star()),
    h("h1", { class: "sm" }, title),
    h("p", { class: "lede mt center" }, text),
    h("div", { class: "row centered mt-l" },
      h("button", { class: "btn ghost", type: "button", onclick: () => go("/app") }, "Volver a comprobar"),
      h("button", { class: "btn", type: "button", onclick: () => logout() }, "Cerrar sesión"))));
}

function codeInput() {
  const el = input({ inputmode: "numeric", autocomplete: "one-time-code", maxlength: 6, pattern: "[0-9]{6}", class: "input mono center", placeholder: "000000" });
  el.addEventListener("input", () => { el.value = el.value.replace(/\D/g, "").slice(0, 6); });
  return el;
}

async function mfaEnroll(root, ctx) {
  mount(root, loading("Preparando la verificación"));
  // Limpia intentos anteriores sin terminar
  const { data: list } = await sb().auth.mfa.listFactors();
  for (const fct of (list && list.all) || []) {
    if (fct.status !== "verified") await sb().auth.mfa.unenroll({ factorId: fct.id });
  }
  const { data, error } = await sb().auth.mfa.enroll({ factorType: "totp", friendlyName: "PULSO " + new Date().toISOString().slice(0, 16) });
  if (error) return statusScreen(root, "No se pudo iniciar la verificación", errMsg(error));
  const code = codeInput();
  const err = errBox();
  const btn = h("button", { class: "btn block", type: "submit" }, "Confirmar y continuar");
  const secret = h("p", { class: "codebox", hidden: true }, data.totp.secret);
  mount(root, h("section", { class: "view narrow" },
    eyebrow("Seguridad obligatoria"),
    h("h1", { class: "sm" }, "Activa la verificación en dos pasos"),
    h("p", { class: "lede mt" }, `Como ${ctx.role === "profesional" ? "profesional en salud mental" : ctx.role === "admin" ? "administración" : "plataforma"}, puedes ver información sensible. Por eso, además de tu contraseña, usarás un código que cambia cada 30 segundos.`),
    h("form", {
      class: "card stack mt-l", novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        busy(btn, async () => {
          showErr(err, "");
          if (code.value.length !== 6) return showErr(err, "Escribe los seis números.");
          const { error: e2 } = await sb().auth.mfa.challengeAndVerify({ factorId: data.id, code: code.value });
          if (e2) { code.value = ""; return showErr(err, errMsg(e2)); }
          toast("Verificación activada");
          go("/app", true);
        });
      },
    },
      h("p", { class: "small ink2" }, "1. Instala una aplicación de autenticación en tu celular, como Google Authenticator, Microsoft Authenticator o Authy."),
      h("p", { class: "small ink2" }, "2. Escanea este código con la aplicación."),
      h("div", { class: "qr" }, h("img", { src: data.totp.qr_code, alt: "Código QR para la aplicación de autenticación" })),
      h("button", { class: "btn soft sm", type: "button", onclick: () => { secret.hidden = !secret.hidden; } }, "No puedo escanear, mostrar la clave"),
      secret,
      h("p", { class: "small ink2" }, "3. Escribe el código de seis números que muestra la aplicación."),
      field("Código", code), err, btn),
    h("p", { class: "center mt" }, h("button", { class: "btn soft sm", type: "button", onclick: () => logout() }, "Cerrar sesión"))));
  code.focus();
}

function mfaChallenge(root, factor) {
  const code = codeInput();
  const err = errBox();
  const btn = h("button", { class: "btn block", type: "submit" }, "Verificar");
  let tries = 0;
  mount(root, h("section", { class: "view narrow" },
    eyebrow("Verificación en dos pasos"),
    h("h1", { class: "sm" }, "Escribe el código de tu celular"),
    h("p", { class: "lede mt" }, "Abre tu aplicación de autenticación y escribe el código de PULSO."),
    h("form", {
      class: "card stack mt-l", novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        busy(btn, async () => {
          showErr(err, "");
          if (code.value.length !== 6) return showErr(err, "Escribe los seis números.");
          const { error } = await sb().auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.value });
          if (error) {
            code.value = ""; tries++;
            if (tries >= 5) return logout();
            return showErr(err, errMsg(error));
          }
          go("/app", true);
        });
      },
    }, field("Código", code), err, btn,
      h("p", { class: "tiny muted" }, "¿Perdiste el celular? Pide al equipo de PULSO o a la administración que restablezca tu verificación. Por seguridad, eso se hace fuera de la aplicación.")),
    h("p", { class: "center mt" }, h("button", { class: "btn soft sm", type: "button", onclick: () => logout() }, "Cerrar sesión"))));
  code.focus();
}

export function changePassword(root, ctx, forced) {
  const pw = input({ type: "password", autocomplete: "new-password", required: true });
  const pw2 = input({ type: "password", autocomplete: "new-password", required: true });
  const rules = pwBlock(pw, () => [ctx.username, ctx.display_name && ctx.display_name.split(" ")[0]]);
  const err = errBox();
  const btn = h("button", { class: "btn block", type: "submit" }, "Guardar contraseña");
  const form = h("form", {
    class: "card stack mt-l", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      busy(btn, async () => {
        showErr(err, "");
        if (!rules.ok()) return showErr(err, "La contraseña todavía no cumple todos los requisitos.");
        if (pw.value !== pw2.value) return showErr(err, "Las contraseñas no coinciden.");
        const { error } = await sb().auth.updateUser({ password: pw.value });
        if (error) return showErr(err, /different from the old|same/i.test(error.message) ? "La nueva contraseña debe ser distinta de la anterior." : errMsg(error));
        toast("Contraseña actualizada");
        go("/app", true);
      });
    },
  }, field("Nueva contraseña", pw), rules.box, field("Repítela", pw2), err, btn);
  mount(root, h("section", { class: "view narrow" },
    eyebrow(forced ? "Contraseña temporal" : "Mi cuenta"),
    h("h1", { class: "sm" }, forced ? "Crea una contraseña nueva" : "Cambiar contraseña"),
    h("p", { class: "lede mt" }, forced ? "La administración restableció tu contraseña. Antes de seguir, elige una que solo tú conozcas." : "Elige una contraseña que no uses en ningún otro sitio."),
    form,
    h("p", { class: "center mt" }, forced
      ? h("button", { class: "btn soft sm", type: "button", onclick: () => logout() }, "Cerrar sesión")
      : h("button", { class: "btn soft sm", type: "button", onclick: () => go("/app") }, "Volver"))));
  pw.focus();
}

// Encabezado común de los paneles
export function panelHead(ctx, title, sub, ...actions) {
  return h("div", { class: "panel-head" },
    h("div", null,
      eyebrow(ROLE_NAME[ctx.role] + (ctx.institution ? " · " + ctx.institution.name : "")),
      h("h1", { class: "sm" }, title),
      sub ? h("p", { class: "lede mt-s" }, sub) : null),
    h("div", { class: "row" }, ...actions,
      h("button", { class: "btn soft sm", type: "button", onclick: () => changePassword(document.getElementById("main"), ctx, false) }, "Cambiar contraseña")));
}
