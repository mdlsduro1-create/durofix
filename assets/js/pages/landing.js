// Página de inicio y política de privacidad.
import { h, mount, star, icon, eyebrow, tabs, LEVEL, dec } from "../ui.js";
import { state } from "../main.js";

const link = (href, text, cls = "btn") => h("a", { class: cls, href, "data-link": "" }, text);

export async function landing(root) {
  document.title = "PULSO · Detección temprana de ansiedad escolar";
  const logged = !!state.session;

  const hero = h("section", { class: "hero" },
    h("div", null,
      h("div", { class: "wordmark", "aria-label": "PULSO" }, star(), "PULSO"),
      h("h1", null, "Escuchar a cada curso, sin exponer a nadie."),
      h("p", { class: "lede mt" },
        "PULSO es una plataforma institucional para detectar a tiempo la ansiedad escolar. Cada estudiante registra cómo se siente en menos de un minuto, ",
        "la profesional en salud mental ve un semáforo por curso, y nadie, ni siquiera ella, puede ver la respuesta de una persona en particular."),
      h("div", { class: "row mt-l" },
        logged ? link("/app", "Ir a mi panel") : link("/registro/institucion", "Registrar mi institución"),
        link("/ingresar", "Ingresar", "btn ghost"))),
    heroCard());

  const facts = h("section", { class: "section grid-4" },
    fact("1 min", "al día por estudiante", "Una pregunta, cinco caras, sin escribir nada."),
    fact("5", "respuestas mínimas por curso", "Por debajo de ese número el curso se muestra como protegido."),
    fact("0", "nombres en los registros", "Cada respuesta se guarda con una huella que cambia todos los días."),
    fact("2", "pasos para el personal", "Contraseña y código del celular para quien ve datos sensibles."));

  const how = h("section", { class: "section", id: "como-funciona" },
    eyebrow("Cómo funciona"),
    h("h2", null, "Tres momentos, un mismo cuidado"),
    h("div", { class: "grid-3 mt-l" },
      step("01", "phone", "El estudiante registra", "Elige la cara que mejor describe su día. Cada dos semanas responde el GAD-7, un cuestionario breve y validado, y si quiere, pide conversar."),
      step("02", "shield", "La base de datos protege", "El nombre se separa de la respuesta. Solo se calculan promedios por curso, y solo cuando hay al menos cinco respuestas."),
      step("03", "grid", "El colegio actúa a tiempo", "La profesional ve qué cursos necesitan atención, recibe las solicitudes de conversación y cruza el bienestar con la asistencia.")));

  const sim = simulator();

  const roles = roleTabs();

  const security = h("section", { class: "section", id: "seguridad" },
    eyebrow("Seguridad institucional"),
    h("h2", null, "Diseñada para pasar una revisión estricta"),
    h("p", { class: "lede mt" }, "La seguridad no depende de la pantalla. Está en la base de datos, que rechaza cualquier consulta que no venga de una función autorizada."),
    h("div", { class: "grid-2 mt-l" },
      measure("lock", "Denegar por defecto", "Ninguna tabla se puede leer directamente. Cada acción pasa por una función que verifica la sesión, el rol, el estado de la cuenta y el de la institución."),
      measure("key", "Verificación en dos pasos", "Administración, profesional en salud mental y propietario de la plataforma deben usar un código de su celular para ver cualquier dato."),
      measure("eyeoff", "Respuestas sin identidad", "Los registros diarios no guardan a quién pertenecen. Se usa una huella criptográfica que cambia cada día, imposible de unir entre fechas."),
      measure("building", "Aislamiento entre instituciones", "Cada colegio ve solo lo suyo. La separación la hace el servidor, no la interfaz."),
      measure("log", "Bitácora de auditoría", "Aprobaciones, invitaciones, restablecimientos y borrados quedan registrados con fecha y responsable. Las solicitudes de ayuda nunca se registran ahí, para cuidar al estudiante."),
      measure("clock", "Sesiones cortas", "La sesión vive solo en la pestaña abierta y se cierra sola tras unos minutos sin actividad. Suspender una cuenta la expulsa al instante.")));

  const onboarding = h("section", { class: "section grid-2", id: "empezar" },
    h("div", null,
      eyebrow("Para empezar"),
      h("h2", null, "Así se suma un colegio"),
      h("p", { class: "lede mt" }, "Solo las instituciones educativas pueden registrarse. Cada solicitud se revisa a mano antes de habilitarla."),
      h("div", { class: "row mt-l" }, link("/registro/institucion", "Registrar mi institución"))),
    h("div", { class: "timeline" },
      tl("1", "Solicitud", "La dirección o la persona responsable completa el registro con los datos del colegio."),
      tl("2", "Revisión", "El equipo de PULSO verifica la institución y la habilita. Hasta entonces, nadie puede ver datos."),
      tl("3", "Configuración", "La administración activa la verificación en dos pasos, crea los cursos e invita a la profesional y a los docentes."),
      tl("4", "Inscripción", "Cada curso recibe un código. El estudiante crea su usuario con ese código y la administración lo aprueba."),
      tl("5", "Uso diario", "Un minuto al día. El semáforo se enciende cuando hay datos suficientes para cuidar el anonimato.")));

  const faq = h("section", { class: "section mid", id: "preguntas" },
    eyebrow("Preguntas frecuentes"),
    h("h2", null, "Lo que suelen preguntar las familias y los colegios"),
    h("div", { class: "mt-l" },
      q("¿La profesional puede saber qué respondió mi hijo o mi hija?", "No. Las respuestas diarias y los cuestionarios se guardan sin identidad y solo se muestran como promedios de curso. La única forma de que la profesional sepa quién es, es que el propio estudiante pida conversar."),
      q("¿PULSO hace diagnósticos?", "No. PULSO es una herramienta de detección temprana para el colegio. El GAD-7 orienta, no diagnostica. Cualquier evaluación clínica la hace un profesional en persona."),
      q("¿Qué pasa si un curso tiene pocas respuestas?", "Se muestra como protegido y no se calcula ningún promedio. El mínimo predeterminado es cinco, y cada institución puede subirlo."),
      q("¿Por qué el día de hoy no muestra un número?", "Porque si alguien mirara el promedio antes y después de que un estudiante responda, podría deducir su respuesta. Por eso el día en curso solo muestra un nivel, y los números aparecen al cerrar el día."),
      q("¿Quién puede registrarse?", "Solo instituciones educativas, que se aprueban a mano. El alumnado se inscribe con el código de su curso y queda pendiente hasta que la administración lo aprueba. El personal entra solo con una invitación de un solo uso."),
      q("¿Cómo se borran los datos?", "La administración puede borrar todos los registros de su institución en cualquier momento, y la acción queda en la bitácora. Al terminar un piloto, se recomienda hacerlo.")));

  const cta = h("section", { class: "section" },
    h("div", { class: "card ink stack center" },
      eyebrow("Olimpiadas Científicas STEM+ 2026"),
      h("h2", null, "Un proyecto del Equipo PULSO, Unidad Educativa Anglo Americano, Oruro"),
      h("p", { class: "muted" }, "Hecho por estudiantes de secundaria para que pedir ayuda deje de ser lo más difícil del día."),
      h("div", { class: "row mt centered" }, link("/registro/institucion", "Registrar mi institución"), link("/privacidad", "Leer la política de privacidad", "btn ghost"))));

  mount(root, h("div", { class: "view" }, hero, facts, how, sim, roles, security, onboarding, faq, cta));
}

