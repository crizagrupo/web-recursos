// ============================================================================
// CATÁLOGO DE RECURSOS — Biblioteca de contenido de Criza Grupo
// ----------------------------------------------------------------------------
// RESPALDO — YA NO es la fuente de verdad. La biblioteca carga los recursos
// desde n8n (webhook recursos-listar) y los recursos se gestionan desde el
// panel. Este fichero se conserva como copia de seguridad y referencia del
// formato; biblioteca.html ya no lo incluye.
//
// (Histórico) Para AÑADIR un recurso, copia un bloque { ... } y rellénalo.
//
// Campos de cada recurso:
//   titulo       Nombre que se ve en la tarjeta.
//   descripcion  Una frase explicando qué es.
//   categoria    Agrupa las tarjetas (las que compartan texto van juntas).
//   tipo         'descarga' (archivo que se baja), 'enlace' (web externa) o
//                'pagina' (abre otra página de esta misma web, ej. una guía).
//   url          Ruta del archivo (ej. 'archivos/guia.pdf'), enlace completo
//                (ej. 'https://youtu.be/...') o página interna ('aios-by-criza.html').
//   destacado    (opcional) true → se muestra como tarjeta grande arriba del todo.
// ============================================================================
window.RECURSOS = [
  {
    titulo: "AIOS by Criza",
    descripcion: "Nuestro producto: el sistema operativo de IA para tu negocio. Una capa sobre Claude Code que conoce tu empresa, gestiona tus proyectos y automatiza tu día a día. Incluye guía de instalación y descarga.",
    categoria: "Producto",
    tipo: "pagina",
    url: "aios-by-criza.html",
    destacado: true
  },
  {
    titulo: "Guía: 10 errores al empezar en redes",
    descripcion: "PDF con los fallos más comunes y cómo evitarlos desde el primer día.",
    categoria: "Guías descargables",
    tipo: "descarga",
    url: "archivos/guia-10-errores.pdf"
  },
  {
    titulo: "Plantilla de calendario de contenido",
    descripcion: "Hoja de cálculo para planificar tus publicaciones del mes.",
    categoria: "Plantillas",
    tipo: "descarga",
    url: "archivos/plantilla-calendario.xlsx"
  },
  {
    titulo: "Masterclass: enganchar en los 3 primeros segundos",
    descripcion: "Vídeo de 20 min sobre cómo escribir hooks que retienen.",
    categoria: "Formación en vídeo",
    tipo: "enlace",
    url: "https://www.youtube.com/"
  },
  {
    titulo: "Banco de ganchos (Notion)",
    descripcion: "Colección viva de aperturas que funcionan, ordenada por formato.",
    categoria: "Formación en vídeo",
    tipo: "enlace",
    url: "https://www.notion.so/"
  }
];
