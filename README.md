# Web de recursos — Criza Grupo

Landing donde una persona deja nombre y email y entra al instante a la biblioteca
de contenido (descargas + enlaces). Pensada para enviar a quien comenta en redes.

Publicada en: **recursos.crizagrupo.com** (proyecto Vercel `criza-web-recursos`).

## Este repo es solo para el despliegue

El desarrollo real (specs, backend n8n, panel admin, auditorías) vive en el
monorepo `AIOS-CRIZA-Loren`, carpeta `BUILD/web-recursos/`. Este repo
(`crizagrupo/web-recursos`) es una copia **solo con los archivos que se
publican** — se mantiene aparte a propósito para que Vercel pueda desplegar
directo desde su raíz, sin depender del resto del monorepo.

**Flujo de actualización:** cuando cambie algo en `BUILD/web-recursos/` del
monorepo (y esté mergeado a `main`), hay que copiar los archivos actualizados
aquí y hacer push — eso dispara el redeploy automático en Vercel.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `index.html` | Landing con el formulario de acceso. |
| `biblioteca.html` | La biblioteca: carga los recursos en vivo desde n8n (`recursos-listar`), agrupados por categoría. |
| `aios-by-criza.html` | Página del producto AIOS by Criza: guía de instalación/uso y descarga del `.zip`. |
| `app.js` | Lógica: formulario de acceso, carga dinámica de la biblioteca y registro de descargas. |
| `recursos.js` | Respaldo del formato antiguo. Ya no es la fuente de verdad — los recursos se gestionan desde el panel interno. |
| `estilos.css` | Diseño (marca Criza). |
| `archivos/` | Ficheros descargables que no viven en Supabase Storage (ej. `AIOS-by-Criza.zip`). |

## Backend (n8n + Supabase)

La biblioteca y el formulario llaman a los webhooks de n8n en
`https://devn8n.crizagrupo.com/webhook/...`. El backend completo (5 workflows,
tablas Supabase, panel admin) está documentado en el monorepo
(`BUILD/web-recursos/README.md`, `AUTOMATION/n8n/`).

## Nota

La biblioteca lleva `noindex` para que no aparezca en Google, pero el acceso es
"blando": quien tenga el enlace directo puede entrar sin formulario. Es lo normal
en un recurso gratuito de captación.
