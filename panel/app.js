// ============================================================================
// Panel de recursos — Criza Grupo
// Login real con Supabase Auth + subida/edición/analítica vía webhooks de n8n.
// Configuración en config.js (window.PANEL_CONFIG). No hay datos de ejemplo.
// ============================================================================

var CFG = window.PANEL_CONFIG || {};
var URLS = {
  listar:      CFG.N8N_BASE + '/recursos-listar',
  subir:       CFG.N8N_BASE + '/recursos-subir',
  actualizar:  CFG.N8N_BASE + '/recursos-actualizar',
  analitica:   CFG.N8N_BASE + '/recursos-analitica',
  eliminar:    CFG.N8N_BASE + '/recursos-eliminar'
};

// Tamaño máximo de fichero (configurable en config.js). Por defecto 10 MB.
var MAX_FICHERO_MB = Number(CFG.MAX_FICHERO_MB) > 0 ? Number(CFG.MAX_FICHERO_MB) : 10;
var MAX_FICHERO_BYTES = MAX_FICHERO_MB * 1024 * 1024;

// URL a la que Supabase redirige tras pulsar el enlace de recuperación del email.
// Debe estar permitida en Supabase (Auth → URL Configuration → Redirect URLs).
var RESET_REDIRECT = 'https://recursos.crizagrupo.com/panel';

// Cliente Supabase (supabase-js por CDN). Guarda/refresca la sesión en localStorage.
var sb = null;
if (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) {
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
}

// ── ESTADO ─────────────────────────────────────────────────────────────────
var sesion = null;        // { email }
var editando = null;      // id del recurso en edición, o null
var recursosCache = [];   // últimos recursos leídos de recursos-listar

// ── UTILIDADES ───────────────────────────────────────────────────────────────

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function emailValido(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

// Mensaje de aviso cuando el fichero elegido supera el tamaño máximo (R2/R3).
function mensajeTamano() {
  return 'El fichero supera el máximo de ' + MAX_FICHERO_MB + ' MB. Elige uno más pequeño.';
}

// Traduce el error devuelto por el servidor/red a un texto en lenguaje claro (R5).
// Nunca deja un código técnico ("HTTP 500") como único texto: lo añade entre paréntesis
// como pista tras un mensaje llano.
function mensajeErrorSubida(raw) {
  var cod = String(raw == null ? '' : raw).trim();
  var base;
  if (/almacenamiento|storage/i.test(cod)) {
    // Fallo específico de la subida a Storage (el workflow responde ok:false, 502).
    base = 'No se pudo subir el fichero. Prueba con uno más pequeño o inténtalo de nuevo.';
  } else {
    base = 'No se pudo guardar el recurso. Revisa la conexión e inténtalo de nuevo.';
  }
  // Añade el detalle como pista solo si aporta algo y no es ya un texto llano.
  if (cod && !/^No se pudo/i.test(cod)) base += ' (' + cod + ')';
  return base;
}

// Convierte un File a base64 puro (sin el prefijo "data:...;base64,").
function fileABase64(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      var res = String(reader.result || '');
      var coma = res.indexOf(',');
      resolve(coma >= 0 ? res.slice(coma + 1) : res);
    };
    reader.onerror = function () { reject(reader.error); };
    reader.readAsDataURL(file);
  });
}

// Fecha "YYYY-MM-DD" → "DD mmm" (para el gráfico).
var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaCorta(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return String(Number(m[3])) + ' ' + (MESES[Number(m[2]) - 1] || '');
}

// ── SESIÓN (Supabase Auth) ────────────────────────────────────────────────────

// Devuelve el access_token vigente (o null si no hay sesión).
async function tokenActual() {
  if (!sb) return null;
  var r = await sb.auth.getSession();
  var s = r && r.data ? r.data.session : null;
  return s ? s.access_token : null;
}

// Cierra la sesión y vuelve a login. Motivo opcional para avisar al usuario.
async function forzarLogout(motivo) {
  try { if (sb) await sb.auth.signOut(); } catch (_) {}
  sesion = null;
  editando = null;
  mostrarLogin();
  if (motivo) {
    var alerta = document.getElementById('login-alert');
    alerta.textContent = motivo;
    alerta.hidden = false;
  }
}

// ── LLAMADAS A WEBHOOKS ───────────────────────────────────────────────────────

