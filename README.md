# PULSO

Plataforma institucional para la detección temprana de la ansiedad escolar. Proyecto del Equipo PULSO, Unidad Educativa Anglo Americano (Oruro), para las Olimpiadas Científicas STEM+ 2026.

## Qué hace

Cada estudiante registra cómo se siente en menos de un minuto. La profesional en salud mental del colegio ve un semáforo por curso y recibe las solicitudes de conversación. Nadie, ni siquiera ella, puede ver la respuesta de una persona en particular.

## Arquitectura

* **Interfaz**: página estática (HTML, CSS y módulos de JavaScript sin compilación) publicada en Vercel. No usa estilos ni scripts en línea, de modo que la política de seguridad de contenido puede ser estricta.
* **Datos y autenticación**: Supabase (PostgreSQL, Auth con verificación TOTP).
* **Modelo de acceso**: la base de datos niega todo por defecto. Las tablas tienen RLS activado y ningún privilegio para `anon` ni `authenticated`. Todo pasa por funciones `SECURITY DEFINER` que validan sesión, rol, estado de la cuenta, estado de la institución, nivel de verificación (AAL2) y contraseña temporal.

```
assets/
  css/app.css            estilos
  js/config.js           URL de Supabase y clave pública (anon)
  js/sb.js               cliente y mensajes de error
  js/ui.js, charts.js    utilidades y gráficos SVG
  js/main.js             enrutador, sesión, cierre por inactividad
  js/pages/*.js          landing, registros, paneles por rol
  vendor/supabase.js     supabase-js 2.45.4 (copia local)
  fonts/                 Comfortaa e IBM Plex Mono (copia local)
supabase/migrations/0001_pulso.sql   esquema, funciones y permisos
vercel.json              rutas y cabeceras de seguridad
```

## Roles

| Rol | Cómo entra | Qué ve |
|---|---|---|
| Propietario de la plataforma | `/plataforma/registro`, se activa desde el editor SQL | Solicitudes de instituciones, aprobar, rechazar, suspender |
| Administración | Registra la institución, queda pendiente hasta la aprobación | Cursos, códigos, cuentas, invitaciones, semáforo, asistencia, bitácora, ajustes, borrado |
| Profesional en salud mental | Invitación de un solo uso | Semáforo, tendencia, solicitudes de ayuda, correlación con asistencia |
| Docente | Invitación de un solo uso | Clima de los cursos asignados |
| Estudiante | Código de curso y aprobación de la administración | Su registro diario, GAD-7 quincenal, herramientas, pedido de ayuda |

Administración, profesional y propietario usan verificación en dos pasos obligatoria.

## Flujo de puesta en marcha

1. El propietario crea su cuenta en `/plataforma/registro` y la activa en el editor SQL de Supabase:
   `select private.activate_owner('correo@ejemplo.com');`
2. Un colegio se registra en `/registro/institucion`. El propietario lo revisa y aprueba.
3. La administración entra, activa la verificación en dos pasos, crea cursos e invita al personal.
4. El alumnado crea su cuenta en `/registro/estudiante` con el código de su curso. La administración la aprueba.
5. El alumnado ingresa con el código de institución, su usuario y su contraseña.

## Despliegue

1. **Supabase**: crear el proyecto (región São Paulo), ejecutar `supabase/migrations/0001_pulso.sql` en el editor SQL.
2. **Auth** (Authentication, Sign In / Providers, Email): desactivar *Confirm email* (las cuentas del alumnado usan un correo interno que no recibe mensajes; la aprobación la hace la administración). Longitud mínima de contraseña 10, exigir letras y números. Activar TOTP en *Multi Factor*.
3. **API** (Data API): confirmar que el esquema `private` NO esté entre los esquemas expuestos.
4. **config.js**: colocar la URL del proyecto y la clave `anon` (pública por diseño). La clave `service_role` nunca se usa en este proyecto.
5. **Vercel**: importar el repositorio, sin comando de compilación, directorio raíz `/`.

## Recuperación de cuentas

* Estudiantes, docentes y profesionales: la administración restablece la contraseña; se genera una temporal que se muestra una sola vez y obliga a cambiarla.
* Pérdida del celular de verificación: el propietario elimina el factor desde el editor SQL, después de verificar la identidad por un canal oficial:
  `delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'correo@ejemplo.com');`
