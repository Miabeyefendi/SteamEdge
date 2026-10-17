[← Volver al README](../../README.md)

# ⚙️ Configuración

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
