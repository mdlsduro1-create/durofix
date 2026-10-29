// Panel del estudiante: registro diario, GAD-7 quincenal, herramientas y pedido de ayuda.
import { h, mount, eyebrow, icon, field, errBox, showErr, busy, toast, ago } from "../ui.js";
import { rpc, errMsg } from "../sb.js";
import { panelHead } from "./app.js";

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
  cerrada: ["Cerrada", "Esta solicitud terminó. Puedes enviar otra cuando quieras."],
};

export async function student(root, ctx) {
  document.title = "Mi día · PULSO";
  const st = await rpc("student_state");
  const inst = ctx.institution;
  const hello = ctx.username ? "Hola, " + ctx.username : "Hola";

  const checkCard = h("div", { class: "card" });
  const gadCard = h("div", { class: "card" });
  const toolsCard = h("div", { class: "card stack" });
  const helpCard = h("div", { class: "card stack", id: "ayuda" });

  // ---------------------------------------------------------------- registro diario
  function paintCheck(value) {
    const out = h("div", { class: "stack tight", "aria-live": "polite" });
    const moods = h("div", { class: "moods", role: "group", "aria-label": "¿Cómo te sientes hoy?" },
      FACES.map(([f, t], i) => h("button", {
        class: "mood", type: "button", "aria-pressed": String(value === i + 1), "aria-label": t,
        onclick: async (e) => {
          const b = e.currentTarget;
          if (b.disabled) return;
          moods.querySelectorAll("button").forEach((x) => { x.disabled = true; });
          try {
            const r = await rpc("student_checkin", { p_value: i + 1 });
            moods.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
            b.setAttribute("aria-pressed", "true");
            value = i + 1;
            afterCheck(out, r.low);
          } catch (err) { toast(errMsg(err)); }
          finally { moods.querySelectorAll("button").forEach((x) => { x.disabled = false; }); }
        },
      }, f, h("small", null, t))));
    mount(checkCard,
      eyebrow("Registro de hoy"),
      h("h2", null, "¿Cómo te sientes hoy?"),
      moods, out,
      h("p", { class: "tiny muted" }, "Puedes cambiar tu respuesta durante el día. Se guarda sin tu nombre, con una huella que cambia mañana."));
    if (value) afterCheck(out, value <= 2, true);
  }
  function afterCheck(out, low, silent) {
    mount(out, low
      ? h("div", { class: "note" }, "Gracias por contarlo. Un día difícil no te define. Si quieres, prueba una de las herramientas de abajo o pide conversar con la profesional de tu colegio.")
      : h("p", { class: "small ink2" }, silent ? "Ya registraste tu día. Gracias." : "Listo, quedó registrado. Gracias por tomarte un minuto."));
    if (low && !silent) toolsCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------------------------------------------------------------- GAD-7
  function paintGad(done) {
    if (done) {
      mount(gadCard, eyebrow("Cuestionario quincenal"), h("h2", null, "Ya respondiste esta quincena"),
        h("p", { class: "ink2 mt-s" }, "Gracias. El próximo cuestionario se habilita en la siguiente quincena."));
      return;
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
          btn.disabled = ans.some((a) => a === null);
        },
      }, o)))));
    mount(gadCard,
      eyebrow("Cuestionario quincenal · GAD-7"),
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
              mount(gadCard, eyebrow("Cuestionario quincenal"), h("h2", null, "Gracias por responder"),
                r.suggest_talk
                  ? h("div", { class: "note mt" }, "Por lo que contaste, puede que estas semanas hayan sido pesadas. Hablar ayuda mucho: puedes pedir una conversación con la profesional de tu colegio aquí abajo, sin que nadie más se entere.")
                  : h("p", { class: "ink2 mt-s" }, "Tus respuestas se sumaron al resumen de tu curso."),
                r.suggest_talk ? h("p", { class: "mt" }, h("button", { class: "btn", type: "button", onclick: () => helpCard.scrollIntoView({ behavior: "smooth" }) }, "Quiero conversar")) : null);
            } catch (x) { showErr(err, errMsg(x)); }
          });
        },
      }, qs, err, h("div", { class: "row end mt" }, btn)));
  }

  // ---------------------------------------------------------------- herramientas
  function paintTools() {
    const stage = h("div");
    mount(toolsCard,
      eyebrow("Para calmarte"),
      h("h2", null, "Herramientas de un minuto"),
      h("button", { class: "tool", type: "button", onclick: () => breathing(stage) }, icon("wind", ""), h("div", null, h("b", null, "Respiración 4, 4, 6"), h("span", null, "Inhala, sostén y exhala lento. Baja el ritmo del corazón."))),
      h("button", { class: "tool", type: "button", onclick: () => grounding(stage) }, icon("hand", ""), h("div", null, h("b", null, "Técnica 5, 4, 3, 2, 1"), h("span", null, "Usa tus sentidos para volver al presente."))),
      stage);
  }

  // ---------------------------------------------------------------- ayuda
  function paintHelp(requests) {
    const msg = h("textarea", { class: "input", maxlength: 280, rows: 3, placeholder: "Opcional. Por ejemplo: me cuesta concentrarme antes de los exámenes." });
    const contact = h("input", { class: "input", maxlength: 120, placeholder: "Opcional. Por ejemplo: en el recreo, o mi número" });
    const err = errBox();
    const btn = h("button", { class: "btn", type: "submit" }, "Pedir conversación");
    const open = requests.filter((r) => r.status !== "cerrada");
    mount(helpCard,
      eyebrow("Pedir ayuda"),
      h("h2", null, "¿Quieres conversar con alguien?"),
      h("p", { class: "ink2" }, "Tu solicitud llega solo a la profesional en salud mental de tu colegio, con tu usuario y tu curso. Docentes y compañeros no la ven."),
      open.length ? h("div", { class: "stack tight" }, open.map((r) => h("div", { class: "req" },
        h("div", { class: "req-head" }, h("span", { class: "pill p-dark" }, REQ[r.status][0]), h("span", null, ago(r.created_at))),
        h("p", { class: "small ink2" }, REQ[r.status][1])))) : null,
      h("form", {
        class: "stack", novalidate: true,
        onsubmit: (e) => {
          e.preventDefault();
          busy(btn, async () => {
            showErr(err, "");
            try {
              await rpc("student_request_help", { p_message: msg.value, p_contact: contact.value });
              toast("Solicitud enviada");
              const s2 = await rpc("student_state");
              paintHelp(s2.requests);
            } catch (x) { showErr(err, errMsg(x)); }
          });
        },
      }, field("Cuéntale algo, si quieres", msg), field("¿Cómo prefieres que te busque?", contact), err, h("div", { class: "row end" }, btn)),
      h("div", { class: "card ink helpline" },
        h("div", null, h("p", { class: "tiny" }, "Si es urgente o fuera del horario escolar"), h("p", { class: "small" }, inst.help_name)),
        h("div", { class: "stack tight" },
          h("b", null, "Línea " + inst.help_line),
          inst.help_wa ? h("span", { class: "small" }, "WhatsApp " + inst.help_wa) : null)));
  }

  mount(root, h("div", { class: "view" },
    panelHead(ctx, hello, ctx.course ? ctx.course.name + " · " + inst.name : inst.name),
    h("div", { class: "grid-2" },
      h("div", { class: "stack" }, checkCard, toolsCard),
      h("div", { class: "stack" }, gadCard, helpCard))));
  paintCheck(st.today_value);
  paintGad(st.gad_done);
  paintTools();
  paintHelp(st.requests || []);
}

