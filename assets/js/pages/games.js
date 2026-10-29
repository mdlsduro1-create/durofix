// Biblioteca de bienestar y juegos interactivos para el alumnado.
// Nada de lo que se hace aquí se guarda ni se envía: todo queda en el navegador.
import { h, mount, icon } from "../ui.js";

// ---------------------------------------------------------------- lecturas
export const READINGS = [
  {
    title: "Cuando los nervios llegan antes del examen",
    min: 2,
    body: [
      "Sentir nervios antes de una prueba es normal. Tu cuerpo se prepara para un reto: el corazón late más rápido, las manos sudan y la mente se acelera. En una dosis pequeña, eso incluso ayuda a concentrarte.",
      "El problema aparece cuando los nervios crecen tanto que bloquean. Si te pasa, prueba esto: antes de empezar, respira lento tres veces, soltando el aire más despacio de lo que lo tomaste. Después lee todo el examen una vez y empieza por la pregunta que mejor sabes.",
      "Si te quedas en blanco, no pelees con la mente. Pasa a otra pregunta y vuelve después. La información sigue ahí, solo necesita que bajes un poco la presión.",
      "Y recuerda: una nota habla de un examen, no de quién eres.",
    ],
  },
  {
    title: "Dormir mejor en semanas difíciles",
    min: 2,
    body: [
      "Dormir poco hace que todo se sienta más pesado: cuesta concentrarse, uno se irrita fácil y las preocupaciones se ven más grandes.",
      "Algunas ideas que ayudan: intenta acostarte y levantarte a horas parecidas, incluso el fin de semana. Deja el celular lejos de la cama al menos media hora antes de dormir. Si la cabeza no para, escribe en un papel lo que te preocupa y lo que harás mañana con eso; así no tienes que sostenerlo toda la noche.",
      "Si después de veinte minutos no logras dormir, levántate un rato, haz algo tranquilo con poca luz y vuelve cuando sientas sueño.",
    ],
  },
  {
    title: "Pedir ayuda no te hace débil",
    min: 1,
    body: [
      "Muchas personas esperan a estar muy mal para hablar con alguien. Pero pedir ayuda temprano es como ir al médico por un resfrío antes de que se vuelva algo más serio.",
      "Hablar con la profesional de tu colegio es confidencial. No tienes que tener las palabras exactas ni un problema enorme: basta con decir que estos días no te sientes bien.",
      "También puedes empezar por alguien de confianza: un familiar, un amigo, un docente. Lo importante es no cargarlo solo.",
    ],
  },
  {
    title: "Cuando la preocupación da vueltas",
    min: 2,
    body: [
      "A veces un pensamiento se repite una y otra vez: ¿y si me va mal?, ¿y si piensan mal de mí? Mientras más intentamos no pensarlo, más vuelve.",
      "Prueba separar lo que puedes hacer de lo que no. Si puedes hacer algo hoy, aunque sea pequeño, hazlo. Si no depende de ti, intenta reconocerlo: esto me preocupa, pero ahora no puedo resolverlo.",
      "Otra idea es darle a la preocupación un horario. Por ejemplo, quince minutos en la tarde para escribir todo lo que te inquieta. Si aparece en otro momento, le dices: te atiendo a las cinco.",
      "Y si las preocupaciones no te dejan vivir tranquilo por varias semanas, es una buena señal para conversar con alguien.",
    ],
  },
  {
    title: "Cómo acompañar a un amigo que la está pasando mal",
    min: 2,
    body: [
      "No necesitas tener soluciones. Muchas veces lo que más ayuda es escuchar sin juzgar y decir algo simple como: estoy aquí, gracias por contarme.",
      "Evita minimizar lo que siente con frases como no es para tanto. Mejor pregunta cómo puedes ayudar.",
      "Si tu amigo habla de hacerse daño o de que no quiere seguir viviendo, no lo guardes como un secreto. Cuéntaselo a un adulto de confianza o a la profesional del colegio. Eso es cuidarlo, no traicionarlo.",
    ],
  },
];

