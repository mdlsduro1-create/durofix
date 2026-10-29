// Panel del estudiante: actividades programadas, bienestar, juegos y conversación.
import { h, mount, eyebrow, field, errBox, showErr, busy, toast, ago, tabs, dayMonth, dayName, loading } from "../ui.js";
import { rpc, errMsg } from "../sb.js";
import { panelHead } from "./app.js";
import { READINGS, tipOfDay, GAMES, playGame, stopGame, gameCard } from "./games.js";
import { studentChat } from "./chat.js";

const FACES = [["😣", "Muy mal"], ["😕", "Mal"], ["😐", "Normal"], ["🙂", "Bien"], ["😄", "Muy bien"]];
const GAD = [
  "Sentirte nervioso, ansioso o con los nervios de punta",
  "No poder dejar de preocuparte o no poder controlar la preocupación",
  "Preocuparte demasiado por diferentes cosas",
  "Tener dificultad para relajarte",
  "Estar tan inquieto que te cuesta quedarte quieto",
  "Molestarte o irritarte fácilmente",
  "Sentir miedo, como si algo terrible fuera a pasar",
];
const GAD_OPTS = ["Nunca", "Varios días", "Más de la mitad de los días", "Casi todos los días"];
const REQ = {
  pendiente: ["Enviada", "La profesional la recibió y te buscará pronto."],
  conversacion: ["En conversación", "Ya están en contacto contigo."],
  derivada: ["Derivada", "Te conectaron con un servicio especializado."],
  cerrada: ["Cerrada", "Esta solicitud terminó."],
};
const KIND = { animo: "Registro de ánimo", gad7: "Cuestionario GAD-7" };

export async function student(root, ctx) {
  document.title = "Mi espacio · PULSO";
  const inst = ctx.institution;
  const box = h("div", { class: "mt" });
  const views = { hoy, bienestar, juegos, conversar };
  const t = tabs([["hoy", "Hoy"], ["bienestar", "Bienestar"], ["juegos", "Juegos"], ["conversar", inst.chat_enabled ? "Chat" : "Conversar"]],
    (k) => { stopGame(); views[k](box, ctx, go); }, "hoy");
  function go(k) { t.set(k); }

  mount(root, h("div", { class: "view" },
    panelHead(ctx, ctx.username ? "Hola, " + ctx.username : "Hola", ctx.course ? ctx.course.name + " · " + inst.name : inst.name),
    t.el, box,
    h("div", { class: "card ink helpline mt-l" },
      h("div", null, h("p", { class: "tiny" }, "Si es urgente o fuera del horario escolar"), h("p", { class: "small" }, inst.help_name)),
      h("div", { class: "stack tight" },
        h("b", null, "Línea " + inst.help_line),
        inst.help_wa ? h("span", { class: "small" }, "WhatsApp " + inst.help_wa) : null))));
  hoy(box, ctx, go);
}

// ---------------------------------------------------------------- hoy
async function hoy(box, ctx, go) {
  mount(box, loading());
  let st;
  try { st = await rpc("student_state"); } catch (e) { mount(box, h("p", { class: "err" }, errMsg(e))); return; }
  const cards = st.open.map((a) => a.kind === "animo" ? moodCard(a, go) : gadCard(a, go, () => hoy(box, ctx, go)));
  const upcoming = st.upcoming.slice(0, 5);
  mount(box, h("div", { class: "grid-2" },
    h("div", { class: "stack" },
      cards.length ? cards : h("div", { class: "card stack" },
        eyebrow("Ahora"),
        h("h2", null, "No hay actividades abiertas"),
        h("p", { class: "ink2" }, "Tu colegio abre las actividades en horarios específicos. Mientras tanto, puedes usar las lecturas y los juegos cuando quieras."),
        h("div", { class: "row" },
          h("button", { class: "btn soft sm", type: "button", onclick: () => go("bienestar") }, "Ver lecturas"),
          h("button", { class: "btn soft sm", type: "button", onclick: () => go("juegos") }, "Ir a los juegos")))),
    h("div", { class: "stack" },
      h("div", { class: "card stack tight" },
        eyebrow("Próximas actividades"),
        upcoming.length ? upcoming.map((u) => h("div", { class: "row between small" },
          h("span", null, KIND[u.kind]),
          h("span", { class: "muted" }, `${u.date === st.today ? "Hoy" : dayName(u.date) + " " + dayMonth(u.date)}, ${u.from} a ${u.to}`)))
          : h("p", { class: "small muted" }, "No hay nada programado para los próximos días.")),
      h("div", { class: "card flat stack tight" }, eyebrow("Idea para hoy"), h("p", null, tipOfDay())),
      st.requests.some((r) => r.status !== "cerrada") ? h("div", { class: "card stack tight" },
        eyebrow("Tus solicitudes"),
        st.requests.filter((r) => r.status !== "cerrada").map((r) => h("div", { class: "req" },
          h("div", { class: "req-head" }, h("span", { class: "pill p-dark" }, REQ[r.status][0]), h("span", null, ago(r.created_at))),
          h("p", { class: "small ink2" }, REQ[r.status][1])))) : null)));
}

