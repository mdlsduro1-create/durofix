// Ingreso y registros (institución, estudiante, personal, propietario).
import { h, mount, eyebrow, field, input, select, errBox, showErr, busy, tabs } from "../ui.js";
import { sb, rpc, errMsg, studentEmail } from "../sb.js";
import { CONFIG } from "../config.js";
import { go, state, startIdle } from "../main.js";

const link = (href, text, cls = "btn ghost") => h("a", { class: cls, href, "data-link": "" }, text);

// ---------------------------------------------------------------- reglas de contraseña
export function passwordRules(pw, extra = []) {
  const v = pw.value;
  const rules = [
    [v.length >= CONFIG.PASSWORD_MIN, `Al menos ${CONFIG.PASSWORD_MIN} caracteres`],
    [/[a-zA-ZáéíóúñÑ]/.test(v) && /\d/.test(v), "Letras y números"],
    [!extra.some((x) => x && x.length >= 3 && v.toLowerCase().includes(x.toLowerCase())), "Sin tu usuario ni tu correo"],
    [!/^(.)\1+$/.test(v) && !/(1234567|abcdefg|qwerty|contrase|password)/i.test(v), "Nada obvio ni repetido"],
  ];
  return rules;
}
export function pwBlock(pw, getExtra = () => []) {
  const box = h("div", { class: "pwrules", "aria-live": "polite" });
  const paint = () => mount(box, passwordRules(pw, getExtra()).map(([ok, t]) => h("span", { class: ok ? "ok" : "" }, t)));
  pw.addEventListener("input", paint);
  paint();
  return { box, ok: () => passwordRules(pw, getExtra()).every((r) => r[0]), paint };
}

const consent = (text) => {
  const cb = h("input", { type: "checkbox", required: true });
  return { cb, el: h("label", { class: "check" }, cb, h("span", null, text, " ", h("a", { href: "/privacidad", "data-link": "" }, "Política de privacidad"), ".")) };
};

function shell(title, sub, ...body) {
  return h("section", { class: "view narrow" },
    eyebrow(sub),
    h("h1", { class: "sm" }, title),
    ...body);
}

async function afterAuth() {
  const { data } = await sb().auth.getSession();
  state.session = data.session;
  startIdle();
  go("/app", true);
}

// Pequeña espera creciente tras intentos fallidos (además del límite del servidor)
let fails = 0;
const backoff = () => new Promise((r) => setTimeout(r, Math.min(fails, 6) * 700));