function heroCard() {
  const faces = ["😣", "😕", "😐", "🙂", "😄"];
  const out = h("p", { class: "small muted mt", "aria-live": "polite" }, "Toca una cara para ver qué ocurre con tu respuesta.");
  const moods = h("div", { class: "moods" }, faces.map((f, i) => h("button", {
    class: "mood", type: "button", "aria-pressed": "false", "aria-label": "Valor " + (i + 1),
    onclick: (e) => {
      moods.querySelectorAll(".mood").forEach((b) => b.setAttribute("aria-pressed", "false"));
      e.currentTarget.setAttribute("aria-pressed", "true");
      out.textContent = `Se guarda el valor ${i + 1} con una huella de hoy. Tu nombre no viaja con él, y mañana la huella será otra.`;
    },
  }, f, h("small", null, ["Muy mal", "Mal", "Normal", "Bien", "Muy bien"][i]))));
  return h("div", { class: "card" },
    eyebrow("Así lo ve el estudiante"),
    h("h3", null, "¿Cómo te sientes hoy?"),
    moods, out);
}

const fact = (v, k, src) => h("div", { class: "card stat" }, h("div", { class: "v" }, v), h("p", { class: "k" }, k), h("p", { class: "src" }, src));
const step = (n, ic, t, d) => h("div", { class: "card step-card" }, icon(ic), h("span", { class: "n" }, n), h("h3", null, t), h("p", { class: "ink2 small" }, d));
const measure = (ic, t, d) => h("div", { class: "card flat measure" }, icon(ic, ""), h("div", null, h("h3", null, t), h("p", { class: "small ink2 mt-s" }, d)));
const tl = (n, t, d) => h("div", { class: "tl" }, h("div", { class: "dot" }, n), h("div", null, h("h3", null, t), h("p", { class: "small ink2" }, d)));
const q = (t, d) => h("details", { class: "faq" }, h("summary", null, t), h("p", null, d));

