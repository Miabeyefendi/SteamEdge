[← Volver al README](../../README.md)

# ✨ Lo esencial

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
- **Navegación rápida** - Ctrl+K abre una paleta de comandos que encuentra páginas, ajustes, cuentas y las acciones de la página abierta mientras escribes; Ctrl+1 a Ctrl+9 abren páginas por número, ? lista los atajos, y los ajustes tienen su propio cuadro de búsqueda y marcan las secciones que cambiaste y guardaste.
- **Sin cliente de Steam** - Habla el protocolo de red propio de Steam. El cliente nunca se abre y no hace falta.
- **Portátil** - Extraer y ejecutar. Sin instalador, sin registro, todo vive junto al ejecutable.

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