// ---------------------------------------------------------------- ingreso
export async function login(root) {
  document.title = "Ingresar · PULSO";
  if (state.session) return go("/app", true);
  const reason = new URLSearchParams(location.search).get("motivo");
  const card = h("div", { class: "card stack mt-l" });

  const studentForm = () => {
    const inst = input({ autocomplete: "organization", autocapitalize: "none", spellcheck: "false", required: true, placeholder: "anglo-americano-oruro" });
    const user = input({ autocomplete: "username", autocapitalize: "none", spellcheck: "false", required: true });
    const pw = input({ type: "password", autocomplete: "current-password", required: true });
    const err = errBox();
    const btn = h("button", { class: "btn block", type: "submit" }, "Ingresar");
    try { inst.value = localStorage.getItem("pulso.inst") || ""; } catch { }
    return h("form", {
      class: "stack", novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        busy(btn, async () => {
          showErr(err, "");
          const slug = inst.value.trim().toLowerCase(), u = user.value.trim().toLowerCase();
          if (!slug || !u || !pw.value) return showErr(err, "Completa los tres campos.");
          await backoff();
          const { error } = await sb().auth.signInWithPassword({ email: studentEmail(slug, u), password: pw.value });
          if (error) { fails++; pw.value = ""; return showErr(err, errMsg(error)); }
          fails = 0;
          try { localStorage.setItem("pulso.inst", slug); } catch { }
          await afterAuth();
        });
      },
    },
      field("Código de institución", inst, "Te lo da tu colegio junto con el código de tu curso."),
      field("Usuario", user), field("Contraseña", pw), err, btn,
      h("p", { class: "small muted center" }, "¿Primera vez? ", h("a", { href: "/registro/estudiante", "data-link": "" }, "Crea tu cuenta con el código de tu curso")),
      h("p", { class: "tiny muted center" }, "¿Olvidaste tu contraseña? Pídele a la administración de tu colegio que la restablezca."));
  };

  const staffForm = () => {
    const email = input({ type: "email", autocomplete: "email", autocapitalize: "none", spellcheck: "false", required: true });
    const pw = input({ type: "password", autocomplete: "current-password", required: true });
    const err = errBox();
    const btn = h("button", { class: "btn block", type: "submit" }, "Ingresar");
    return h("form", {
      class: "stack", novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        busy(btn, async () => {
          showErr(err, "");
          if (!email.value.trim() || !pw.value) return showErr(err, "Completa el correo y la contraseña.");
          await backoff();
          const { error } = await sb().auth.signInWithPassword({ email: email.value.trim().toLowerCase(), password: pw.value });
          if (error) { fails++; pw.value = ""; return showErr(err, errMsg(error)); }
          fails = 0;
          await afterAuth();
        });
      },
    },
      field("Correo institucional", email), field("Contraseña", pw), err, btn,
      h("p", { class: "small muted center" }, "¿Tienes una invitación? ", h("a", { href: "/registro/personal", "data-link": "" }, "Activa tu cuenta")),
      h("p", { class: "tiny muted center" }, "Docentes y profesionales: si olvidaste tu contraseña, la administración puede restablecerla. Administración: escribe al equipo de PULSO."));
  };

  const t = tabs([["estudiante", "Soy estudiante"], ["personal", "Soy del personal"]], (k) => mount(card, k === "estudiante" ? studentForm() : staffForm()), "estudiante");
  mount(card, studentForm());

  mount(root, shell("Ingresar a PULSO", "Acceso",
    reason === "inactividad" ? h("p", { class: "note mt" }, "Cerramos tu sesión por inactividad, para cuidar tus datos.") : null,
    h("div", { class: "mt-l" }, t.el), card));
}