// Simulador interactivo del umbral de anonimato
function simulator() {
  const K = 5;
  const pool = [4, 3, 5, 2, 4, 3, 4, 2, 5, 3, 4, 1];
  const facesFor = (v) => ["😣", "😕", "😐", "🙂", "😄"][v - 1];
  const range = h("input", { type: "range", min: 0, max: 12, value: 3, class: "input", "aria-label": "Respuestas del curso" });
  const nOut = h("b", { class: "num" });
  const tile = h("div", { class: "sim-tile" });
  const faces = h("div", { class: "sim-faces", "aria-hidden": "true" });
  const why = h("p", { class: "small ink2" });

  function paint() {
    const n = Number(range.value);
    nOut.textContent = String(n);
    mount(faces, pool.slice(0, n).map((v) => h("span", null, facesFor(v))));
    let lv, big, sub;
    if (n === 0) { lv = "vacio"; big = "–"; sub = "Sin respuestas todavía"; }
    else if (n < K) { lv = "protegido"; big = "Protegido"; sub = `${n} de ${K} respuestas mínimas`; }
    else {
      const avg = pool.slice(0, n).reduce((a, b) => a + b, 0) / n;
      lv = avg >= 3.5 ? "estable" : avg >= 2.7 ? "atencion" : "alerta";
      big = dec(avg); sub = LEVEL[lv].t + " · " + n + " respuestas";
    }
    tile.className = "sim-tile lv-" + lv;
    mount(tile, h("span", { class: "small" }, "4.º de secundaria B"), h("div", null, h("div", { class: "big" }, big), h("p", { class: "small mt-s" }, sub)));
    why.textContent = n < K
      ? "Con tan pocas respuestas, un promedio podría delatar a alguien. PULSO no lo calcula."
      : "Con cinco o más respuestas el promedio ya no permite identificar a nadie, y el curso aparece en el semáforo.";
  }
  range.addEventListener("input", paint);
  paint();
  return h("section", { class: "section", id: "privacidad-simulador" },
    eyebrow("Pruébalo"),
    h("h2", null, "El umbral que cuida el anonimato"),
    h("div", { class: "sim mt-l" },
      h("div", { class: "card stack" },
        h("p", { class: "ink2" }, "Mueve el control para simular cuántos estudiantes de un curso respondieron hoy."),
        h("div", { class: "row between" }, h("span", { class: "small muted" }, "Respuestas"), nOut),
        range, faces, why),
      tile));
}

