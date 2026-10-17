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

[Instalación](#-instalación) · [Funciones](./FEATURES_ES.md) · [Uso](#-inicio-rápido) · [Guía](./TUTORIAL_ES.md) · [Cambios](../../CHANGELOG.md)

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

**En breve:** tu contraseña nunca se escribe en disco, la aplicación solo habla con Steam, sus servidores de imágenes y la lista pública de versiones de GitHub, y no hay telemetría, ni analítica, ni ningún servidor mío. Qué guarda, dónde y cómo comprobarlo tú mismo está en [Privacidad y seguridad](./PRIVACY_ES.md).

---

## ✨ Lo esencial

- **Farmeo de cromos** - Ejecuta tus juegos como "jugando" para que caigan los cromos.
- **Impulsor de horas** - Mantiene hasta 32 juegos abiertos a la vez, con sincronización opcional que iguala las horas totales de una selección.
- **Gestor de logros** - Lee el estado real de bloqueo y desbloqueo directamente del protocolo de Steam, y luego desbloquea o rebloquea en lote.
- **Modo realista** - Mantiene un juego abierto y desbloquea sus logros del más común al más raro, repartidos por la sesión, de forma que el perfil parezca jugado de verdad.
- **Inventario y mercado** - Historial real de ventas, libro de órdenes, precios medios en lote y venta, todo en la moneda de tu cartera.
- **Claves de producto** - Pega una lista de claves y se canjean en segundo plano, una a una.
- **Varias cuentas** - Varias cuentas conectadas a la vez, cada una farmeando en segundo plano, intercambiables sin perder el progreso.
- **Sin cliente de Steam** - Habla el protocolo de red propio de Steam.
- **Portátil** - Extraer y ejecutar.

**[Ver todas las funciones →](./FEATURES_ES.md)**

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

</div>

---

## 📦 Instalación

### Requisitos

| | |
|---|---|
| Sistema operativo | Windows 10 o superior, 64 bits |
| Cuenta de Steam | Con Steam Guard configurado, móvil o correo |
| Espacio en disco | Unos 290 MB extraído |
| Cliente de Steam | No hace falta, y no se usa |

### Instalar

1. Descarga el último `.rar` desde la [página de versiones](https://github.com/Miabeyefendi/SteamEdge/releases/latest).
2. Extráelo donde quieras. Una carpeta tuya, no `Program Files`.
3. Ejecuta `SteamEdge.exe`. No hay nada que instalar y no se escribe nada fuera de esa carpeta.
4. Para actualizar, extrae la nueva versión en una carpeta nueva y vacía y copia en ella la carpeta `settings/` de la anterior. Extraer encima de la carpeta antigua con la app abierta mezcla archivos de dos versiones.

---

## 🚀 Inicio rápido

En el primer arranque aparece la pantalla de inicio de sesión. Escanea el código QR con la aplicación móvil de Steam, o cambia a la pestaña de contraseña e introduce tus credenciales y un código de Steam Guard. No se guarda nada salvo un token de sesión en `settings/`, junto al ejecutable.

Una vez dentro, el Resumen muestra qué está en marcha y qué está disponible. Abre **Farmeo de cromos**, actualiza la lista, elige un modo y pulsa Iniciar. Lo demás puede esperar a que leas la [guía](./TUTORIAL_ES.md).

---

## 📖 Documentación

- [**Funciones**](./FEATURES_ES.md) - todo lo que hace la aplicación
- [**Guía**](./TUTORIAL_ES.md) - todas las funciones y ajustes, explicados por completo
- [**Ajustes**](./SETTINGS_ES.md) - dónde viven los ajustes y las claves que conviene conocer
- [**Privacidad y seguridad**](./PRIVACY_ES.md) - qué hace con tu inicio de sesión y qué sale por la red
- [**Preguntas frecuentes**](./FAQ_ES.md) - bloqueos, precios, logros que no se desbloquean, actualizaciones
- [**Hoja de ruta**](./ROADMAP_ES.md) - qué está hecho y qué sigue
- [**Cambios**](../../CHANGELOG.md) - qué cambió en cada versión
- [**Para desarrolladores**](../DEVELOPERS.md) - estructura del código, pruebas, costumbres (en inglés)
- [**Contribuir**](../../CONTRIBUTING.md) - cómo enviar un cambio
- [**Informes de seguridad**](../../SECURITY.md) - cómo informar de una vulnerabilidad en privado

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
