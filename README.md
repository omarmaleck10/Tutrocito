# Tutrocito Flipbook

## Estructura
```
index.html    ← página principal
style.css     ← estilos
flipbook.js   ← motor de animación + hotspots
pages/        ← 52 imágenes (00.jpg … 51.jpg)
catalogo.pdf  ← añadir manualmente (ver abajo)
```

## Deploy en Vercel

1. Descomprime el ZIP y añade `catalogo.pdf` en la raíz
2. Sube a GitHub (repo nuevo)
3. vercel.com → New Project → Import → Framework: Other → Deploy

Si el PDF (93MB) supera el límite de GitHub, alójalo aparte y cambia
en index.html:  href="catalogo.pdf"  →  href="https://tu-url/catalogo.pdf"

## Controles
- Arrastra la esquina del libro para pasar página
- Desliza (móvil) · Flechas ← → · Botones laterales
- Doble clic para ampliar · + / − para zoom
