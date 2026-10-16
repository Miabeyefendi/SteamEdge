<div align="center">

<img src="../../assets/logo-mark.svg" width="120" alt="SteamEdge">

# SteamEdge

**Consigue cromos de Steam, acumula horas de juego y gestiona logros sin abrir nunca el cliente de Steam.**

[![Licencia: AGPL v3](https://img.shields.io/badge/Licencia-AGPL_v3-A78BFA?style=for-the-badge&logo=gnu&logoColor=white)](../../LICENSE)
[![Versión](https://img.shields.io/github/v/release/Miabeyefendi/SteamEdge?style=for-the-badge&color=F59E0B&label=versi%C3%B3n)](https://github.com/Miabeyefendi/SteamEdge/releases/latest)
[![Plataforma](https://img.shields.io/badge/Windows-1E293B?style=for-the-badge&logo=windows&logoColor=white)](#-instalación)
[![Estado](https://img.shields.io/badge/estado-activo-22C55E?style=for-the-badge)](#)
[![Autor](https://img.shields.io/badge/por-Miabeyefendi-0EA5E9?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Miabeyefendi)

[English](../../README.md) · [Türkçe](./README_TR.md) · **Español** · [简体中文](./README_ZH.md) · [Русский](./README_RU.md)

[Instalación](#-instalación) · [Funciones](#-lo-esencial) · [Uso](#-inicio-rápido) · [Guía](./TUTORIAL_ES.md) · [Cambios](../../CHANGELOG.md)

<a href="https://github.com/Miabeyefendi/SteamEdge/releases/latest">
  <img src="../../assets/btn-download.svg" height="52" alt="Descargar la última versión">
</a>
<a href="./TUTORIAL_ES.md">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../assets/btn-tutorial-dark.svg">
    <img src="../../assets/btn-tutorial.svg" height="52" alt="Leer la guía">
  </picture>
</a>

<img src="../../design/screenshots/Overview.png" width="92%" alt="SteamEdge farmeando cromos, subiendo horas y gestionando logros sin el cliente de Steam">

</div>

---

<div align="center">

<img src="../../assets/security-banner.svg" width="100%" alt="Seguridad: lee esto primero">

</div>

## 🔐 Seguridad y tu inicio de sesión de Steam

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

---

## ✨ Lo esencial

- **Farmeo de cromos** - Ejecuta tus juegos como "jugando" para que caigan los cromos. Siete modos, uno de ellos sabe que en cuentas con caídas restringidas Steam no empieza a soltar cromos hasta que un juego supera un umbral de tiempo, normalmente dos horas.
- **Impulsor de horas** - Mantiene hasta 32 juegos abiertos a la vez, con sincronización opcional que iguala las horas totales de una selección.
- **Gestor de logros** - Lee el estado real de bloqueo y desbloqueo directamente del protocolo de Steam, y luego desbloquea o rebloquea en lote.
- **Modo realista** - Mantiene un juego abierto y desbloquea sus logros del más común al más raro, repartidos por la sesión, de forma que el perfil parezca jugado de verdad.
- **Inventario y mercado** - Historial real de ventas, libro de órdenes, precios medios en lote y venta, todo en la moneda de tu cartera. Los precios de venta usan el cálculo de comisión propio de Steam, y la venta en lote se detiene y avisa al llegar al límite de Steam por cuenta, o divide la venta en lotes. Los anuncios activos se pueden retirar y los sobres de refuerzo se abren desde la misma página. Un selector cambia a los objetos de otros juegos (Counter-Strike 2, Dota 2 y más), con las mismas herramientas.
- **Claves de producto** - Pega una lista de claves y se canjean en segundo plano, una a una. Al llegar al límite horario de Steam, la cola espera y sigue sola. Una clave que una cuenta ya tiene se puede probar en tus otras cuentas, y un juego gratuito se añade desde el enlace de su tienda.
- **Chat** - Lista de amigos, conversaciones y envío, por el mismo protocolo de red. Los no leídos se ven en la pestaña, así no se escapa nada mientras corre una cola.
- **Varias cuentas** - Varias cuentas conectadas a la vez, cada una farmeando en segundo plano, intercambiables sin perder el progreso. Las estadísticas se guardan por cuenta.
- **Programación, proxy y protección de tokens** - La recolección de cartas y el Modo realista pueden ejecutarse solos dentro de un horario, cada cuenta puede usar su propio proxy HTTP o SOCKS5 (el inicio de sesión también tiene uno) y los tokens de inicio de sesión guardados pueden cifrarse con Windows DPAPI.
- **Listas y filtros** - Una lista negra permanente y una lista blanca para el farmeo de cromos, un filtro que deja fuera los juegos aún en plazo de reembolso, juegos favoritos que quedan al principio de las listas y una exportación del inventario a CSV.
- **Temas e idiomas** - Temas Oscuro, Púrpura medianoche y Blanco, pantalla de inicio de sesión incluida. Turco, inglés, alemán, español, chino tradicional y ruso. Las instalaciones nuevas empiezan en inglés.
- **Se adapta a tu pantalla** - El diseño es fluido hasta 900 x 560: las listas pasan a otra línea en vez de salirse por el borde, el menú lateral se cierra solo en una ventana estrecha y la interfaz pasa a modo compacto en una ventana baja. La ventana vuelve donde la dejaste, en una pantalla que siga existiendo. En ventanas más pequeñas que 900 x 560, toda la página se escala, hasta 675 x 420, y los botones conservan su forma.
- **Modular** - Desactiva las páginas que no uses (cartas, horas, inventario, logros, claves, chat) y ordena el resto como quieras. Una página desactivada no pide nada a Steam. Un modo ligero quita animaciones y desenfoque para equipos modestos, y un ajuste automático lo elige por ti. También se pueden desactivar funciones pequeñas (el cuadro de actividad, las estrellas de favoritos, los botones Mis anuncios y CSV) y elementos de la barra superior (búsqueda, notificaciones, actualizaciones).
- **Continúa donde lo dejó** - Una recolección de cartas, un impulso de horas o una ejecución del Modo realista que estaba en marcha cuando se cerró la app, se apagó el PC o falló la app vuelve a empezar donde se quedó cuando la cuenta se conecta de nuevo. El tiempo con la app parada no cuenta: un impulso al que le quedaban tres horas vuelve a tener tres horas.
- **Legible y apto para teclado** - Una escala de la interfaz del 80 al 150 por ciento (también con Ctrl + / - / 0), un tema de Alto contraste que sigue el ajuste de contraste del sistema, texto que se lee a 4,5 : 1 o más y nunca menor de 11 píxeles, e interruptores y menú lateral que funcionan con el teclado y con lector de pantalla.
- **Sin cliente de Steam** - Habla el protocolo de red propio de Steam. El cliente nunca se abre y no hace falta.
- **Portátil** - Extraer y ejecutar. Sin instalador, sin registro, todo vive junto al ejecutable.

---

## 📸 Capturas

<div align="center">

| | |
|:-:|:-:|
| <img src="../../design/screenshots/CardFarming.png" alt="Farmeo de cromos"><br><sub>Farmeo de cromos</sub> | <img src="../../design/screenshots/HourBoostr.png" alt="Subida de horas"><br><sub>Subida de horas</sub> |
| <img src="../../design/screenshots/Achievements.png" alt="Logros"><br><sub>Logros</sub> | <img src="../../design/screenshots/RealisticMode.png" alt="Modo realista"><br><sub>Modo realista</sub> |
| <img src="../../design/screenshots/RealisticModeAdvanced.png" alt="Modo realista, avanzado"><br><sub>Modo realista, avanzado</sub> | <img src="../../design/screenshots/Market.png" alt="Inventario y mercado"><br><sub>Inventario y mercado</sub> |
| <img src="../../design/screenshots/Market2.png" alt="Mercado, libro de órdenes"><br><sub>Mercado, libro de órdenes</sub> | <img src="../../design/screenshots/Chat.png" alt="Chat de Steam"><br><sub>Chat de Steam</sub> |
| <img src="../../design/screenshots/SettingsGeneral.png" alt="Ajustes"><br><sub>Ajustes</sub> |  |

**Temas: Oscuro, Púrpura medianoche, Blanco (Ajustes > General > Tema)**

| Oscuro | Púrpura medianoche | Blanco |
|---|---|---|
| <img src="../../design/screenshots/themes/overview-dark.png" alt="Oscuro"> | <img src="../../design/screenshots/themes/overview-midnight.png" alt="Púrpura medianoche"> | <img src="../../design/screenshots/themes/overview-white.png" alt="Blanco"> |
| <img src="../../design/screenshots/themes/login-dark.png" alt="Oscuro"> | <img src="../../design/screenshots/themes/login-midnight.png" alt="Púrpura medianoche"> | <img src="../../design/screenshots/themes/login-white.png" alt="Blanco"> |

</div>

---

## 📦 Instalación

### Requisitos

| | |
|---|---|
| Sistema operativo | Windows 10 o superior, 64 bits |
| Cuenta de Steam | Con Steam Guard configurado, móvil o correo |
| Espacio en disco | Unos 330 MB extraído |
| Cliente de Steam | No hace falta, y no se usa |

### Construido con

![Electron](https://img.shields.io/badge/Electron-1E293B?style=for-the-badge&logo=electron&logoColor=A78BFA)
![Node.js](https://img.shields.io/badge/Node.js-1E293B?style=for-the-badge&logo=nodedotjs&logoColor=A78BFA)
![JavaScript](https://img.shields.io/badge/JavaScript-1E293B?style=for-the-badge&logo=javascript&logoColor=A78BFA)

### Instalar

```bash
git clone https://github.com/Miabeyefendi/SteamEdge.git
cd SteamEdge
npm install
```

<details>
<summary><b>Instalar desde una versión publicada</b></summary>

1. Descarga el último `.rar` desde la [página de versiones](https://github.com/Miabeyefendi/SteamEdge/releases/latest).
2. Extráelo donde quieras. Una carpeta tuya, no `Program Files`.
3. Ejecuta `SteamEdge.exe`. No hay nada que instalar y no se escribe nada fuera de esa carpeta.
4. Para actualizar, extrae la nueva versión en una carpeta nueva y vacía y copia en ella la carpeta `settings/` de la anterior. Extraer encima de la carpeta antigua con la app abierta mezcla archivos de dos versiones.

</details>

---

## 🚀 Inicio rápido

```bash
npm start
```

En el primer arranque aparece la pantalla de inicio de sesión. Escanea el código QR con la aplicación móvil de Steam, o cambia a la pestaña de contraseña e introduce tus credenciales y un código de Steam Guard. No se guarda nada salvo un token de sesión en `settings/`, junto al ejecutable.

Una vez dentro, el Resumen muestra qué está en marcha y qué está disponible. Abre **Farmeo de cromos**, actualiza la lista, elige un modo y pulsa Iniciar. Lo demás puede esperar a que leas la [guía](./TUTORIAL_ES.md).

---

## ⚙️ Configuración

Los ajustes viven en `settings/settings.json` junto al ejecutable, y los datos por cuenta en `settings/accounts/<steamID>.json`. Casi todo se edita desde la página de Ajustes de la aplicación y desde las páginas de cada función; no hay motivo para tocar los archivos a mano. Los cambios de la página de Ajustes solo se aplican al pulsar Guardar, y las tareas en marcha los recogen en pocos segundos.

> **No compartas nunca la carpeta `settings/`.** Contiene tu token de sesión de Steam, suficiente para usar tu cuenta.

| Clave | Por defecto | Qué hace |
|---|---|---|
| `boostMaxGames` | `32` | Cuántos juegos mantiene abiertos el impulsor de horas |
| `boostSync` | `false` | Iguala las horas totales de los juegos seleccionados |
| `fetchAvgWithPrice` | `true` | Obtiene la media de ventas junto con el precio |
| `pauseFarmOnBoost` | `false` | Pausa el farmeo mientras funciona el impulsor de horas o el Modo realista |
| `bulkSellLimit` | `50` | La venta en lote se divide en lotes de este número de objetos; `0` publica hasta que Steam lo detenga |
| `priceDropThreshold` | `10` | Porcentaje por debajo de la media de 24 horas de Steam que cuenta como bajada de precio |
| `reconnectPolicy` | `unlimited` | Reconexión tras perder la conexión: `unlimited` (sin límite), `10`, `3` o `off` (desactivado) |
| `sessionTimeout` | `never` | Cierra todas las sesiones tras estos minutos sin actividad; las tareas en marcha no cuentan como inactividad |
| `theme` | `dark` | Tema de color: `dark`, `midnight`, `white` |
| `language` | `en` | Idioma de la interfaz: `tr`, `en`, `de`, `es`, `zh`, `ru` |

La [referencia de configuración](./TUTORIAL_ES.md#️-referencia-de-configuración) cubre las claves que conviene conocer; el resto son los demás controles de la página Ajustes.

---

## 📖 Documentación

- [**Guía**](./TUTORIAL_ES.md) - todas las funciones y ajustes, explicados por completo
- [**Cambios**](../../CHANGELOG.md) - qué cambió en cada versión
- [**Contribuir**](../../CONTRIBUTING.md) - cómo enviar un cambio
- [**Seguridad**](../../SECURITY.md) - cómo informar de una vulnerabilidad en privado

---

## 🧭 Hoja de ruta

- [x] Chat de Steam: lista de amigos, conversaciones y envío, dentro de la aplicación
- [x] Interfaz en ruso, a la altura de la documentación
- [x] Modo realista rehecho según el diseño
- [x] Cola de mercado por objeto, precio y media juntos
- [x] Todos los textos generados en ejecución traducidos, con formas de plural en todos los idiomas (1.3.0)
- [x] Temas: Oscuro, Púrpura medianoche, Blanco (1.3.0)
- [x] Electron 41 (1.3.2)
- [x] Inglés por defecto y el resto del texto de la interfaz traducido (1.3.3)
- [x] Todo el código en inglés: identificadores, comentarios, ids de elementos, canales IPC, claves de ajustes y nombres de archivo (1.4.0)
- [x] Diseño fluido para pantallas pequeñas y una ventana que recuerda su lugar (1.4.9)
- [ ] Las páginas restantes rehechas según el diseño, una por versión

Nada de esto es una promesa. Es un proyecto personal y la lista se mueve cuando cambian mis prioridades.

---

## ❓ Preguntas frecuentes

<details>
<summary><b>¿Necesito el cliente de Steam abierto?</b></summary>

No. SteamEdge habla directamente el protocolo de red de Steam. El cliente nunca se abre, y tenerlo abierto no cambia nada.

</details>

<details>
<summary><b>¿Pueden banearme la cuenta?</b></summary>

Dejar juegos en marcha y desbloquear logros por el protocolo es lo que hacen muchas herramientas, y Valve nunca se ha pronunciado públicamente al respecto. Eso no significa que sea seguro. Lo ejecutas bajo tu propio riesgo. Lee el descargo de responsabilidad antes de decidir.

</details>

<details>
<summary><b>¿Por qué no se convierten los precios a mi moneda?</b></summary>

Ya están en ella. Los precios llegan de Steam en la moneda de tu cartera y se muestran tal cual. Convertirlos significaría inventar un tipo de cambio, y un número inventado es peor que ninguno.

</details>

<details>
<summary><b>Un logro no se desbloquea, ¿por qué?</b></summary>

Algunos logros los escribe el servidor del juego, no el cliente, y Steam no permite que ningún cliente los toque. SteamEdge los detecta en el esquema y los omite en vez de fallar una y otra vez. Unos pocos juegos tampoco guardan estadísticas por este protocolo; en ese caso verás `0 / N` y no hay nada que hacer.

</details>

<details>
<summary><b>Dejó de funcionar tras una actualización, ¿ahora qué?</b></summary>

Asegúrate de haber extraído la nueva versión en una carpeta nueva y vacía, copiando solo `settings/`; extraer encima de la carpeta antigua mezcla archivos de dos versiones. Mira primero la [sección de resolución de problemas](./TUTORIAL_ES.md#-resolución-de-problemas) de la guía, y luego el registro en `cache/steamedge.log`. Si sigue roto, abre un informe de error y adjunta ese registro.

</details>

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Lee antes [CONTRIBUTING.md](../../CONTRIBUTING.md) y
[CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md). Al contribuir aceptas licenciar tu
trabajo bajo la AGPL-3.0.

<div align="center">
<a href="https://github.com/Miabeyefendi/SteamEdge/issues/new?template=bug_report.yml">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../assets/btn-report-bug-dark.svg">
    <img src="../../assets/btn-report-bug.svg" height="52" alt="Informar de un error">
  </picture>
</a>
<a href="https://github.com/Miabeyefendi/SteamEdge/stargazers">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../assets/btn-star-dark.svg">
    <img src="../../assets/btn-star.svg" height="52" alt="Marcar el repositorio con una estrella">
  </picture>
</a>
</div>

---

## 🛡️ Seguridad

¿Has encontrado una vulnerabilidad? No abras una incidencia pública. Sigue el
proceso privado descrito en [SECURITY.md](../../SECURITY.md).

---

## 📜 Licencia

Este proyecto se publica bajo la **Licencia Pública General Affero de GNU v3.0
(AGPL-3.0)**, junto con los términos complementarios del archivo
[NOTICE](../../NOTICE). En resumen:

- Puedes usar, estudiar, modificar, redistribuir e incluso ganar dinero con este
  software de forma gratuita, **siempre que** mantengas el código fuente completo
  disponible bajo la AGPL-3.0, incluido cualquier uso alojado, SaaS o en red
  (AGPL, sección 13), y conserves la atribución al autor que figura abajo.
- Para usar este trabajo en un producto cerrado o propietario, o ejecutarlo como
  un SaaS cerrado, necesitas una **licencia comercial escrita aparte**, que puede
  incluir regalías o reparto de ingresos. Consulta [NOTICE](../../NOTICE), sección 8,
  y ponte en contacto conmigo.

### Atribución (obligatoria)

Según la sección 7(b) de la AGPL-3.0, la siguiente atribución debe conservarse,
visible y sin modificar, en toda copia, bifurcación o despliegue de este proyecto:

> **Miabeyefendi (Mustafa Ihsan Albayrak)** - https://github.com/Miabeyefendi

### Descargo de responsabilidad

Este software se entrega "tal cual", sin garantía de ningún tipo. Lo ejecutas
enteramente bajo tu propio riesgo y eres el único responsable de tu uso, incluido
el cumplimiento de las condiciones de servicio de cualquier plataforma de terceros
con la que interactúe. Valve y Steam no están afiliados al autor ni lo respaldan;
sus nombres y marcas pertenecen a sus respectivos propietarios. El autor no acepta
responsabilidad alguna por baneos de cuenta, pérdida de datos ni ningún otro daño,
en la máxima medida permitida por la ley aplicable. Los términos completos están
en los archivos [LICENSE](../../LICENSE) y [NOTICE](../../NOTICE).

---

## 📬 Contacto

- GitHub: [@miabeyefendi](https://github.com/Miabeyefendi)
- Para licencias comerciales o reparto de ingresos, contáctame a través de mi
  perfil de GitHub.
