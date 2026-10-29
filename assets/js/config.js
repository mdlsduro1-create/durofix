// Configuración pública del despliegue.
// La clave "anon" de Supabase es pública por diseño: no da acceso a ninguna tabla,
// porque la base de datos niega todo y solo expone funciones que validan rol, estado y MFA.
// La clave "service_role" NUNCA debe aparecer en este proyecto.
export const CONFIG = Object.freeze({
  SUPABASE_URL: "__SUPABASE_URL__",
  SUPABASE_ANON_KEY: "__SUPABASE_ANON_KEY__",
  // Dominio interno para las cuentas del alumnado (no recibe correos).
  // usuario@codigo-institucion.<este dominio>
  STUDENT_EMAIL_DOMAIN: "alumnos.pulso.invalid",
  IDLE_MINUTES_STAFF: 15,
  IDLE_MINUTES_STUDENT: 20,
  PASSWORD_MIN: 10,
});

export const configured = () =>
  !CONFIG.SUPABASE_URL.startsWith("__") && !CONFIG.SUPABASE_ANON_KEY.startsWith("__");