function moodCard(a, go) {
  const out = h("div", { class: "stack tight", "aria-live": "polite" });
  let value = a.value;
  const after = (low, silent) => mount(out, low
    ? h("div", { class: "note" }, "Gracias por contarlo. Un día difícil no te define. Si quieres, prueba un juego para calmarte o escríbele a la profesional.",
      h("div", { class: "row mt-s" },
        h("button", { class: "btn soft sm", type: "button", onclick: () => go("juegos") }, "Ir a los juegos"),
        h("button", { class: "btn soft sm", type: "button", onclick: () => go("conversar") }, "Conversar")))
    : h("p", { class: "small ink2" }, silent ? "Ya respondiste. Puedes cambiar tu respuesta mientras siga abierto." : "Listo, quedó registrado. Gracias por tomarte un minuto."));
  const moods = h("div", { class: "moods", role: "group", "aria-label": a.prompt || "¿Cómo te sientes hoy?" },
    FACES.map(([f, t], i) => h("button", {
      class: "mood", type: "button", "aria-pressed": String(value === i + 1), "aria-label": t,
      onclick: async (e) => {
        const b = e.currentTarget;
        moods.querySelectorAll("button").forEach((x) => { x.disabled = true; });
        try {
          const r = await rpc("student_checkin", { p_value: i + 1 });
          moods.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
          b.setAttribute("aria-pressed", "true");
          value = i + 1;
          after(r.low);
        } catch (err) { toast(errMsg(err)); }
        finally { moods.querySelectorAll("button").forEach((x) => { x.disabled = false; }); }
      },
    }, f, h("small", null, t))));
  if (value) after(value <= 2, true);
  return h("div", { class: "card" },
    h("div", { class: "row between" }, eyebrow("Registro de ánimo"), h("span", { class: "pill p-line" }, "Abierto hasta las " + a.until)),
    h("h2", null, a.prompt || "¿Cómo te sientes hoy?"),
    moods, out,
    h("p", { class: "tiny muted" }, "Se guarda sin tu nombre, con una huella que cambia cada día."));
}

function gadCard(a, go, reload) {
  const card = h("div", { class: "card" });
  if (a.done) {
    mount(card, eyebrow("Cuestionario GAD-7"), h("h2", null, "Ya respondiste este cuestionario"),
      h("p", { class: "ink2 mt-s" }, "Gracias. Tu respuesta se sumó al resumen de tu curso."));
    return card;
  }
  const ans = new Array(7).fill(null);
  const err = errBox();
  const btn = h("button", { class: "btn", type: "submit", disabled: true }, "Enviar respuestas");
  const qs = GAD.map((q, i) => h("div", { class: "gad-q" },
    h("p", null, (i + 1) + ". " + q),
    h("div", { class: "opts", role: "group", "aria-label": q }, GAD_OPTS.map((o, v) => h("button", {
      class: "opt", type: "button", "aria-pressed": "false",
      onclick: (e) => {
        ans[i] = v;
        e.currentTarget.parentElement.querySelectorAll(".opt").forEach((b) => b.setAttribute("aria-pressed", "false"));
        e.currentTarget.setAttribute("aria-pressed", "true");
        btn.disabled = ans.some((x) => x === null);
      },
    }, o)))));
  mount(card,
    h("div", { class: "row between" }, eyebrow("Cuestionario GAD-7"), h("span", { class: "pill p-line" }, "Abierto hasta las " + a.until)),
    h("h2", null, "En las últimas dos semanas, ¿con qué frecuencia te pasó esto?"),
    h("p", { class: "small muted mt-s" }, "Son siete preguntas. Tu puntaje no se muestra a nadie, ni siquiera a ti: solo cuenta en el resumen de tu curso."),
    h("form", {
      class: "mt", novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        busy(btn, async () => {
          showErr(err, "");
          try {
            const r = await rpc("student_gad", { p_answers: ans });
            mount(card, eyebrow("Cuestionario GAD-7"), h("h2", null, "Gracias por responder"),
              r.suggest_talk
                ? h("div", { class: "note mt" }, "Por lo que contaste, puede que estas semanas hayan sido pesadas. Hablar ayuda mucho: puedes escribirle a la profesional de tu colegio, sin que nadie más se entere.",
                  h("div", { class: "row mt-s" }, h("button", { class: "btn sm", type: "button", onclick: () => go("conversar") }, "Quiero conversar")))
                : h("p", { class: "ink2 mt-s" }, "Tus respuestas se sumaron al resumen de tu curso."));
          } catch (x) {
            showErr(err, errMsg(x));
            if (/fuera_de_horario/.test(String(x.message))) setTimeout(reload, 1500);
          }
        });
      },
    }, qs, err, h("div", { class: "row end mt" }, btn)));
  return card;
}

