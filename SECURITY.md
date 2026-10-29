# Seguridad de PULSO

Este documento describe los controles de seguridad, los riesgos que quedan y qué hacer ante un incidente. Está pensado para una revisión institucional.

## Clasificación de datos

| Dato | Clase | Dónde vive | Quién lo ve |
|---|---|---|---|
| Registro diario (valor de 1 a 5) | Confidencial, sin identidad | `checkins`, con huella HMAC diaria | Nadie individualmente; promedios con mínimo k |
| Puntaje GAD-7 | Confidencial, sin identidad | `gad_results`, huella HMAC quincenal | Nadie individualmente; proporción por curso con mínimo k |
| Solicitud de ayuda | Sensible, identificable | `help_requests` | Solo la profesional en salud mental |
| Usuario del estudiante | Personal (seudónimo) | `profiles` | Administración y profesional (en solicitudes) |
| Correo, nombre y rol del personal | Personal | `auth.users`, `profiles` | Administración de la institución, propietario |
| Mensajes del chat | Sensible, identificable | `chat_threads`, `chat_messages` | Solo la profesional en salud mental y el propio estudiante |
| Programación de actividades y recursos | Interno | `schedules`, `resources` | Administración y profesional (el alumnado ve solo lo que le corresponde) |
| Asistencia semanal por curso | Interno | `attendance` | Administración y profesional |
| Bitácora | Interno | `audit_log` | Administración de la institución |

No se guardan nombres reales del alumnado, fechas de nacimiento, documentos de identidad ni datos de las familias.

## Controles

### Autenticación
* Contraseñas de al menos 10 caracteres con letras y números, validadas en la interfaz y en Supabase Auth.
* Verificación en dos pasos (TOTP) obligatoria para administración, profesional y propietario. La base de datos rechaza sus consultas si la sesión no es AAL2.
* Límite de intentos del servidor de Supabase, más una espera creciente en la interfaz tras cada fallo.
* Sesión guardada en `sessionStorage`: se pierde al cerrar la pestaña. Cierre automático tras 15 minutos de inactividad (personal) o 20 (alumnado).
* Contraseña temporal tras un restablecimiento: obliga a cambiarla antes de ver cualquier dato, y cierra todas las sesiones abiertas.

### Control de acceso
* Denegación por defecto: RLS activado sin políticas, y privilegios revocados a `anon` y `authenticated` sobre todas las tablas.
* Toda operación pasa por una función que comprueba sesión, perfil, estado de la cuenta, rol permitido, estado de la institución, AAL2 y contraseña temporal.
* Aislamiento entre instituciones: cada función filtra por la institución del perfil autenticado; nunca acepta el identificador de institución desde el cliente.
* Mínimo privilegio por rol (ver README). El docente no ve solicitudes ni GAD-7; la administración no ve solicitudes.
* Altas controladas: las instituciones las aprueba el propietario; el alumnado, la administración; el personal entra solo con invitaciones de un solo uso, guardadas como huella SHA-256 y con vencimiento a los 7 días.
* Baja inmediata: suspender una cuenta o una institución borra sus sesiones en el servidor.

### Protección de datos
* Anonimato de registros: la huella es HMAC(usuario, día) con una clave guardada en un esquema privado no expuesto. No es posible unir respuestas de días distintos ni volver al usuario sin esa clave.
* Umbral k (5 por defecto, configurable de 3 a 15): no se calcula ningún promedio con menos respuestas.
* Antidiferenciación: el día en curso se informa solo como nivel cualitativo; los números aparecen al cerrar el día.
* El estudiante nunca recibe su puntaje GAD-7, solo una sugerencia de conversar si corresponde.
* Cifrado en tránsito (TLS, HSTS) y en reposo (Supabase).
* Borrado total de datos de una institución por su administración, registrado en la bitácora.

### Programación, chat y recursos
* Las actividades solo se aceptan dentro de una ventana programada: la verificación ocurre en la base de datos, no en la pantalla.
* El GAD-7 se agrega por los últimos 14 días cerrados, con el mínimo k, para que una respuesta nueva no pueda deducirse comparando lecturas.
* El chat es opcional y lo activa la profesional. Ni la administración ni los docentes pueden leerlo, y su contenido no entra en la bitácora. Límite de 30 mensajes por hora por estudiante.
* Los enlaces publicados solo se aceptan con `https://` y se abren en una pestaña aislada (`noopener noreferrer`).
* El borrado total de datos de una institución incluye las conversaciones.

### Navegador
* Política de seguridad de contenido sin `unsafe-inline` ni `unsafe-eval`; solo scripts, estilos y fuentes del propio dominio.
* `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` restrictiva, COOP y CORP.
* Todo texto de usuario se inserta como texto, nunca como HTML.
* Dependencias copiadas en el repositorio con versión fija (supabase-js 2.45.4), sin CDN de terceros.

### Secretos
* El repositorio contiene solo la clave pública `anon`. La clave `service_role` no se usa ni se guarda.
* La clave HMAC se genera dentro de la base de datos y nunca sale de ella.

### Auditoría
* Se registran: altas, aprobaciones, suspensiones, invitaciones, cambios de curso, códigos, ajustes, restablecimientos, cargas de asistencia y borrados.
* Las solicitudes de ayuda no se registran en la bitácora de la administración, para proteger la identidad del estudiante.

## Riesgos que quedan

* **Correo sin confirmar**: se desactivó la confirmación de correo para que el alumnado pueda usar cuentas internas. Mitigación: toda cuenta queda pendiente hasta una aprobación humana, y el personal necesita una invitación.
* **Recuperación de contraseña por correo**: el servicio de correo incluido en Supabase tiene límites estrictos. Para producción, configurar un SMTP propio. Mientras tanto, la administración restablece contraseñas desde la plataforma.
* **Protección contra contraseñas filtradas y límite de duración de sesión**: requieren el plan Pro de Supabase. Recomendado antes de un uso a gran escala.
* **Persona con acceso al panel de Supabase**: puede ver todo. Esa cuenta debe tener verificación en dos pasos y no compartirse.
* **Grupos muy pequeños**: si un curso tiene justo k estudiantes y todos responden lo mismo, el promedio revela el valor de todos. Subir k reduce el riesgo.
* **Respaldo**: el plan gratuito no ofrece restauración a un punto en el tiempo. Exportar la base periódicamente y probar la restauración.

## Respuesta a incidentes

1. **Detectar**: revisar la bitácora de cada institución y los registros de Auth en Supabase (inicios de sesión fallidos, altas inusuales).
2. **Contener**: suspender la cuenta o la institución afectada (cierra sus sesiones al instante). Si se sospecha de la clave HMAC o de una cuenta del panel de Supabase, rotar contraseñas del panel y revisar sus miembros.
3. **Erradicar**: restablecer contraseñas afectadas, eliminar factores TOTP comprometidos, cerrar inscripciones y cambiar códigos de curso.
4. **Recuperar**: reactivar cuentas verificadas por un canal oficial.
5. **Comunicar**: informar a la dirección de las instituciones afectadas en un máximo de 72 horas, describiendo qué datos se vieron comprometidos.
6. **Aprender**: documentar la causa y el cambio aplicado.

## Revisión periódica

* Cada trimestre: revisar cuentas activas del personal y suspender las que ya no corresponden; revisar miembros del panel de Supabase.
* Al terminar un piloto: borrar los datos de la institución.
* Al actualizar supabase-js: revisar avisos de seguridad y volver a probar con la política de contenido.
