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

Todo vive junto al ejecutable. No se escribe nada en el registro ni en `Program Files`; `AppData` solo se usa como alternativa cuando no se puede escribir en la carpeta del ejecutable.

```
SteamEdge/
  SteamEdge.exe
  settings/
    settings.json              ajustes generales
    accounts.json              cuentas guardadas
    session.json               token de sesión activa
    accounts/<steamID>.json    datos por cuenta: estadísticas, colas, presets, registro de logros
    stats.json, state.json     solo de versiones antiguas: se leen una vez y no se vuelven a escribir
    *.bak, *.bozuk             copia de seguridad automática y archivo dañado apartado
  cache/
    prices.json                precios de mercado, 24 horas de vida
    history.json               medias de ventas realizadas, 72 horas de vida
    no-achievements.json            juegos sin logros detectados
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

La aplicación consulta el número de versión publicado unos segundos después de arrancar y cada vez que pulsas el botón de actualización de la barra superior, y avisa cuando hay una más nueva. A propósito, no descarga ni instala nada. Para actualizar, cierra SteamEdge, extrae el nuevo archivo en una **carpeta nueva y vacía** y copia en ella la carpeta `settings/` de la anterior. Extraer encima de la carpeta antigua con la aplicación abierta mezcla archivos de dos versiones; la aplicación detecta el caso habitual y lo indica al arrancar.

Los archivos escritos por una versión anterior se convierten la primera vez que se leen, así que basta con copiar `settings/`. La conversión es de un solo sentido: una vez que 1.4.0 ha abierto una carpeta `settings/`, 1.3.x ya no puede usarla; guarda una copia si quieres poder volver atrás.

### Desinstalar

Borra la carpeta. Ese es todo el procedimiento.

---

## 🖥️ Recorrido por la interfaz

### Resumen

La página de inicio. El panel **Tarea activa** muestra lo que está realmente en marcha, un trabajo cada vez, con flechas para pasar entre ellos cuando hay varios. Iniciar, Detener y Detalles actúan sobre el trabajo que estás mirando, no sobre una página fija.

Encima, seis recuadros: cromos restantes, biblioteca, esta sesión, valor del inventario, impulsor de horas y logros. **Actividad reciente** a la izquierda lista lo ocurrido con estado y hora (las últimas 30 entradas, que se conservan entre sesiones); **Acciones rápidas** bajo el panel de tarea activa actualizan la lista de juegos, el inventario o el mercado y abren los ajustes. Un recuadro muestra un guion mientras su página no se ha cargado; eso habla de lo que se ha obtenido, no de tu cuenta.

### Farmeo de cromos

La cola de juegos con cromos pendientes, leída de tus páginas de insignias, con filtro para 1-2 o 3+ cromos. Reordena con las flechas o **Mover al principio** (el modo pasa a Prioridad), quita un juego con ✕; el orden y las exclusiones se recuerdan. A la derecha: el modo de farmeo, el temporizador por juego (cuánto funciona cada juego antes de que tome el relevo el siguiente, con atajos; el modo Rápido marca su propio ritmo y lo atenúa), **Automatización** (publicar los cromos obtenidos, farmear en segundo plano, avisar al obtener un cromo, desbloquear logros mientras suben las horas) y **Últimas obtenciones**. Pulsa Iniciar.

### Inventario y mercado

Tu inventario de Steam, con los duplicados en una fila, filtrable por juego, nombre, tipo, estado y precio, y agrupable por juego. **Obtener precios** carga los precios de mercado de lo que muestra el filtro actual, por defecto junto con la media de ventas de cada artículo; **Obtener medias** rellena solo las medias que faltan, indica antes el tiempo estimado y se puede cancelar. El panel de detalle muestra los anuncios en venta, el precio de venta inmediata y las ventas realizadas. La barra inferior suma la selección, el bruto y lo que recibes, y ofrece los modos de venta (desde la media, rebajar, igualar el más bajo, vender al instante, precio propio) antes de **Vender**.

### Impulsor de horas

A la izquierda toda tu biblioteca, con búsqueda (se dibujan como máximo 300 filas a la vez, así que busca para acotar); en el centro la cola activa. A la derecha: **Sincronización de horas** (objetivo y método), el límite simultáneo (2, 8, 16, 32 o personalizado), la duración con atajos (6, 12, 18, 24 horas, ∞ o personalizada), interruptores de comportamiento y aparecer desconectado. Una duración fijada detiene la sesión al agotarse; ∞ sigue hasta que la detengas. Una selección se puede guardar como preajuste.

### Modo realista

Un espacio de tres columnas bajo una franja con el juego, los logros desbloqueados, el intervalo medio y el progreso general. A la izquierda la cola, la duración de la sesión y el objetivo AUTO; en el centro el orden de desbloqueo con el siguiente logro arriba; a la derecha los ajustes, divididos en Simple y Avanzado.

### Logros

Por juego, el estado real bloqueado y desbloqueado leído del protocolo, con totales arriba, filtros de estado y rareza, vista de cuadrícula o lista y un panel de detalle. Selecciona logros y desbloquéalos o vuelve a bloquearlos en lote; la barra inferior muestra la selección, el tiempo estimado y si el modo seguro espacia los desbloqueos. El progreso es en vivo y Detener actúa incluso a mitad de una espera.

### Ajustes

Todo lo que se le puede pedir a la aplicación, agrupado: General, Farmeo de cromos, Mercado, Inventario, Impulsor de horas, Logros, Notificaciones, Privacidad y seguridad, Estadísticas, Avanzado y datos y Acerca de. La columna derecha muestra la cuenta (nivel, estado de conexión, IDs de Steam para copiar) y la configuración (último guardado, cambios sin guardar).

Los cambios esperan en la página hasta que pulses **Guardar**. Antes no se escribe nada, y salir de la página con cambios sin guardar pregunta primero. Tras guardar, el farmeo o el impulso de horas en marcha a los que afecten los ajustes cambiados se pausan unos cinco segundos y siguen desde el mismo juego con los nuevos valores; los ajustes que no afectan a una tarea en marcha se aplican al instante. **Restablecer** carga los valores predeterminados en la página y también espera a Guardar; mantiene el idioma de la aplicación.

El tema (Oscuro, Púrpura medianoche, Blanco) está en General y se aplica también a la pantalla de inicio de sesión.

### Chat

Se abre desde el botón Chat de arriba a la derecha, no desde el menú lateral. A la izquierda los amigos, con los conectados primero; a la derecha la conversación (al abrirla se cargan los últimos 50 mensajes). Enter envía, Shift+Enter salta de línea. Los no leídos aparecen en la fila del amigo y en el botón de la barra superior.

---

## 🧩 Referencia de funciones

### Farmeo de cromos

Steam no suelta cromos hasta que un juego supera las **dos horas** de tiempo total. Todos los modos menos uno ignoran ese hecho y simplemente ejecutan juegos; el **modo Rápido** lo tiene en cuenta y sube por encima del umbral los juegos que aún están por debajo antes de empezar a rotar.

En todos los modos salvo Rápido se ejecuta un juego cada vez durante el **Tiempo por juego** que fijes (Ajustes > Farmeo de cromos, 5 minutos por defecto; el temporizador de la página de farmeo parte de ese valor y se puede cambiar en cada ejecución) y luego toma el relevo el siguiente. Un juego sin cromos pendientes sale de la cola y el siguiente empieza de inmediato. Cuando ningún juego de la cola tiene cromos, o **Pasar al siguiente al terminar un juego** está desactivado y se acaba el tiempo del juego actual o sus cromos, el farmeo se detiene y explica por qué en lugar de reiniciar el último juego. El farmeo y el impulsor de horas pueden funcionar a la vez: cada uno mantiene sus propios juegos y Steam ve ambos, hasta su límite de 32.

El **modo Rápido** funciona en dos fases. Primero el calentamiento: los juegos por debajo del umbral (`fastMinPlaytimeMin`, 120 minutos) se abren juntos, en grupos de hasta **Máx. juegos a la vez**, y siguen abiertos hasta que todo el grupo lo ha superado, porque Steam acredita tiempo a todos los juegos abiertos a la vez. Después, cada juego que aún tiene cromos permanece abierto a la vez, hasta el mismo límite, y la aplicación cambia el juego destacado cada 90 a 120 segundos, con un intervalo aleatorio cada vez.

Los modos:

| Modo | Qué hace |
|---|---|
| Uno por uno | Un juego cada vez, en el orden de la lista |
| Más cromos | Primero los juegos con más cromos pendientes |
| Menos cromos | Primero los juegos más cerca de terminar |
| Prioridad | Tu propio orden |
| Rápido | Calentamiento de los juegos por debajo de dos horas y luego todos abiertos a la vez con un juego destacado que rota |

Los cromos no llegan según un horario y Steam no envía ningún evento de "ha caído un cromo". La aplicación vuelve a leer las páginas de insignias de cada cuenta cada tres minutos y reporta la diferencia honesta del total de cromos restantes en lugar de un contador inventado.

### Impulsor de horas

Ejecuta hasta 32 juegos a la vez. Steam cuenta el tiempo de cada juego abierto por separado, así que 32 juegos abiertos durante una hora son 32 horas de tiempo jugado. El **Modo secuencial** (un interruptor de la página) recorre en cambio la cola juego a juego, con la duración fijada aplicada a cada uno, así que ahí no se puede elegir ∞ y no se usa la sincronización de horas.

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

**Desbloquear y bloquear en lote** actúan sobre los logros seleccionados, o sobre todo lo que muestra el filtro actual si no hay selección. Siempre se envían uno a uno según el **Intervalo de desbloqueo** (Ajustes > Logros), nunca de golpe. Con el **Modo seguro** activado, cada espera varía al azar hasta un 40 % en ambos sentidos, o entre el 40 % y el 160 % del intervalo con **Repartir los desbloqueos en el tiempo**; con el modo seguro desactivado el intervalo es exacto. La confirmación muestra el intervalo y el tiempo total estimado, un lote se detiene tras tres fallos seguidos, y al terminar la aplicación vuelve a leer el juego desde Steam y corrige las marcas que Steam no guardó realmente. Un desbloqueo individual pregunta antes, salvo que marques No volver a preguntar (**Pedir confirmación en cambios individuales** en Ajustes lo reactiva); los lotes siempre preguntan. La rareza sigue el porcentaje global de desbloqueo de Steam en cinco niveles: menos del 1 % Legendario, menos del 5 % Ultra raro, menos del 10 % Raro, menos del 25 % Poco común, el resto Común.

### Modo realista

Mantiene un juego abierto y va desbloqueando sus logros a lo largo de la sesión, del más común al más raro. La razón es el rastro que deja: cientos de logros apareciendo en un minuto se ve a la legua en un perfil y en sitios de terceros.

**El tiempo de completado al 100%** es el número sobre el que se construye toda la página: cuántas horas cuesta terminar este juego con todos sus logros. Introdúcelo y queda recordado para ese juego. Déjalo vacío y se estima a partir del tipo de juego, pero esa estimación es tu propio tiempo jugado multiplicado por un factor, así que se infla en juegos que has jugado mucho.

**El número objetivo** se calcula con dos partes: lo que ya debería estar desbloqueado a tu tiempo de juego menos lo que realmente lo está, más la parte que corresponde a esta sesión. El panel desglosa la aritmética para que puedas comprobarla. Con **Fijar la duración según los ajustes** activado y sin una duración escrita a mano, también se calcula la longitud de la sesión: el tiempo que necesitaría un jugador real para los logros atrasados, limitado entre 15 minutos y 12 horas.

**El modelo de distribución** da forma al espaciado. Lineal es uniforme, exponencial carga la mano al principio como se ven las primeras horas de un jugador real, y Pareto pone la mayoría en el primer quinto.

**El ritmo** está ponderado por rareza. Solo los logros por debajo del 5% esperan notablemente más; todo lo que está por encima mantiene un compás uniforme y rápido. Un juego jugado más allá de su tiempo de completado comprime todo el calendario, porque ya no queda curva de aprendizaje que imitar.

**Los juegos sin logros** se retiran de la cola en cuanto se descubre, se anotan en `cache/no-achievements.json` y no se vuelven a ofrecer en esta página. La marca de biblioteca que publica Steam no es fiable; solo lo es la petición del esquema.

Con **Intervalos aleatorios**, los intervalos varían hasta un 40 % en ambos sentidos y nunca bajan de tres segundos. Con varios juegos en la cola, el tiempo restante se reparte según el número de logros y la cola avanza sola si **Iniciar la cola automáticamente** está activado. Si se acaba el tiempo con logros pendientes, la ejecución se detiene e indica cuántos no se desbloquearon en lugar de forzarlos; un farmeo de cromos que se hubiera pausado para ella se reanuda después.

### Inventario y mercado

El valor de un artículo es la **mediana ponderada por cantidad de las ventas realizadas**, no el listado activo más barato. Que alguien publique un cromo a 999.999 no lo mueve.

Los precios llegan en la **moneda del monedero** de tu cuenta y se muestran exactamente como llegan. No hay conversión, deliberadamente: convertir significaría inventarse un tipo de cambio.

El precio y la media de ventas se obtienen **por artículo, juntos**, y después la cola pasa al siguiente. Ambos comparten el único presupuesto de mercado de Steam, y el límite se cuenta en peticiones, no en artículos; la aplicación envía 18 peticiones y espera el enfriamiento de Steam, de unos 32 segundos. El intervalo entre peticiones está en Ajustes > Avanzado y datos; la tolerancia de Steam varía según la cuenta.

**Vender.** Tú eliges el precio que paga el comprador; lo que recibes lo calcula el propio script de comisiones de Steam (descargado de Steam y ejecutado en una ventana aislada), así que ambos coinciden con lo que mostraría la web de Steam. La venta en lote se detiene cuando Steam indica un límite o rechaza dos anuncios seguidos, y el diálogo cita el motivo de Steam: las cuentas nuevas pueden detenerse tras 10-15 anuncios, las antiguas publican 80 o más. Los artículos que Steam dice que ahora no se pueden publicar (por ejemplo, los que ya tienen un anuncio pendiente) no detienen la ejecución: se omiten y se cuentan. **Tamaño del lote** y **Espera entre lotes** (Ajustes > Mercado) dividen una venta grande; sin espera, se te pregunta tras cada lote. Con el autenticador móvil activado, cada anuncio sigue necesitando confirmación en la aplicación de Steam.

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

Los ajustes viven en `settings/settings.json`. La mayoría de las claves de abajo son controles de la página de Ajustes; las propias de una tarea (duración y método de sincronización del impulsor de horas, valores del Modo realista) están en la página de su función. Las claves marcadas con * no tienen ningún control y solo se cambian editando el archivo con la aplicación cerrada. Las tablas recogen las claves que conviene conocer; el resto son los demás controles de esas páginas, y el archivo se reescribe cada vez que pulsas Guardar.

### General

| Clave | Por defecto | Qué hace |
|---|---|---|
| `language` | `en` | Idioma de la interfaz: `tr`, `en`, `de`, `es`, `zh`, `ru` |
| `autoLaunch` | `false` | Arrancar con Windows |
| `theme` | `dark` | Tema de color: `dark`, `midnight` (Púrpura medianoche), `white` |
| `preventSleep` | `false` | Impide que el equipo se suspenda mientras funcionan el farmeo, el impulso de horas o el Modo realista. La pantalla puede apagarse y bloquearse igualmente |

### Farmeo de cromos

| Clave | Por defecto | Qué hace |
|---|---|---|
| `autoNextGame` | `true` | Pasa al siguiente juego cuando uno termina. Desactivado: el farmeo se detiene tras el juego actual |
| `cardMaxGames` | `32` | Juegos abiertos a la vez |
| `farmMaxMinutes` | `5` | Minutos que funciona cada juego antes de que tome el relevo el siguiente. El modo Rápido marca su propio ritmo |
| `fastMinPlaytimeMin`* | `120` | El modo Rápido sube primero por encima de este tiempo los juegos que están por debajo y luego rota todos |

### Mercado

| Clave | Por defecto | Qué hace |
|---|---|---|
| `priceRefreshHours`* | `24` | Cuánto sigue siendo fresco un precio obtenido |
| `historyRefreshHours`* | `72` | Cuánto sigue siendo fresca una media de ventas |
| `fetchAvgWithPrice` | `true` | Obtener la media en la misma pasada que el precio. Desactivado significa una petición por artículo y medias solo mediante el botón Media |
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
| `rememberBoostList` | `true` | Conservar la selección entre sesiones |
| `pauseFarmOnBoost` | `false` | Pausa el farmeo mientras funcionan el impulsor de horas o el Modo realista y luego sigue donde estaba |

### Modo realista

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
| `sessionTimeout` | `never` | Cierra todas las sesiones tras estos minutos sin actividad (30, 120 u 480). Las tareas en marcha no cuentan como inactividad; solo tu propia interacción reinicia el contador. Al cumplirse, todas las cuentas se desconectan, se olvida la sesión activa y se abre la pantalla de inicio de sesión |
| `apiRequestDelayMs` | `350` | Intervalo mínimo entre peticiones al mercado. Más bajo es más rápido pero más cerca del límite de Steam (HTTP 429) |
| `logLevel` | `error` | Qué se escribe en `cache/steamedge.log`: `off`, `error`, `warn`, `info`, `debug` |

### Dónde se guardan los ajustes

Los ajustes generales en `settings/settings.json`. Todo lo que pertenece a una cuenta, la selección del impulsor de horas, la cola y los preajustes del Modo realista, el registro de logros y las estadísticas, vive en `settings/accounts/<steamID>.json`. Las cachés van aparte, bajo `cache/`, y se pueden borrar en cualquier momento sin perder configuración. Cada archivo JSON se escribe primero en un archivo temporal y se intercambia de una vez, y la copia anterior intacta se conserva al lado como `.bak`. Si un archivo no se puede leer se usa el `.bak`; si también está dañado, el archivo no se toca, se aparta una copia como `.bozuk`, la aplicación te lo dice al arrancar y los datos afectados empiezan con los valores predeterminados. `stats.json` y `state.json` solo existen en carpetas de versiones antiguas; su contenido pasa al archivo de la cuenta la primera vez y no se vuelven a escribir.

---

## 🔧 Resolución de problemas

### La aplicación se abre y se cierra al instante

Ya hay otra copia en marcha. SteamEdge permite una sola instancia. Busca `SteamEdge.exe` en el Administrador de tareas y ciérralo primero.

### La insignia de cuenta se queda vacía y no carga nada

La sesión de Steam no llegó a levantarse. Aparece un aviso bajo la barra superior cuando la conexión se cae o se está reintentando. Si persiste, comprueba que Steam sea alcanzable y luego mira `cache/steamedge.log` para ver el motivo. Si Steam cerró la sesión definitivamente, el aviso lo dice y ofrece un botón para reconectar.

### La venta en lote se detuvo a medias

Steam limita cuántos anuncios puede crear una cuenta, y el límite depende de su antigüedad, nivel y reputación. El diálogo cita lo que devolvió Steam. Confirma los anuncios pendientes en la aplicación de Steam, espera unas horas o elige un **Tamaño del lote** menor con espera entre lotes.

### Dice "quedan 40 cromos" pero solo cayeron unos pocos

Los cromos solo caen después de que un juego supere las dos horas de tiempo total, y cada juego tiene su propio número limitado de caídas. Una sesión larga en los otros modos sobre juegos que están todos por debajo de dos horas no produce nada hasta que cruzan el umbral; el modo Rápido primero los sube todos juntos por encima.

### Los precios muestran un guion, o se rellenan muy despacio

Steam permite unas 20 peticiones de mercado cada 30 segundos por cuenta, compartidas entre precios, medias de ventas y listados. Un inventario grande tarda por diseño. Con `fetchAvgWithPrice` activado cada artículo cuesta dos peticiones, así que un inventario completo tarda el doble, pero no esperas una segunda pasada para las medias.

### Un logro no se desbloquea

O bien está protegido, es decir lo escribe el servidor del juego y ningún cliente puede, o bien el juego no lleva estadísticas por este protocolo. Ambos casos se detectan y se informan en vez de reintentarse. La operación en bloque se detiene tras tres fallos consecutivos y te dice por qué, en lugar de parecer que se ha colgado.

### El Modo realista solo propone uno o dos desbloqueos

El tiempo de completado es demasiado alto. Si se deja vacío se estima a partir de tu tiempo jugado, así que un juego al que has dedicado mucho tiempo se lee como un juego larguísimo. Introduce el tiempo real de completado al 100% en la casilla del panel principal.

### SteamEdge dice que no se pudo leer un archivo

Si un archivo de ajustes o de datos se daña, SteamEdge restaura la copia automática `.bak`. Si esta también está dañada, el archivo se deja tal cual, se aparta una copia junto a él con la extensión `.bozuk`, los datos afectados empiezan con los valores predeterminados y la aplicación te lo indica al arrancar. No se sobrescribe nada, así que puedes devolver el archivo a mano.

### Recoger un registro para informar de un fallo

El registro es `cache/steamedge.log`, junto al ejecutable, o ábrelo desde Ajustes. Anota eventos de conexión, decisiones de cola y errores. **No** contiene tu contraseña ni tu token de sesión, así que es seguro adjuntarlo; aun así, échale un vistazo antes de publicarlo. Por defecto solo se escriben errores; pon Ajustes > Avanzado y datos > **Archivo de registro** en **Detallado (depuración)**, reproduce el problema y adjunta el archivo. El registro tiene tope: al pasar de 2 MB se aparta como `steamedge.log.1` y empieza un archivo nuevo, de modo que siempre se conserva una parte anterior.

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