// ---------------------------------------------------------------- institución
export async function registerInstitution(root) {
  document.title = "Registrar institución · PULSO";
  if (state.session) return go("/app", true);

  const f = {
    name: input({ required: true, maxlength: 160, autocomplete: "organization", placeholder: "Unidad Educativa ..." }),
    kind: select([["", "Elige una opción"], ["fiscal", "Fiscal"], ["particular", "Particular"], ["convenio", "De convenio"]]),
    city: input({ required: true, maxlength: 80, autocomplete: "address-level2" }),
    department: select([["", "Elige un departamento"], ...["Chuquisaca", "La Paz", "Cochabamba", "Oruro", "Potosí", "Tarija", "Santa Cruz", "Beni", "Pando"].map((d) => [d, d])]),
    sie: input({ inputmode: "numeric", maxlength: 10, placeholder: "Opcional" }),
    contact: input({ required: true, maxlength: 120, autocomplete: "name" }),
    role: input({ required: true, maxlength: 80, placeholder: "Dirección, coordinación, psicología ..." }),
    phone: input({ type: "tel", maxlength: 20, autocomplete: "tel", placeholder: "Opcional" }),
    email: input({ type: "email", required: true, autocomplete: "email", autocapitalize: "none", spellcheck: "false" }),
    pw: input({ type: "password", required: true, autocomplete: "new-password" }),
    pw2: input({ type: "password", required: true, autocomplete: "new-password" }),
  };
  const rules = pwBlock(f.pw, () => [f.email.value.split("@")[0]]);
  const c1 = consent("Declaro que represento a esta institución y que obtendremos el consentimiento informado de las familias antes de inscribir al alumnado. Acepto la");
  const err = errBox();
  const bar = h("div", { class: "steps-bar" }, h("i"), h("i"), h("i"));
  const body = h("div", { class: "stack" });
  let stepN = 0;

  const pages = [
    () => [h("h3", null, "Datos de la institución"),
      field("Nombre completo", f.name), field("Tipo", f.kind),
      h("div", { class: "grid-2" }, field("Ciudad", f.city), field("Departamento", f.department)),
      field("Código SIE", f.sie, "El código del Sistema de Información Educativa, si lo tienes a mano.")],
    () => [h("h3", null, "Persona responsable"),
      field("Nombre y apellido", f.contact), field("Cargo", f.role), field("Teléfono", f.phone)],
    () => [h("h3", null, "Cuenta de administración"),
      h("p", { class: "small ink2" }, "Con esta cuenta se administra la institución. Usarás además un código de tu celular, la verificación en dos pasos, para entrar."),
      field("Correo institucional", f.email),
      field("Contraseña", f.pw), rules.box, field("Repite la contraseña", f.pw2), c1.el],
  ];

  function validate(i) {
    if (i === 0) {
      if (f.name.value.trim().length < 3) return "Escribe el nombre completo de la institución.";
      if (!f.kind.value) return "Elige el tipo de institución.";
      if (f.city.value.trim().length < 2) return "Escribe la ciudad.";
      if (!f.department.value) return "Elige el departamento.";
      if (f.sie.value.trim() && !/^\d{6,10}$/.test(f.sie.value.replace(/\s/g, ""))) return "El código SIE debe tener solo números (de 6 a 10).";
    }
    if (i === 1) {
      if (f.contact.value.trim().length < 3) return "Escribe el nombre de la persona responsable.";
      if (f.role.value.trim().length < 2) return "Escribe el cargo.";
      if (f.phone.value.trim() && !/^[0-9 +()-]{6,20}$/.test(f.phone.value.trim())) return "El teléfono no tiene un formato válido.";
    }
    if (i === 2) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.value.trim())) return "Escribe un correo válido.";
      if (!rules.ok()) return "La contraseña todavía no cumple todos los requisitos.";
      if (f.pw.value !== f.pw2.value) return "Las contraseñas no coinciden.";
      if (!c1.cb.checked) return "Debes aceptar la declaración y la política de privacidad.";
    }
    return null;
  }

  const back = h("button", { class: "btn soft", type: "button", onclick: () => paint(stepN - 1) }, "Atrás");
  const next = h("button", { class: "btn", type: "submit" }, "Continuar");

  function paint(i) {
    stepN = i;
    showErr(err, "");
    bar.querySelectorAll("i").forEach((el, j) => el.classList.toggle("on", j <= i));
    mount(body, pages[i]());
    back.hidden = i === 0;
    next.textContent = i === pages.length - 1 ? "Enviar solicitud" : "Continuar";
    const first = body.querySelector("input,select");
    if (first) first.focus();
  }

  const form = h("form", {
    class: "card stack mt-l", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      const v = validate(stepN);
      if (v) return showErr(err, v);
      if (stepN < pages.length - 1) return paint(stepN + 1);
      busy(next, async () => {
        const { error } = await sb().auth.signUp({
          email: f.email.value.trim().toLowerCase(),
          password: f.pw.value,
          options: { data: {
            intent: "institucion", inst_name: f.name.value.trim(), kind: f.kind.value, city: f.city.value.trim(),
            department: f.department.value, sie_code: f.sie.value.replace(/\s/g, ""),
            contact_name: f.contact.value.trim(), contact_role: f.role.value.trim(), contact_phone: f.phone.value.trim(),
          } },
        });
        if (error) return showErr(err, errMsg(error));
        await afterAuth();
      });
    },
  }, bar, body, err, h("div", { class: "row between" }, back, next));

  mount(root, shell("Registrar una institución", "Solicitud institucional",
    h("p", { class: "lede mt" }, "Solo para instituciones educativas. Revisaremos tu solicitud antes de habilitarla; mientras tanto, la cuenta queda en espera."),
    form));
  paint(0);
}

