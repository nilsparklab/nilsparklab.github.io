/* NIL SparkLab — cross-device progress sync.
   No login. Instead: a random "sync code" identifies one saved snapshot on
   the server (Worker KV or the self-hosted backend's data/sync/ folder).
   Push on this device -> enter the same code on another device -> Pull.
   Only a small whitelist of progress-related localStorage keys is synced —
   never anything else the page might store. */
(function () {
  'use strict';

  var CODE_KEY = 'nsl_sync_code_v1';
  var LAST_SYNC_KEY = 'nsl_sync_last_v1';
  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/l — easy to read/type aloud
  var CODE_LENGTH = 10;

  // Everything that counts as "progress" worth carrying to another device.
  // Deliberately narrow — this is not a general localStorage backup.
  var SYNC_KEYS = [
    'nsl_streak_v1',
    'nsl_v593_streak',
    'nsl_v593_badges',
    'nsl_v593_sim_count',
    'nsl_v595_adapt',
    'nsl_srs_v1',
    'nsl_study_quiz_scores',
    'nil_sparklab_assistant_progress_v56'
  ];

  function generateCode() {
    var bytes = new Uint8Array(CODE_LENGTH);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < CODE_LENGTH; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var out = '';
    for (var j = 0; j < CODE_LENGTH; j++) out += CODE_ALPHABET[bytes[j] % CODE_ALPHABET.length];
    return out;
  }

  function getOrCreateCode() {
    var existing = null;
    try { existing = localStorage.getItem(CODE_KEY); } catch (e) {}
    if (existing) return existing;
    var fresh = generateCode();
    try { localStorage.setItem(CODE_KEY, fresh); } catch (e) {}
    return fresh;
  }

  function normalizeCodeInput(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function collectLocalSnapshot() {
    var out = {};
    SYNC_KEYS.forEach(function (key) {
      try {
        var v = localStorage.getItem(key);
        if (v !== null) out[key] = v;
      } catch (e) {}
    });
    return out;
  }

  function applyRemoteSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return 0;
    var applied = 0;
    SYNC_KEYS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(snapshot, key) && typeof snapshot[key] === 'string') {
        try { localStorage.setItem(key, snapshot[key]); applied++; } catch (e) {}
      }
    });
    return applied;
  }

  function friendlyError(err) {
    if (err && err.code === 'API_NOT_CONFIGURED') return 'Sync abhi server pe set up nahi hai (API gateway configure karna baaki hai).';
    if (err && err.code === 'SYNC_NOT_CONFIGURED') return 'Is deployment par sync storage (KV) set up nahi hai.';
    if (err && err.code === 'SYNC_CODE_NOT_FOUND') return 'Ye code abhi tak kahin se push nahi hua — pehle us dusre device pe "Sync Now" dabao.';
    if (err && err.code === 'SYNC_DATA_TOO_LARGE') return 'Progress data thoda zyada bada ho gaya hai sync ke liye.';
    if (err && (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT')) return 'Network se connect nahi ho paya. Internet check karo.';
    return (err && err.message) || 'Kuch galat ho gaya, dobara try karo.';
  }

  function setStatus(text) {
    var el = document.getElementById('nsl-sync-status');
    if (el) el.textContent = text;
  }

  async function pushNow() {
    if (!window.NIL_API) { setStatus('Sync module load nahi hua.'); return; }
    var code = getOrCreateCode();
    setStatus('Sync ho raha hai...');
    try {
      var payload = JSON.stringify(collectLocalSnapshot());
      var res = await window.NIL_API.syncPush(code, payload);
      try { localStorage.setItem(LAST_SYNC_KEY, res.updatedAt || new Date().toISOString()); } catch (e) {}
      setStatus('✅ Sync ho gaya — ' + new Date().toLocaleTimeString());
      renderCode();
    } catch (err) {
      setStatus('❌ ' + friendlyError(err));
    }
  }

  async function pullNow(rawCode) {
    if (!window.NIL_API) { setStatus('Sync module load nahi hua.'); return; }
    var code = normalizeCodeInput(rawCode);
    if (code.length < 8) { setStatus('Code sahi nahi lag raha — dusre device wala poora code daalo.'); return; }
    var confirmMsg = 'Ye is device ka progress overwrite kar dega us code ke saved data se. Continue karein?';
    if (!window.confirm(confirmMsg)) return;
    setStatus('Load ho raha hai...');
    try {
      var res = await window.NIL_API.syncPull(code);
      var snapshot = JSON.parse(res.data);
      var applied = applyRemoteSnapshot(snapshot);
      try { localStorage.setItem(CODE_KEY, code); localStorage.setItem(LAST_SYNC_KEY, res.updatedAt || new Date().toISOString()); } catch (e) {}
      setStatus('✅ ' + applied + ' progress items load ho gaye. Page refresh karo dikhne ke liye.');
      renderCode();
    } catch (err) {
      setStatus('❌ ' + friendlyError(err));
    }
  }

  function renderCode() {
    var codeEl = document.getElementById('nsl-sync-code-display');
    if (codeEl) codeEl.textContent = getOrCreateCode();
    var lastEl = document.getElementById('nsl-sync-last');
    if (lastEl) {
      var last = null;
      try { last = localStorage.getItem(LAST_SYNC_KEY); } catch (e) {}
      lastEl.textContent = last ? ('Last sync: ' + new Date(last).toLocaleString()) : 'Abhi tak sync nahi hua';
    }
  }

  function wireUi() {
    var toggle = document.getElementById('nsl-sync-toggle');
    var panel = document.getElementById('nsl-sync-panel');
    if (toggle && panel) {
      toggle.addEventListener('click', function () {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) renderCode();
      });
    }
    var pushBtn = document.getElementById('nsl-sync-push-btn');
    if (pushBtn) pushBtn.addEventListener('click', pushNow);
    var pullBtn = document.getElementById('nsl-sync-pull-btn');
    var pullInput = document.getElementById('nsl-sync-pull-input');
    if (pullBtn && pullInput) pullBtn.addEventListener('click', function () { pullNow(pullInput.value); });
    var copyBtn = document.getElementById('nsl-sync-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var code = getOrCreateCode();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(function () { setStatus('Code copy ho gaya: ' + code); }).catch(function () { setStatus('Code: ' + code); });
        } else {
          setStatus('Code: ' + code);
        }
      });
    }
    renderCode();
  }

  window.NilSparkLabSync = Object.freeze({ pushNow: pushNow, pullNow: pullNow, getOrCreateCode: getOrCreateCode });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireUi);
  } else {
    wireUi();
  }
})();
