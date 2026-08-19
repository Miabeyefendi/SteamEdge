<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/logo-dark.svg">
  <img src="./assets/logo.svg" width="120" alt="SteamEdge">
</picture>

# SteamEdge

**Consigue cromos de Steam, acumula horas de juego y gestiona logros sin abrir nunca el cliente de Steam.**

[![Licencia: AGPL v3](https://img.shields.io/badge/Licencia-AGPL_v3-A78BFA?style=for-the-badge&logo=gnu&logoColor=white)](./LICENSE)
[![Versión](https://img.shields.io/github/v/release/Miabeyefendi/SteamEdge?style=for-the-badge&color=F59E0B&label=versi%C3%B3n)](https://github.com/Miabeyefendi/SteamEdge/releases/latest)
[![Plataforma](https://img.shields.io/badge/Windows-1E293B?style=for-the-badge&logo=windows&logoColor=white)](#-instalación)
[![Estado](https://img.shields.io/badge/estado-activo-22C55E?style=for-the-badge)](#)
[![Autor](https://img.shields.io/badge/por-Miabeyefendi-0EA5E9?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Miabeyefendi)

[English](./README.md) · [Türkçe](./README_TR.md) · **Español** · [简体中文](./README_ZH.md) · [Русский](./README_RU.md)

[Instalación](#-instalación) · [Funciones](#-lo-esencial) · [Uso](#-inicio-rápido) · [Guía](./TUTORIAL_ES.md) · [Cambios](./CHANGELOG.md)

<a href="https://github.com/Miabeyefendi/SteamEdge/releases/latest">
  <img src="./assets/btn-download.svg" height="52" alt="Descargar la última versión">
</a>
<a href="./TUTORIAL_ES.md">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-tutorial-dark.svg">
    <img src="./assets/btn-tutorial.svg" height="52" alt="Leer la guía">
  </picture>
</a>

</div>

---

## ✨ Lo esencial

- **Farmeo de cromos** - Ejecuta tus juegos como "jugando" para que caigan los cromos. Cinco modos, uno de ellos sabe que Steam no empieza a soltar cromos hasta que un juego pasa de dos horas.
- **Impulsor de horas** - Mantiene hasta 32 juegos abiertos a la vez, con sincronización opcional que iguala las horas totales de una selección.
- **Gestor de logros** - Lee el estado real de bloqueo y desbloqueo directamente del protocolo de Steam, y luego desbloquea o rebloquea en lote.
- **Modo realista** - Mantiene un juego abierto y desbloquea sus logros del más común al más raro, repartidos por la sesión, de forma que el perfil parezca jugado de verdad.
- **Inventario y mercado** - Historial real de ventas, libro de órdenes, precios medios en lote y venta, todo en la moneda de tu cartera.
- **Varias cuentas** - Varias cuentas conectadas a la vez, cada una farmeando en segundo plano, intercambiables sin perder el progreso.
- **Sin cliente de Steam** - Habla el protocolo de red propio de Steam. El cliente nunca se abre y no hace falta.
- **Portátil** - Extraer y ejecutar. Sin instalador, sin registro, todo vive junto al ejecutable.

---

## 📦 Instalación

### Requisitos

| | |
|---|---|
| Sistema operativo | Windows 10 o superior, 64 bits |
| Cuenta de Steam | Con Steam Guard configurado, móvil o correo |
| Espacio en disco | Unos 320 MB extraído |
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

Los ajustes viven en `settings/settings.json` junto al ejecutable, y los datos por cuenta en `settings/accounts/<steamID>.json`. Todo se edita desde la página de Ajustes de la aplicación; no hay motivo para tocar los archivos a mano.

> **No compartas nunca la carpeta `settings/`.** Contiene tu token de sesión de Steam, suficiente para usar tu cuenta.

| Clave | Por defecto | Qué hace |
|---|---|---|
| `boostMaxGames` | `32` | Cuántos juegos mantiene abiertos el impulsor de horas |
| `boostSync` | `false` | Iguala las horas totales de los juegos seleccionados |
| `fetchAvgWithPrice` | `true` | Obtiene la media de ventas junto con el precio |
| `pauseFarmOnBoost` | `false` | Detiene el farmeo cuando arranca el impulsor de horas |
| `sessionTimeout` | `never` | Desconecta tras estos minutos sin actividad |
| `uiLang` | `tr` | Idioma de la interfaz: `tr`, `en`, `de`, `es`, `zh` |

Todas las claves están documentadas en la [referencia de configuración](./TUTORIAL_ES.md#️-referencia-de-configuración).

---

## 📖 Documentación

- [**Guía**](./TUTORIAL_ES.md) - todas las funciones y ajustes, explicados por completo
- [**Cambios**](./CHANGELOG.md) - qué cambió en cada versión
- [**Contribuir**](./CONTRIBUTING.md) - cómo enviar un cambio
- [**Seguridad**](./SECURITY.md) - cómo informar de una vulnerabilidad en privado

---

## 🧭 Hoja de ruta

- [ ] Integración del chat de Steam. El motor ya recibe mensajes y puede responder solo; falta la interfaz.
- [ ] Interfaz en ruso, para igualar la documentación.
- [ ] Las páginas restantes rehechas según el diseño, una por versión.
- [x] Modo realista rehecho según el diseño
- [x] Cola de mercado por objeto, precio y media juntos

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

Mira primero la [sección de resolución de problemas](./TUTORIAL_ES.md#-resolución-de-problemas) de la guía, y luego el registro en `cache/steamedge.log`. Si sigue roto, abre un informe de error y adjunta ese registro.

</details>

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Lee antes [CONTRIBUTING.md](./CONTRIBUTING.md) y
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Al contribuir aceptas licenciar tu
trabajo bajo la AGPL-3.0.

<div align="center">
<a href="https://github.com/Miabeyefendi/SteamEdge/issues/new?template=bug_report.yml">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-report-bug-dark.svg">
    <img src="./assets/btn-report-bug.svg" height="52" alt="Informar de un error">
  </picture>
</a>
<a href="https://github.com/Miabeyefendi/SteamEdge/stargazers">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-star-dark.svg">
    <img src="./assets/btn-star.svg" height="52" alt="Marcar el repositorio con una estrella">
  </picture>
</a>
</div>

---

## 🛡️ Seguridad

¿Has encontrado una vulnerabilidad? No abras una incidencia pública. Sigue el
proceso privado descrito en [SECURITY.md](./SECURITY.md).

---

## 📜 Licencia

Este proyecto se publica bajo la **Licencia Pública General Affero de GNU v3.0
(AGPL-3.0)**, junto con los términos complementarios del archivo
[NOTICE](./NOTICE). En resumen:

- Puedes usar, estudiar, modificar, redistribuir e incluso ganar dinero con este
  software de forma gratuita, **siempre que** mantengas el código fuente completo
  disponible bajo la AGPL-3.0, incluido cualquier uso alojado, SaaS o en red
  (AGPL, sección 13), y conserves la atribución al autor que figura abajo.
- Para usar este trabajo en un producto cerrado o propietario, o ejecutarlo como
  un SaaS cerrado, necesitas una **licencia comercial escrita aparte**, que puede
  incluir regalías o reparto de ingresos. Consulta [NOTICE](./NOTICE), sección 8,
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
en los archivos [LICENSE](./LICENSE) y [NOTICE](./NOTICE).

---

## 📬 Contacto

- GitHub: [@miabeyefendi](https://github.com/Miabeyefendi)
- Para licencias comerciales o reparto de ingresos, contáctame a través de mi
  perfil de GitHub.
