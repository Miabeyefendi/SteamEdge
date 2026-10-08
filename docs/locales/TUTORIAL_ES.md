<div align="center">

# 📖 Guía de SteamEdge

[English](../guides/TUTORIAL.md) · [Türkçe](./TUTORIAL_TR.md) · [Deutsch](./TUTORIAL_DE.md) · **Español** · [简体中文](./TUTORIAL_ZH.md) · [Русский](./TUTORIAL_RU.md)

[Volver al README](./README_ES.md) · [Cambios](../../CHANGELOG.md)

</div>

---

## 📑 Contenido

- [Visión general](#-visión-general)
- [Instalación](#-instalación)
- [Recorrido por la interfaz](#️-recorrido-por-la-interfaz)
- [Referencia de funciones](#-referencia-de-funciones)
- [Referencia de configuración](#️-referencia-de-configuración)
- [Resolución de problemas](#-resolución-de-problemas)
- [Preguntas frecuentes](#-preguntas-frecuentes)
- [Glosario](#-glosario)

---

## 🔭 Visión general

### Qué hace

SteamEdge mantiene tus juegos de Steam "en ejecución" sin ejecutarlos. Recoge cromos, acumula horas de juego, lee y escribe logros y valora tu inventario contra el mercado real. Normalmente cada una de esas cosas necesita el cliente de Steam abierto; aquí ninguna lo necesita.

### Cómo funciona

La aplicación habla el propio protocolo de red de Steam, el mismo que usa el cliente. Inicia sesión con un token, le dice a Steam qué juegos se están jugando y lee de vuelta las páginas de insignias, los inventarios, los datos de mercado y los esquemas de logros.

De ahí se derivan dos consecuencias, y explican casi todo el comportamiento de la aplicación:

- **Steam es la única fuente de verdad.** Nada se estima ni se inventa. Si un número no se puede obtener, la casilla muestra un guion en lugar de una suposición.
- **Los límites de Steam son los límites de la aplicación.** Las peticiones de mercado están topadas en unas 20 cada 30 segundos por cuenta, y todas las partes de la aplicación que tocan el mercado comparten ese único presupuesto. Los cromos no empiezan a caer hasta que un juego supera las dos horas de tiempo total. Son hechos medidos, no ajustes. Publicar anuncios tiene además un límite propio por cuenta que Steam no publica.

### Estructura de archivos

Todo vive junto al ejecutable. No se escribe nada en el registro, en `AppData` ni en `Program Files`.

```
SteamEdge/
  SteamEdge.exe
  settings/
    settings.json              ajustes generales
    accounts.json              cuentas guardadas
    session.json               token de sesión activa
    stats.json                 estadísticas acumuladas
    state.json                 colas recordadas y registro de logros
    accounts/<steamID>.json    datos por cuenta: colas, presets, estadísticas
  cache/
    prices.json                precios de mercado, 24 horas de vida
    history.json               medias de ventas realizadas, 72 horas de vida
    basarimsiz.json            juegos sin logros detectados
    chromium/                  caché de imágenes y páginas
    steamedge.log              el registro que adjuntar a un informe de fallo
```

> **`settings/` es la carpeta sensible.** `session.json` contiene un token que basta para usar tu cuenta. No lo metas en una copia de seguridad que compartas, en un archivo que subas ni en una captura de pantalla.

---

## 📦 Instalación

### Requisitos

Windows 10 o superior, 64 bits. Una cuenta de Steam con Steam Guard activado. Unos 330 MB de espacio en disco una vez extraído. El cliente de Steam no hace falta y no se abre en ningún momento.

### Paso a paso

1. Descarga el `.rar` más reciente desde la [página de publicaciones](https://github.com/Miabeyefendi/SteamEdge/releases/latest).
2. Extráelo en una carpeta tuya. No en `Program Files`, porque la aplicación escribe sus ajustes junto a sí misma.
3. Ejecuta `SteamEdge.exe`.
4. Inicia sesión. La pestaña QR es el camino más cómodo: escanea el código con la app móvil de Steam y aprueba. La pestaña de contraseña pide usuario, contraseña y un código de Steam Guard.

### Verificar la instalación

Abajo a la izquierda aparece `SISTEMA: LISTO` en cuanto hay sesión, y `SISTEMA: EN MARCHA` mientras una tarea funciona, y la insignia de cuenta arriba a la derecha se rellena con tu nombre, avatar y nivel. Si la insignia sigue en blanco, la sesión no llegó a levantarse; consulta [resolución de problemas](#-resolución-de-problemas).

### Actualizar

La aplicación consulta el número de versión publicado y avisa cuando hay una más nueva. A propósito, no descarga ni instala nada. Para actualizar, cierra SteamEdge, extrae el nuevo archivo en una **carpeta nueva y vacía** y copia en ella la carpeta `settings/` de la anterior. Extraer encima de la carpeta antigua con la aplicación abierta mezcla archivos de dos versiones; la aplicación detecta el caso habitual y lo indica al arrancar.

### Desinstalar

Borra la carpeta. Ese es todo el procedimiento.

---

## 🖥️ Recorrido por la interfaz

### Overview

La página de inicio. El panel **Active Task** muestra lo que está realmente en marcha, un trabajo cada vez, con flechas para pasar entre ellos cuando hay varios. Start, Stop y Details actúan sobre el trabajo que estás mirando, no sobre una página fija.

Encima, seis recuadros: cromos restantes, biblioteca, esta sesión, valor del inventario, impulsor de horas y logros. **Actividad reciente** a la izquierda lista lo ocurrido con estado y hora; **Acciones rápidas** bajo el panel de tarea activa actualizan la lista de juegos, el inventario o el mercado y abren los ajustes. Un recuadro muestra un guion mientras su página no se ha cargado; eso habla de lo que se ha obtenido, no de tu cuenta.

### Card Farming

La cola de juegos con cromos pendientes, leída de tus páginas de insignias, con filtro para 1-2 o 3+ cromos. Reordena con las flechas o **Al principio**, quita un juego con ✕. A la derecha: el modo de farmeo, el temporizador de sesión con atajos, **Automatización** (publicar los cromos obtenidos, farmear en segundo plano, avisar al obtener un cromo, desbloquear logros mientras suben las horas) y **Últimas obtenciones**. Pulsa Iniciar.

### Inventory & Market

Tu inventario de Steam, con los duplicados en una fila, filtrable por juego, nombre, tipo, estado y precio, y agrupable por juego. **Obtener precios** y **Obtener medias** cargan los datos del mercado objeto a objeto, ambos valores juntos. El panel de detalle muestra los anuncios en venta, el precio de venta inmediata y las ventas realizadas. La barra inferior suma la selección, el bruto y lo que recibes, y ofrece los modos de venta (desde la media, rebajar, igualar el más bajo, vender al instante, precio propio) antes de **Vender**.

### Hours Booster

A la izquierda toda tu biblioteca, con búsqueda; en el centro la cola activa. A la derecha: **Sincronización de horas** (objetivo y método), el límite simultáneo (2, 8, 16, 32 o personalizado), la duración con atajos, interruptores de comportamiento y aparecer desconectado. Una duración fijada detiene la sesión al agotarse; ∞ sigue hasta que la detengas. Una selección se puede guardar como preajuste.

### Realistic Mode

Un espacio de tres columnas bajo una franja con el juego, los logros desbloqueados, el intervalo medio y el progreso general. A la izquierda la cola, la duración de la sesión y el objetivo AUTO; en el centro el orden de desbloqueo con el siguiente logro arriba; a la derecha los ajustes, divididos en Simple y Avanzado.

### Achievements

Por juego, el estado real bloqueado y desbloqueado leído del protocolo, con totales arriba, filtros de estado y rareza, vista de cuadrícula o lista y un panel de detalle. Selecciona logros y desbloquéalos o vuelve a bloquearlos en lote; la barra inferior muestra la selección, el tiempo estimado y si el modo seguro espacia los desbloqueos. El progreso es en vivo y Detener actúa incluso a mitad de una espera.

### Settings

Todo lo que se le puede pedir a la aplicación, agrupado: General, Farmeo de cromos, Mercado, Inventario, Impulsor de horas, Logros, Notificaciones, Privacidad y seguridad, Estadísticas, Avanzado y datos y Acerca de. La columna derecha muestra la cuenta (nivel, estado de conexión, IDs de Steam para copiar) y la configuración (último guardado, cambios sin guardar).

Los cambios esperan en la página hasta que pulses **Guardar**. Antes no se escribe nada, y salir de la página con cambios sin guardar pregunta primero. Tras guardar, el farmeo o el impulso de horas en marcha se pausan unos cinco segundos y siguen desde el mismo juego con los nuevos valores. **Restablecer** carga los valores predeterminados en la página y también espera a Guardar; mantiene el idioma de la aplicación.

El tema (Oscuro, Púrpura medianoche, Blanco) está en General y se aplica también a la pantalla de inicio de sesión.

### Chat

Se abre desde el botón Chat de arriba a la derecha, no desde el menú lateral. A la izquierda los amigos, con los conectados primero; a la derecha la conversacion. Enter envia, Shift+Enter salta de linea. Los no leidos aparecen en la fila del amigo y en el botón de la barra superior.

---

## 🧩 Referencia de funciones

### Farmeo de cromos

Steam no suelta cromos hasta que un juego supera las **dos horas** de tiempo total. Todos los modos menos uno ignoran ese hecho y simplemente ejecutan juegos; el **modo Fast** lo tiene en cuenta y rota juegos que ya han pasado el umbral, para no gastar tiempo en juegos que todavía no pueden soltar nada.

Cuando ningún juego de la cola tiene cromos, o **Pasar al siguiente al terminar un juego** está desactivado y el juego actual termina, el farmeo se detiene y explica por qué en lugar de reiniciar el último juego. El farmeo y el impulsor de horas pueden funcionar a la vez: cada uno mantiene sus propios juegos y Steam ve ambos, hasta su límite de 32.

Los modos:

| Modo | Qué hace |
|---|---|
| Sequential | Un juego cada vez, en el orden de la lista |
| Most cards | Primero los juegos con más cromos pendientes |
| Fewest cards | Primero los juegos más cerca de terminar |
| Priority | Tu propio orden |
| Fast | Solo juegos ya por encima de dos horas, rotados a intervalos cortos |

Los cromos no llegan según un horario y Steam no envía ningún evento de "ha caído un cromo". La aplicación mide periódicamente el total de cromos restantes y reporta la diferencia honesta en lugar de un contador inventado.

### Impulsor de horas

Ejecuta hasta 32 juegos a la vez. Steam cuenta el tiempo de cada juego abierto por separado, así que 32 juegos abiertos durante una hora son 32 horas de tiempo jugado.

**La sincronización de horas** lleva una selección hasta el mismo total. Dos métodos:

- **Todos a la vez** - todos los juegos seleccionados corren simultáneamente y van saliendo según alcanzan el objetivo. La ruta más rápida posible: el trabajo entero dura lo que tarde el juego más rezagado.
- **Uno por uno** - el juego más rezagado avanza solo, y cuando alcanza al siguiente continúan juntos. Más lento, pero los juegos se mantienen a la par por el camino.

Las barras de progreso comparten una línea temporal: una barra es uno menos el tiempo restante del juego dividido entre la duración del trabajo completo. Un juego que termina a las cuatro horas de una tanda de treinta y cinco empieza casi lleno; uno que corre hasta el final empieza vacío. Cada uno llega al 100% exactamente cuando alcanza su objetivo.

### Logros

Los logros se leen y se escriben por el protocolo, no raspando tu perfil público. Que el perfil sea privado no cambia nada.

Hay dos categorías intocables, y la aplicación detecta ambas desde el esquema en vez de fallar una y otra vez:

- **Los logros protegidos** los escribe el servidor del juego. Steam rechaza a cualquier cliente que lo intente.
- **Los juegos sin estadísticas por este protocolo** (algunos títulos multijugador grandes) reportan `0 / N`. Eso es correcto, no un fallo.

Algunos juegos solo aceptan escrituras de logros mientras el juego está abierto. La aplicación abre el juego para la escritura y luego restaura lo que estuviera corriendo antes.

### Realistic Mode

Mantiene un juego abierto y va desbloqueando sus logros a lo largo de la sesión, del más común al más raro. La razón es el rastro que deja: cientos de logros apareciendo en un minuto se ve a la legua en un perfil y en sitios de terceros.

**El tiempo de completado al 100%** es el número sobre el que se construye toda la página: cuántas horas cuesta terminar este juego con todos sus logros. Introdúcelo y queda recordado para ese juego. Déjalo vacío y se estima a partir del tipo de juego, pero esa estimación es tu propio tiempo jugado multiplicado por un factor, así que se infla en juegos que has jugado mucho.

**El número objetivo** se calcula con dos partes: lo que ya debería estar desbloqueado a tu tiempo de juego menos lo que realmente lo está, más la parte que corresponde a esta sesión. El panel desglosa la aritmética para que puedas comprobarla.

**El modelo de distribución** da forma al espaciado. Linear es uniforme, exponential carga la mano al principio como se ven las primeras horas de un jugador real, y Pareto pone la mayoría en el primer quinto.

**El ritmo** está ponderado por rareza. Solo los logros por debajo del 5% esperan notablemente más; todo lo que está por encima mantiene un compás uniforme y rápido. Un juego jugado más allá de su tiempo de completado comprime todo el calendario, porque ya no queda curva de aprendizaje que imitar.

**Los juegos sin logros** se retiran de la cola en cuanto se descubre, se anotan en `cache/basarimsiz.json` y no se vuelven a ofrecer en esta página. La marca de biblioteca que publica Steam no es fiable; solo lo es la petición del esquema.

### Inventario y mercado

El valor de un artículo es la **mediana ponderada por cantidad de las ventas realizadas**, no el listado activo más barato. Que alguien publique un cromo a 999.999 no lo mueve.

Los precios llegan en la **moneda del monedero** de tu cuenta y se muestran exactamente como llegan. No hay conversión, deliberadamente: convertir significaría inventarse un tipo de cambio.

El precio y la media de ventas se obtienen **por artículo, juntos**, y después la cola pasa al siguiente. Ambos comparten el único presupuesto de mercado de Steam, y el límite se cuenta en peticiones, no en artículos. El intervalo entre peticiones está en Ajustes > Avanzado y datos; la tolerancia de Steam varía según la cuenta.

**Vender.** Tú eliges el precio que paga el comprador; lo que recibes lo calcula el propio script de comisiones de Steam (descargado de Steam y ejecutado en una ventana aislada), así que ambos coinciden con lo que mostraría la web de Steam. La venta en lote se detiene en cuanto Steam rechaza un anuncio y el diálogo cita el motivo de Steam: las cuentas nuevas pueden detenerse tras 10-15 anuncios, las antiguas publican 80 o más. **Tamaño del lote** y **Espera entre lotes** (Ajustes > Mercado) dividen una venta grande; sin espera, se te pregunta tras cada lote. Con el autenticador móvil activado, cada anuncio sigue necesitando confirmación en la aplicación de Steam.

**Alerta de bajada de precio.** Cuando el anuncio más barato de un objeto queda al menos el **Umbral de bajada de precio** (10 % por defecto) por debajo de la media de 24 horas de Steam, se marca con un ▼ rojo, la confirmación de venta avisa en rojo y, con la alerta activada, recibes una notificación como mucho una vez al día por objeto.

### Chat

Los mensajes de amigos van por el mismo protocolo de red que todo lo demas, sin cliente de Steam de por medio. Abrir una conversacion la marca como leida en Steam, y la persona a la que escribes ve el indicador de escritura.

**Los chats de grupo quedan fuera.** Son un concepto aparte en el protocolo (chat room groups) y piden una pantalla propia.

### Varias cuentas

Se pueden conectar varias cuentas a la vez. Cada una mantiene su propio motor, sus propias colas y su propio archivo de datos. Cambiar de cuenta no reinicia la aplicación ni interrumpe lo que están haciendo las demás. Las copias de seguridad exportadas desde Ajustes incluyen las estadísticas, la lista del impulsor de horas y la cola y preajustes del Modo realista de cada cuenta.

### Conexión

Cuando se cae la conexión, SteamEdge se reconecta solo y las tareas en marcha continúan donde estaban. **Reconectar si se pierde la conexión** (Ajustes > Avanzado y datos) fija el límite: sin límite, 10 intentos, 3 intentos o desactivado. Si Steam cierra la sesión definitivamente, por ejemplo porque la cuenta inició sesión en otro lugar, los intentos se detienen y un aviso ofrece un botón para reconectar.

---

## ⚙️ Referencia de configuración

Los ajustes viven en `settings/settings.json`. Todo lo de abajo es editable desde la página de Settings.

### General

| Clave | Por defecto | Qué hace |
|---|---|---|
| `language` | `en` | Idioma de la interfaz: `tr`, `en`, `de`, `es`, `zh`, `ru` |
| `autoLaunch` | `false` | Arrancar con Windows |
| `theme` | `dark` | Tema de color: `dark`, `midnight` (Púrpura medianoche), `white` |
| `preventSleep` | `true` | Impide que el equipo se suspenda mientras funcionan el farmeo, el impulso de horas o el Modo realista. La pantalla puede apagarse y bloquearse igualmente |

### Farmeo de cromos

| Clave | Por defecto | Qué hace |
|---|---|---|
| `autoNextGame` | `true` | Pasa al siguiente juego cuando uno termina. Desactivado: el farmeo se detiene tras el juego actual |
| `cardMaxGames` | `32` | Juegos abiertos a la vez |
| `fastMinPlaytimeMin` | `120` | El modo Fast ignora juegos por debajo de este tiempo jugado |
| `pauseFarmOnBoost` | `false` | Pausa el farmeo mientras funcionan el impulsor de horas o el Modo realista y luego sigue donde estaba |

### Mercado

| Clave | Por defecto | Qué hace |
|---|---|---|
| `priceRefreshHours` | `24` | Cuánto sigue siendo fresco un precio obtenido |
| `historyRefreshHours` | `72` | Cuánto sigue siendo fresca una media de ventas |
| `fetchAvgWithPrice` | `true` | Obtener la media en la misma pasada que el precio. Desactivado significa una petición por artículo y medias solo mediante el botón Average |
| `bookDepth` | `5` | Filas del libro de órdenes en el panel de detalle |
| `bulkSellLimit` | `50` | La venta en lote se divide en lotes de este número de objetos. `0` publica hasta que Steam lo detenga |
| `sellBatchWaitMin` | `0` | Minutos de espera entre lotes. `0` pregunta tras cada lote |
| `priceDropThreshold` | `10` | Porcentaje por debajo de la media de 24 horas de Steam que cuenta como bajada de precio |

### Impulsor de horas

| Clave | Por defecto | Qué hace |
|---|---|---|
| `boostMaxGames` | `32` | Juegos abiertos a la vez |
| `boostDurationSec` | `3600` | Duración de la sesión |
| `boostSync` | `false` | Llevar la selección a un total común |
| `boostSyncMode` | `highest` | Objetivo: el `highest` seleccionado, horas `manual`, o el más alto de la `library` |
| `boostSyncStrategy` | `parallel` | `parallel` es todos a la vez, `staged` es uno por uno |
| `boostAutoRestart` | `false` | Volver a lanzar la cola cuando acaba la sesión |
| `rememberBoostList` | `false` | Conservar la selección entre sesiones |

### Realistic Mode

| Clave | Por defecto | Qué hace |
|---|---|---|
| `grDurationSec` | `7200` | Duración de la sesión |
| `grModel` | `linear` | Modelo de distribución |
| `grTcGame` | `{}` | Tiempo de completado al 100% por juego, en horas |
| `grCatchUp` | `true` | Comprimir el atraso acumulado al principio de la sesión |
| `grSpeed` | `1` | Multiplicador de velocidad para todo el calendario |
| `grUltraMultiplier` | `3` | Cuánto más esperan los logros por debajo del 5% |
| `grCatchUpShare` | `20` | Porcentaje de la sesión que se lleva la ráfaga de recuperación |
| `grFinishedRatio` | `50` | Cuánto se comprime el calendario en un juego ya terminado |
| `grKeepHours` | `true` | Seguir acumulando horas cuando terminen los desbloqueos |
| `grSkipUltraRare` | `false` | Saltarse por completo los logros por debajo del 5% |

### Privacidad

| Clave | Por defecto | Qué hace |
|---|---|---|
| `offlineMode` | `false` | Aparecer desconectado mientras se ejecuta |
| `hideGameName` | `false` | Compartir que estás en línea pero no a qué juegas |

> Aparecer desconectado cambia lo que ven tus amigos. También puede cambiar si Steam te cuenta como jugando, así que pruébalo antes de confiar en ello para una sesión larga.

### Avanzado

| Clave | Por defecto | Qué hace |
|---|---|---|
| `reconnectPolicy` | `unlimited` | Reconexión tras perder la conexión: `unlimited` (sin límite), `10`, `3`, `off` (desactivado) |
| `sessionTimeout` | `never` | Desconecta tras estos minutos sin actividad. Las tareas en marcha no cuentan como inactividad |
| `apiRequestDelayMs` | `350` | Intervalo mínimo entre peticiones al mercado. Más bajo es más rápido pero más cerca del límite de Steam (HTTP 429) |
| `logLevel` | `error` | Qué se escribe en `cache/steamedge.log`: `off`, `error`, `warn`, `info`, `debug` |

### Dónde se guardan los ajustes

Los ajustes generales en `settings/settings.json`. Todo lo que pertenece a una cuenta, la selección del acumulador de horas, la cola y los presets de Realistic Mode, el registro de logros y las estadísticas, vive en `settings/accounts/<steamID>.json`. Las cachés van aparte, bajo `cache/`, y se pueden borrar en cualquier momento sin perder configuración.

---

## 🔧 Resolución de problemas

### La aplicación se abre y se cierra al instante

Ya hay otra copia en marcha. SteamEdge permite una sola instancia. Busca `SteamEdge.exe` en el Administrador de tareas y ciérralo primero.

### La insignia de cuenta se queda vacía y no carga nada

La sesión de Steam no llegó a levantarse. Aparece un aviso bajo la barra superior cuando la conexión se cae o se está reintentando. Si persiste, comprueba que Steam sea alcanzable y luego mira `cache/steamedge.log` para ver el motivo. Si Steam cerró la sesión definitivamente, el aviso lo dice y ofrece un botón para reconectar.

### La venta en lote se detuvo a medias

Steam limita cuántos anuncios puede crear una cuenta, y el límite depende de su antigüedad, nivel y reputación. El diálogo cita lo que devolvió Steam. Confirma los anuncios pendientes en la aplicación de Steam, espera unas horas o elige un **Tamaño del lote** menor con espera entre lotes.

### Dice "quedan 40 cromos" pero solo cayeron unos pocos

Los cromos solo caen después de que un juego supere las dos horas de tiempo total, y cada juego tiene su propio número limitado de caídas. Una sesión larga sobre juegos que están todos por debajo de dos horas no produce absolutamente nada; usa el modo Fast, que solo elige juegos que ya pasaron el umbral.

### Los precios muestran un guion, o se rellenan muy despacio

Steam permite unas 20 peticiones de mercado cada 30 segundos por cuenta, compartidas entre precios, medias de ventas y listados. Un inventario grande tarda por diseño. Con `fetchAvgWithPrice` activado cada artículo cuesta dos peticiones, así que un inventario completo tarda el doble, pero no esperas una segunda pasada para las medias.

### Un logro no se desbloquea

O bien está protegido, es decir lo escribe el servidor del juego y ningún cliente puede, o bien el juego no lleva estadísticas por este protocolo. Ambos casos se detectan y se informan en vez de reintentarse. La operación en bloque se detiene tras tres fallos consecutivos y te dice por qué, en lugar de parecer que se ha colgado.

### Realistic Mode solo propone uno o dos desbloqueos

El tiempo de completado es demasiado alto. Si se deja vacío se estima a partir de tu tiempo jugado, así que un juego al que has dedicado mucho tiempo se lee como un juego larguísimo. Introduce el tiempo real de completado al 100% en la casilla del panel principal.

### Recoger un registro para informar de un fallo

El registro es `cache/steamedge.log`, junto al ejecutable, o ábrelo desde Settings. Anota eventos de conexión, decisiones de cola y errores. **No** contiene tu contraseña ni tu token de sesión, así que es seguro adjuntarlo; aun así, échale un vistazo antes de publicarlo. Por defecto solo se escriben errores; pon Ajustes > Avanzado y datos > **Archivo de registro** en **Detallado (depuración)**, reproduce el problema y adjunta el archivo.

---

## ❓ Preguntas frecuentes

<details>
<summary><b>¿Necesita el cliente de Steam?</b></summary>

No, y nunca lo abre.

</details>

<details>
<summary><b>¿Puedo usar varias cuentas a la vez?</b></summary>

Sí. Cada una mantiene su conexión y sus datos, y las cuentas en segundo plano siguen trabajando mientras miras otra.

</details>

<details>
<summary><b>¿Hay actualizador automático?</b></summary>

No, deliberadamente. La aplicación lee el número de versión publicado y te avisa cuando existe uno más nuevo. No descarga nada ni modifica nada.

</details>

<details>
<summary><b>¿Por qué está todo en la moneda de mi monedero?</b></summary>

Porque así es como lo envía Steam. Convertir significaría inventarse un tipo de cambio.

</details>

<details>
<summary><b>¿Puedo llevarme mi configuración a otro equipo?</b></summary>

Copia la carpeta. Está todo dentro. Recuerda que `settings/` incluye tu token de sesión, así que cópiala en privado. La sección Copia de seguridad de Ajustes > General también puede exportar ajustes y datos por cuenta a un único archivo, sin el token de sesión.

</details>

---

## 📕 Glosario

| Término | Significado |
|---|---|
| **AppID** | El identificador numérico de Steam para un juego, por ejemplo 1091500 para Cyberpunk 2077 |
| **Página de insignia** | La página de Steam que indica cuántas caídas de cromos le quedan a un juego |
| **Caída** | Un cromo concedido por tiempo jugado |
| **market_hash_name** | El nombre exacto que usa el mercado para un artículo |
| **Libro de órdenes** | La tabla en vivo de órdenes de compra y listados de venta de un artículo |
| **Logro protegido** | Uno que solo el servidor del juego puede fijar; ningún cliente puede |
| **Venta realizada** | Una transacción completada, frente a un listado activo |
| **Esquema** | La definición que hace Steam de los logros y estadísticas de un juego |
| **Token de sesión** | La credencial que te mantiene con la sesión iniciada. Trátala como una contraseña |
| **Tc** | Tiempo de completado al 100%: horas para terminar un juego con todos sus logros |

---

<div align="center">

[Volver al README](./README_ES.md) · [Informar de un fallo](https://github.com/Miabeyefendi/SteamEdge/issues/new?template=bug_report.yml)

</div>