// ---------------------------------------------------------------- bienestar
async function bienestar(box, ctx) {
  mount(box, loading());
  let own = [];
  try { own = await rpc("student_resources"); } catch { /* sigue con la biblioteca */ }
  const KINDN = { lectura: "Lectura", recomendacion: "Recomendación", enlace: "Enlace" };
  const ownCards = own.map((r) => h("article", { class: "card stack tight" + (r.pinned ? " pinned" : "") },
    h("div", { class: "row between" }, eyebrow(KINDN[r.kind] + " · " + ctx.institution.name), r.pinned ? h("span", { class: "pill p-dark" }, "Destacado") : null),
    h("h3", null, r.title),
    r.body ? r.body.split(/\n+/).map((p) => h("p", { class: "small ink2" }, p)) : null,
    r.url ? h("a", { class: "btn soft sm", href: r.url, target: "_blank", rel: "noopener noreferrer" }, "Abrir enlace") : null));
  mount(box, h("div", { class: "stack" },
    ownCards.length ? h("div", { class: "grid-2" }, ownCards) : null,
    h("div", { class: "card stack" },
      eyebrow("Lecturas breves"),
      READINGS.map((r) => h("details", { class: "faq" },
        h("summary", null, r.title, h("span", { class: "tiny muted" }, ` · ${r.min} min`)),
        r.body.map((p) => h("p", null, p))))),
    h("div", { class: "card flat stack tight" }, eyebrow("Idea para hoy"), h("p", null, tipOfDay()))));
}

// ---------------------------------------------------------------- juegos
function juegos(box) {
  const stage = h("div", { class: "card", hidden: true });
  mount(box, h("div", { class: "stack" },
    h("p", { class: "small ink2" }, "Herramientas cortas para calmarte, despejarte o volver al presente. Nada de lo que hagas aquí se guarda."),
    h("div", { class: "grid-3" }, GAMES.map((g) => gameCard(g, () => { stage.hidden = false; playGame(g[0], stage); }))),
    stage));
}

// ---------------------------------------------------------------- conversar
function conversar(box, ctx) {
  const chat = h("div", { class: "card" });
  const req = h("div", { class: "card stack" });
  mount(box, h("div", { class: "grid-2" }, chat, req));
  helpForm(req, ctx);
  studentChat(chat, (b) => mount(b, h("div", { class: "stack tight" },
    eyebrow("Chat"),
    h("h3", null, "El chat no está activo"),
    h("p", { class: "small ink2" }, "La profesional de tu colegio aún no habilitó el chat. Puedes pedirle una conversación en persona con el formulario."))));
}

async function helpForm(card, ctx) {
  void ctx;
  const msg = h("textarea", { class: "input", maxlength: 280, rows: 3, placeholder: "Opcional. Por ejemplo: me cuesta concentrarme antes de los exámenes." });
  const contact = h("input", { class: "input", maxlength: 120, placeholder: "Opcional. Por ejemplo: en el recreo" });
  const err = errBox();
  const btn = h("button", { class: "btn", type: "submit" }, "Pedir conversación");
  mount(card,
    eyebrow("En persona"),
    h("h3", null, "¿Quieres conversar con alguien?"),
    h("p", { class: "small ink2" }, "Tu solicitud llega solo a la profesional en salud mental, con tu usuario y tu curso. Docentes y compañeros no la ven."),
    h("form", {
      class: "stack", novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        busy(btn, async () => {
          showErr(err, "");
          try { await rpc("student_request_help", { p_message: msg.value, p_contact: contact.value }); toast("Solicitud enviada"); msg.value = ""; contact.value = ""; }
          catch (x) { showErr(err, errMsg(x)); }
        });
      },
    }, field("Cuéntale algo, si quieres", msg), field("¿Cómo prefieres que te busque?", contact), err, h("div", { class: "row end" }, btn)));
}
