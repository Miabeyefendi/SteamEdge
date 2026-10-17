[← Volver al README](../../README.md)

# ❓ Preguntas frecuentes

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

Asegúrate de haber extraído la nueva versión en una carpeta nueva y vacía, copiando solo `settings/`; extraer encima de la carpeta antigua mezcla archivos de dos versiones. Mira primero la [sección de resolución de problemas](./TUTORIAL_ES.md#-resolución-de-problemas) de la guía, y luego el registro en `cache/steamedge.log`. Si sigue roto, abre un informe de error y adjunta ese registro.

</details>
