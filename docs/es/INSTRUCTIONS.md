# Ajustes - todo explicado

[English](../en/INSTRUCTIONS.md) · [Türkçe](../tr/INSTRUCTIONS.md) · [Deutsch](../de/INSTRUCTIONS.md) · [Español](../es/INSTRUCTIONS.md) · [繁體中文](../zh/INSTRUCTIONS.md)

Abre los ajustes con el icono del engranaje arriba a la derecha. Los ajustes son **globales
de la aplicación**, no por cuenta. Cada fila tiene un **?** que, al pasar el ratón, muestra
la misma explicación que aquí.

Los cambios se guardan al instante. **Restablecer valores** está en la parte superior.

---

## General

| Ajuste | Predeterminado | Qué hace |
|---|---|---|
| **Idioma de la aplicación** | Türkçe | English, Türkçe, Deutsch, Español, 繁體中文. La app se recarga al cambiarlo. |
| **Página de inicio** | Resumen | Qué pestaña se abre al arrancar. |
| **Densidad de la interfaz** | Cómoda | Compacta reduce la altura de fila, cabe alrededor de un tercio más por pantalla. |
| **Formato de hora** | 24 horas | Se aplica a los contadores de sesión, marcas de tiempo y horas de silencio. |
| **Iniciar con Windows** | Desactivado | Arranca SteamEdge al iniciar sesión, silenciosamente en la bandeja. |
| **Minimizar a la bandeja al cerrar** | Desactivado | Cerrar la ventana mantiene el farmeo en segundo plano. |
| **Impedir la suspensión** | Desactivado | Evita que el equipo se suspenda y que se bloquee la pantalla durante el farmeo o el impulso. |
| **Iniciar con la barra lateral contraída** | Desactivado | Barra solo con iconos; el contenido gana 128 píxeles. |

### Copia de seguridad

| Ajuste | Predeterminado | Qué hace |
|---|---|---|
| **Exportar / Importar** | - | Escribe todas las preferencias y estadísticas acumuladas en un único `.json`. **Los tokens de sesión y las cuentas guardadas se excluyen a propósito**, así que el archivo puede guardarse en la nube. |
| **Cuánto tiempo se guardan los datos recordados** | 90 días | Se aplica al orden de la cola, los juegos retirados y el registro de logros. Lo caducado se borra al iniciar. Tus ajustes no se ven afectados. |

### Zona de peligro

**Eliminar todos los datos** borra la sesión, las cuentas guardadas, los ajustes, las
estadísticas y la caché de precios, y vuelve a la pantalla de inicio de sesión. Tu cuenta de
Steam no se toca. Requiere dos confirmaciones.

---

## Farmeo de cromos

| Ajuste | Predeterminado | Qué hace |
|---|---|---|
| **Modo de prioridad predeterminado** | Secuencial | Con qué modo se abre la pestaña. |
| **Orden predeterminado de la cola** | Predeterminado | Por qué columna se ordena la cola al abrir. |
| **Máx. juegos a la vez** | 10 | Cuántos juegos cuentan como activos simultáneamente. El límite conocido del cliente de Steam es 32: es comportamiento del servidor, no un límite de esta app. Valores bajos usan menos recursos. |
| **Tiempo máx. por juego** | 5 min | Al agotarse, la cola pasa al siguiente aunque no haya caído ningún cromo. `0` desactiva el límite. |
| **Reintentar tras un error** | 3 | Cuántas veces se reintenta una conexión caída con Steam. El intervalo se duplica cada vez. |
| **Reconectar automáticamente** | Activado | Restablece la sesión tras una caída de internet o de Steam y reanuda la cola. |
| **Pasar al siguiente juego** | Activado | Desactivado significa que inicias cada juego a mano. |

### Automatización

| Ajuste | Predeterminado | Qué hace |
|---|---|---|
| **Publicar automáticamente en el mercado** | Desactivado | Publica los cromos recién obtenidos al precio medio. **Cambia tu cuenta de forma permanente**: desactivado por defecto. |
| **Farmear en segundo plano** | Desactivado | Omite los redibujados por segundo con la ventana oculta. El motor no se ve afectado. |
| **Desbloquear logros mientras suben las horas** | Desactivado | Desbloquea logros a intervalos durante el farmeo. **Cambia tu cuenta de forma permanente.** |
| **Notificar al obtener un cromo** | Desactivado | Notificación de escritorio por cada cromo. |

---

## Mercado

| Ajuste | Predeterminado | Qué hace |
|---|---|---|
| **Precio de venta predeterminado** | Media | Estrategia inicial de la barra de venta: media, rebajar, igualar al más bajo, vender al instante o personalizado. |
| **Cantidad de rebaja** | 1 céntimo | Cuánto baja "Rebajar" respecto a la oferta más barata. Poco protege el beneficio, mucho vende más rápido. |
| **Máx. objetos por venta masiva** | 50 | Valores altos pueden provocar una restricción temporal en Steam. |
| **Profundidad del libro de órdenes** | 5 | Cuántos niveles de precio muestra el panel de detalles. |
| **Intervalo de actualización de precios** | 15 min | Cada cuánto se vuelven a obtener los precios con la pestaña Inventario abierta. |
| **Actualizar precios automáticamente** | Desactivado | Activa el intervalo anterior. |
| **Pedir confirmación antes de vender** | Activado | Muestra número de objetos, bruto y neto antes de publicar. |
| **Confirmación en dos pasos al vender** | Desactivado | Pide el código móvil de Steam Guard en ventas masivas. |
| **Alerta de bajada de precio** | Desactivado | Avisa cuando un objeto baja de su mediana reciente. |

