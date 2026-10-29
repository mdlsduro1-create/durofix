// Cliente de Supabase y traducción de errores.
// La sesión se guarda en sessionStorage: al cerrar la pestaña, la sesión desaparece
// (pensado para computadoras compartidas del colegio).
import { CONFIG, configured } from "./config.js";

let client = null;
export function sb() {
  if (!client) {
    if (!configured()) throw new Error("sin_configurar");
    client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "pulso.sesion" },
      global: { headers: { "x-client-info": "pulso-web" } },
    });
  }
  return client;
}

const MSG = {
  no_autenticado: "Tu sesión terminó. Vuelve a ingresar.",
  sin_perfil: "Esta cuenta no tiene un perfil en PULSO.",
  cuenta_pendiente: "Tu cuenta todavía está pendiente de aprobación.",
  cuenta_suspendida: "Tu cuenta está suspendida.",
  cuenta_rechazada: "Tu solicitud de cuenta fue rechazada.",
  rol_no_permitido: "Tu rol no tiene permiso para esta acción.",
  institucion_pendiente: "La institución aún no fue aprobada.",
  institucion_suspendida: "La institución está suspendida.",
  institucion_rechazada: "La solicitud de la institución fue rechazada.",
  mfa_requerido: "Esta acción exige la verificación en dos pasos.",
  cambio_contrasena: "Primero debes cambiar tu contraseña temporal.",
  codigo_curso_invalido: "El código de curso no es válido o la inscripción está cerrada.",
  institucion_no_activa: "La institución no está activa.",
  usuario_invalido: "El usuario debe tener de 3 a 24 caracteres: letras minúsculas, números, punto o guion bajo.",
  usuario_en_uso: "Ese usuario ya existe en tu institución, elige otro.",
  invitacion_invalida: "La invitación no es válida, ya se usó o venció.",
  registro_no_permitido: "Este tipo de registro no está permitido.",
  valor_invalido: "El valor no es válido.",
  sin_curso: "Tu cuenta no tiene un curso asignado. Avisa a la administración.",
  respuestas_invalidas: "Responde las siete preguntas.",
  gad_ya_respondido: "Ya respondiste el cuestionario de esta quincena.",
  limite_solicitudes: "Ya enviaste varias solicitudes hoy. La profesional ya las tiene, te buscará pronto.",
  curso_no_encontrado: "No se encontró el curso.",
  curso_no_asignado: "Ese curso no está asignado a tu cuenta.",
  curso_duplicado: "Ya existe un curso con ese nombre.",
  limite_cursos: "Se alcanzó el límite de cursos.",
  accion_invalida: "Acción no válida.",
  rol_invalido: "Rol no válido.",
  limite_invitaciones: "Hay demasiadas invitaciones activas. Espera a que se usen o venzan.",
  miembro_no_encontrado: "No se encontró a esa persona.",
  no_puedes_modificarte: "No puedes cambiar el estado de tu propia cuenta.",
  solicitud_no_encontrada: "No se encontró la solicitud.",
  datos_invalidos: "Los datos no tienen el formato esperado.",
  institucion_no_encontrada: "No se encontró la institución.",
  sin_configurar: "La plataforma aún no está conectada a su base de datos.",
  fuera_de_horario: "Esta actividad ya no está abierta. Revisa los próximos horarios.",
  programacion_no_encontrada: "No se encontró esa programación.",
  limite_programaciones: "Se alcanzó el límite de programaciones. Borra las que ya no uses.",
  enlace_invalido: "El enlace debe empezar con https://",
  recurso_no_encontrado: "No se encontró el recurso.",
  limite_recursos: "Se alcanzó el límite de recursos publicados.",
  chat_inactivo: "El chat no está activo en este momento.",
  mensaje_vacio: "Escribe un mensaje.",
  limite_mensajes: "Enviaste muchos mensajes seguidos. Espera un rato; la profesional ya los tiene.",
  conversacion_no_encontrada: "No se encontró la conversación o ya está cerrada.",
};

export function errMsg(e) {
  if (!e) return "";
  const raw = String(e.message || e.error_description || e.msg || e);
  for (const k of Object.keys(MSG)) if (raw.includes(k)) return MSG[k];
  if (/Invalid login credentials/i.test(raw)) return "Los datos de ingreso no coinciden.";
  if (/rate limit|too many/i.test(raw)) return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
  if (/already registered|already been registered/i.test(raw)) return "Ese correo ya tiene una cuenta.";
  if (/Database error saving new user/i.test(raw)) return "No se pudo crear la cuenta. Revisa el código y los datos e inténtalo otra vez.";
  if (/Password should|weak|password.*characters/i.test(raw)) return "La contraseña no cumple los requisitos de seguridad.";
  if (/Invalid TOTP|invalid.*code/i.test(raw)) return "El código no es correcto o ya venció.";
  if (/Email address .* is invalid|invalid email/i.test(raw)) return "El correo no es válido.";
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return "Sin conexión con el servidor. Revisa tu internet.";
  if (/JWT expired|session/i.test(raw)) return MSG.no_autenticado;
  return "Ocurrió un error inesperado. Inténtalo otra vez.";
}

export function code(e) {
  const raw = String((e && (e.message || e)) || "");
  return Object.keys(MSG).find((k) => raw.includes(k)) || null;
}

// Llamada a una función del servidor; lanza un Error con el mensaje original.
export async function rpc(name, args) {
  const { data, error } = await sb().rpc(name, args || {});
  if (error) throw new Error(error.message || "error");
  return data;
}

export const studentEmail = (slug, username) =>
  `${String(username).trim().toLowerCase()}@${String(slug).trim().toLowerCase()}.${CONFIG.STUDENT_EMAIL_DOMAIN}`;
