// Chat entre estudiante y profesional en salud mental.
// Se actualiza consultando cada pocos segundos mientras la vista está abierta.
import { h, mount, errBox, showErr, busy, toast, loading, ago, dateTime, field, input } from "../ui.js";
import { rpc, errMsg } from "../sb.js";

const POLL_MS = 8000;

function bubbles(list, who) {
  if (!list.length) return h("p", { class: "empty" }, who === "estudiante" ? "Escribe tu primer mensaje. Solo lo leerá la profesional de tu colegio." : "Sin mensajes todavía.");
  return list.map((m) => h("div", { class: "msg" + (m.mine ? " mine" : "") },
    h("p", null, m.body),
    h("span", { class: "tiny", "data-tip": dateTime(m.at) }, (m.who ? m.who + " · " : "") + ago(m.at))));
}

function composer(onSend, disabled) {
  const ta = h("textarea", { class: "input", rows: 2, maxlength: 1000, placeholder: "Escribe un mensaje", disabled });
  const btn = h("button", { class: "btn", type: "submit", disabled }, "Enviar");
  const err = errBox();
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  const form = h("form", {
    class: "composer", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      if (!ta.value.trim()) return;
      busy(btn, async () => {
        showErr(err, "");
        try { await onSend(ta.value); ta.value = ""; } catch (x) { showErr(err, errMsg(x)); }
      });
    },
  }, ta, btn);
  return h("div", { class: "stack tight" }, form, err);
}

// ---------------------------------------------------------------- estudiante
export async function studentChat(box, fallback) {
  mount(box, loading());
  let st;
  try { st = await rpc("student_chat_state"); } catch (e) { mount(box, h("p", { class: "err" }, errMsg(e))); return; }
  if (!st.enabled) { fallback(box); return; }
  const list = h("div", { class: "chat-log", role: "log", "aria-live": "polite" });
  const paint = (s) => {
    mount(list, bubbles(s.messages, "estudiante"));
    list.scrollTop = list.scrollHeight;
  };
  mount(box, h("div", { class: "stack" },
    h("div", { class: "row between" },
      h("h3", null, "Chat con la profesional"),
      st.hours ? h("span", { class: "pill p-line" }, st.hours) : null),
    h("p", { class: "small ink2" }, "Solo la profesional en salud mental de tu colegio lee estos mensajes. Puede tardar en responder fuera de su horario."),
    list,
    composer(async (text) => { await rpc("student_chat_send", { p_body: text }); paint(await rpc("student_chat_state")); }),
    h("p", { class: "tiny muted" }, "Si es una emergencia, no esperes la respuesta: llama a la línea de ayuda que aparece en tu panel.")));
  paint(st);
  const timer = setInterval(async () => {
    if (!list.isConnected) { clearInterval(timer); return; }
    if (document.hidden) return;
    try { const s = await rpc("student_chat_state"); if (s.messages.length !== list.querySelectorAll(".msg").length) paint(s); } catch { /* reintenta */ }
  }, POLL_MS);
}

