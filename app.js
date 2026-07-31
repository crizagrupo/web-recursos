// ============================================================================
// app.js — Lógica de la web de recursos de Criza Grupo
//   (1) Landing (index.html): valida el formulario, envía el lead al webhook
//       y redirige al instante a la biblioteca.
//   (2) Biblioteca (biblioteca.html): carga los recursos desde n8n
//       (webhook recursos-listar), los renderiza agrupados por categoría y
//       registra cada descarga a través del webhook recurso-descargar.
// ============================================================================

// --- Configuración -----------------------------------------------------------
// Pega aquí la URL del webhook de n8n cuando exista. Si está vacía, el
// formulario sigue funcionando (da acceso) pero no guarda el lead todavía.
var WEBHOOK_URL = "https://devn8n.crizagrupo.com/webhook/recursos-lead";

// Webhooks de la biblioteca dinámica (módulo recursos-n8n).
//   LISTAR_URL    → devuelve el catálogo publicado en JSON.
//   DESCARGAR_URL → registra el clic y redirige (302) al recurso.
var LISTAR_URL    = "https://devn8n.crizagrupo.com/webhook/recursos-listar";
var DESCARGAR_URL = "https://devn8n.crizagrupo.com/webhook/recurso-descargar";

// Clave de localStorage donde guardamos el nombre para personalizar la biblioteca.
var STORE_KEY = "criza_recursos_lead";

// --- Iconos (Lucide) ---------------------------------------------------------
function pintarIconos(){ if (window.lucide) lucide.createIcons(); }

// =============================================================================
// (1) LANDING — formulario de acceso
// =============================================================================
function initFormulario(){
  var form = document.getElementById("form-acceso");
  if (!form) return;

  var nombre  = document.getElementById("nombre");
  var email   = document.getElementById("email");
  var consent = document.getElementById("consent");
  var boton   = document.getElementById("btn-enviar");

  function mostrarError(campo, mensaje){
    var box = form.querySelector('[data-err-for="' + campo + '"]');
    if (box) box.textContent = mensaje || "";
    var input = document.getElementById(campo);
    if (input) input.classList.toggle("invalid", !!mensaje);
  }

  function emailValido(v){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function validar(){
    var ok = true;
    mostrarError("nombre", ""); mostrarError("email", ""); mostrarError("consent", "");
    if (!nombre.value.trim()){ mostrarError("nombre", "Escribe tu nombre."); ok = false; }
    if (!emailValido(email.value.trim())){ mostrarError("email", "Escribe un email válido."); ok = false; }
    if (!consent.checked){ mostrarError("consent", "Necesito tu permiso para darte acceso."); ok = false; }
    return ok;
  }

  // Quita el error en cuanto el usuario corrige.
  [nombre, email].forEach(function(inp){
    inp.addEventListener("input", function(){ mostrarError(inp.id, ""); });
  });
  consent.addEventListener("change", function(){ mostrarError("consent", ""); });

  form.addEventListener("submit", function(e){
    e.preventDefault();
    if (!validar()) return;

    var lead = {
      nombre: nombre.value.trim(),
      email: email.value.trim(),
      consentimiento: consent.checked,
      fuente: new URLSearchParams(window.location.search).get("fuente") || "directo",
      fecha: new Date().toISOString()
    };

    // Guarda el nombre para personalizar la biblioteca.
    try { localStorage.setItem(STORE_KEY, JSON.stringify(lead)); } catch (_){}

    // Envía al webhook si está configurado. No bloquea el acceso: el envío va
    // "en paralelo" y la redirección ocurre igualmente.
    if (WEBHOOK_URL){
      try {
        fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lead),
          keepalive: true
        }).catch(function(err){ console.warn("Webhook no disponible:", err); });
      } catch (err){ console.warn("Webhook no disponible:", err); }
    } else {
      console.info("WEBHOOK_URL vacío — lead no enviado (pendiente conectar n8n):", lead);
    }

    boton.setAttribute("disabled", "disabled");
    boton.textContent = "Entrando…";
    // Acceso inmediato.
    window.location.href = "biblioteca.html";
  });

  pintarIconos();
}

