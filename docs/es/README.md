<div align="center">

<img src="../assets/social-preview.jpg" alt="SteamEdge - consigue cromos de Steam, aumenta horas de juego, gestiona logros y vende en el Mercado de la Comunidad" width="860">

# SteamEdge

**Farmea cromos de Steam, aumenta horas de juego, gestiona logros y vende en el Mercado de la Comunidad, sin ejecutar el cliente de Steam.**

[![Licencia: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](../../LICENSE)
[![Versión](https://img.shields.io/github/v/release/Miabeyefendi/steamedge?label=descargar)](https://github.com/Miabeyefendi/steamedge/releases/latest)
[![Descargas](https://img.shields.io/github/downloads/Miabeyefendi/steamedge/total)](https://github.com/Miabeyefendi/steamedge/releases)
[![Plataforma](https://img.shields.io/badge/platform-Windows-lightgrey.svg)](https://github.com/Miabeyefendi/steamedge/releases/latest)

[English](../../README.md) · [Türkçe](../tr/README.md) · [Deutsch](../de/README.md) · **Español** · [繁體中文](../zh/README.md)

[Descargar](https://github.com/Miabeyefendi/steamedge/releases/latest) · [Instalación](./SETUP.md) · [Tutorial](./TUTORIAL.md) · [Todos los ajustes](./INSTRUCTIONS.md) · [FAQ](./FAQ.md)

</div>

---

## Qué es

SteamEdge es una aplicación de escritorio que habla con Steam mediante su propio protocolo
de red. Inicia sesión con tu cuenta, informa de los juegos como "en ejecución" y recoge los
cromos que Steam suelta por ellos. El cliente de Steam nunca tiene que estar abierto, no se
descarga ni se lanza ningún juego, y no se inyecta nada en ningún proceso.

También aumenta las horas de juego, desbloquea o bloquea logros y lee datos reales del
Mercado de la Comunidad para que puedas fijar precios y vender tus cromos sin salir de la
aplicación.

> **Sin afiliación con Valve Corporation.** Steam y el logotipo de Steam son marcas de
> Valve. Úsalo bajo tu propia responsabilidad: consulta el
> [Descargo de responsabilidad](#descargo-de-responsabilidad).

## Funciones

| | |
|---|---|
| **Farmeo de cromos** | Cinco modos: secuencial, más cromos, menos cromos, prioridad personalizada y un modo Rápido que entiende la regla de las 2 horas de Steam. |
| **Varias cuentas** | Inicia sesión en varias cuentas a la vez. Farmean en paralelo en segundo plano; la ventana muestra la que elijas. |
| **Impulsor de horas** | Mantén hasta 32 juegos abiertos a la vez. La **sincronización de horas** opcional iguala tiempos distintos por etapas. |
| **Logros** | Lee el estado real de desbloqueo por protocolo, desbloquea o bloquea en lote, con modo seguro e intervalos aleatorios. |
| **Inventario y Mercado** | Libro de órdenes real (ofertas actuales + órdenes de compra) e historial real de ventas. El valor procede de **ventas completadas**, nunca de una sola oferta inflada. |
| **Sin cliente de Steam** | Todo funciona mediante el protocolo de red de Steam. Sin archivos de juego, sin overlay, sin inyección. |
| **Portable** | Descomprime y ejecuta. Los ajustes y la caché quedan junto al ejecutable; no se escribe nada en el registro. |
| **5 idiomas** | English, Türkçe, Deutsch, Español, 繁體中文. |

## Inicio rápido

1. Descarga el `SteamEdge-vX.Y.Z-win-x64.rar` más reciente desde
   [Releases](https://github.com/Miabeyefendi/steamedge/releases/latest).
2. Extráelo donde tengas permiso de escritura (escritorio, memoria USB, donde quieras).
3. Ejecuta `SteamEdge.exe`.
4. Escanea el código QR con la app móvil de Steam, o inicia sesión con usuario y contraseña.
5. Abre **Farmeo de cromos** y pulsa **Iniciar**.

Guía completa con capturas: [Instalación](./SETUP.md).

## Comparativa

| | SteamEdge | Idle Master | ArchiSteamFarm |
|---|---|---|---|
| Requiere cliente de Steam | No | Sí | No |
| Varias cuentas a la vez | Sí | No | Sí |
| Interfaz gráfica | Sí | Sí | Interfaz web |
| Impulso de horas | Sí | No | No |
| Gestor de logros | Sí | No | No |
| Venta en el mercado integrada | Sí | No | No |
| Portable (sin instalación) | Sí | Sí | Sí |

Esta tabla trata sobre alcance, no sobre calidad. ArchiSteamFarm es un proyecto mucho más
maduro y la mejor opción para farmeo masivo, headless y multicuenta. SteamEdge apunta a un
único usuario de escritorio que quiere cromos, horas, logros y venta en una sola ventana.

## Cómo funciona

Steam solo suelta cromos de un juego cuando su tiempo total de juego supera las **2 horas**.
SteamEdge envía el mismo mensaje `ClientGamesPlayed` que envía el cliente real de Steam, así
que Steam cuenta el tiempo y suelta los cromos con normalidad.

- El **modo Rápido** lleva primero todos los juegos por debajo de 2 horas hasta el umbral,
  en paralelo, porque Steam acumula tiempo para cada juego abierto a la vez, y después los
  mantiene todos abiertos rotando el juego destacado cada 1,5-2 minutos.
- El **valor del objeto** es la mediana ponderada por cantidad de las *ventas completadas*
  del historial de precios de Steam. Las ofertas actuales se muestran aparte y nunca
  alimentan el valor, porque un único vendedor que publique un objeto a 999.999 $ no debe
  moverlo.
- **Los precios se obtienen en la moneda de tu propio monedero**, leída del Mercado de la
  Comunidad, y se muestran exactamente en esa moneda. No hay conversión en ningún punto.

## Requisitos

- Windows 10 u 11, 64 bits
- Una cuenta de Steam (se recomienda el autenticador móvil de Steam Guard)
- Conexión a internet

Nada más. Sin .NET, sin Node.js, sin cliente de Steam.

## Compilar desde el código fuente

```bash
git clone https://github.com/Miabeyefendi/steamedge.git
cd SteamEdge
npm install
npm start          # ejecutar en modo desarrollo
npm run build      # generar una versión portable en ../SteamEdge-vX.Y.Z-win-x64
```

Requiere Node.js 20 o superior. Consulta [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Documentación

| Guía | Contenido |
|---|---|
| [Instalación](./SETUP.md) | Descarga, primer arranque, inicio de sesión, añadir más cuentas |
| [Tutorial](./TUTORIAL.md) | Farmear tus primeros cromos, aumentar horas, vender un objeto |
| [Ajustes](./INSTRUCTIONS.md) | Cada ajuste, qué hace y qué deberías elegir |
| [FAQ](./FAQ.md) | Baneos, seguridad, límites de peticiones, resolución de problemas |

## ¿Es seguro?

Lee [FAQ.md](./FAQ.md) antes de decidir. En resumen:

- SteamEdge solo envía mensajes que el cliente oficial de Steam también envía. No modifica
  archivos de juego, no usa la clave de la API web de Steam y no toca a otros jugadores.
- Tu contraseña nunca se guarda. Steam emite un token de actualización que se guarda en
  `settings/`, junto al ejecutable. Trata esa carpeta como una contraseña.
- Desbloquear cientos de logros en segundos es visible en tu perfil público. El modo seguro
  existe por algo: déjalo activado.
- Automatizar tu cuenta va contra el Acuerdo de Suscriptor de Steam. Nadie puede prometerte
  que no habrá consecuencias. Asumes ese riesgo tú.

## Contribuir

Los informes de errores, traducciones y pull requests son bienvenidos. Empieza por
[CONTRIBUTING.md](../../CONTRIBUTING.md) y el
[Código de conducta](../../CODE_OF_CONDUCT.md). Para problemas de seguridad, sigue
[SECURITY.md](../../SECURITY.md) en lugar de abrir una incidencia pública.

## Créditos

SteamEdge es una aplicación independiente escrita desde cero. **No se ha tomado código** de
los proyectos siguientes; cada uno se estudió para entender cómo funciona Steam, y los
problemas que resolvieron y los enfoques que eligieron nos dieron ideas.

| Proyecto | Qué aprendimos | Autor |
|---|---|---|
| [Idle Master](https://github.com/jshackles/idle_master) | La idea central: se pueden farmear cromos sin cliente de Steam, informando de un juego como "en ejecución". | [@jshackles](https://github.com/jshackles) |
| [Idle Master Extended](https://github.com/JonasNilson/idle_master_extended) | Qué cambió en Steam tras archivarse el original y qué ajustes vale la pena ofrecer. | [@JonasNilson](https://github.com/JonasNilson) |
| [HourBoostr](https://github.com/ezzpify/HourBoostr) | Que se pueden mantener varios juegos abiertos a la vez y qué implica para la acumulación de tiempo. | [@ezzpify](https://github.com/ezzpify) |
| [Steam Achievement Manager](https://github.com/gibbed/SteamAchievementManager) | Que los logros se pueden leer y modificar sin lanzar el juego. | [@gibbed](https://github.com/gibbed) |
| [ArchiSteamFarm](https://github.com/JustArchiNET/ArchiSteamFarm) | Mantener sana una sesión headless de larga duración, el uso de maFile y el multicuenta. | [@JustArchi](https://github.com/JustArchi) |

La parte de la aplicación que habla con Steam usa los paquetes de código abierto
[steam-user](https://github.com/DoctorMcKay/node-steam-user),
[steam-session](https://github.com/DoctorMcKay/node-steam-session),
[steam-totp](https://github.com/DoctorMcKay/node-steam-totp) y
[qrcode](https://github.com/soldair/node-qrcode) de
[@DoctorMcKay](https://github.com/DoctorMcKay) y colaboradores. Todo el demás código
pertenece a SteamEdge.

## Licencia

Este proyecto está licenciado bajo la **GNU Affero General Public License v3.0 (AGPL-3.0)**,
junto con los términos suplementarios del archivo [LICENSE](../../LICENSE). En resumen:

- Puedes usar, estudiar, modificar, redistribuir e incluso ganar dinero con este software de
  forma gratuita, **siempre que** mantengas el código fuente completo disponible bajo la
  AGPL-3.0, incluido cualquier uso alojado/SaaS/en red (AGPL, sección 13), y conserves la
  atribución de autoría siguiente.
- Para usarlo en un producto de código cerrado o propietario, o para ejecutarlo como un SaaS
  cerrado, necesitas una **licencia comercial escrita aparte** (que puede incluir regalías o
  reparto de ingresos). Consulta [LICENSE](../../LICENSE), sección 8, y contacta conmigo.

### Atribución (obligatoria)

Según la sección 7(b) de la AGPL-3.0, la siguiente atribución debe conservarse, visible y
sin modificar, en cualquier copia, bifurcación o despliegue de este proyecto:

> **Miabeyefendi (Mustafa Ihsan Albayrak)** - https://github.com/Miabeyefendi

Consulta el archivo [NOTICE](../../NOTICE).

## Descargo de responsabilidad

Este software se proporciona "tal cual", sin garantía de ningún tipo. Lo ejecutas
enteramente bajo tu propia responsabilidad y eres el único responsable de su uso, incluido
el cumplimiento del Acuerdo de Suscriptor de Steam. Valve Corporation no está afiliada a
este proyecto ni lo respalda; Steam y las marcas relacionadas pertenecen a sus respectivos
propietarios. El autor no acepta responsabilidad alguna por baneos de cuenta, pérdida de
datos u otros daños, en la máxima medida permitida por la ley aplicable. Los términos
completos están en [LICENSE](../../LICENSE).

## Contacto

- GitHub: [@miabeyefendi](https://github.com/Miabeyefendi)
- Para licencias comerciales o reparto de ingresos, contáctame a través de mi perfil de
  GitHub.

---

<div align="center">
<sub>Creado por <a href="https://github.com/Miabeyefendi">Miabeyefendi</a> · AGPL-3.0-or-later</sub>
</div>
