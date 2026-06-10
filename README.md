# Tutrocito Flipbook

## Estructura
```
index.html      ← página principal
flipbook.js     ← motor de animación
pages/          ← 52 imágenes JPG (00.jpg … 51.jpg)
catalogo.pdf    ← PDF original (súbelo tú aparte, ver abajo)
```

## Deploy en Vercel

1. Sube este repositorio a GitHub
2. Añade el archivo `catalogo.pdf` al repo (o en /public si usas Vercel CLI)
3. Conecta el repo en vercel.com → New Project → Import
4. Framework: **Other** (sin framework, es HTML estático)
5. Root directory: `/` (raíz)
6. Deploy ✓

## Botón de descarga del PDF
El botón "Descargar PDF" apunta a `catalogo.pdf` en la raíz.
Asegúrate de tener el archivo en el repositorio o ajusta la ruta en index.html.

## Notas
- Las imágenes se cargan de forma progresiva (fetch lazy)
- Las primeras 4 páginas se cargan al inicio, el resto en background
- Compatible con Chrome, Firefox, Safari, Edge — escritorio y móvil