// =============================================================================
// (2) BIBLIOTECA — render de recursos
// =============================================================================
function escapar(s){
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function detectarFormato(r){
  var u = (r.url || "").toLowerCase();
  if (r.tipo === "pagina") return "producto";
  if (/\.pdf$/.test(u)) return "pdf";
  if (/\.(xlsx|xls|csv)$/.test(u)) return "xlsx";
  if (/youtube\.com|youtu\.be/.test(u)) return "video";
  if (/notion\.so/.test(u)) return "notion";
  return r.tipo === "enlace" ? "notion" : "pdf";
}

function mockupHTML(fmt){
  if (fmt === "pdf") return (
    '<div class="prev-pdf">' +
      '<div class="p-bar"><span></span><span></span><span></span></div>' +
      '<div class="p-h"></div>' +
      '<div class="p-l w95"></div><div class="p-l w80"></div><div class="p-l w88"></div>' +
      '<div class="p-l w65"></div><div class="p-l w92"></div><div class="p-l w75"></div>' +
    '</div>'
  );
  if (fmt === "xlsx") return (
    '<div class="prev-xlsx">' +
      '<div class="x-bar"><span>XLSX</span></div>' +
      '<div class="x-grid">' +
        '<div class="xc xch"></div><div class="xc xch">A</div><div class="xc xch">B</div><div class="xc xch">C</div>' +
        '<div class="xc xrh">1</div><div class="xc xhi"></div><div class="xc xhi"></div><div class="xc xhi"></div>' +
        '<div class="xc xrh">2</div><div class="xc"></div><div class="xc"></div><div class="xc"></div>' +
        '<div class="xc xrh">3</div><div class="xc"></div><div class="xc"></div><div class="xc"></div>' +
        '<div class="xc xrh">4</div><div class="xc"></div><div class="xc"></div><div class="xc"></div>' +
      '</div>' +
    '</div>'
  );
  if (fmt === "video") return '<div class="prev-video"><div class="play-ring"></div></div>';
  if (fmt === "producto") return (
    '<div class="prev-prod">' +
      '<div class="pp-mark">AIOS</div>' +
      '<div class="pp-sub">by Criza</div>' +
    '</div>'
  );
  return (
    '<div class="prev-notion">' +
      '<div class="n-ico">📎</div>' +
      '<div class="n-ttl"></div>' +
      '<div class="n-row"><div class="n-dot"></div><div class="n-ln l"></div></div>' +
      '<div class="n-row"><div class="n-dot"></div><div class="n-ln m"></div></div>' +
      '<div class="n-row"><div class="n-dot"></div><div class="n-ln s"></div></div>' +
      '<div class="n-row"><div class="n-dot"></div><div class="n-ln m"></div></div>' +
    '</div>'
  );
}

// Devuelve {icono, texto, attrs} del botón según el tipo de recurso.
function accionRecurso(r){
  if (r.tipo === "pagina")  return { icono: "arrow-right",   texto: "Ver guía",   attrs: "" };
  if (r.tipo === "enlace")  return { icono: "external-link", texto: "Abrir",      attrs: 'target="_blank" rel="noopener"' };
  return                           { icono: "download",      texto: "Descargar",  attrs: "download" };
}

// Email guardado en localStorage al pasar por la landing. Vacío si no existe (R5).
function emailGuardado(){
  try {
    var lead = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    return (lead && lead.email) ? lead.email : "";
  } catch (_){ return ""; }
}

// Construye el enlace del botón: siempre pasa por recurso-descargar para que el
// clic quede registrado. n8n redirige (302) al fichero, enlace o página según el
// tipo del recurso. Sirve para descarga, enlace y pagina (R3, R4, R5).
function urlDescarga(r){
  var params = new URLSearchParams();
  params.set("id", r.id == null ? "" : r.id);
  params.set("email", emailGuardado());
  params.set("fuente", "biblioteca");
  return DESCARGAR_URL + "?" + params.toString();
}

function tarjetaRecurso(r){
  var a = accionRecurso(r);
  return '' +
    '<article class="res-h">' +
      '<div class="res-prev">' + mockupHTML(detectarFormato(r)) + '</div>' +
      '<div class="res-body">' +
        '<h3>' + escapar(r.titulo) + '</h3>' +
        '<p>' + escapar(r.descripcion) + '</p>' +
        '<div class="foot">' +
          '<a class="btn btn-primary sm" href="' + escapar(urlDescarga(r)) + '" ' + a.attrs + '>' +
            escapar(a.texto) + ' <i data-lucide="' + a.icono + '"></i>' +
          '</a>' +
        '</div>' +
      '</div>' +
    '</article>';
}

// Tarjeta grande para el recurso principal (destacado).
function tarjetaDestacada(r){
  var a = accionRecurso(r);
  return '' +
    '<article class="res-feat">' +
      '<div class="feat-prev">' + mockupHTML(detectarFormato(r)) + '</div>' +
      '<div class="feat-body">' +
        '<span class="feat-badge"><i data-lucide="box"></i> Producto destacado</span>' +
        '<h3>' + escapar(r.titulo) + '</h3>' +
        '<p>' + escapar(r.descripcion) + '</p>' +
        '<a class="btn btn-primary" href="' + escapar(urlDescarga(r)) + '" ' + a.attrs + '>' +
          escapar(a.texto) + ' <i data-lucide="' + a.icono + '"></i>' +
        '</a>' +
      '</div>' +
    '</article>';
}

// Pinta el catálogo ya cargado: destacados arriba, el resto agrupado por
// categoría. Mismo HTML de siempre (tarjetas, mockups). (R1)
function renderRecursos(cont, recursos){
  // Separa los recursos destacados: van arriba del todo, como tarjeta grande.
  var destacados = recursos.filter(function(r){ return r.destacado; });
  var resto = recursos.filter(function(r){ return !r.destacado; });

  var html = destacados.length
    ? '<section class="featured">' + destacados.map(tarjetaDestacada).join("") + '</section>'
    : "";

  // Agrupa el resto por categoría conservando el orden de aparición.
  var orden = [];
  var grupos = {};
  resto.forEach(function(r){
    var cat = r.categoria || "Otros";
    if (!grupos[cat]){ grupos[cat] = []; orden.push(cat); }
    grupos[cat].push(r);
  });

  html += orden.map(function(cat){
    var tarjetas = grupos[cat].map(tarjetaRecurso).join("");
    return '' +
      '<section class="cat">' +
        '<h2 class="cat-title"><span class="bar"></span>' + escapar(cat) + '</h2>' +
        '<div class="grid">' + tarjetas + '</div>' +
      '</section>';
  }).join("");

  cont.innerHTML = html;
  pintarIconos();
}

// Carga los recursos desde n8n (recursos-listar) y los renderiza. Muestra un
// estado de carga y, si el fetch falla, un mensaje amable (R1, R2).
async function initBiblioteca(){
  var cont = document.getElementById("biblioteca");
  if (!cont) return;

  // Saludo personalizado si tenemos el nombre guardado.
  try {
    var lead = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (lead && lead.nombre){
      var saludo = document.getElementById("saludo");
      if (saludo) saludo.textContent = "Hola, " + lead.nombre;
    }
  } catch (_){}

  // Estado de carga.
  cont.innerHTML = '<div class="empty">Cargando recursos…</div>';

  // Pide el catálogo publicado al webhook. Si algo falla, mensaje amable (R2).
  var recursos;
  try {
    var resp = await fetch(LISTAR_URL, { headers: { "Accept": "application/json" } });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    var data = await resp.json();
    // Acepta tanto { ok, recursos:[...] } como un array suelto.
    recursos = (data && data.recursos) || (Array.isArray(data) ? data : []);
  } catch (err){
    console.warn("No se pudieron cargar los recursos:", err);
    cont.innerHTML = '<div class="empty">No se pudieron cargar los recursos ahora mismo. ' +
      'Recarga la página en unos minutos; si el problema continúa, escríbenos.</div>';
    return;
  }

  // El webhook manda 'destino'; el render existente lee 'url'. Mapeamos para
  // reutilizar detectarFormato / mockupHTML sin tocarlos.
  recursos = recursos.map(function(r){
    if (r.url == null && r.destino != null) r.url = r.destino;
    return r;
  });

  if (!recursos.length){
    cont.innerHTML = '<div class="empty">Aún no hay recursos publicados.</div>';
    return;
  }

  renderRecursos(cont, recursos);
}

// --- Arranque ----------------------------------------------------------------
document.addEventListener("DOMContentLoaded", function(){
  initFormulario();
  initBiblioteca();
});
