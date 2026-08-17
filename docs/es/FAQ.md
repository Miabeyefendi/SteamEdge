# FAQ

[English](../en/FAQ.md) · [Türkçe](../tr/FAQ.md) · [Deutsch](../de/FAQ.md) · [Español](../es/FAQ.md) · [繁體中文](../zh/FAQ.md)

---

## Seguridad y baneos

### ¿Me van a banear?

Nadie puede prometerte que no. Esto es lo que realmente ocurre, para que decidas tú.

**Qué hace SteamEdge:** envía el mismo mensaje `ClientGamesPlayed` que envía el cliente
oficial de Steam cuando lanzas un juego. Steam ve un juego en ejecución y suelta cromos con
normalidad. Ese es todo el mecanismo.

**Qué no hace:** no modifica archivos de juego, no se inyecta en ningún proceso, no usa la
clave de la API web de Steam, no toca a otros jugadores, no intercambia ni regala en tu
nombre, y no interactúa en modo alguno con juegos protegidos por VAC.

**El riesgo honesto:** automatizar tu cuenta va contra el
[Acuerdo de Suscriptor de Steam](https://store.steampowered.com/subscriber_agreement/).
Herramientas así existen desde hace más de una década y no ha habido baneos masivos por
farmear cromos, pero "no ha pasado" no es "no puede pasar". Valve puede cambiar de política
cuando quiera. Ese riesgo lo asumes tú.

### ¿Interviene VAC?

No. Los baneos de VAC se aplican por hacer trampas en un proceso de juego en ejecución.
SteamEdge nunca lanza un juego, así que no hay proceso que VAC pueda inspeccionar.

### ¿Qué mete a la gente en problemas de verdad?

No el farmeo en sí. Lo que llama la atención:

- **Desbloquear cientos de logros en minutos.** Es público en tu perfil y los sitios de
  terceros lo registran. Usa el modo seguro y un intervalo real.
- **Abuso de intercambios y mercado**: no es algo que haga esta app, pero quien automatiza
  el farmeo a menudo automatiza otras cosas.
- **Compartir la carpeta `settings/`.** Ahí está tu token de inicio de sesión. Quien la
  tenga, eres tú.

### ¿Se guarda mi contraseña?

No. Con el inicio por QR nunca escribes la contraseña. Con contraseña se usa una vez para
obtener un token y luego se descarta. Lo que se guarda es el token de actualización que
emite Steam, en `settings/session.json`.

Trata `settings/` como una contraseña: no la subas, no la pongas en carpetas compartidas, no
la adjuntes a un informe de error.

---

## Problemas frecuentes

### Windows dice "Windows protegió su PC"

El ejecutable no está firmado. Un certificado cuesta varios cientos de dólares al año, algo
que un proyecto gratuito de aficionado no tiene. Pulsa **Más información → Ejecutar de todas
formas**, o [compílalo tú mismo](./SETUP.md#compilarlo-tú-mismo).

### Aparece "SteamEdge ya está abierto" y la app se cierra

Solo puede ejecutarse una copia a la vez. Si corrieran dos, Steam descartaría la primera
sesión (`LogonSessionReplaced`) y las páginas mostrarían "Sin conexión". Cierra la ventana
abierta y vuelve a empezar.

### Logros o Inventario muestran "Sin conexión"

Otra sesión tomó el control. Normalmente significa que el cliente de Steam está abierto con
la misma cuenta, o que hay otra copia de SteamEdge en marcha. Cierra la otra y pulsa
**Reintentar**.

### "Límite de peticiones de Steam" en los cuadros del mercado

Steam permite unas 20 peticiones al mercado cada 30 segundos por cuenta. SteamEdge encola
todo por una única puerta para que las peticiones nunca se solapen, pero aun así puedes
llegar al límite si abres muchos detalles de objetos seguidos.

Espera un minuto y pulsa **Reintentar**. Para evitarlo, filtra primero y usa **Obtener
precios** en vez de cargar todo el inventario.

### Los precios parecen incorrectos

Los precios se obtienen en la moneda de tu monedero de Steam, se leen del Mercado de la
Comunidad y se muestran exactamente en esa moneda. No hay conversión.

Si una cifra parece rara, mira qué cuadro estás leyendo:

- **Ofertas actuales** es lo que piden los vendedores, y puede ser absurdo: alguien puede
  publicar un objeto a 999.999 $.
- **Ventas completadas** es a cuánto se vendió de verdad. Ese es el valor real.

### No caen cromos

Comprueba, en orden:

1. **¿Al juego le quedan cromos?** Pulsa Actualizar lista de juegos.
2. **¿El juego supera las 2 horas?** Steam no suelta cromos antes. El modo Rápido lo
   gestiona automáticamente.
3. **¿La cuenta es elegible?** Steam exige al menos una compra de 5 $ en la cuenta antes de
   poder recibir cromos.
4. **¿Interfiere otra sesión de Steam?** Cierra el cliente de Steam.

### La app usa mucha memoria

Es Electron: se ejecuta como varios procesos, por eso el Administrador de tareas muestra
varias filas de SteamEdge. Ajustes → Avanzado → **Memoria en uso** los suma por ti y
muestra cuanto ocupa cada uno. En nuestra maquina una sesion tipica ronda los 200-240 MB.

Dos cosas lo reducen:

- **Desactivar la aceleracion por hardware** (Ajustes → Avanzado). El proceso grafico se
  encoge; en nuestra medicion el total paso de 212 MB a 163 MB. El dibujado pasa a la CPU.
- **Farmear en segundo plano** (Farmeo de cromos → Automatizacion). Con la ventana oculta,
  la lista de la pestana abierta se libera de la memoria y se redibuja al volver.

Las listas de las pestanas que no estas mirando ya se liberan solas, y el redibujado se
detiene por completo mientras la ventana esta oculta.

### ¿Cómo actualizo?

SteamEdge consulta la lista de versiones una vez al iniciar y solo muestra una ventana si
existe una version mas nueva; si estas al dia, se queda callado. El boton de descarga de la
barra superior repite la comprobacion cuando quieras.

La aplicacion nunca se actualiza sola. Descarga el nuevo archivo desde la pagina de
versiones, extraelo en una carpeta **vacia y nueva** y copia tu carpeta `settings/` junto al
nuevo `SteamEdge.exe`. Tus ajustes, cuentas guardadas y sesion van contigo.

Extraer una version nueva **encima** de la carpeta antigua es lo unico que debes evitar:
los archivos en uso se omiten, acabas con una mezcla de dos versiones y la aplicacion se
niega a arrancar.

### ¿Dónde están mis archivos?

Junto a `SteamEdge.exe`, en `settings/` y `cache/`. Ajustes → Avanzado → **Abrir carpeta de
datos** te lleva allí.

Si extrajiste la app en `C:\Archivos de programa`, Windows bloquea la escritura y la app
recurre a tu carpeta AppData. Mueve la carpeta a un sitio con permiso de escritura para
recuperar la disposición portable.

---

## Funciones

### ¿Puedo usar varias cuentas a la vez?

Sí. Menú del avatar → **Añadir cuenta**. Todas las cuentas conectadas farmean en paralelo en
segundo plano; la ventana muestra la que elijas.

### ¿El impulso de horas funciona de verdad?

Sí: Steam cuenta el tiempo de juego de cada juego abierto a la vez, hasta un límite conocido
de 32. El límite lo aplican los servidores de Steam, no esta app.

### ¿Qué es la sincronización de horas?

Iguala por etapas el tiempo total de varios juegos. Ver
[Tutorial](./TUTORIAL.md#sincronización-de-horas).

### ¿Puedo volver a bloquear un logro?

Sí. Aunque la fecha original de desbloqueo se pierde de forma permanente.

### ¿Funciona sin la app móvil de Steam?

Sí, pero tendrás que introducir los códigos de Steam Guard a mano, y las publicaciones
masivas en el mercado necesitarán confirmarse según la configuración de tu cuenta.

### ¿Linux / macOS?

Por ahora solo se compila para Windows. El código es Electron puro sin dependencias
específicas de Windows, así que `npm run build -- --platform=linux` probablemente genere una
versión funcional, pero no está probada ni soportada.

---

## Proyecto

### ¿Es un fork de Idle Master / ASF?

No. Se escribió desde cero. Esos proyectos se estudiaron para entender cómo funciona Steam;
no se copió código. Créditos completos en el [README](./README.md#créditos).

### ¿Por qué AGPL-3.0?

Para que quien lo redistribuya, o ejecute una versión modificada como servicio, tenga que
mantener el código abierto. Si quieres usarlo en un producto cerrado, contacta con el autor
para una licencia comercial.

### ¿Cómo informo de un error?

Abre una incidencia con:

1. Qué hiciste, qué esperabas y qué pasó.
2. Tu versión de SteamEdge (Ajustes → Acerca de).
3. Tu versión de Windows.
4. El registro: Ajustes → Avanzado → activa **Guardar registros de depuración**, reproduce
   el problema y adjunta `cache/steamedge.log`.

**Nunca adjuntes `settings/session.json` ni `settings/accounts.json`.** Contienen tu token de
inicio de sesión.

Para vulnerabilidades de seguridad, sigue [SECURITY.md](../../SECURITY.md) en lugar de abrir
una incidencia pública.

### ¿Cómo puedo ayudar?

Traducciones, informes de errores y pull requests son bienvenidos: ver
[CONTRIBUTING.md](../../CONTRIBUTING.md). El diccionario de la interfaz está en
`src/main/js/i18n.js`; añadir un idioma es añadir una columna.
