// ============================================================================
// Configuración del Panel de recursos — Criza Grupo
// ----------------------------------------------------------------------------
// Estos valores NO son secretos:
//  - SUPABASE_URL: la dirección pública del proyecto Supabase.
//  - SUPABASE_ANON_KEY: la clave "anon" (pública, pensada para el navegador). El
//    acceso real lo controla la sesión de cada usuario (Supabase Auth) y las
//    políticas de la base de datos, no esta clave.
//
// PARA PONER EL PANEL EN PRODUCCIÓN:
//  1. En Supabase Studio → Project Settings → API, copia la clave "anon public".
//  2. Pégala abajo en SUPABASE_ANON_KEY (entre las comillas).
//  Ver README.md → "Puesta en marcha".
//
// La clave "service_role" (secreta) NUNCA va aquí: vive solo dentro de n8n.
// ============================================================================

window.PANEL_CONFIG = {
  // Proyecto Supabase de Criza (público, ya documentado en DATA/integraciones/supabase.md)
  SUPABASE_URL: 'https://devsupabase.crizagrupo.com',

  // Clave anon (pública). Pégala aquí. Mientras esté vacía, el login no funcionará.
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.6LgCIDMk3-TEI1wIu0eI0EA7rOOLM0kkY3I832gWJUc',

  // Base de los webhooks de n8n (módulo recursos-n8n)
  N8N_BASE: 'https://devn8n.crizagrupo.com/webhook',

  // Tamaño máximo (en MB) de un fichero de tipo "descarga". El panel avisa y bloquea
  // el envío si se supera. El fichero viaja como base64 dentro de un JSON (infla ~33 %)
  // y n8n limita cada petición (~16 MB por defecto), así que 10 MB deja margen seguro.
  // Ajusta este número aquí, sin tocar app.js. NO es una clave ni un secreto.
  MAX_FICHERO_MB: 10
};