// Respiración guiada con temporizador y orbe animado
let breathTimer = null;
function breathing(stage) {
  clearTimeout(breathTimer);
  const orb = h("div", { class: "orb" });
  const label = h("p", { class: "small ink2" }, "Ponte cómodo. Empezamos en un momento.");
  const stop = h("button", { class: "btn soft sm", type: "button", onclick: () => { clearTimeout(breathTimer); mount(stage); } }, "Terminar");
  mount(stage, h("div", { class: "breath mt" }, orb, label, stop));
  const phases = [["Inhala", 4000, 1], ["Sostén", 4000, 1], ["Exhala", 6000, .55]];
  let i = 0, cycle = 0;
  const tick = () => {
    if (!orb.isConnected) return;
    const [t, ms, sc] = phases[i];
    orb.textContent = t;
    orb.style.transitionDuration = ms + "ms";
    orb.style.transform = `scale(${sc})`;
    label.textContent = `Ciclo ${cycle + 1} de 4`;
    i = (i + 1) % phases.length;
    if (i === 0) cycle++;
    if (cycle >= 4) { breathTimer = setTimeout(() => { orb.textContent = "Bien"; label.textContent = "Muy bien. Vuelve aquí cuando lo necesites."; }, ms); return; }
    breathTimer = setTimeout(tick, ms);
  };
  breathTimer = setTimeout(tick, 600);
}

function grounding(stage) {
  clearTimeout(breathTimer);
  const steps = [
    ["5", "cosas que puedes ver"], ["4", "cosas que puedes tocar"], ["3", "sonidos que puedes oír"],
    ["2", "olores que puedes sentir"], ["1", "cosa buena de hoy"],
  ];
  let i = 0;
  const big = h("div", { class: "big-r" });
  const txt = h("p", { class: "ink2" });
  const next = h("button", { class: "btn sm", type: "button", onclick: () => { i++; paint(); } }, "Siguiente");
  const paint = () => {
    if (i >= steps.length) { big.textContent = "✓"; txt.textContent = "Volviste al presente. Respira hondo una vez más."; next.hidden = true; return; }
    big.textContent = steps[i][0]; txt.textContent = "Nombra " + steps[i][1] + ".";
  };
  mount(stage, h("div", { class: "breath mt" }, big, txt, next));
  paint();
}