// GET/POST a un webhook privado con Authorization: Bearer <token>.
// Si el webhook responde 401 → cierra sesión y vuelve a login (R9).
async function llamadaPrivada(url, opciones) {
  opciones = opciones || {};
  var token = await tokenActual();
  if (!token) { await forzarLogout('Tu sesión ha caducado. Vuelve a entrar.'); throw new Error('sin sesión'); }
  var headers = Object.assign({ 'Authorization': 'Bearer ' + token }, opciones.headers || {});
  var resp = await fetch(url, { method: opciones.method || 'GET', headers: headers, body: opciones.body });
  if (resp.status === 401) {
    await forzarLogout('Tu sesión ya no es válida. Vuelve a entrar.');
    throw new Error('401');
  }
  return resp;
}

// ── NAVEGACIÓN ENTRE PANTALLAS ────────────────────────────────────────────────

function ocultarPantallas() {
  ['s-login', 's-panel', 's-recuperar', 's-nueva-pwd'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.hidden = true;
  });
}

function mostrarLogin() {
  ocultarPantallas();
  document.getElementById('s-login').hidden = false;
}

function mostrarRecuperar() {
  ocultarPantallas();
  document.getElementById('s-recuperar').hidden = false;
}

function mostrarNuevaPwd() {
  ocultarPantallas();
  document.getElementById('s-nueva-pwd').hidden = false;
}