// ---------------------------------------------------------------- profesional
export async function proChat(box) {
  mount(box, loading());
  let data;
  try { data = await rpc("pro_chat_threads"); } catch (e) { mount(box, h("p", { class: "err" }, errMsg(e))); return; }

  // Ajustes del chat
  const enabled = h("input", { type: "checkbox", role: "switch", checked: data.enabled });
  const hours = input({ maxlength: 120, value: data.hours || "", placeholder: "Por ejemplo: lunes a viernes, de 8:00 a 12:00" });
  const sErr = errBox();
  const sBtn = h("button", { class: "btn sm", type: "submit" }, "Guardar");
  const settings = h("form", {
    class: "card stack tight", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      busy(sBtn, async () => {
        showErr(sErr, "");
        try { await rpc("pro_chat_settings", { p_enabled: enabled.checked, p_hours: hours.value }); toast(enabled.checked ? "Chat activado para el alumnado" : "Chat desactivado"); }
        catch (x) { showErr(sErr, errMsg(x)); }
      });
    },
  },
    h("label", { class: "check" }, enabled, h("span", null, h("b", null, "Permitir que el alumnado me escriba"), h("br"), "Si lo desactivas, el alumnado solo puede pedir una conversación en persona. Los mensajes anteriores se conservan.")),
    field("Horario de atención que verá el alumnado", hours), sErr, h("div", { class: "row end" }, sBtn));

  const threadsBox = h("div", { class: "stack tight" });
  const convo = h("div", { class: "card stack" }, h("p", { class: "empty" }, "Elige una conversación."));
  let current = null;

  function paintThreads(threads) {
    if (!threads.length) return mount(threadsBox, h("div", { class: "empty" }, data.enabled ? "Aún no hay conversaciones." : "El chat está desactivado."));
    mount(threadsBox, threads.map((t) => h("button", {
      class: "thread" + (current === t.id ? " on" : ""), type: "button",
      onclick: () => { current = t.id; openThread(t.id); paintThreads(threads); },
    },
      h("div", { class: "row between" }, h("b", { class: "mono" }, t.username || "estudiante"), t.unread ? h("span", { class: "pill p-dark" }, String(t.unread)) : h("span", { class: "tiny muted" }, ago(t.last_at))),
      h("span", { class: "small muted" }, (t.course || "Sin curso") + (t.status === "cerrada" ? " · cerrada" : "")),
      t.preview ? h("span", { class: "small ink2 clamp1" }, t.preview) : null)));
  }

  async function openThread(id) {
    let m;
    try { m = await rpc("pro_chat_messages", { p_thread: id }); } catch (e) { toast(errMsg(e)); return; }
    const log = h("div", { class: "chat-log", role: "log" }, bubbles(m.messages, "profesional"));
    const closed = m.status === "cerrada";
    mount(convo,
      h("div", { class: "row between" },
        h("h3", { class: "mono" }, m.username || "estudiante"),
        h("button", { class: "btn soft sm", type: "button", onclick: (e) => busy(e.currentTarget, async () => {
          try { await rpc("pro_chat_status", { p_thread: id, p_status: closed ? "abierta" : "cerrada" }); toast(closed ? "Conversación reabierta" : "Conversación cerrada"); refresh(); openThread(id); }
          catch (x) { toast(errMsg(x)); }
        }) }, closed ? "Reabrir" : "Cerrar conversación")),
      log,
      closed ? h("p", { class: "note" }, "Conversación cerrada. Si el estudiante vuelve a escribir, se abre una nueva.")
        : composer(async (text) => { await rpc("pro_chat_send", { p_thread: id, p_body: text }); openThread(id); refresh(); }));
    log.scrollTop = log.scrollHeight;
  }

  async function refresh() {
    try { data = await rpc("pro_chat_threads"); paintThreads(data.threads); } catch { /* reintenta */ }
  }

  mount(box, h("div", { class: "stack" },
    h("p", { class: "note" }, "Las conversaciones son confidenciales: solo las ve el personal de salud mental de tu institución. No quedan en la bitácora de la administración."),
    h("div", { class: "chat-grid" },
      h("div", { class: "stack" }, settings, h("div", { class: "card stack tight" }, h("h3", null, "Conversaciones"), threadsBox)),
      convo)));
  paintThreads(data.threads);

  const timer = setInterval(async () => {
    if (!box.isConnected || !threadsBox.isConnected) { clearInterval(timer); return; }
    if (document.hidden) return;
    await refresh();
    if (current) {
      const log = convo.querySelector(".chat-log");
      try {
        const m = await rpc("pro_chat_messages", { p_thread: current });
        if (log && m.messages.length !== log.querySelectorAll(".msg").length) { mount(log, bubbles(m.messages, "profesional")); log.scrollTop = log.scrollHeight; }
      } catch { /* reintenta */ }
    }
  }, POLL_MS);
}
