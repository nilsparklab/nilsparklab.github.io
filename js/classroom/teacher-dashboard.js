/* NIL SparkLab -- Teacher Dashboard (cross-device classroom).
   Extends the existing same-browser-only "Live Classroom" (BroadcastChannel
   circuit push) with a real cross-device roster: each student's device
   pushes a small status snapshot to the Worker/backend under a shared room
   code, and the teacher's device pulls all of them into one live table. */
(function () {
  'use strict';

  var STUDENT_ID_KEY = 'nsl_class_student_id_v1';
  var STUDENT_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var REFRESH_MS = 20000;
  var dashboardTimer = null;

  function getOrCreateStudentId() {
    var existing = null;
    try { existing = localStorage.getItem(STUDENT_ID_KEY); } catch (e) {}
    if (existing) return existing;
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    var out = '';
    for (var j = 0; j < 16; j++) out += STUDENT_ID_ALPHABET[bytes[j] % STUDENT_ID_ALPHABET.length];
    try { localStorage.setItem(STUDENT_ID_KEY, out); } catch (e) {}
    return out;
  }

  function normalizeRoom(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  }

  function isHindi() {
    try { if (typeof currentLang !== 'undefined' && currentLang === 'hi') return true; } catch (e) {}
    return false;
  }

  function mostRecentQuiz() {
    if (!window.NilSparkLabStudyKB || typeof window.NilSparkLabStudyKB.getScores !== 'function') return null;
    var scores = window.NilSparkLabStudyKB.getScores() || {};
    var best = null;
    Object.keys(scores).forEach(function (topicId) {
      var s = scores[topicId];
      if (!s || !s.at) return;
      if (!best || Date.parse(s.at) > Date.parse(best.at)) best = { topicId: topicId, best: s.best, total: s.total, at: s.at };
    });
    return best;
  }

  function currentStreak() {
    try {
      var raw = localStorage.getItem('nsl_streak_v1');
      if (!raw) return 0;
      var parsed = JSON.parse(raw);
      return Number(parsed.streak) || 0;
    } catch (e) { return 0; }
  }

  function buildStatusSnapshot() {
    var health = { score: null, level: 'unknown' };
    try {
      if (window.NilSparkLabHealth && typeof window.NilSparkLabHealth.analyze === 'function') {
        var h = window.NilSparkLabHealth.analyze();
        health = { score: h.score, level: h.level };
      }
    } catch (e) {}
    return {
      health: health,
      lastQuiz: mostRecentQuiz(),
      streak: currentStreak(),
      at: new Date().toISOString()
    };
  }

  function setDashStatus(text) {
    var el = document.getElementById('nsl-class-dash-status');
    if (el) el.textContent = text;
  }

  function friendlyError(err) {
    if (err && err.code === 'API_NOT_CONFIGURED') return isHindi() ? 'Ye feature abhi server pe set up nahi hai.' : 'This feature is not set up on the server yet.';
    if (err && err.code === 'CLASSROOM_NOT_CONFIGURED') return isHindi() ? 'Is deployment par classroom storage set up nahi hai.' : 'Classroom storage is not configured on this deployment.';
    if (err && err.code === 'INVALID_ROOM_CODE') return isHindi() ? 'Room code 3-12 letters/numbers ka hona chahiye.' : 'Room code must be 3-12 letters/numbers.';
    if (err && (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT')) return isHindi() ? 'Network se connect nahi ho paya.' : 'Could not reach the network.';
    return (err && err.message) || (isHindi() ? 'Kuch galat ho gaya.' : 'Something went wrong.');
  }

  async function sendStatus() {
    if (!window.NIL_API) { setDashStatus('Module load nahi hua.'); return; }
    var room = normalizeRoom((document.getElementById('nsl-class-code') || {}).value);
    var name = ((document.getElementById('nsl-class-student-name') || {}).value || '').trim() || 'Student';
    if (room.length < 3) { setDashStatus(isHindi() ? 'Pehle room code bharo (kam se kam 3 characters).' : 'Enter a room code first (at least 3 characters).'); return; }
    setDashStatus(isHindi() ? 'Status bhej rahe hain...' : 'Sending status...');
    try {
      var snapshot = buildStatusSnapshot();
      await window.NIL_API.classPush(room, getOrCreateStudentId(), name, JSON.stringify(snapshot));
      setDashStatus('✅ ' + (isHindi() ? 'Status bhej diya.' : 'Status sent.') + ' (' + new Date().toLocaleTimeString() + ')');
    } catch (err) {
      setDashStatus('❌ ' + friendlyError(err));
    }
  }

  function statusBadge(snapshot) {
    if (!snapshot || !snapshot.health || snapshot.health.level === 'unknown') return '⚪';
    if (snapshot.health.level === 'ok') return '🟢';
    if (snapshot.health.level === 'warn') return '🟡';
    return '🔴';
  }

  function rowPriority(snapshot) {
    // Lower number = needs attention first (bad health, or never sent anything).
    if (!snapshot) return -1;
    if (!snapshot.health || snapshot.health.score === null) return 50;
    return snapshot.health.score;
  }

  function renderRoster(students) {
    var host = document.getElementById('nsl-class-roster');
    if (!host) return;
    var hi = isHindi();
    if (!students.length) {
      host.textContent = hi ? 'Abhi tak koi student join nahi hua.' : 'No students yet.';
      return;
    }
    var rows = students.map(function (s) {
      var snapshot = null;
      try { snapshot = JSON.parse(s.status); } catch (e) {}
      return { student: s, snapshot: snapshot };
    });
    rows.sort(function (a, b) { return rowPriority(a.snapshot) - rowPriority(b.snapshot); });

    host.innerHTML = '';
    var table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px;';
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.style.cssText = 'border-bottom:1px solid #1e293b;';
      var quizText = '--';
      if (r.snapshot && r.snapshot.lastQuiz) {
        quizText = r.snapshot.lastQuiz.topicId + ' (' + r.snapshot.lastQuiz.best + '/' + r.snapshot.lastQuiz.total + ')';
      }
      var healthText = (r.snapshot && r.snapshot.health && r.snapshot.health.score !== null) ? (r.snapshot.health.score + '%') : '--';
      var streakText = r.snapshot ? String(r.snapshot.streak || 0) : '0';
      var ago = r.student.updatedAt ? timeAgo(r.student.updatedAt, hi) : '--';
      tr.innerHTML =
        '<td style="padding:4px 4px;">' + statusBadge(r.snapshot) + ' ' + escapeHtml(r.student.studentName) + '</td>' +
        '<td style="padding:4px 4px;text-align:right;">' + healthText + '</td>' +
        '<td style="padding:4px 4px;text-align:right;">' + escapeHtml(quizText) + '</td>' +
        '<td style="padding:4px 4px;text-align:right;">🔥' + streakText + '</td>' +
        '<td style="padding:4px 4px;text-align:right;color:#64748b;">' + ago + '</td>';
      table.appendChild(tr);
    });
    host.appendChild(table);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function timeAgo(iso, hi) {
    var sec = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
    if (sec < 60) return hi ? 'abhi' : 'now';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + 'm ' + (hi ? 'pehle' : 'ago');
    var hr = Math.floor(min / 60);
    return hr + 'h ' + (hi ? 'pehle' : 'ago');
  }

  async function pullDashboard(showBusy) {
    if (!window.NIL_API) return;
    var room = normalizeRoom((document.getElementById('nsl-class-code') || {}).value);
    if (room.length < 3) { setDashStatus(isHindi() ? 'Pehle room code bharo.' : 'Enter a room code first.'); return; }
    if (showBusy) setDashStatus(isHindi() ? 'Roster load ho raha hai...' : 'Loading roster...');
    try {
      var res = await window.NIL_API.classPull(room);
      renderRoster(res.students || []);
      setDashStatus((isHindi() ? 'Last refresh: ' : 'Last refresh: ') + new Date().toLocaleTimeString());
    } catch (err) {
      setDashStatus('❌ ' + friendlyError(err));
    }
  }

  function stopAutoRefresh() {
    if (dashboardTimer) { clearInterval(dashboardTimer); dashboardTimer = null; }
  }

  function openDashboard() {
    var panel = document.getElementById('nsl-class-dashboard');
    if (panel) panel.hidden = false;
    pullDashboard(true);
    stopAutoRefresh();
    dashboardTimer = setInterval(function () { pullDashboard(false); }, REFRESH_MS);
  }

  function wire() {
    var sendBtn = document.getElementById('nsl-class-send-status');
    if (sendBtn) sendBtn.addEventListener('click', sendStatus);
    var openBtn = document.getElementById('nsl-class-dashboard-open');
    if (openBtn) openBtn.addEventListener('click', openDashboard);
    var refreshBtn = document.getElementById('nsl-class-dashboard-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { pullDashboard(true); });
    // Stop polling once the classroom panel is closed, from either close
    // button -- this only adds a listener, it doesn't touch the panel's
    // existing open/close behaviour.
    var closeBtn = document.getElementById('nsl-class-close');
    if (closeBtn) closeBtn.addEventListener('click', stopAutoRefresh);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