> **Los precios siempre coinciden con Steam.** En las columnas de la lista no hay conversión
> de moneda ni descuento de comisión. La cantidad mostrada es exactamente la de la página
> del mercado de Steam. El neto (lo que llega a tu monedero tras la comisión) se muestra
> aparte en el flujo de venta.

---

## Inventario

| Ajuste | Predeterminado | Qué hace |
|---|---|---|
| **Ordenación predeterminada** | Por valor | Por qué columna se ordena la tabla al abrir. |
| **Acción al hacer doble clic** | Abrir detalles | Qué hace el doble clic. "Vender al instante" omite la confirmación: cuidado. |
| **Umbral de valor bajo** | 1 | Los objetos por debajo se atenúan para que destaquen en la selección masiva. |
| **Ocultar objetos no vendibles** | Desactivado | Quita cupones, regalos y objetos no intercambiables. |
| **Ocultar objetos vendidos** | Activado | Los objetos publicados pasan a Pendiente para que no los publiques dos veces. |
| **Agrupar por juego** | Desactivado | Se abre con la agrupación activada. |
| **Filas compactas** | Desactivado | Altura de fila de 60 a 40 píxeles. |

---

## Impulsor de horas

| Ajuste | Predeterminado | Qué hace |
|---|---|---|
| **Duración objetivo predeterminada** | 1 hora | Con qué duración se abre la pestaña. Sin límite dura hasta que la detengas. |
| **Máx. juegos a la vez** | 32 | El límite conocido. Steam no cuenta el tiempo de los que lo superen. |
| **Intervalo de inicio de juegos** | 5 s | Los juegos arrancan uno a uno con este espaciado en lugar de todos a la vez. |
| **Recordar la lista de juegos** | Activado | Tu selección estará lista en el próximo arranque. |
| **Detener automáticamente al acabar el tiempo** | Activado | Desactivado mantiene los juegos abiertos pasado el objetivo. |
| **Mezclar el orden de los juegos** | Desactivado | Orden distinto cada sesión, repartiendo las horas de forma equilibrada. |
| **Pausar el farmeo mientras se impulsan horas** | Desactivado | Evita hacer trabajar los dos motores contra Steam a la vez. |

### Sincronización de horas

