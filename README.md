# Tutrocito Flipbook

## Estructura del proyecto
```
index.html       ← página principal
style.css        ← estilos
flipbook.js      ← motor de animación
pages/           ← 52 imágenes (00.jpg … 51.jpg)
catalogo.pdf     ← PDF original (añadir manualmente, ver abajo)
```

## Deploy en Vercel (pasos exactos)

1. Descomprime este ZIP
2. Añade el archivo `catalogo.pdf` en la carpeta raíz
3. Crea un repo en GitHub y sube todos los archivos
4. Ve a vercel.com → New Project → Import el repo
5. Framework: **Other** (HTML estático, sin framework)
6. Root directory: `/`  — Build command: vacío — Output: vacío
7. Deploy ✓

El PDF es grande (93MB). Si GitHub rechaza el archivo grande,
usa Git LFS o alójalo en otro sitio y cambia el href en index.html:
  href="https://tu-url/catalogo.pdf"

## Controles
- Flechas ← → o botones laterales para navegar
- Arrastra desde la esquina del libro para pasar página
- Desliza (móvil) para navegar
- Doble clic en una página para ampliarla
- Botones + / − para zoom
