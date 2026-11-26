# Historias 24h — versión con video

100 % cliente: HTML + CSS + JavaScript puro, sin dependencias ni build. Abre `index.html` (o sirve la carpeta con `python -m http.server`).

## Funciones
- Lista de historias arriba + botón **+** (foto o video).
- **Imágenes**: se reducen a máx. **1080×1920 px** y se guardan en **localStorage** como base64 (JPEG).
- **Videos**: cualquier resolución, sin recodificar. Se guardan como Blob en **IndexedDB** (localStorage solo admite ~5 MB), y en localStorage queda el registro + miniatura. El tamaño máximo lo define el espacio que el navegador concede al sitio (se muestra abajo en la página).
- **Borrado automático a las 24 h** (imagen o video): al cargar, cada segundo y al volver a la pestaña; también con el visor abierto.
- Visor: barras de progreso (los videos duran lo que dura el video), **swipe**, toques laterales, flechas, mantener pulsado para pausar, botón de sonido, deslizar abajo / Esc para cerrar.
- Diseño responsivo con fondo degradado y paneles de cristal.

## Probar la expiración
Abre `index.html?ttl=15` → las historias duran 15 s. Sin el parámetro: 24 h reales.

## Notas
- Formatos de video: los que reproduzca tu navegador (MP4/H.264 y WebM funcionan en todos; algunos .mov/HEVC no en Chrome/Firefox).
- En modo incógnito el límite de almacenamiento es mucho menor.
