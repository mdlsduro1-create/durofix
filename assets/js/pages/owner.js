// Panel del propietario de la plataforma: revisión de instituciones.
import { h, mount, tabs, loading, toast, busy, dateTime, confirmInline } from "../ui.js";
import { rpc, errMsg } from "../sb.js";
import { panelHead } from "./app.js";

const KIND = { fiscal: "Fiscal", particular: "Particular", convenio: "De convenio" };
const ST = { pendiente: ["Pendiente", "p-line"], activa: ["Activa", "p-dark"], suspendida: ["Suspendida", "p-mid"], rechazada: ["Rechazada", "p-soft"] };

export async function owner(root, ctx) {
  document.title = "Plataforma · PULSO";
  const list = h("div", { class: "stack mt" });
  let filter = "pendiente";
  const t = tabs([["pendiente", "Pendientes"], ["activa", "Activas"], ["suspendida", "Suspendidas"], ["rechazada", "Rechazadas"], ["todas", "Todas"]],
    (k) => { filter = k; paint(); }, filter);
  mount(root, h("div", { class: "view" },
    panelHead(ctx, "Instituciones", "Revisa cada solicitud antes de habilitarla. Verifica por teléfono o por un canal oficial que la persona representa a la institución."),
    t.el, list));

  async function paint() {
    mount(list, loading());
    let rows;
    try { rows = await rpc("owner_institutions", { p_status: filter }); } catch (e) { mount(list, h("p", { class: "err" }, errMsg(e))); return; }
    if (!rows.length) return mount(list, h("div", { class: "empty" }, "No hay instituciones en esta lista."));
    mount(list, rows.map(card));
  }

  function card(i) {
    const note = h("input", { class: "input", maxlength: 300, placeholder: "Nota de revisión (opcional)", value: i.review_note || "" });
    const holder = h("div");
    const decide = (d) => async () => {
      try { await rpc("owner_review", { p_id: i.id, p_decision: d, p_note: note.value }); toast("Decisión guardada"); paint(); }
      catch (x) { toast(errMsg(x)); }
    };
    const b = (t, d, cls = "btn soft sm") => h("button", { class: cls, type: "button", onclick: (e) => busy(e.currentTarget, decide(d)) }, t);
    const acts = [];
    if (i.status === "pendiente") acts.push(b("Aprobar", "activa", "btn sm"), b("Rechazar", "rechazada"));
    if (i.status === "activa") acts.push(h("button", { class: "btn danger sm", type: "button", onclick: () => confirmInline(holder, "Todas las cuentas de la institución perderán el acceso de inmediato.", "Suspender", decide("suspendida")) }, "Suspender"));
    if (i.status === "suspendida" || i.status === "rechazada") acts.push(b("Reactivar", "activa"));
    const row = (k, v) => v ? h("div", { class: "row between small" }, h("span", { class: "muted" }, k), h("span", null, v)) : null;
    return h("article", { class: "card stack" },
      h("div", { class: "row between" },
        h("div", null, h("h3", null, i.name), h("p", { class: "small muted" }, `${i.city}${i.department ? ", " + i.department : ""} · ${KIND[i.kind] || i.kind}`)),
        h("span", { class: "pill " + ST[i.status][1] }, ST[i.status][0])),
      h("div", { class: "grid-2" },
        h("div", { class: "stack tight" },
          row("Código de institución", i.slug), row("Código SIE", i.sie_code || "No informado"),
          row("Solicitud", dateTime(i.created_at)), i.reviewed_at ? row("Revisión", dateTime(i.reviewed_at)) : null),
        h("div", { class: "stack tight" },
          row("Responsable", i.contact_name), row("Cargo", i.contact_role), row("Teléfono", i.contact_phone || "No informado"),
          row("Correo", i.contact_email || "–"), row("Uso", `${i.courses} cursos · ${i.students} estudiantes`))),
      h("div", { class: "row" }, h("div", { class: "grow" }, note), ...acts),
      holder);
  }
  paint();
}