function mostrarPanel() {
  ocultarPantallas();
  document.getElementById('s-panel').hidden = false;
  var inicial = (sesion.email || '?').charAt(0).toUpperCase();
  document.getElementById('p-avatar').textContent = inicial;
  document.getElementById('p-email').textContent = sesion.email;
  cargarRecursos();
  cargarAnalitica();
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────

function initLogin() {
  var btnLogin = document.getElementById('btn-login');
  var inEmail = document.getElementById('l-email');
  var inPwd = document.getElementById('l-pwd');
  var alerta = document.getElementById('login-alert');

  function limpiarErr() {
    document.getElementById('l-email-err').textContent = '';
    document.getElementById('l-pwd-err').textContent = '';
    alerta.hidden = true;
  }

  async function intentarLogin() {
    limpiarErr();
    var email = inEmail.value.trim();
    var pwd = inPwd.value;
    var ok = true;
    if (!emailValido(email)) {
      document.getElementById('l-email-err').textContent = 'Escribe un email válido.';
      inEmail.classList.add('invalid');
      ok = false;
    }
    if (!pwd) {
      document.getElementById('l-pwd-err').textContent = 'Escribe la contraseña.';
      inPwd.classList.add('invalid');
      ok = false;
    }
    if (!ok) return;

    if (!sb) {
      alerta.textContent = 'El panel aún no está configurado (falta la clave de Supabase en config.js).';
      alerta.hidden = false;
      return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = 'Entrando…';

    try {
      var r = await sb.auth.signInWithPassword({ email: email, password: pwd });
      if (r.error) {
        // Mensaje real de Supabase (temporal, para diagnosticar). Antes decía
        // siempre "Email o contraseña incorrectos" y ocultaba la causa real
        // (ej. "Email not confirmed", clave anon de otro proyecto, etc.).
        alerta.textContent = 'No se pudo entrar: ' + (r.error.message || 'email o contraseña incorrectos') + '.';
        alerta.hidden = false;
      } else {
        sesion = { email: r.data.user.email };
        inPwd.value = '';
        mostrarPanel();
      }
    } catch (e) {
      alerta.textContent = 'No se pudo conectar. Inténtalo de nuevo.';
      alerta.hidden = false;
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = 'Entrar';
    }
  }

  btnLogin.addEventListener('click', intentarLogin);
  [inEmail, inPwd].forEach(function (inp) {
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') intentarLogin(); });
    inp.addEventListener('input', function () { inp.classList.remove('invalid'); });
  });
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────

function initLogout() {
  document.getElementById('btn-logout').addEventListener('click', function () {
    forzarLogout();
  });
}

// ── RECUPERAR CONTRASEÑA — PEDIR EMAIL ────────────────────────────────────────

function initRecuperar() {
  var linkForgot = document.getElementById('link-forgot');
  if (linkForgot) linkForgot.addEventListener('click', function (e) {
    e.preventDefault();
    document.getElementById('rec-email').value = '';
    document.getElementById('rec-email-err').textContent = '';
    document.getElementById('rec-alert').hidden = true;
    mostrarRecuperar();
  });

  var linkVolver = document.getElementById('link-rec-volver');
  if (linkVolver) linkVolver.addEventListener('click', function (e) {
    e.preventDefault();
    mostrarLogin();
  });

  var btnEnviar = document.getElementById('btn-rec-enviar');
  var inEmail = document.getElementById('rec-email');
  var alerta = document.getElementById('rec-alert');

  async function pedirRecuperacion() {
    document.getElementById('rec-email-err').textContent = '';
    alerta.hidden = true;
    var email = inEmail.value.trim();
    if (!emailValido(email)) {
      document.getElementById('rec-email-err').textContent = 'Escribe un email válido.';
      inEmail.classList.add('invalid');
      return;
    }
    if (!sb) {
      document.getElementById('rec-email-err').textContent =
        'El panel aún no está configurado (falta la clave de Supabase en config.js).';
      return;
    }
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando…';
    try {
      // Usa solo la clave anon ya presente (R11). No comprobamos el resultado para no
      // revelar si el email existe: el mensaje siguiente es neutro en todos los casos (R9).
      await sb.auth.resetPasswordForEmail(email, { redirectTo: RESET_REDIRECT });
    } catch (_) {}
    alerta.textContent =
      'Si ese email tiene acceso, te hemos enviado un enlace para crear una contraseña ' +
      'nueva. Revisa tu correo (y la carpeta de spam).';
    alerta.hidden = false;
    inEmail.value = '';
    btnEnviar.disabled = false;
    btnEnviar.textContent = 'Enviar enlace';
  }

  btnEnviar.addEventListener('click', pedirRecuperacion);
  inEmail.addEventListener('keydown', function (e) { if (e.key === 'Enter') pedirRecuperacion(); });
  inEmail.addEventListener('input', function () { inEmail.classList.remove('invalid'); });
}

// ── RECUPERAR CONTRASEÑA — FIJAR NUEVA CONTRASEÑA ─────────────────────────────

function initNuevaPwd() {
  var btnGuardar = document.getElementById('btn-np-guardar');
  var inPwd = document.getElementById('np-pwd');
  var inPwd2 = document.getElementById('np-pwd2');
  var alerta = document.getElementById('np-alert');

  async function guardarPwd() {
    document.getElementById('np-pwd-err').textContent = '';
    document.getElementById('np-pwd2-err').textContent = '';
    alerta.hidden = true;
    var pwd = inPwd.value;
    var pwd2 = inPwd2.value;
    var ok = true;
    if (pwd.length < 8) {
      document.getElementById('np-pwd-err').textContent = 'La contraseña debe tener al menos 8 caracteres.';
      inPwd.classList.add('invalid');
      ok = false;
    }
    if (pwd2 !== pwd) {
      document.getElementById('np-pwd2-err').textContent = 'Las contraseñas no coinciden.';
      inPwd2.classList.add('invalid');
      ok = false;
    }
    if (!ok) return;
    if (!sb) {
      alerta.textContent = 'El panel aún no está configurado (falta la clave de Supabase en config.js).';
      alerta.hidden = false;
      return;
    }
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando…';
    try {
      // La sesión de recuperación ya está activa (evento PASSWORD_RECOVERY); updateUser
      // fija la nueva contraseña sobre esa sesión. Solo la clave anon (R11).
      var r = await sb.auth.updateUser({ password: pwd });
      if (r.error) {
        alerta.textContent = 'No se pudo guardar la contraseña: ' + (r.error.message || 'inténtalo de nuevo') + '.';
        alerta.hidden = false;
      } else {
        sesion = { email: (r.data && r.data.user && r.data.user.email) || (sesion && sesion.email) || '' };
        inPwd.value = ''; inPwd2.value = '';
        // Limpia el hash del enlace de recuperación de la URL.
        try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
        mostrarPanel();
      }
    } catch (_) {
      alerta.textContent = 'No se pudo conectar. Inténtalo de nuevo.';
      alerta.hidden = false;
    } finally {
      btnGuardar.disabled = false;
      btnGuardar.textContent = 'Guardar y entrar';
    }
  }

  btnGuardar.addEventListener('click', guardarPwd);
  [inPwd, inPwd2].forEach(function (inp) {
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') guardarPwd(); });
    inp.addEventListener('input', function () { inp.classList.remove('invalid'); });
  });
}

// ── TABS ──────────────────────────────────────────────────────────────────────

function initTabs() {
  var tabs = document.querySelectorAll('.p-tab');
  tabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.dataset.tab;
      tabs.forEach(function (b) { b.classList.remove('p-tab-active'); });
      btn.classList.add('p-tab-active');
      document.querySelectorAll('.tab-pane').forEach(function (p) { p.hidden = true; });
      document.getElementById('tab-' + target).hidden = false;
      if (target === 'analitica') cargarAnalitica();
    });
  });
}

