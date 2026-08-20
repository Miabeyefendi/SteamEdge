<div align="center">

# 📖 Guía de SteamEdge

[English](./TUTORIAL.md) · [Türkçe](./TUTORIAL_TR.md) · [Deutsch](./TUTORIAL_DE.md) · **Español** · [繁體中文](./TUTORIAL_ZH.md) · [Русский](./TUTORIAL_RU.md)

[Volver al README](./README_ES.md) · [Cambios](./CHANGELOG.md)

</div>

---

## 📑 Contenido

- [Panorama](#-panorama)
- [Instalación](#-instalación)
- [Recorrido por la interfaz](#️-recorrido-por-la-interfaz)
- [Referencia de funciones](#-referencia-de-funciones)
- [Referencia de configuración](#️-referencia-de-configuración)
- [Resolución de problemas](#-resolución-de-problemas)
- [Preguntas frecuentes](#-preguntas-frecuentes)
- [Glosario](#-glosario)

---

## 🔭 Panorama

### Qué hace

SteamEdge mantiene tus juegos de Steam "en marcha" sin ejecutarlos. Recoge cromos, acumula horas, lee y escribe logros y pone precio a tu inventario contra el mercado real. Todo eso normalmente exige el cliente de Steam abierto; aquí nada de ello.

### Cómo funciona

La aplicación habla el protocolo de red propio de Steam, el mismo que usa el cliente. Inicia sesión con un token, le dice a Steam qué juegos se están jugando y lee de vuelta páginas de insignias, inventarios, datos de mercado y esquemas de logros.

De ahí se derivan dos cosas, y explican casi todo el comportamiento de la aplicación:

- **Steam es la única fuente de verdad.** Nada se estima ni se inventa. Si un número no se puede obtener, la casilla muestra un guion en lugar de una suposición.
- **Los límites de Steam son los límites de la aplicación.** Las peticiones al mercado están limitadas a unas 20 cada 30 segundos por cuenta, y cada parte de la aplicación que toca el mercado comparte ese único presupuesto. Los cromos no empiezan a caer hasta que un juego supera las dos horas de tiempo total. Son hechos medidos, no ajustes.

### Distribución de archivos

Todo vive junto al ejecutable. No se escribe nada en el registro, en `AppData` ni en `Program Files`.

```
SteamEdge/
  SteamEdge.exe
  settings/
    settings.json              ajustes generales
    accounts.json              cuentas guardadas
    session.json               token de sesión activo
    accounts/<steamID>.json    por cuenta: colas, ajustes guardados, estadísticas
  cache/
    prices.json                precios de mercado, 24 horas de vida
    history.json               medias de ventas realizadas, 72 horas de vida
    basarimsiz.json            juegos sin logros
    steamedge.log              el registro que adjuntar a un informe de error
```

> **La carpeta delicada es `settings/`.** `session.json` guarda un token que basta para usar tu cuenta. No la pongas en una copia de seguridad que compartas, en un archivo que subas ni en una captura de pantalla.

---

## 📦 Instalación

### Requisitos

Windows 10 o superior, 64 bits. Una cuenta de Steam con Steam Guard activado. Unos 320 MB de disco una vez extraído. El cliente de Steam no hace falta y nunca se abre.

### Paso a paso

1. Descarga el último `.rar` desde la [página de versiones](https://github.com/Miabeyefendi/SteamEdge/releases/latest).
2. Extráelo en una carpeta tuya. No en `Program Files`, porque la aplicación escribe sus ajustes junto a sí misma.
3. Ejecuta `SteamEdge.exe`.
4. Inicia sesión. La vía fácil es la pestaña QR: escanea el código con la app móvil de Steam y aprueba. La pestaña de contraseña pide usuario, contraseña y un código de Steam Guard.

### Comprobar la instalación

Abajo a la izquierda pone `SISTEMA: EN MARCHA` cuando hay una sesión viva, y arriba a la derecha la placa de cuenta se rellena con tu nombre, tu avatar y tu nivel. Si sigue vacía, la sesión no llegó a levantarse; mira la [resolución de problemas](#-resolución-de-problemas).

### Actualizar

La aplicación consulta el número de versión publicado y avisa cuando existe uno más nuevo. A propósito no descarga ni instala nada. Para actualizar, extrae el archivo nuevo sobre la carpeta antigua y conserva `settings/` y `cache/`.

### Desinstalar

Borra la carpeta. Ese es todo el procedimiento.

---

## 🖥️ Recorrido por la interfaz

### Resumen

La página de inicio. El panel **Tarea activa** muestra lo que está en marcha de verdad, una tarea a la vez, con flechas para pasar entre ellas cuando hay varias. Iniciar, Detener y Detalles actúan sobre la tarea que estás viendo, no sobre una página fija.

Debajo, la cola y el historial de actividad. A la derecha, las casillas de cromos, tamaño de biblioteca, valor del inventario, impulsor de horas y logros. Una casilla muestra un guion mientras su página no se ha cargado; eso habla de lo que se ha obtenido, no de tu cuenta.

### Farmeo de cromos

La lista de juegos a los que aún les quedan cromos, leída de tus páginas de insignias. Elige un modo, fija una duración y pulsa Iniciar.

### Inventario & Mercado

Tu inventario de Steam, agrupado para que los duplicados sean una sola fila. Los precios y las medias de ventas realizadas se obtienen en segundo plano, objeto a objeto y los dos valores juntos. El panel de detalle muestra el libro de órdenes y permite poner un objeto a la venta.

### Impulsor de horas

Toda tu biblioteca, con buscador. Selecciona juegos, fija un límite simultáneo y una duración, pulsa Iniciar. La sincronización opcional lleva una selección a un total común.

### Modo realista

Un espacio de trabajo de tres columnas. La cola y la duración a la izquierda, el orden de desbloqueo en el centro, los ajustes a la derecha, divididos en un panel Simple y otro Avanzado.

### Logros

Por juego, el estado real de bloqueo y desbloqueo leído del protocolo. Selecciona logros y desbloquéalos o vuelve a bloquearlos en lote, con progreso en vivo y un botón de parada que surte efecto incluso en medio de una espera.

### Ajustes

Todo lo que se le puede indicar a la aplicación, agrupado: general, farmeo, mercado, impulsor de horas, modo realista, privacidad, identidad de la cuenta, copias de seguridad.

---

## 🧩 Referencia de funciones

### Farmeo de cromos

Steam no suelta cromos hasta que un juego supera **dos horas** de tiempo total. Todos los modos menos uno lo ignoran y simplemente ejecutan juegos; el **modo rápido** lo tiene en cuenta y rota solo juegos que ya han pasado el umbral, para no gastar tiempo en juegos que todavía no pueden soltar nada.

Los modos:

| Modo | Qué hace |
|---|---|
| Secuencial | Un juego cada vez, en el orden de la lista |
| Más cromos | Primero los juegos con más cromos pendientes |
| Menos cromos | Primero los juegos más cerca de terminar |
| Prioridad | Tu propio orden |
| Rápido | Solo juegos que ya pasan de dos horas, rotados a intervalos cortos |

Los cromos no llegan según un horario y Steam no envía ningún evento de "ha caído un cromo". La aplicación mide periódicamente el total de cromos pendientes e informa de la diferencia real en vez de un contador inventado.

### Impulsor de horas

Ejecuta hasta 32 juegos a la vez. Steam cuenta el tiempo por separado para cada juego abierto, así que 32 juegos abiertos una hora son 32 horas de juego.

**La sincronización de horas** lleva una selección al mismo total. Dos métodos:

- **Todos a la vez** - todos los juegos seleccionados se ejecutan simultáneamente y van saliendo al alcanzar el objetivo. La vía más rápida posible: el trabajo entero dura lo que tarde el juego más rezagado.
- **Uno por uno** - el juego más rezagado avanza en solitario y, cuando alcanza al siguiente, ambos continúan juntos. Más lento, pero los juegos se mantienen a la par por el camino.

Las barras de progreso se apoyan en una línea de tiempo común: una barra es uno menos el tiempo restante del juego dividido por la duración de todo el trabajo. Un juego que termina cuatro horas dentro de una tarea de treinta y cinco horas empieza casi lleno; uno que corre hasta el final empieza vacío. Cada uno llega al 100% justo cuando alcanza el objetivo.

### Logros

Los logros se leen y se escriben por el protocolo, no rascando tu perfil público. Que el perfil sea privado no cambia nada.

Hay dos categorías intocables, y la aplicación detecta ambas por el esquema en vez de fallar una y otra vez:

- **Los logros protegidos** los escribe el servidor del juego. Steam rechaza a cualquier cliente que lo intente.
- **Los juegos sin estadísticas por este protocolo** (algunos títulos multijugador grandes) informan `0 / N`. Eso es correcto, no un fallo.

Algunos juegos solo aceptan escrituras de logros mientras el juego está abierto. La aplicación abre el juego para escribir y luego restaura lo que estuviera en marcha antes.

### Modo realista

Mantiene un juego abierto y desbloquea sus logros a lo largo de la sesión, del más común al más raro. Lo que importa es el rastro que deja: cientos de logros en un minuto cantan mucho en un perfil y en las webs de terceros.

**Tiempo para el 100%** es la cifra sobre la que se construye toda la página: cuántas horas cuesta terminar este juego con todos sus logros. Si la introduces, se recuerda para ese juego. Si la dejas vacía se estima a partir del tipo de juego, pero esa estimación son tus propias horas multiplicadas por un factor, así que se infla en juegos que has jugado mucho.

**El número objetivo** sale de dos partes: lo que ya debería estar desbloqueado con tus horas menos lo que realmente lo está, más la parte que aporta esta sesión. El panel escribe la cuenta para que puedas comprobarla.

**El modelo de distribución** da forma a los intervalos. Lineal reparte por igual, exponencial carga al principio como las primeras horas de un jugador real, Pareto pone la mayoría en el primer quinto.

**El ritmo** se pondera por rareza. Solo los logros por debajo del 5% esperan notablemente más; todo lo que esté por encima mantiene un ritmo parejo y rápido. Un juego jugado más allá de su tiempo de finalización comprime todo el calendario, porque ya no queda curva de aprendizaje que imitar.

**Los juegos sin logros** salen de la cola en cuanto se descubre, se anotan en `cache/basarimsiz.json` y no vuelven a ofrecerse en esta página. La bandera de biblioteca que publica Steam no es fiable; solo lo es la petición del esquema.

### Inventario y mercado

El valor de un objeto es la **mediana ponderada por cantidad de las ventas realizadas**, no la oferta activa más baja. Que una persona ponga un cromo a 999.999 no lo mueve.

Los precios llegan en la **moneda de tu cartera** y se muestran exactamente así. No hay conversión, a propósito: convertir significaría inventar un tipo de cambio.

El precio y la media de ventas se obtienen **por objeto, juntos**, y luego la cola pasa al siguiente. Ambos comparten el único presupuesto de mercado de Steam, y el límite se cuenta en peticiones, no en objetos.

### Varias cuentas

Pueden estar conectadas varias cuentas a la vez. Cada una mantiene su motor, sus colas y su archivo de datos. Cambiar de cuenta no reinicia la aplicación ni interrumpe lo que hacen las demás.

---

## ⚙️ Referencia de configuración

Los ajustes viven en `settings/settings.json`. Todo lo de abajo se edita desde la página de Ajustes.

### General

| Clave | Por defecto | Qué hace |
|---|---|---|
| `uiLang` | `tr` | Idioma de la interfaz: `tr`, `en`, `de`, `es`, `zh` |
| `autoLaunch` | `false` | Arrancar con Windows |
| `preventSleep` | `true` | Mantener el equipo despierto mientras algo está en marcha |
| `sessionTimeout` | `never` | Desconectar tras estos minutos sin actividad. Las tareas en segundo plano no reinician el contador; solo tu interacción |

### Farmeo de cromos

| Clave | Por defecto | Qué hace |
|---|---|---|
| `autoNextGame` | `true` | Pasar al siguiente juego cuando uno termina |
| `cardMaxGames` | `32` | Juegos abiertos a la vez |
| `fastMinPlaytimeMin` | `120` | El modo rápido ignora los juegos por debajo de esto |
| `pauseFarmOnBoost` | `false` | Parar el farmeo cuando arranca el impulsor de horas |

### Mercado

| Clave | Por defecto | Qué hace |
|---|---|---|
| `priceRefreshHours` | `24` | Cuánto sigue fresco un precio obtenido |
| `historyRefreshHours` | `72` | Cuánto sigue fresca una media de ventas |
| `fetchAvgWithPrice` | `true` | Obtener la media en el mismo paso que el precio. Apagado significa una petición por objeto y medias solo con el botón Media |
| `bookDepth` | `5` | Filas del libro de órdenes en el panel de detalle |

### Impulsor de horas

| Clave | Por defecto | Qué hace |
|---|---|---|
| `boostMaxGames` | `32` | Juegos abiertos a la vez |
| `boostDurationSec` | `3600` | Duración de la sesión |
| `boostSync` | `false` | Llevar la selección a un total común |
| `boostSyncMode` | `highest` | Objetivo: el más alto de los seleccionados, horas manuales o el más alto de la biblioteca |
| `boostSyncStrategy` | `parallel` | `parallel` es todos a la vez, `staged` es uno por uno |
| `boostAutoRestart` | `false` | Volver a lanzar la cola al terminar la sesión |
| `rememberBoostList` | `false` | Conservar la selección entre sesiones |

### Modo realista

| Clave | Por defecto | Qué hace |
|---|---|---|
| `grDurationSec` | `7200` | Duración de la sesión |
| `grModel` | `linear` | Modelo de distribución |
| `grTcOyun` | `{}` | Tiempo para el 100% por juego, en horas |
| `grCatchUp` | `true` | Comprimir el atraso al principio de la sesión |
| `grHiz` | `1` | Multiplicador de velocidad para todo el calendario |
| `grUltraCarpan` | `3` | Cuánto más esperan los logros por debajo del 5% |
| `grTelafiPay` | `20` | Porcentaje de la sesión dedicado a recuperar el atraso |
| `grBitmisSik` | `50` | Cuánto se comprime el calendario en un juego terminado |
| `grKeepHours` | `true` | Seguir acumulando horas cuando acaban los desbloqueos |
| `grSkipUltraRare` | `false` | Saltarse por completo los logros por debajo del 5% |

### Privacidad

| Clave | Por defecto | Qué hace |
|---|---|---|
| `offlineMode` | `false` | Aparecer desconectado mientras se ejecuta |
| `hideGameName` | `false` | Compartir que estás conectado pero no a qué juegas |

> Aparecer desconectado cambia lo que ven tus amigos. También puede cambiar si Steam te cuenta como jugando, así que pruébalo antes de confiar en ello en una sesión larga.

### Dónde se guardan los ajustes

Lo general en `settings/settings.json`. Todo lo que pertenece a una cuenta, la selección del impulsor de horas, la cola y los ajustes guardados del modo realista, el registro de logros y las estadísticas, vive en `settings/accounts/<steamID>.json`. Las cachés van aparte, bajo `cache/`, y se pueden borrar en cualquier momento sin perder configuración.

---

## 🔧 Resolución de problemas

### La aplicación se abre y se cierra al momento

Ya hay otra copia en marcha. SteamEdge permite una sola instancia. Busca `SteamEdge.exe` en el Administrador de tareas y ciérralo primero.

### La placa de cuenta se queda vacía y no carga nada

La sesión de Steam no llegó a levantarse. Cuando la conexión se cae o se está reintentando aparece una banda bajo la barra superior. Si persiste, comprueba primero que Steam sea accesible y luego mira el motivo en `cache/steamedge.log`.

### Dice "quedan 40 cromos" pero solo han caído unos pocos

Los cromos solo caen cuando un juego pasa de dos horas de tiempo total, y cada juego tiene un número limitado. Una sesión larga con juegos que están todos por debajo de dos horas no produce nada; usa el modo rápido, que solo elige juegos por encima del umbral.

### Los precios muestran un guion o se llenan muy despacio

Steam permite unas 20 peticiones de mercado cada 30 segundos por cuenta, compartidas entre precios, medias de ventas y anuncios. Un inventario grande tarda por diseño. Con `fetchAvgWithPrice` activado cada objeto cuesta dos peticiones, así que un inventario completo tarda el doble, pero no esperas una segunda pasada para las medias.

### Un logro no se desbloquea

O está protegido, es decir lo escribe el servidor del juego y ningún cliente puede, o el juego no guarda estadísticas por este protocolo. Ambos casos se detectan y se informan en vez de reintentarse. La operación en lote se detiene tras tres fallos seguidos y dice por qué, en lugar de parecer colgada.

### El modo realista solo propone uno o dos desbloqueos

El tiempo de finalización es demasiado alto. Dejado vacío se estima a partir de tus horas, así que un juego que has jugado mucho se lee como un juego larguísimo. Introduce el tiempo real para el 100% en la casilla del panel principal.

### Recoger un registro para un informe de error

El registro es `cache/steamedge.log`, junto al ejecutable, o se abre desde Ajustes. Anota eventos de conexión, decisiones de cola y errores. **No** contiene tu contraseña ni tu token de sesión, así que es seguro adjuntarlo; aun así échale un vistazo antes de publicarlo.

---

## ❓ Preguntas frecuentes

<details>
<summary><b>¿Hace falta el cliente de Steam?</b></summary>

No, y nunca se abre.

</details>

<details>
<summary><b>¿Puedo llevar varias cuentas a la vez?</b></summary>

Sí. Cada una mantiene su conexión y sus datos, y las cuentas en segundo plano siguen trabajando mientras miras otra.

</details>

<details>
<summary><b>¿Hay actualización automática?</b></summary>

No, a propósito. La aplicación lee el número de versión publicado y avisa cuando hay uno más nuevo. No descarga nada ni modifica nada.

</details>

<details>
<summary><b>¿Por qué está todo en la moneda de mi cartera?</b></summary>

Porque así lo envía Steam. Convertirlo significaría inventar un tipo de cambio.

</details>

<details>
<summary><b>¿Puedo mover mi instalación a otro equipo?</b></summary>

Copia la carpeta, todo está dentro. Recuerda que `settings/` incluye tu token de sesión, así que cópiala en privado.

</details>

---

## 📕 Glosario

| Término | Significado |
|---|---|
| **AppID** | El identificador numérico de Steam para un juego, por ejemplo 1091500 para Cyberpunk 2077 |
| **Página de insignias** | La página de Steam que enumera cuántos cromos le quedan por soltar a un juego |
| **Drop** | Un cromo concedido por tiempo de juego |
| **market_hash_name** | El nombre exacto que usa el mercado para un objeto |
| **Libro de órdenes** | La tabla en vivo de órdenes de compra y anuncios de venta de un objeto |
| **Logro protegido** | Uno que solo puede otorgar el servidor del juego, ningún cliente |
| **Venta realizada** | Una transacción completada, frente a un anuncio activo |
| **Esquema** | La definición que hace Steam de los logros y estadísticas de un juego |
| **Token de sesión** | La credencial que te mantiene con la sesión iniciada. Trátala como una contraseña |
| **Tc** | Tiempo para el 100%: horas para terminar un juego con todos sus logros |

---

<div align="center">

[Volver al README](./README_ES.md) · [Informar de un error](https://github.com/Miabeyefendi/SteamEdge/issues/new?template=bug_report.yml)

</div>
