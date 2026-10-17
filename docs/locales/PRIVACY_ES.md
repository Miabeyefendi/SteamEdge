[← Volver al README](../../README.md)

# 🔐 Seguridad y tu inicio de sesión de Steam

> [!WARNING]
> **SteamEdge puede actuar sobre tu cuenta de Steam: recolectar cartas, subir horas, desbloquear logros y poner objetos a la venta en el mercado. Aquí está exactamente qué hace con tu inicio de sesión, dónde lo guarda y qué envía por la red, para que decidas si te sientes cómodo usándolo.**

| Qué | Qué ocurre |
|---|---|
| **Contraseña** | Se escribe en la pantalla de inicio de sesión y se entrega directamente al servicio de acceso de Steam por HTTPS. Solo está en memoria durante esa llamada. **Nunca se escribe en disco** ni en el registro. |
| **Códigos de Steam Guard** | Se envían una vez a Steam y se descartan. No se guardan. La app no tiene ningún secreto de tu autenticador (la antigua función maFile se eliminó en 1.1.9), así que no puede aprobar confirmaciones móviles por ti. |
| **Token de sesión** | Tras iniciar sesión, Steam da a la app un token de renovación para no volver a pedirte la contraseña. No es tu contraseña. Se guarda en `settings/session.json` y `settings/accounts.json`, junto al exe. **Por defecto es texto plano.** Activa *Ajustes > Privacidad y seguridad > Cifrar los tokens de inicio de sesión* para sellarlo con Windows DPAPI: solo tu usuario de Windows en este PC podrá leerlo. Las cookies web solo viven en memoria. |
| **Inicio con cookies (alternativa)** | Si usas el inicio con cookies en lugar del normal, `settings/web-session.json` guarda esas cookies en texto plano hasta que cierres sesión. |
| **Archivo de registro** | `cache/steamedge.log` guarda eventos, nunca contraseñas, tokens ni cookies. |
| **Exportación** | La exportación de ajustes deja fuera los tokens, las direcciones de proxy (con sus contraseñas) y el PIN parental. |

**Qué sale por la red**

- **Steam en sí**: las mismas conexiones que hace el cliente de Steam (inicio de sesión, chat, estado "jugando"), con las bibliotecas `steam-user` y `steam-session`.
- **`steamcommunity.com`**: inventario, mercado, anuncios y páginas de logros, con tu sesión.
- **`api.steampowered.com`**: llamadas de inicio y de sesión.
- **`*.steamstatic.com`**: imágenes de juegos y el script de comisiones del mercado de Steam (se ejecuta en una ventana oculta y aislada, sin acceso a Node).
- **`api.github.com`**: una vez al arrancar y cuando pulsas el botón de actualización, para leer la lista pública de versiones. No envía nada sobre ti y nunca descarga ni instala nada.
- **Tu propio proxy**, solo si lo configuras por cuenta o para el inicio de sesión.
- Nada más. **Ningún servidor mío, ni analíticas, ni telemetría, ni informes de fallos, ni anuncios.** Las fuentes van incluidas, así que tampoco se consulta ningún servidor de fuentes.

**Ventas**: los anuncios llegan al mercado de Steam igual que desde la web. Con el autenticador móvil activo, cada anuncio espera tu aprobación en la app de Steam, y SteamEdge no puede darla. La app espacia sus peticiones (al menos 1,5 segundos) y nunca envía el mismo objeto dos veces.

**Cómo está blindada la ventana de la app**: solo carga sus propios archivos, no puede abrir páginas web y dentro no hay acceso a Node (aislamiento de contexto y Content Security Policy).

**Cómo comprobarlo tú mismo**: el código es abierto (AGPL-3.0), cada cambio pasa por CodeQL, se publica el SHA-256 de cada archivo de versión y puedes compilarlo con `npm run build`.

**Protégete**
- No compartas tu carpeta `settings/` (zips, capturas, peticiones de ayuda). Puede contener tu token.
- Activa el cifrado de tokens (arriba) y usa *Cerrar sesión* cuando dejes de usar la app en un PC.
- Para cortar todas las sesiones guardadas, usa la opción de Steam *cerrar sesión en todos los demás dispositivos* en los ajustes de Steam Guard.

**Límites honestos**: es un proyecto personal de una sola persona, no lo hace ni está conectado con Valve, y automatizar una cuenta puede ir contra las normas de Steam. Úsalo bajo tu propio riesgo.

## 🛡️ Seguridad

¿Has encontrado una vulnerabilidad? No abras una incidencia pública. Sigue el
proceso privado descrito en [SECURITY.md](../../SECURITY.md).
