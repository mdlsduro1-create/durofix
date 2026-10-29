// Panel docente: clima de los cursos asignados.
import { h, mount } from "../ui.js";
import { rpc } from "../sb.js";
import { panelHead } from "./app.js";
import { courseDetail } from "./course.js";

export async function teacher(root, ctx) {
  document.title = "Mis cursos · PULSO";
  const courses = await rpc("teacher_courses_list");
  const detail = h("div", { class: "card mt" });
  const head = panelHead(ctx, "El clima de tus cursos", "Promedios de curso, nunca respuestas individuales. Úsalos para ajustar la clase en una semana difícil.");
  if (!courses.length) {
    mount(root, h("div", { class: "view" }, head,
      h("div", { class: "empty" }, "Todavía no tienes cursos asignados. La administración de tu colegio debe asignártelos.")));
    return;
  }
  const list = h("div", { class: "courses" }, courses.map((c, i) => h("button", {
    class: "course lv-estable", type: "button", "aria-pressed": String(i === 0),
    onclick: (e) => {
      list.querySelectorAll(".course").forEach((b) => b.setAttribute("aria-pressed", "false"));
      e.currentTarget.setAttribute("aria-pressed", "true");
      courseDetail(detail, c.id);
    },
  }, h("h4", null, c.name), h("p", { class: "lv" }, "Ver detalle"))));
  mount(root, h("div", { class: "view" }, head, list, detail));
  courseDetail(detail, courses[0].id);
}