export const TIPS = [
  "Toma agua y estira el cuerpo un minuto.",
  "Escucha una canción que te guste, sin hacer nada más.",
  "Sal a tomar aire o mira por la ventana un rato.",
  "Escríbele a alguien que te hace bien.",
  "Divide la tarea grande en un primer paso de cinco minutos.",
  "Ordena una sola cosa pequeña de tu espacio.",
  "Piensa en algo que salió bien hoy, por pequeño que sea.",
  "Deja el celular boca abajo durante diez minutos.",
];

export function tipOfDay() {
  const d = new Date();
  const n = Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  return TIPS[n % TIPS.length];
}

// ---------------------------------------------------------------- juegos
export const GAMES = [
  ["breath", "wind", "Respiración 4, 4, 6", "Inhala, sostén y exhala lento. Calma el ritmo del corazón."],
  ["square", "grid", "Respiración cuadrada", "Cuatro tiempos iguales, como dibujar un cuadrado con el aire."],
  ["ground", "hand", "Técnica 5, 4, 3, 2, 1", "Usa tus sentidos para volver al presente."],
  ["bubbles", "heart", "Burbujas", "Revienta burbujas a tu ritmo. No hay puntaje ni prisa."],
  ["memory", "chart", "Memoria tranquila", "Encuentra los pares. Un juego corto para despejar la mente."],
  ["clouds", "chat", "Nubes de pensamiento", "Escribe lo que te preocupa y míralo alejarse."],
];

let stopFn = null;
export function stopGame() { if (stopFn) { stopFn(); stopFn = null; } }

export function playGame(id, stage) {
  stopGame();
  ({ breath: () => breathing(stage, [["Inhala", 4000, 1], ["Sostén", 4000, 1], ["Exhala", 6000, .55]]),
    square: () => breathing(stage, [["Inhala", 4000, 1], ["Sostén", 4000, 1], ["Exhala", 4000, .55], ["Sostén", 4000, .55]]),
    ground: () => grounding(stage), bubbles: () => bubbles(stage), memory: () => memory(stage), clouds: () => clouds(stage) })[id]();
  stage.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

const closeBtn = (stage) => h("button", { class: "btn soft sm", type: "button", onclick: () => { stopGame(); mount(stage); } }, "Terminar");

function breathing(stage, phases) {
  let timer;
  const orb = h("div", { class: "orb" });
  const label = h("p", { class: "small ink2" }, "Ponte cómodo. Empezamos en un momento.");
  mount(stage, h("div", { class: "game breath" }, orb, label, closeBtn(stage)));
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
    if (cycle >= 4) { timer = setTimeout(() => { orb.textContent = "Bien"; label.textContent = "Muy bien. Vuelve aquí cuando lo necesites."; }, ms); return; }
    timer = setTimeout(tick, ms);
  };
  timer = setTimeout(tick, 600);
  stopFn = () => clearTimeout(timer);
}

function grounding(stage) {
  const steps = [["5", "cosas que puedes ver"], ["4", "cosas que puedes tocar"], ["3", "sonidos que puedes oír"], ["2", "olores que puedes sentir"], ["1", "cosa buena de hoy"]];
  let i = 0;
  const big = h("div", { class: "big-r" });
  const txt = h("p", { class: "ink2" });
  const next = h("button", { class: "btn sm", type: "button", onclick: () => { i++; paint(); } }, "Siguiente");
  const paint = () => {
    if (i >= steps.length) { big.textContent = "✓"; txt.textContent = "Volviste al presente. Respira hondo una vez más."; next.hidden = true; return; }
    big.textContent = steps[i][0]; txt.textContent = "Nombra " + steps[i][1] + ".";
  };
  mount(stage, h("div", { class: "game breath" }, big, txt, h("div", { class: "row centered" }, next, closeBtn(stage))));
  paint();
}