// ---------------------------------------------------------------- estudiante
export async function registerStudent(root) {
  document.title = "Crear cuenta de estudiante · PULSO";
  if (state.session) return go("/app", true);
  const codeIn = input({ required: true, autocapitalize: "characters", spellcheck: "false", placeholder: "ABCD-2345", maxlength: 9, class: "input mono" });
  const user = input({ required: true, autocapitalize: "none", spellcheck: "false", maxlength: 24, autocomplete: "username" });
  const pw = input({ type: "password", required: true, autocomplete: "new-password" });
  const pw2 = input({ type: "password", required: true, autocomplete: "new-password" });
  const rules = pwBlock(pw, () => [user.value]);
  const c1 = consent("Mi familia conoce y autorizó mi participación, y acepto la");
  const err = errBox();
  const info = h("div", { class: "note", hidden: true });
  const userHint = h("span", { class: "hint" }, "De 3 a 24 caracteres: minúsculas, números, punto o guion bajo. No uses tu nombre real.");
  const step2 = h("div", { class: "stack", hidden: true });
  const btn = h("button", { class: "btn block", type: "submit" }, "Verificar código");
  let found = null;

  codeIn.addEventListener("input", () => {
    let v = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    if (v.length > 4) v = v.slice(0, 4) + "-" + v.slice(4);
    codeIn.value = v;
    if (found) { found = null; step2.hidden = true; info.hidden = true; btn.textContent = "Verificar código"; }
  });
  user.addEventListener("input", () => { user.value = user.value.toLowerCase().replace(/[^a-z0-9._]/g, ""); });

  mount(step2,
    h("label", { class: "f", for: "su-user" }, "Elige tu usuario", user, userHint),
    field("Contraseña", pw), rules.box, field("Repite la contraseña", pw2), c1.el);
  user.id = "su-user";

  const form = h("form", {
    class: "card stack mt-l", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      busy(btn, async () => {
        showErr(err, "");
        if (!found) {
          if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codeIn.value)) return showErr(err, "El código tiene ocho caracteres, como ABCD-2345.");
          await backoff();
          const r = await rpc("check_join", { p_code: codeIn.value });
          if (!r || !r.valid) { fails++; return showErr(err, "Ese código no existe o la inscripción del curso está cerrada."); }
          fails = 0;
          found = r;
          info.textContent = `${r.institution} · ${r.course}. Código de institución para ingresar: ${r.slug}`;
          info.hidden = false; step2.hidden = false; btn.textContent = "Crear mi cuenta";
          user.focus();
          return;
        }
        if (!/^[a-z0-9._]{3,24}$/.test(user.value)) return showErr(err, "El usuario debe tener de 3 a 24 caracteres: minúsculas, números, punto o guion bajo.");
        if (!rules.ok()) return showErr(err, "La contraseña todavía no cumple todos los requisitos.");
        if (pw.value !== pw2.value) return showErr(err, "Las contraseñas no coinciden.");
        if (!c1.cb.checked) return showErr(err, "Debes confirmar la autorización y aceptar la política de privacidad.");
        const chk = await rpc("check_join", { p_code: codeIn.value, p_username: user.value });
        if (!chk.valid) return showErr(err, "La inscripción de este curso se cerró. Pide un código nuevo.");
        if (chk.username_ok === false) return showErr(err, "Ese usuario ya existe en tu colegio, elige otro.");
        const { error } = await sb().auth.signUp({
          email: studentEmail(found.slug, user.value), password: pw.value,
          options: { data: { intent: "estudiante", join_code: codeIn.value, username: user.value } },
        });
        if (error) return showErr(err, errMsg(error));
        try { localStorage.setItem("pulso.inst", found.slug); } catch { }
        await afterAuth();
      });
    },
  }, field("Código de tu curso", codeIn, "Te lo entrega tu colegio."), info, step2, err, btn);

  mount(root, shell("Crear tu cuenta", "Estudiantes",
    h("p", { class: "lede mt" }, "Tu cuenta queda pendiente hasta que la administración de tu colegio la apruebe. Nadie verá tus respuestas individuales."),
    form,
    h("p", { class: "small muted center mt" }, "¿Ya tienes cuenta? ", h("a", { href: "/ingresar", "data-link": "" }, "Ingresa aquí"))));
}