function roleTabs() {
  const ROLES = {
    estudiante: ["Estudiante", "Registra su día con una cara, responde el GAD-7 cada quincena y tiene a mano herramientas para calmarse.", [
      "No ve datos de nadie más, ni siquiera los de su curso.",
      "Si un registro sale bajo, se le ofrece respirar, conectarse con su entorno o pedir conversar.",
      "Solo cuando pide ayuda, su usuario llega a la profesional.",
    ]],
    docente: ["Docente", "Ve el clima de los cursos que tiene asignados, para ajustar su clase en una semana difícil.", [
      "Ve niveles por día y promedios por semana.",
      "No ve solicitudes de ayuda ni resultados del GAD-7.",
      "Los cursos con pocas respuestas aparecen como protegidos.",
    ]],
    profesional: ["Profesional en salud mental", "Tiene el semáforo de toda la institución y atiende las solicitudes de conversación.", [
      "Ve qué cursos están en atención o en alerta y cómo cambian semana a semana.",
      "Gestiona cada solicitud: conversación, derivación externa y cierre.",
      "Cruza bienestar con asistencia y calcula la correlación de Pearson.",
    ]],
    admin: ["Administración", "Configura la institución y decide quién entra.", [
      "Crea cursos y sus códigos, aprueba al alumnado e invita al personal.",
      "Restablece contraseñas, suspende cuentas y revisa la bitácora.",
      "Puede borrar todos los datos de la institución.",
    ]],
  };
  const pane = h("div", { class: "card role-pane" });
  const paint = (k) => {
    const [t, d, li] = ROLES[k];
    mount(pane, h("h3", null, t), h("p", { class: "ink2 mt-s" }, d), h("ul", null, li.map((x) => h("li", null, x))));
  };
  const tb = tabs(Object.entries(ROLES).map(([k, v]) => [k, v[0].split(" ")[0]]), paint, "estudiante");
  paint("estudiante");
  return h("section", { class: "section", id: "roles" },
    eyebrow("Quién ve qué"),
    h("h2", null, "Cada rol ve solo lo que necesita"),
    h("div", { class: "mt-l stack" }, tb.el, pane));
}

export async function privacy(root) {
  document.title = "Privacidad · PULSO";
  const sec = (t, ...ps) => h("section", { class: "section sm" }, h("h2", null, t), ps.map((p) => h("p", { class: "ink2 mt" }, p)));
  mount(root, h("article", { class: "view mid" },
    eyebrow("Política de privacidad"),
    h("h1", { class: "sm" }, "Qué datos guarda PULSO y para qué"),
    h("p", { class: "lede mt" }, "Esta política explica, en palabras simples, cómo se cuidan los datos del alumnado y del personal de cada institución."),
    sec("Responsables",
      "Cada institución registrada es responsable de los datos de su comunidad educativa y de obtener el consentimiento informado de las familias antes de inscribir al alumnado. PULSO actúa como herramienta tecnológica a su servicio."),
    sec("Datos que se guardan",
      "Del alumnado: un nombre de usuario elegido por el estudiante (no su nombre real), su curso y su contraseña cifrada. Las respuestas diarias y del cuestionario GAD-7 se guardan sin identidad, con una huella criptográfica que cambia cada día o cada quincena.",
      "Del personal: nombre, correo, rol y contraseña cifrada. De la institución: nombre, ciudad, tipo, código SIE si se informa y los datos de la persona de contacto.",
      "Solicitudes de ayuda: el mensaje y el medio de contacto que el estudiante decida escribir, ambos opcionales."),
    sec("Quién puede ver qué",
      "Nadie ve respuestas individuales. Docentes y profesionales ven promedios de curso, y solo cuando hay al menos el mínimo de respuestas definido por la institución (cinco, de forma predeterminada). Las solicitudes de ayuda solo las ve la profesional en salud mental."),
    sec("Seguridad",
      "Las comunicaciones viajan cifradas. La base de datos niega toda lectura directa y solo responde a funciones que verifican la identidad, el rol y el estado de cada cuenta. El personal con acceso a datos sensibles usa verificación en dos pasos. Las acciones administrativas quedan en una bitácora de auditoría."),
    sec("Conservación y borrado",
      "Los datos se conservan mientras la institución use la plataforma. La administración puede borrar en cualquier momento todos los registros de su institución. Una cuenta suspendida pierde el acceso de inmediato."),
    sec("No es un servicio de emergencia",
      "PULSO no reemplaza la atención profesional ni es un canal de emergencia. Ante una situación de riesgo, comunícate con la línea de ayuda que tu institución muestra en la aplicación o con los servicios de emergencia."),
    sec("Contacto",
      "Para ejercer tus derechos de acceso, corrección o eliminación, comunícate con la administración de tu institución."),
    h("p", { class: "mt-l" }, link("/", "Volver al inicio", "btn ghost"))));
}