| Ajuste | Predeterminado | Qué hace |
|---|---|---|
| **Igualar tiempos de juego** | **Desactivado** | Iguala por etapas el tiempo total de los juegos seleccionados. Ver [Tutorial](./TUTORIAL.md#sincronización-de-horas). |
| **Objetivo** | El más alto de los seleccionados | O las horas introducidas manualmente, o el más alto de toda la biblioteca. |
| **Horas objetivo manuales** | 100 | Solo se usa cuando el objetivo es "Horas introducidas manualmente". |

---

## Logros

| Ajuste | Predeterminado | Qué hace |
|---|---|---|
| **Intervalo de desbloqueo** | 1 segundo | Espera entre dos desbloqueos. El retardo real varía aleatoriamente en torno a ese valor (±40 %) para que no se forme un ritmo fijo. Las opciones largas llegan a 90 minutos. |
| **Ordenación predeterminada** | Predeterminada | Ordenar por rareza pone primero los menos desbloqueados. |
| **Modo seguro** | Activado | Desbloquea de uno en uno usando el intervalo. Déjalo activado. |
| **Repartir los desbloqueos en el tiempo** | Desactivado | Aleatoriedad mucho mayor: parece natural, tarda bastante más. |
| **Pedir confirmación en cambios individuales** | Activado | Desactivado permite alternar al instante con doble clic. |
| **Marqué "no volver a preguntar"** | Desactivado | Aparece aquí si desactivaste el diálogo de confirmación. Desactívalo para recuperarlo. |

> Desbloquear logros cambia tu cuenta de Steam de forma permanente. Volver a bloquearlos es
> posible, pero la fecha original de desbloqueo no se puede restaurar.

---

## Notificaciones

| Ajuste | Predeterminado | Qué hace |
|---|---|---|
| **Mostrar notificaciones de escritorio** | Activado | Interruptor principal. Desactivado silencia todo lo de abajo; los registros internos continúan. |
| **Farmeo iniciado / detenido** | Activado | Incluye el número de cromos. |
| **Impulso de horas iniciado / detenido** | Activado | Inicio, objetivo alcanzado y parada. |
| **Cuando se desbloquea un logro** | Activado | |
| **Cuando ocurre un error** | Activado | Caídas de conexión, inicios rechazados, fallos de venta. No se recomienda desactivarlo. |
| **Sonido de notificación** | Campanilla | 23 sonidos, todos generados en la app: sin archivos, sin problemas de licencia. Al elegir uno, suena. |
| **Horas de silencio** | Desactivado | Sin notificaciones en el intervalo que definas, errores incluidos. |

### Chat de Steam

| Ajuste | Predeterminado | Qué hace |
|---|---|---|
| **Avisarme al recibir mensajes** | Activado | Los amigos que te escriban por Steam te alcanzan aunque la app esté en segundo plano. |
| **Enviar respuesta automática** | Desactivado | Responde automáticamente a quien te escriba. |
| **Texto de la respuesta automática** | *(un breve mensaje de ausencia)* | Déjalo vacío para desactivarlo. |
| **Espera antes de responder de nuevo** | 1 hora | Evita hacer spam a quien escribe varias veces. |

---

## Privacidad y seguridad

| Ajuste | Predeterminado | Qué hace |
|---|---|---|
| **Aparecer sin conexión** | Desactivado | Tus amigos no te ven jugando; la actividad no se publica en tu perfil. |
| **Ocultar el nombre del juego** | Desactivado | Apareces en línea, pero no se ve a qué juegas. |
| **Tiempo de espera de sesión** | Nunca | Cierra la sesión tras ese tiempo de inactividad. El farmeo o el impulso activos reinician el contador. |
| **Confirmación en dos pasos al vender** | Desactivado | Código de Steam Guard para ventas masivas. Protege tu inventario si roban la cuenta. |

---

## Estadísticas

Totales acumulados: tiempo de ejecución, cromos obtenidos, cromos vendidos, tiempo de
impulso, mejor día, venta media y desde cuándo se registra. **Restablecer estadísticas** las
borra.

> El XP y el número de insignias no se registran: Steam no los expone al acceso headless.
> Los datos de cromos, ventas y tiempo son medidas reales.

---

## Avanzado y datos

| Ajuste | Predeterminado | Qué hace |
|---|---|---|
| **Nivel de registro** | Solo errores | El nivel detallado aumenta bastante el uso de disco. Úsalo solo al depurar. |
| **Guardar registros de depuración** | Desactivado | Escribe todo el tráfico del protocolo en `cache/steamedge.log`. Adjúntalo a los informes. |
| **Aceleración por hardware** | Activado | Desactivarla reduce el proceso gráfico y bajó el uso de memoria unos 45 MB en nuestras mediciones, a cambio de dibujar en la CPU. Desactívala y reinicia también si ves fallos gráficos o bloqueos. |
| **Memoria en uso** | - | Suma de todos los procesos de SteamEdge con desglose por proceso. Leída de las métricas, no estimada. |
| **Intervalo entre peticiones API** | 350 ms | Espacio mínimo entre peticiones a Steam. Por debajo de 350 ms hay riesgo de límite temporal. |
| **Abrir carpeta de datos** | - | Abre la carpeta que contiene `settings/` y `cache/`. |
| **Vaciar caché de precios** | - | Fuerza a obtener todos los precios de nuevo. |

---

## Tarjeta de cuenta

El panel a la derecha de Ajustes. Nivel de Steam, estado de conexion y todos los formatos
de identidad de la cuenta conectada: **SteamID** (la de 17 digitos), **SteamID2**
(`STEAM_1:...`), **SteamID3** (`[U:1:...]`), **numero de cuenta**, **hex** y la **direccion
personalizada** si el perfil la tiene. Haz clic en cualquier fila para copiarla. Todos se
calculan localmente a partir de la SteamID - no se pregunta nada a Steam - salvo la
direccion personalizada, que se lee de la pagina del perfil.

**Copiar identidades** las pone todas en el portapapeles; **Abrir perfil** abre el perfil
en el navegador.

---

## Actualizaciones

SteamEdge consulta la lista de versiones **una vez al iniciar** y muestra una ventana
**solo** si existe una version mas nueva. Si estas al dia, no aparece nada.

El boton de descarga de la barra superior, entre la campana y el engranaje, repite la
comprobacion cuando quieras; ahi siempre se te da el resultado, incluido "ya estas al dia".

La aplicacion lee un numero de version y nada mas. Nunca se descarga, instala ni se
reemplaza a si misma: tu decides que instalar y cuando. Para actualizar: extrae el nuevo
archivo en una carpeta **vacia y nueva** y copia junto a ella tu carpeta `settings/`.

---

## Acerca de

Versión, créditos y enlaces a los proyectos que inspiraron SteamEdge. **No se tomó código de
ninguno de ellos**: ver [README](./README.md#créditos).

---

## Punto de partida recomendado

Si solo quieres que funcione sin pensarlo:

- Farmeo: modo **Rápido**, máx. juegos **10**
- Logros: **modo seguro activado**, intervalo **1 segundo**
- Mercado: **pedir confirmación antes de vender activado**
- Privacidad: **aparecer sin conexión activado** si tienes amigos que lo notarían
- Notificaciones: **horas de silencio activadas** para tus horas de sueño

---

Dudas sobre seguridad, baneos o errores: [FAQ](./FAQ.md).
