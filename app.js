(() => {
  'use strict';
  const KEY = 'stories_v1';                 // metadatos (+ imágenes en base64) en localStorage
  const MAX_W = 1080, MAX_H = 1920;         // límite SOLO para imágenes
  const SLIDE_MS = 5000;                    // duración de una imagen en el visor
  const testSecs = parseFloat(new URLSearchParams(location.search).get('ttl'));  // ?ttl=15 → 15 s (pruebas)
  const TTL = testSecs > 0 ? testSecs * 1000 : 24 * 60 * 60 * 1000;
  const $ = id => document.getElementById(id);
  const strip = $('strip'), fileInput = $('fileInput'), emptyMsg = $('empty'), viewer = $('viewer'), frame = $('frame'),
    bars = $('bars'), img = $('storyImg'), vid = $('storyVid'), metaTime = $('metaTime'), muteBtn = $('muteBtn'), backdrop = $('backdrop');

  // ---------- IndexedDB: guarda los videos como Blob (sin límite de 5 MB de localStorage) ----------
  let dbp;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('stories-db', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('videos');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => {
    const t = d.transaction('videos', mode), req = fn(t.objectStore('videos'));
    t.oncomplete = () => res(req.result); t.onerror = t.onabort = () => rej(t.error); }); };
  const idbPut = (id, blob) => tx('readwrite', s => s.put(blob, id));
  const idbGet = id => tx('readonly', s => s.get(id));
  const idbDel = id => tx('readwrite', s => s.delete(id)).catch(() => {});
  const idbKeys = () => tx('readonly', s => s.getAllKeys());

  // ---------- localStorage ----------
  const load = () => { try { const l = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(l) ? l : []; } catch { return []; } };
  const save = l => { try { localStorage.setItem(KEY, JSON.stringify(l)); return true; } catch { return false; } };
  function purge() {                         // borra vencidas (metadatos + blob) y devuelve las vigentes, nuevas primero
    const now = Date.now(), all = load(), fresh = all.filter(s => s && s.expiresAt > now);
    if (fresh.length !== all.length) {
      all.filter(s => !fresh.includes(s) && s.type === 'video').forEach(s => idbDel(s.id));
      save(fresh);
    }
    return fresh.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ---------- Utilidades ----------
  const fmt = ms => { const s = Math.max(0, Math.round(ms / 1000));
    return s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.floor(s / 3600) + ' h ' + Math.round((s % 3600) / 60) + ' min'; };
  const mb = b => (b / 1048576).toFixed(b > 1e9 ? 0 : 1) + ' MB';
  let toastT;
  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 4500); }
  async function showQuota() {
    if (!navigator.storage || !navigator.storage.estimate) return;
    const { usage, quota } = await navigator.storage.estimate();
    $('storageInfo').textContent = 'Almacenamiento del navegador: ' + mb(usage) + ' usados de ~' + mb(quota) + ' disponibles';
  }
  const scaled = (w, h, max) => { const k = Math.min(1, max / Math.max(w, 1)); return [Math.round(w * k), Math.round(h * k)]; };

  // Imagen → redimensiona a máx. 1080×1920 (sin ampliar) → base64 JPEG
  function imageToBase64(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, MAX_W / im.naturalWidth, MAX_H / im.naturalHeight);
        const w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
        URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.82));
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
      im.src = url;
    });
  }
  // Video → miniatura (se guarda en localStorage); el archivo original NO se modifica
  function videoThumb(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      const done = (fn, a) => { URL.revokeObjectURL(url); fn(a); };
      v.onerror = () => done(reject, new Error('video'));
      v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); };
      v.onseeked = () => {
        const [w, h] = scaled(v.videoWidth || 360, v.videoHeight || 640, 360);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(v, 0, 0, w, h);
        done(resolve, c.toDataURL('image/jpeg', 0.7));
      };
      v.src = url;
    });
  }

  // ---------- Lista ----------
  let current = [];
  function renderStrip() {
    current = purge();
    strip.querySelectorAll('.story').forEach(n => n.remove());
    current.forEach((s, i) => {
      const b = document.createElement('button'); b.className = 'story';
      b.innerHTML = '<div class="ring"><img alt=""></div><span></span>';
      b.querySelector('img').src = s.type === 'video' ? s.thumb : s.data;
      if (s.type === 'video') b.querySelector('.ring').insertAdjacentHTML('beforeend', '<i class="vbadge">▶</i>');
      b.querySelector('span').textContent = 'expira en ' + fmt(s.expiresAt - Date.now());
      b.onclick = () => openViewer(i);
      strip.appendChild(b);
    });
    emptyMsg.hidden = current.length > 0;
    showQuota();
  }
  $('addBtn').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const f = fileInput.files[0]; fileInput.value = ''; if (!f) return;
    const isVideo = f.type.startsWith('video/'), isImage = f.type.startsWith('image/');
    if (!isVideo && !isImage) return toast('Elige una imagen o un video.');
    toast(isVideo ? 'Procesando video…' : 'Procesando imagen…');
    const now = Date.now(), item = { id: now + '-' + Math.random().toString(36).slice(2, 7), createdAt: now, expiresAt: now + TTL };
    try {
      if (isImage) { item.type = 'image'; item.data = await imageToBase64(f); }
      else {
        item.type = 'video';
        try { item.thumb = await videoThumb(f); }
        catch { return toast('Tu navegador no puede reproducir este formato de video (prueba MP4/H.264 o WebM).'); }
        try { await idbPut(item.id, f); }
        catch { await idbDel(item.id); return toast('El video es demasiado grande para el espacio que el navegador permite (' + mb(f.size) + ').'); }
      }
      const list = purge(); list.push(item);
      if (!save(list)) { if (isVideo) idbDel(item.id); return toast('localStorage está lleno. Espera a que expire alguna historia.'); }
      toast('¡Historia publicada!'); renderStrip();
    } catch { toast('No se pudo procesar el archivo.'); }
  };
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- Visor ----------
  let idx = 0, open = false, token = 0, vUrl = null, muted = false;
  function openViewer(i) { current = purge(); if (!current.length) return renderStrip(); open = true; viewer.hidden = false; show(i); }
  function closeViewer() { open = false; token++; viewer.hidden = true; stopMedia(); renderStrip(); }
  function stopMedia() { vid.pause(); vid.removeAttribute('src'); vid.load(); if (vUrl) { URL.revokeObjectURL(vUrl); vUrl = null; } frame.classList.remove('paused'); }
  function buildBars() {
    bars.innerHTML = '';
    current.forEach((_, k) => { const b = document.createElement('div'); b.className = 'bar' + (k < idx ? ' done' : ''); b.innerHTML = '<i></i>'; bars.appendChild(b); });
  }
  function startBar(ms, t) {
    const b = bars.children[idx]; if (!b || t !== token) return;
    b.style.setProperty('--dur', ms + 'ms'); b.classList.add('active');
    b.firstChild.addEventListener('animationend', () => { if (t === token) next(); }, { once: true });
  }
  async function show(i) {
    const t = ++token, s = current[i]; idx = i; stopMedia(); buildBars(); updateMeta();
    backdrop.style.backgroundImage = 'url(' + (s.type === 'video' ? s.thumb : s.data) + ')';
    muteBtn.hidden = s.type !== 'video';
    if (s.type === 'video') {
      img.hidden = true; vid.hidden = false;
      const blob = await idbGet(s.id).catch(() => null); if (t !== token) return;
      if (!blob) { const l = load().filter(x => x.id !== s.id); save(l); renderStrip(); return current.length ? show(Math.min(i, current.length - 1)) : closeViewer(); }
      vUrl = URL.createObjectURL(blob); vid.muted = muted; vid.src = vUrl;
      await new Promise(r => { vid.onloadedmetadata = r; vid.onerror = r; }); if (t !== token) return;
      const ms = isFinite(vid.duration) && vid.duration > 0 ? vid.duration * 1000 : SLIDE_MS;
      startBar(ms, t);
      vid.play().catch(() => { vid.muted = true; muted = true; muteBtn.textContent = '🔇'; vid.play().catch(() => {}); });
    } else {
      vid.hidden = true; img.hidden = false; img.src = s.data; startBar(SLIDE_MS, t);
    }
  }
  function updateMeta() { const s = current[idx]; if (s) metaTime.textContent = 'Hace ' + fmt(Date.now() - s.createdAt) + ' · expira en ' + fmt(s.expiresAt - Date.now()); }
  const next = () => idx + 1 < current.length ? show(idx + 1) : closeViewer();
  const prev = () => show(Math.max(0, idx - 1));
  $('closeBtn').onclick = closeViewer; $('nextBtn').onclick = next; $('prevBtn').onclick = prev;
  muteBtn.onclick = () => { muted = !muted; vid.muted = muted; muteBtn.textContent = muted ? '🔇' : '🔊'; };
  viewer.addEventListener('click', e => { if (e.target === viewer || e.target === backdrop) closeViewer(); });
  document.addEventListener('keydown', e => { if (!open) return;
    if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev(); else if (e.key === 'Escape') closeViewer(); });

  // Swipe, toques laterales y mantener pulsado para pausar
  let sx = 0, sy = 0, down = false, holdT, held = false;
  const setPause = p => { frame.classList.toggle('paused', p); if (!vid.hidden && vid.src) p ? vid.pause() : vid.play().catch(() => {}); };
  frame.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; down = true; held = false; sx = e.clientX; sy = e.clientY;
    holdT = setTimeout(() => { held = true; setPause(true); }, 250); });
  frame.addEventListener('pointerup', e => {
    if (!down) return; down = false; clearTimeout(holdT);
    if (held) return setPause(false);
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? next() : prev();
    if (dy > 90 && dy > Math.abs(dx)) return closeViewer();
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { const r = frame.getBoundingClientRect(); (e.clientX - r.left < r.width / 3) ? prev() : next(); }
  });
  frame.addEventListener('pointercancel', () => { down = false; clearTimeout(holdT); if (held) setPause(false); });

  // ---------- Expiración automática ----------
  function tick() {
    const before = current.map(s => s.id).join(), curId = current[idx] && current[idx].id, fresh = purge();
    if (fresh.map(s => s.id).join() !== before) {
      renderStrip();
      if (open) {
        if (!current.length) return closeViewer();
        const k = current.findIndex(s => s.id === curId);
        if (k < 0) show(Math.min(idx, current.length - 1)); else { idx = k; buildBars(); const b = bars.children[idx]; if (b) b.classList.add('active'); }
      }
    } else {
      strip.querySelectorAll('.story').forEach((b, i) => { if (current[i]) b.querySelector('span').textContent = 'expira en ' + fmt(current[i].expiresAt - Date.now()); });
      if (open) updateMeta();
    }
  }
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('storage', e => { if (e.key === KEY && !open) renderStrip(); });
  if (testSecs > 0) { const b = $('testBadge'); b.hidden = false; b.textContent = 'Modo prueba: ' + testSecs + ' s'; }
  renderStrip();
  idbKeys().then(keys => { const ids = new Set(load().map(s => s.id)); keys.forEach(k => { if (!ids.has(k)) idbDel(k); }); }).catch(() => {});  // limpia blobs huérfanos
})();
