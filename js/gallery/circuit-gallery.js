/* NIL SparkLab -- Community Circuits (cross-device gallery).
   The app already has a solid peer-to-peer share mechanism: Copy Share
   Link / native Share encode the current circuit into a "#nsl=<code>"
   URL fragment, and an existing on-load handler decodes + security-
   validates + applies it. This module adds the missing piece: a
   persistent, browsable library of published circuits, built entirely on
   top of that same trusted code/URL format -- it never touches circuit
   serialization or validation itself. */
(function () {
  'use strict';

  function isHindi() {
    try { if (typeof currentLang !== 'undefined' && currentLang === 'hi') return true; } catch (e) {}
    return false;
  }

  function setStatus(text) {
    var el = document.getElementById('nsl-gallery-status');
    if (el) el.textContent = text;
  }

  function friendlyError(err) {
    var hi = isHindi();
    if (err && err.code === 'API_NOT_CONFIGURED') return hi ? 'Ye feature abhi server pe set up nahi hai.' : 'This feature is not set up on the server yet.';
    if (err && err.code === 'GALLERY_NOT_CONFIGURED') return hi ? 'Is deployment par gallery storage set up nahi hai.' : 'Gallery storage is not configured on this deployment.';
    if (err && err.code === 'INVALID_TITLE') return hi ? 'Circuit ko ek title do.' : 'Give the circuit a title.';
    if (err && (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT')) return hi ? 'Network se connect nahi ho paya.' : 'Could not reach the network.';
    return (err && err.message) || (hi ? 'Kuch galat ho gaya.' : 'Something went wrong.');
  }

  function extractCodeFromShareUrl(url) {
    if (!url) return null;
    var i = url.indexOf('#nsl=');
    if (i === -1) return null;
    return url.slice(i + 5);
  }

  async function publishCurrent() {
    if (!window.NIL_API) { setStatus('Module load nahi hua.'); return; }
    var hi = isHindi();
    var titleInput = document.getElementById('nsl-gallery-title');
    var authorInput = document.getElementById('nsl-gallery-author');
    var title = ((titleInput && titleInput.value) || '').trim();
    var author = ((authorInput && authorInput.value) || '').trim();
    if (!title) { setStatus(hi ? 'Pehle circuit ka title likho.' : 'Give the circuit a title first.'); return; }
    if (!window.NilSparkLabShare || typeof window.NilSparkLabShare.url !== 'function') {
      setStatus(hi ? 'Share module load nahi hua.' : 'Share module not loaded.'); return;
    }
    var shareUrl = window.NilSparkLabShare.url();
    var code = extractCodeFromShareUrl(shareUrl);
    if (!code) { setStatus(hi ? 'Pehle Builder mein ek circuit banao.' : 'Build a circuit in the Builder first.'); return; }

    setStatus(hi ? 'Publish ho raha hai...' : 'Publishing...');
    try {
      await window.NIL_API.galleryPublish(title, author, code);
      setStatus('✅ ' + (hi ? 'Publish ho gaya!' : 'Published!'));
      if (titleInput) titleInput.value = '';
      refreshList();
    } catch (err) {
      setStatus('❌ ' + friendlyError(err));
    }
  }

  function timeAgo(iso, hi) {
    var sec = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
    if (sec < 60) return hi ? 'abhi' : 'just now';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + 'm ' + (hi ? 'pehle' : 'ago');
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ' + (hi ? 'pehle' : 'ago');
    var d = Math.floor(hr / 24);
    return d + 'd ' + (hi ? 'pehle' : 'ago');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadCircuit(code) {
    var hi = isHindi();
    var msg = hi
      ? 'Ye is device ka current Builder circuit overwrite kar dega. Continue karein?'
      : 'This will replace the circuit currently in your Builder. Continue?';
    if (!window.confirm(msg)) return;
    // Reuses the app's own existing, security-validated share-link loader
    // (the on-load "#nsl=" hash handler) rather than re-implementing
    // circuit validation here -- a full reload runs through exactly the
    // same tested path a real shared link takes.
    location.hash = 'nsl=' + code;
    location.reload();
  }

  function renderList(circuits) {
    var host = document.getElementById('nsl-gallery-list');
    if (!host) return;
    var hi = isHindi();
    if (!circuits || !circuits.length) {
      host.textContent = hi ? 'Abhi tak koi circuit publish nahi hua.' : 'No circuits published yet.';
      return;
    }
    host.innerHTML = '';
    circuits.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'nsl-gallery-row';
      var loadLabel = hi ? 'Load karo' : 'Load';
      row.innerHTML =
        '<div class="title">' + escapeHtml(c.title) + '</div>' +
        '<div class="meta">' + escapeHtml(c.authorName) + ' · ' + timeAgo(c.createdAt, hi) + '</div>';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = loadLabel;
      btn.addEventListener('click', function () { loadCircuit(c.code); });
      row.appendChild(btn);
      host.appendChild(row);
    });
  }

  async function refreshList() {
    if (!window.NIL_API) return;
    setStatus(isHindi() ? 'Circuits load ho rahe hain...' : 'Loading circuits...');
    try {
      var res = await window.NIL_API.galleryList();
      renderList(res.circuits || []);
      setStatus('');
    } catch (err) {
      setStatus('❌ ' + friendlyError(err));
    }
  }

  function openPanel() {
    var panel = document.getElementById('nsl-gallery-panel');
    if (panel) panel.classList.add('open');
    refreshList();
  }

  function closePanel() {
    var panel = document.getElementById('nsl-gallery-panel');
    if (panel) panel.classList.remove('open');
  }

  function wire() {
    var openBtn = document.getElementById('nsl-gallery-open');
    if (openBtn) openBtn.addEventListener('click', openPanel);
    var closeBtn = document.getElementById('nsl-gallery-close');
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    var publishBtn = document.getElementById('nsl-gallery-publish');
    if (publishBtn) publishBtn.addEventListener('click', publishCurrent);
    var refreshBtn = document.getElementById('nsl-gallery-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshList);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