// ---------------------------------------------------------------- personal (con invitación)
export async function registerStaff(root) {
  document.title = "Activar invitación · PULSO";
  if (state.session) return go("/app", true);
  const ROLE = { admin: "Administración", profesional: "Profesional en salud mental", docente: "Docente" };
  const codeIn = input({ required: true, autocapitalize: "characters", spellcheck: "false", placeholder: "INV-XXXX-XXXX-XXXX", class: "input mono", maxlength: 18 });
  const name = input({ required: true, maxlength: 120, autocomplete: "name" });
  const email = input({ type: "email", required: true, autocomplete: "email", autocapitalize: "none", spellcheck: "false" });
  const pw = input({ type: "password", required: true, autocomplete: "new-password" });
  const pw2 = input({ type: "password", required: true, autocomplete: "new-password" });
  const rules = pwBlock(pw, () => [email.value.split("@")[0]]);
  const c1 = consent("Me comprometo a usar los datos solo para el cuidado del alumnado y acepto la");
  const err = errBox();
  const info = h("div", { class: "note", hidden: true });
  const step2 = h("div", { class: "stack", hidden: true },
    field("Nombre y apellido", name), field("Correo institucional", email),
    field("Contraseña", pw), rules.box, field("Repite la contraseña", pw2), c1.el);
  const btn = h("button", { class: "btn block", type: "submit" }, "Verificar invitación");
  let found = null;
  codeIn.addEventListener("input", () => {
    codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (found) { found = null; step2.hidden = true; info.hidden = true; btn.textContent = "Verificar invitación"; }
  });

  const form = h("form", {
    class: "card stack mt-l", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      busy(btn, async () => {
        showErr(err, "");
        if (!found) {
          await backoff();
          const r = await rpc("check_invite", { p_code: codeIn.value.trim() });
          if (!r || !r.valid) { fails++; return showErr(err, "La invitación no es válida, ya se usó o venció."); }
          fails = 0; found = r;
          info.textContent = `${r.institution} · ${ROLE[r.role] || r.role}${r.course ? " · " + r.course : ""}`;
          info.hidden = false; step2.hidden = false; btn.textContent = "Activar mi cuenta";
          name.focus();
          return;
        }
        if (name.value.trim().length < 3) return showErr(err, "Escribe tu nombre y apellido.");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) return showErr(err, "Escribe un correo válido.");
        if (!rules.ok()) return showErr(err, "La contraseña todavía no cumple todos los requisitos.");
        if (pw.value !== pw2.value) return showErr(err, "Las contraseñas no coinciden.");
        if (!c1.cb.checked) return showErr(err, "Debes aceptar el compromiso y la política de privacidad.");
        const { error } = await sb().auth.signUp({
          email: email.value.trim().toLowerCase(), password: pw.value,
          options: { data: { intent: "personal", invite_code: codeIn.value.trim(), display_name: name.value.trim() } },
        });
        if (error) return showErr(err, errMsg(error));
        await afterAuth();
      });
    },
  }, field("Código de invitación", codeIn, "Es de un solo uso y vence en siete días."), info, step2, err, btn);

  mount(root, shell("Activar tu invitación", "Personal de la institución",
    h("p", { class: "lede mt" }, "La administración de tu colegio te envió un código. Con él creas tu cuenta y quedas habilitado con el rol que te asignaron."),
    form));
}

// ---------------------------------------------------------------- propietario de la plataforma
export async function registerOwner(root) {
  document.title = "Registro de plataforma · PULSO";
  if (state.session) return go("/app", true);
  const name = input({ required: true, maxlength: 120, autocomplete: "name" });
  const email = input({ type: "email", required: true, autocomplete: "email", autocapitalize: "none", spellcheck: "false" });
  const pw = input({ type: "password", required: true, autocomplete: "new-password" });
  const pw2 = input({ type: "password", required: true, autocomplete: "new-password" });
  const rules = pwBlock(pw, () => [email.value.split("@")[0]]);
  const err = errBox();
  const btn = h("button", { class: "btn block", type: "submit" }, "Crear cuenta de plataforma");
  const form = h("form", {
    class: "card stack mt-l", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      busy(btn, async () => {
        showErr(err, "");
        if (name.value.trim().length < 3) return showErr(err, "Escribe tu nombre.");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) return showErr(err, "Escribe un correo válido.");
        if (!rules.ok()) return showErr(err, "La contraseña todavía no cumple todos los requisitos.");
        if (pw.value !== pw2.value) return showErr(err, "Las contraseñas no coinciden.");
        const { error } = await sb().auth.signUp({
          email: email.value.trim().toLowerCase(), password: pw.value,
          options: { data: { intent: "propietario", display_name: name.value.trim() } },
        });
        if (error) return showErr(err, errMsg(error));
        await afterAuth();
      });
    },
  }, field("Nombre", name), field("Correo", email), field("Contraseña", pw), rules.box, field("Repite la contraseña", pw2), err, btn);
  mount(root, shell("Cuenta de plataforma", "Uso interno",
    h("p", { class: "lede mt" }, "Esta cuenta revisa y aprueba instituciones. Queda inactiva hasta que se active directamente en la base de datos, de modo que registrarse aquí no da ningún permiso por sí solo."),
    form));
}

