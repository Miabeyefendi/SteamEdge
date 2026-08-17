# Instalación

[English](../en/SETUP.md) · [Türkçe](../tr/SETUP.md) · [Deutsch](../de/SETUP.md) · [Español](../es/SETUP.md) · [繁體中文](../zh/SETUP.md)

Poner SteamEdge en marcha lleva unos dos minutos. No hay instalador y no se escribe nada en
el registro de Windows.

---

## 1. Descargar

Ve a [Releases](https://github.com/Miabeyefendi/steamedge/releases/latest) y descarga
`SteamEdge-vX.Y.Z-win-x64.rar`.

## 2. Extraer

Clic derecho en el zip → **Extraer todo**. Coloca la carpeta donde tengas permiso de
escritura:

- Bien: `Escritorio`, `Documentos`, `D:\Apps\SteamEdge`, una memoria USB
- Evita: `C:\Archivos de programa` (Windows bloquea la escritura ahí, así que los ajustes
  irían a tu carpeta AppData en lugar de quedarse junto a la app)

Obtendrás:

```
SteamEdge/
  SteamEdge.exe        la aplicación
  settings/            se crea al primer arranque: ajustes, cuentas, sesión, estadísticas
  cache/               se crea al primer arranque: caché de precios y archivo de registro
  resources/           archivos propios de la app, no tocar
  README.txt           nota breve para el usuario
```

## 3. Primer arranque

Doble clic en `SteamEdge.exe`.

Windows SmartScreen puede mostrar **"Windows protegió su PC"**. Ocurre porque el ejecutable
no está firmado digitalmente: un certificado cuesta varios cientos de dólares al año, algo
que un proyecto gratuito de aficionado no tiene. Haz clic en **Más información → Ejecutar de
todas formas**.

Si prefieres no confiar en un binario de un desconocido, es una postura perfectamente
razonable: [compílalo tú mismo](#compilarlo-tú-mismo).

## 4. Iniciar sesión

Tienes dos opciones.

### Opción A - Código QR (recomendada)

1. Abre la **app móvil de Steam** en tu teléfono.
2. Menú → **Steam Guard** → icono del escáner QR.
3. Escanea el código que muestra SteamEdge.
4. Aprueba el inicio de sesión en el teléfono.

Tu contraseña no se escribe en ningún sitio. Es la opción más segura.

### Opción B - Usuario y contraseña

1. Escribe tu usuario y contraseña de Steam.
2. Introduce el código de Steam Guard cuando se te pida (de la app móvil o de tu correo).

Tu contraseña se usa una sola vez para obtener un token y **no se guarda**. Lo que se guarda
es el token de actualización que emite Steam, en `settings/session.json`.

> **Protege la carpeta `settings/`.** Cualquiera que la copie puede iniciar sesión como tú.
> No la subas, no la pongas en carpetas compartidas, no la adjuntes a un informe de error.

## 5. Opcional - archivo del autenticador móvil (maFile)

Tras iniciar sesión, SteamEdge puede generar un maFile. Eso le permite introducir códigos de
Steam Guard automáticamente, lo que importa si quieres que las ventas masivas se confirmen
sin aprobar cada una en el teléfono.

Puedes omitirlo. Pulsa **Omitir (continuar sin maFile)** y todo salvo la confirmación
automática seguirá funcionando.

Si ya tienes un maFile de otra herramienta, usa **Importar maFile**.

## 6. Añadir más cuentas

SteamEdge farmea varias cuentas al mismo tiempo.

1. Haz clic en tu avatar arriba a la derecha → **Añadir cuenta**.
2. Inicia sesión con la segunda cuenta (QR o contraseña).
3. Ahora ambas cuentas farmean en paralelo en segundo plano.

Desde ese mismo menú eliges qué cuenta muestra la ventana. Las demás siguen trabajando
mientras miras una.

## Dónde están tus datos

| Ruta | Contenido | ¿Se puede borrar? |
|---|---|---|
| `settings/settings.json` | Todas tus preferencias | Sí, vuelve a los valores por defecto |
| `settings/session.json` | Tu token de inicio de sesión | Sí, se cerrará tu sesión |
| `settings/accounts.json` | Lista de cuentas guardadas | Sí, tendrás que iniciar sesión otra vez |
| `settings/stats.json` | Totales acumulados | Sí, solo pierdes el histórico |
| `settings/state.json` | Orden de la cola, registro de logros | Sí |
| `cache/prices.json` | Caché de precios del mercado | Sí, los precios se vuelven a obtener |
| `cache/steamedge.log` | Registro de diagnóstico | Sí |
| `cache/chromium/` | Caché de la interfaz | Sí |

**Copias de seguridad:** Ajustes → General → Copia de seguridad → **Exportar**. Escribe un
único `.json` con tus preferencias y estadísticas. Los tokens de sesión y las cuentas
guardadas quedan **excluidos** deliberadamente, así que el archivo es seguro para guardarlo
en la nube.

## Pasar a otro ordenador

Copia la carpeta entera. Tus ajustes, cuentas y sesión van contigo. Puede que Steam te pida
confirmar el nuevo dispositivo desde el teléfono.

## Desinstalar

Borra la carpeta. Eso es todo: sin claves de registro, sin archivos sueltos en otros sitios.

## Compilarlo tú mismo

Si prefieres no ejecutar un binario descargado:

```bash
git clone https://github.com/Miabeyefendi/steamedge.git
cd SteamEdge
npm install
npm start
```

Requiere [Node.js](https://nodejs.org/) 20 o superior. Para generar tu propia versión
portable:

```bash
npm run build
```

El resultado aparece en `../SteamEdge-vX.Y.Z-win-x64`, junto a la carpeta del código fuente.

---

Siguiente: [Tutorial](./TUTORIAL.md) - farmea tus primeros cromos.