// ── EDICIÓN DE RECURSOS ───────────────────────────────────────────────────────

function editarRecurso(id) {
  var r = recursosCache.find(function (x) { return String(x.id) === String(id); });
  if (!r) return;
  editando = id;

  document.getElementById('form-h2').textContent = 'Editar recurso';
  document.getElementById('form-p').textContent = 'Modifica los campos y guarda los cambios.';
  document.getElementById('btn-subir').innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Guardar cambios';
  document.getElementById('btn-cancelar').hidden = false;

  document.getElementById('f-titulo').value = r.titulo || '';
  document.getElementById('f-desc').value = (r.descripcion && r.descripcion !== '—') ? r.descripcion : '';
  document.getElementById('f-cat').value = r.categoria || '';
  document.getElementById('f-tipo').value = r.tipo || 'descarga';
  document.getElementById('f-destacado').checked = !!r.destacado;
  // recursos-listar sólo devuelve recursos publicados; por defecto queda marcado.
  document.getElementById('f-publicado').checked = (r.publicado === undefined ? true : !!r.publicado);
  document.getElementById('cf-descarga').hidden = r.tipo !== 'descarga';
  document.getElementById('cf-enlace').hidden = r.tipo !== 'enlace';
  document.getElementById('cf-pagina').hidden = r.tipo !== 'pagina';
  // El campo condicional viene en "destino" (url_externa para enlace, página para pagina).
  document.getElementById('f-url').value = r.tipo === 'enlace' ? (r.destino || r.url_externa || '') : '';
  document.getElementById('f-pagina').value = r.tipo === 'pagina' ? (r.destino || r.pagina || '') : '';
  // Fichero opcional en edición: limpiamos el selector y el aviso de "obligatorio".
  document.getElementById('f-file').value = '';
  document.getElementById('file-txt').innerHTML = 'Arrastra o <u>selecciona un fichero nuevo (opcional)</u>';
  document.getElementById('file-drop').classList.remove('has-file');
  document.getElementById('err-file').textContent = '';

  document.getElementById('form-subir').hidden = false;
  document.getElementById('form-ok').hidden = true;
  document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetFormulario() {
  editando = null;
  document.getElementById('form-h2').textContent = 'Nuevo recurso';
  document.getElementById('form-p').textContent = 'Rellena el formulario y el recurso aparecerá en la biblioteca.';
  document.getElementById('btn-subir').innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg> Publicar recurso';
  document.getElementById('btn-cancelar').hidden = true;
  document.getElementById('form-subir').reset();
  document.getElementById('cf-descarga').hidden = false;
  document.getElementById('cf-enlace').hidden = true;
  document.getElementById('cf-pagina').hidden = true;
  document.getElementById('file-txt').innerHTML = 'Arrastra o <u>selecciona el fichero</u>';
  document.getElementById('file-drop').classList.remove('has-file');
  document.getElementById('f-titulo').classList.remove('invalid');
  ['titulo', 'file', 'url'].forEach(function (id) {
    var el = document.getElementById('err-' + id);
    if (el) el.textContent = '';
  });
}

// ── BORRADO DE RECURSOS ───────────────────────────────────────────────────────

// Aviso flotante de confirmación tras un borrado correcto (R8).
function mostrarAvisoBorrado(texto) {
  var t = document.createElement('div');
  t.className = 'toast-ok';
  t.textContent = texto;
  document.body.appendChild(t);
  requestAnimationFrame(function () { t.classList.add('show'); });
  setTimeout(function () {
    t.classList.remove('show');
    setTimeout(function () { t.remove(); }, 300);
  }, 3200);
}

// Abre la confirmación reforzada y, si se confirma, llama a recursos-eliminar.
function eliminarRecurso(id) {
  var r = recursosCache.find(function (x) { return String(x.id) === String(id); });
  if (!r) return;
  var titulo = String(r.titulo || '');

  var overlay = document.getElementById('del-modal');
  var nombre = document.getElementById('del-nombre');
  var input = document.getElementById('del-input');
  var btnConfirm = document.getElementById('del-confirm');
  var btnCancel = document.getElementById('del-cancel');
  var err = document.getElementById('del-err');

  nombre.textContent = titulo;
  input.value = '';
  err.textContent = '';
  btnConfirm.disabled = true;          // R2: deshabilitado hasta que el texto coincida
  btnConfirm.textContent = 'Eliminar';
  overlay.hidden = false;
  setTimeout(function () { input.focus(); }, 30);

  function cerrar() {
    overlay.hidden = true;
    input.oninput = null;
    btnConfirm.onclick = null;
    btnCancel.onclick = null;
    overlay.onclick = null;
    document.onkeydown = null;
  }

  function coincide() { return input.value.trim() === titulo.trim(); }

  input.oninput = function () { btnConfirm.disabled = !coincide(); };  // R2
  btnCancel.onclick = function () { cerrar(); };                       // R3 (no borra)
  overlay.onclick = function (e) { if (e.target === overlay) cerrar(); };
  document.onkeydown = function (e) { if (e.key === 'Escape') cerrar(); };

  btnConfirm.onclick = async function () {
    if (!coincide()) return;
    btnConfirm.disabled = true;
    btnConfirm.textContent = 'Eliminando…';
    err.textContent = '';
    try {
      var resp = await llamadaPrivada(URLS.eliminar, {        // R4 (añade Bearer) + R15 (401→logout)
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
      });
      var data = {};
      try { data = await resp.json(); } catch (_) {}
      if (!resp.ok || data.ok === false) {
        throw new Error((data && data.error) || ('HTTP ' + resp.status));
      }
      cerrar();
      cargarRecursos();                                        // R8: refresca la lista
      mostrarAvisoBorrado('«' + titulo + '» se ha eliminado.');
    } catch (e2) {
      if (String(e2.message) === '401' || String(e2.message) === 'sin sesión') {
        cerrar();   // llamadaPrivada ya devolvió al login
        return;
      }
      err.textContent = 'No se pudo eliminar (' + e2.message + '). Inténtalo de nuevo.';
      btnConfirm.disabled = false;
      btnConfirm.textContent = 'Eliminar';
    }
  };
}

// ── FORMULARIO DE SUBIDA / EDICIÓN ────────────────────────────────────────────

function initFormSubir() {
  var tipoSel = document.getElementById('f-tipo');
  var cfDescarga = document.getElementById('cf-descarga');
  var cfEnlace = document.getElementById('cf-enlace');
  var cfPagina = document.getElementById('cf-pagina');
  var fileInput = document.getElementById('f-file');
  var fileDrop = document.getElementById('file-drop');
  var fileTxt = document.getElementById('file-txt');
  var form = document.getElementById('form-subir');
  var btnSubir = document.getElementById('btn-subir');
  var formOk = document.getElementById('form-ok');
  var btnCancelar = document.getElementById('btn-cancelar');

  // Aviso permanente del tamaño máximo junto al campo de fichero (R1).
  var maxHint = document.getElementById('file-max-hint');
  if (maxHint) maxHint.textContent = 'máximo ' + MAX_FICHERO_MB + ' MB';

  function actualizarCampos() {
    var tipo = tipoSel.value;
    cfDescarga.hidden = tipo !== 'descarga';
    cfEnlace.hidden = tipo !== 'enlace';
    cfPagina.hidden = tipo !== 'pagina';
  }
  tipoSel.addEventListener('change', actualizarCampos);

  fileInput.addEventListener('change', function () {
    document.getElementById('err-file').textContent = '';
    fileDrop.classList.remove('invalid');
    if (fileInput.files.length) {
      var f = fileInput.files[0];
      fileTxt.innerHTML = '<strong>' + esc(f.name) + '</strong>';
      fileDrop.classList.add('has-file');
      // Aviso inmediato si supera el máximo (R2). No impide reelegir otro fichero.
      if (f.size > MAX_FICHERO_BYTES) {
        document.getElementById('err-file').textContent = mensajeTamano();
        fileDrop.classList.add('invalid');
      }
    } else {
      fileTxt.innerHTML = 'Arrastra o <u>selecciona el fichero</u>';
      fileDrop.classList.remove('has-file');
    }
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    ['titulo', 'file', 'url'].forEach(function (id) {
      var el = document.getElementById('err-' + id);
      if (el) el.textContent = '';
    });
    document.getElementById('form-err').hidden = true;
    fileDrop.classList.remove('invalid');

    var isEdicion = editando !== null;
    var titulo = document.getElementById('f-titulo').value.trim();
    var tipo = tipoSel.value;
    var ok = true;

    if (!titulo) {
      document.getElementById('err-titulo').textContent = 'El título es obligatorio.';
      document.getElementById('f-titulo').classList.add('invalid');
      ok = false;
    }
    // En modo crear, el fichero es obligatorio para tipo descarga.
    // En modo edición es opcional (se conserva el existente si no se elige otro). R13.
    if (tipo === 'descarga' && !isEdicion && !fileInput.files.length) {
      document.getElementById('err-file').textContent = 'Selecciona un fichero.';
      ok = false;
    }
    // Bloqueo por tamaño antes de llamar a n8n (R3). Aplica tanto al crear como al editar.
    if (tipo === 'descarga' && fileInput.files.length && fileInput.files[0].size > MAX_FICHERO_BYTES) {
      document.getElementById('err-file').textContent = mensajeTamano();
      fileDrop.classList.add('invalid');
      ok = false;
    }
    if (tipo === 'enlace' && !document.getElementById('f-url').value.trim()) {
      document.getElementById('err-url').textContent = 'Introduce la URL.';
      ok = false;
    }
    if (tipo === 'pagina' && !document.getElementById('f-pagina').value.trim()) {
      ok = false;
    }
    if (!ok) return;

    // Construye el payload
    var payload = {
      titulo: titulo,
      descripcion: document.getElementById('f-desc').value.trim(),
      categoria: document.getElementById('f-cat').value.trim() || 'Sin categoría',
      tipo: tipo,
      destacado: document.getElementById('f-destacado').checked,
      publicado: document.getElementById('f-publicado').checked,
      orden: 0,
      subido_por: sesion.email
    };
    if (tipo === 'enlace') payload.url_externa = document.getElementById('f-url').value.trim();
    if (tipo === 'pagina') payload.pagina = document.getElementById('f-pagina').value.trim();
    if (isEdicion) payload.id = editando;

    // Fichero (base64) sólo si el usuario ha elegido uno.
    if (tipo === 'descarga' && fileInput.files.length) {
      try {
        var f = fileInput.files[0];
        payload.archivo_base64 = await fileABase64(f);
        payload.archivo_nombre = f.name;
        payload.mime = f.type || 'application/octet-stream';
      } catch (_) {
        document.getElementById('err-file').textContent = 'No se pudo leer el fichero.';
        return;
      }
    }

    btnSubir.disabled = true;
    var labelGuardando = isEdicion ? 'Guardando…' : 'Publicando…';
    btnSubir.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin .8s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> ' + labelGuardando;

    try {
      var url = isEdicion ? URLS.actualizar : URLS.subir;
      var resp = await llamadaPrivada(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = {};
      try { data = await resp.json(); } catch (_) {}
      if (!resp.ok || data.ok === false) {
        throw new Error((data && data.error) || ('HTTP ' + resp.status));
      }

      resetFormulario();
      form.hidden = true;
      formOk.hidden = false;
      formOk.innerHTML = (isEdicion
        ? 'Los cambios se han guardado correctamente.'
        : 'El recurso se ha publicado correctamente.') +
        ' <button id="btn-otro" class="btn btn-ghost sm">' + (isEdicion ? 'Volver' : 'Subir otro') + '</button>';
      document.getElementById('btn-otro').addEventListener('click', function () {
        form.hidden = false;
        formOk.hidden = true;
      });
      cargarRecursos();
    } catch (err) {
      if (String(err.message) !== '401' && String(err.message) !== 'sin sesión') {
        // Mensaje claro en la alerta dedicada del formulario, nunca un código a secas (R5).
        // No mostramos éxito y conservamos los datos del formulario para reintentar (R6, R7).
        var alertaForm = document.getElementById('form-err');
        alertaForm.textContent = mensajeErrorSubida(err.message);
        alertaForm.hidden = false;
        formOk.hidden = true;
        alertaForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } finally {
      // Botón activo de nuevo. Si el formulario sigue visible (hubo error, o edición sin
      // cerrar), restauramos el texto según el modo para dejarlo reutilizable (R7).
      btnSubir.disabled = false;
      if (!form.hidden) {
        btnSubir.innerHTML = editando
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Guardar cambios'
          : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg> Publicar recurso';
      }
    }
  });

  btnCancelar.addEventListener('click', function () {
    resetFormulario();
  });
}

// ── RENDER LISTA DE RECURSOS ──────────────────────────────────────────────────

function badgeTipo(tipo) {
  var etiquetas = { descarga: 'Descarga', enlace: 'Enlace', pagina: 'Página' };
  return '<span class="badge badge-tipo">' + esc(etiquetas[tipo] || tipo) + '</span>';
}

function badgeEstado(publicado) {
  return publicado
    ? '<span class="badge badge-pub">Publicado</span>'
    : '<span class="badge badge-draft">Borrador</span>';
}

async function cargarRecursos() {
  var cont = document.getElementById('lista-recursos');
  var count = document.getElementById('lista-count');
  cont.innerHTML = '<div class="lista-cargando">Cargando recursos…</div>';
  try {
    var resp = await fetch(URLS.listar);   // recursos-listar es público (sin token)
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    recursosCache = (data && data.recursos) ? data.recursos : [];
    if (count) count.textContent = recursosCache.length;
    if (!recursosCache.length) {
      cont.innerHTML = '<div class="lista-vacia">Todavía no hay recursos publicados.</div>';
      return;
    }
    cont.innerHTML = recursosCache.map(function (r) {
      var publicado = (r.publicado === undefined ? true : !!r.publicado);
      var subPor = r.subido_por ? (' · Por ' + esc(r.subido_por)) : '';
      return '<div class="res-item">' +
        '<div class="res-item-top">' +
          '<div>' +
            '<div class="res-item-titulo">' + esc(r.titulo) + '</div>' +
            '<div class="res-item-sub">' + esc(r.categoria || 'Sin categoría') + subPor + '</div>' +
          '</div>' +
          '<div class="res-item-badges">' +
            badgeEstado(publicado) +
            '<button class="btn btn-ghost sm" onclick="editarRecurso(\'' + esc(r.id) + '\')">Editar</button>' +
            '<button class="btn btn-danger sm" onclick="eliminarRecurso(\'' + esc(r.id) + '\')">Eliminar</button>' +
          '</div>' +
        '</div>' +
        '<div class="res-item-meta">' +
          badgeTipo(r.tipo) +
          (r.destacado ? '<span class="badge badge-tipo">Destacado</span>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  } catch (err) {
    recursosCache = [];
    cont.innerHTML = '<div class="lista-vacia">No se pudieron cargar los recursos. Revisa la conexión e inténtalo de nuevo.</div>';
  }
}

// ── ANALÍTICA ─────────────────────────────────────────────────────────────────

async function cargarAnalitica() {
  try {
    var resp = await llamadaPrivada(URLS.analitica, { method: 'GET' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    renderAnalitica(data || {});
  } catch (err) {
    if (String(err.message) === '401' || String(err.message) === 'sin sesión') return;
    // Deja los KPIs con guiones y avisa en la tabla.
    document.getElementById('tabla-body').innerHTML =
      '<tr><td colspan="7" style="color:var(--muted)">No se pudo cargar la analítica.</td></tr>';
  }
}

function renderAnalitica(data) {
  var porRecurso = data.por_recurso || [];
  var porDia = data.por_dia || [];

  // KPIs
  document.getElementById('kpi-descargas').textContent = (data.descargas_total != null ? data.descargas_total : 0);
  document.getElementById('kpi-contactos').textContent = (data.contactos_total != null ? data.contactos_total : 0);
  if (data.recurso_top) {
    var topMatch = porRecurso.find(function (x) { return String(x.id) === String(data.recurso_top.id); }) || {};
    document.getElementById('kpi-top-name').textContent = data.recurso_top.titulo || '—';
    document.getElementById('kpi-top-sub').textContent =
      (data.recurso_top.descargas || 0) + ' descargas · ' + (topMatch.contactos_unicos || 0) + ' contactos únicos';
  } else {
    document.getElementById('kpi-top-name').textContent = 'Sin datos aún';
    document.getElementById('kpi-top-sub').textContent = '—';
  }

  renderChart(porDia);
  renderTabla(porRecurso);
}

function renderChart(porDia) {
  var cont = document.getElementById('chart-dias');
  var dias = porDia.slice(-7);   // últimos 7 días con datos
  if (!dias.length) {
    cont.innerHTML = '<div class="lista-vacia">Sin descargas registradas todavía.</div>';
    return;
  }
  var max = Math.max.apply(null, dias.map(function (d) { return d.descargas; }));
  var maxH = 100;
  cont.innerHTML = dias.map(function (d) {
    var h = max ? Math.round((d.descargas / max) * maxH) : 4;
    return '<div class="bar-col">' +
      '<div class="bar-val">' + d.descargas + '</div>' +
      '<div class="bar" style="height:' + h + 'px"></div>' +
      '<div class="bar-lbl">' + esc(fechaCorta(d.fecha)) + '</div>' +
    '</div>';
  }).join('');
}

function renderTabla(porRecurso) {
  var tbody = document.getElementById('tabla-body');
  if (!porRecurso.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--muted)">Sin descargas registradas todavía.</td></tr>';
    return;
  }
  // Ordenado por descargas (el webhook ya lo devuelve así; reordenamos por seguridad).
  var ordenados = porRecurso.slice().sort(function (a, b) { return b.descargas - a.descargas; });
  tbody.innerHTML = ordenados.map(function (r) {
    // Enriquecemos con lo que sepamos del recurso (categoría/tipo/estado) desde la lista.
    var info = recursosCache.find(function (x) { return String(x.id) === String(r.id); }) || {};
    var categoria = info.categoria || '—';
    var tipoCell = info.tipo ? badgeTipo(info.tipo) : '—';
    var publicado = (info.publicado === undefined ? (info.tipo ? true : null) : !!info.publicado);
    var estadoCell = (publicado === null) ? '—' : badgeEstado(publicado);
    var subidoPor = info.subido_por ? esc(info.subido_por) : '—';
    return '<tr>' +
      '<td class="td-titulo">' + esc(r.titulo) + '</td>' +
      '<td>' + esc(categoria) + '</td>' +
      '<td>' + tipoCell + '</td>' +
      '<td class="td-num">' + r.descargas + '</td>' +
      '<td class="td-num">' + (r.contactos_unicos != null ? r.contactos_unicos : 0) + '</td>' +
      '<td>' + estadoCell + '</td>' +
      '<td class="td-user">' + subidoPor + '</td>' +
    '</tr>';
  }).join('');
}

// ── CSS ANIMACIÓN SPINNER ─────────────────────────────────────────────────────

(function () {
  var st = document.createElement('style');
  st.textContent = '@keyframes spin { to { transform: rotate(360deg) } }';
  document.head.appendChild(st);
})();

// ── ARRANQUE ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async function () {
  initLogin();
  initLogout();
  initTabs();
  initFormSubir();
  initRecuperar();
  initNuevaPwd();

  // Detección del enlace de recuperación (R10): al volver del email, Supabase emite
  // el evento PASSWORD_RECOVERY. Se registra antes de resolver la sesión guardada.
  if (sb) {
    sb.auth.onAuthStateChange(function (event) {
      if (event === 'PASSWORD_RECOVERY') mostrarNuevaPwd();
    });
  }

  // Si venimos del enlace de recuperación (hash con type=recovery), no entramos directos
  // al panel: mostramos la vista de nueva contraseña y esperamos a que la fije.
  if (/type=recovery/i.test(location.hash)) {
    mostrarNuevaPwd();
    return;
  }

  // ¿Hay una sesión de Supabase ya guardada (localStorage)?
  if (sb) {
    try {
      var r = await sb.auth.getSession();
      var s = r && r.data ? r.data.session : null;
      if (s && s.user) {
        sesion = { email: s.user.email };
        mostrarPanel();
        return;
      }
    } catch (_) {}
  }
  mostrarLogin();
});

// Exponer para el onclick inline de la lista.
window.editarRecurso = editarRecurso;
window.eliminarRecurso = eliminarRecurso;
