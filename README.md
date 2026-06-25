# Web de recursos — Criza Grupo

Landing donde una persona deja nombre y email y entra al instante a la biblioteca
de contenido (descargas + enlaces). Pensada para enviar a quien comenta en redes.

Publicación prevista: **recursos.crizagrupo.com**.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `index.html` | Landing con el formulario de acceso. |
| `biblioteca.html` | La biblioteca: muestra los recursos agrupados por categoría. |
| `aios-by-criza.html` | Página del producto AIOS by Criza: guía de instalación/uso en desplegables y descarga del `.zip`. |
| `recursos.js` | **El catálogo. Esto es lo que editas tú** para añadir o quitar recursos. |
| `estilos.css` | Diseño (marca Criza). No hace falta tocarlo. |
| `app.js` | Lógica (validación, acceso, render). No hace falta tocarlo. |
| `archivos/` | Carpeta para los PDFs/plantillas/zip descargables (incluye `AIOS-by-Criza.zip`). |

## Verla en local

Abre `index.html` con doble clic en el navegador. Rellena el formulario y te
lleva a la biblioteca.

## Añadir un recurso

Abre `recursos.js` y copia un bloque dentro de los corchetes:

```js
{
  titulo: "Nombre del recurso",
  descripcion: "Una frase explicando qué es.",
  categoria: "Guías descargables",      // las que compartan texto se agrupan juntas
  tipo: "descarga",                      // 'descarga' (archivo), 'enlace' (web) o 'pagina' (otra página de esta web)
  url: "archivos/mi-guia.pdf",           // archivo en /archivos, enlace https://... o página interna .html
  destacado: false                       // (opcional) true → tarjeta grande arriba del todo
}
```

- **Descarga:** sube el archivo a la carpeta `archivos/` y pon `tipo: "descarga"`
  con `url: "archivos/nombre-del-archivo.pdf"`.
- **Enlace** (YouTube, Drive, Notion…): pon `tipo: "enlace"` y el enlace completo
  en `url`.
- **Página** (una guía propia dentro de esta web): pon `tipo: "pagina"` y el nombre
  del HTML en `url` (ej. `aios-by-criza.html`). El botón pasa a "Ver guía".
- **Destacado:** añade `destacado: true` para mostrarlo como tarjeta grande arriba
  del todo (así aparece AIOS by Criza).

Guarda y recarga `biblioteca.html`: el recurso aparece solo.

## Backend (flujo de leads) — CONECTADO

Cada registro del formulario viaja al workflow de n8n **WEB-RECURSOS · Captura de
leads** (`WEBHOOK_URL` en `app.js`, webhook `https://devn8n.crizagrupo.com/webhook/recursos-lead`).
El flujo: valida → guarda el lead en Supabase (tabla `public.leads`, nodo Supabase
nativo) → crea/actualiza el contacto en GoHighLevel con la etiqueta `recursos` →
guarda el `ghl_contact_id`. Copia versionada del workflow en
`AUTOMATION/n8n/web-recursos-leads.json`.

## Pendiente (siguientes pasos, fuera de esta web)

1. **Email de bienvenida.** El nodo está creado pero **desactivado** (falta decidir
   proveedor de email). Al activarlo, enviará el enlace de acceso a la biblioteca.
2. **Publicar** en Vercel/Netlify y apuntar el subdominio `recursos.crizagrupo.com`
   (registro CNAME en Cloudflare).

## Nota

La biblioteca lleva `noindex` para que no aparezca en Google, pero el acceso es
"blando": quien tenga el enlace directo puede entrar sin formulario. Es lo normal
en un recurso gratuito de captación.