function bubbles(stage) {
  const area = h("div", { class: "bubble-area", "aria-label": "Área de burbujas" });
  const count = h("span", { class: "small ink2" }, "0 burbujas");
  let n = 0, timer;
  const spawn = () => {
    if (!area.isConnected) return;
    if (area.childElementCount < 9) {
      const size = 38 + Math.random() * 46;
      const b = h("button", { class: "bubble", type: "button", "aria-label": "Burbuja" });
      b.style.width = b.style.height = size + "px";
      b.style.left = (Math.random() * 86) + "%";
      b.style.animationDuration = (7 + Math.random() * 6) + "s";
      b.addEventListener("click", () => { b.classList.add("pop"); n++; count.textContent = n + (n === 1 ? " burbuja" : " burbujas"); setTimeout(() => b.remove(), 220); });
      b.addEventListener("animationend", (e) => { if (e.animationName === "float") b.remove(); });
      area.appendChild(b);
    }
    timer = setTimeout(spawn, 700 + Math.random() * 700);
  };
  mount(stage, h("div", { class: "game" }, h("p", { class: "small ink2" }, "Toca las burbujas cuando quieras. Respira con calma mientras suben."), area,
    h("div", { class: "row between" }, count, closeBtn(stage))));
  spawn();
  stopFn = () => clearTimeout(timer);
}

function memory(stage) {
  const icons = ["🌿", "🌙", "⭐", "🌊", "☁️", "🍃"];
  const deck = [...icons, ...icons].map((e, i) => ({ e, i, open: false, done: false })).sort(() => Math.random() - .5);
  let first = null, lock = false, moves = 0, found = 0;
  const grid = h("div", { class: "mem-grid" });
  const status = h("span", { class: "small ink2" }, "0 intentos");
  const paint = () => mount(grid, deck.map((c) => h("button", {
    class: "mem" + (c.open || c.done ? " open" : "") + (c.done ? " done" : ""), type: "button",
    "aria-label": c.open || c.done ? c.e : "Carta boca abajo", disabled: c.done,
    onclick: () => flip(c),
  }, c.open || c.done ? c.e : "")));
  function flip(c) {
    if (lock || c.open || c.done) return;
    c.open = true;
    if (!first) { first = c; paint(); return; }
    moves++; status.textContent = moves + (moves === 1 ? " intento" : " intentos");
    if (first.e === c.e) {
      first.done = c.done = true; first.open = c.open = false; first = null; found++;
      paint();
      if (found === icons.length) status.textContent = `¡Listo en ${moves} intentos! Tómate un respiro.`;
      return;
    }
    lock = true; paint();
    setTimeout(() => { first.open = c.open = false; first = null; lock = false; paint(); }, 800);
  }
  mount(stage, h("div", { class: "game" }, grid, h("div", { class: "row between" }, status,
    h("div", { class: "row" }, h("button", { class: "btn soft sm", type: "button", onclick: () => memory(stage) }, "Otra vez"), closeBtn(stage)))));
  paint();
}

function clouds(stage) {
  const sky = h("div", { class: "sky", "aria-live": "polite" });
  const inp = h("input", { class: "input", maxlength: 80, placeholder: "Escribe una preocupación" });
  const form = h("form", {
    class: "row", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      const t = inp.value.trim();
      if (!t) return;
      const c = h("div", { class: "cloud" }, t);
      c.style.top = (10 + Math.random() * 55) + "%";
      c.addEventListener("animationend", () => c.remove());
      sky.appendChild(c);
      inp.value = "";
    },
  }, h("div", { class: "grow" }, inp), h("button", { class: "btn sm", type: "submit" }, "Soltar"));
  mount(stage, h("div", { class: "game" },
    h("p", { class: "small ink2" }, "Los pensamientos son como nubes: llegan y se van. Escribe uno, suéltalo y míralo pasar. No se guarda en ningún lado."),
    sky, form, h("div", { class: "row end" }, closeBtn(stage))));
  inp.focus();
}

export const gameCard = (g, onPlay) => h("button", { class: "tool", type: "button", onclick: onPlay },
  icon(g[1], ""), h("div", null, h("b", null, g[2]), h("span", null, g[3])));
