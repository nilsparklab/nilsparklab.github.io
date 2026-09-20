/* NIL SparkLab — Adaptive Practice, upgraded to real spaced repetition.
   The original "Adaptive" panel just showed a few hardcoded strings and
   always started the same fixed LED drill. This module replaces its
   behaviour with a genuine Leitner-style schedule built from the app's
   own quiz data (window.NilSparkLabStudyKB), so it actually tracks which
   of the real study topics are due for review and lets the learner jump
   straight into a real quiz for the most overdue one. */
(function () {
  'use strict';

  var SRS_KEY = 'nsl_srs_v1';
  // Leitner box -> review interval in days. A correct/strong result moves a
  // topic to the next box (reviewed less often); a weak result drops it
  // back to box 0 (reviewed again tomorrow).
  var BOX_INTERVALS_DAYS = [1, 2, 4, 8, 16, 30];

  function srsState() {
    try { return JSON.parse(localStorage.getItem(SRS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function srsSave(s) {
    try { localStorage.setItem(SRS_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function isoInDays(days) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  function updateFromResult(topicId, scoreRatio) {
    var s = srsState();
    var entry = s[topicId] || { box: 0 };
    if (scoreRatio >= 0.7) entry.box = Math.min(entry.box + 1, BOX_INTERVALS_DAYS.length - 1);
    else if (scoreRatio < 0.5) entry.box = 0;
    // 0.5-0.7: partial credit, box stays where it is - reviewed again at the same cadence.
    entry.lastResult = scoreRatio;
    entry.nextReview = isoInDays(BOX_INTERVALS_DAYS[entry.box]);
    s[topicId] = entry;
    srsSave(s);
  }

  // The quiz engine already dispatches this event on every completed quiz
  // (see saveQuizResult in the study-KB script) -- no changes needed there.
  window.addEventListener('nilsparklab:study-quiz-complete', function (e) {
    try {
      var d = e.detail || {};
      if (d.topicId && typeof d.score === 'number' && typeof d.total === 'number' && d.total > 0) {
        updateFromResult(d.topicId, d.score / d.total);
      }
    } catch (err) {}
  });

  function computeQueue() {
    if (!window.NilSparkLabStudyKB || typeof window.NilSparkLabStudyKB.topicsWithIds !== 'function') return [];
    var topics = window.NilSparkLabStudyKB.topicsWithIds();
    var scores = window.NilSparkLabStudyKB.getScores() || {};
    var srs = srsState();
    var now = Date.now();
    var rows = topics.map(function (t) {
      var sc = scores[t.id];
      var sr = srs[t.id];
      var neverAttempted = !sc;
      var overdueDays = sr ? Math.floor((now - Date.parse(sr.nextReview)) / 86400000) : Infinity;
      var ratio = sc ? sc.best / Math.max(1, sc.total) : null;
      return { id: t.id, title: t.title, neverAttempted: neverAttempted, overdueDays: overdueDays, ratio: ratio };
    });
    rows.sort(function (a, b) {
      if (a.neverAttempted !== b.neverAttempted) return a.neverAttempted ? -1 : 1;
      if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays; // most overdue first
      return (a.ratio === null ? 0 : a.ratio) - (b.ratio === null ? 0 : b.ratio); // weakest score as tiebreak
    });
    var due = rows.filter(function (r) { return r.neverAttempted || r.overdueDays >= 0; });
    return (due.length ? due : rows).slice(0, 5);
  }

  function isHindi() {
    try { if (typeof currentLang !== 'undefined' && currentLang === 'hi') return true; } catch (e) {}
    return false;
  }

  function reasonText(r, hi) {
    if (r.neverAttempted) return hi ? 'kabhi practice nahi kiya' : 'never practiced';
    if (r.overdueDays === Infinity) return hi ? 'schedule nahi hai' : 'not yet scheduled';
    if (r.overdueDays === 0) return hi ? 'aaj due hai' : 'due today';
    if (r.overdueDays > 0) return hi ? (r.overdueDays + ' din se due') : (r.overdueDays + 'd overdue');
    return hi ? ((-r.overdueDays) + ' din mein ready') : ((-r.overdueDays) + 'd left');
  }

  function practiceTopic(title) {
    var panel = document.getElementById('nsl-adapt-panel');
    if (panel) panel.classList.remove('open');
    if (window.NilSparkLabSmartAssistant && typeof window.NilSparkLabSmartAssistant.open === 'function') {
      window.NilSparkLabSmartAssistant.open();
      setTimeout(function () {
        try { window.NilSparkLabSmartAssistant.respond(title + ' quiz start'); } catch (e) {}
      }, 150);
    }
  }

  function renderAdaptPanel() {
    var queue = computeQueue();
    var hi = isHindi();
    var summaryEl = document.getElementById('nsl-adapt-summary');
    var listEl = document.getElementById('nsl-adapt-list');
    var startBtn = document.getElementById('nsl-adapt-start');
    if (!summaryEl || !listEl) return;

    if (!queue.length) {
      summaryEl.textContent = hi ? 'Abhi koi topic due nahi -- sab up to date hai!' : "Nothing due right now -- you're all caught up!";
      listEl.innerHTML = '';
      if (startBtn) startBtn.hidden = true;
      return;
    }

    summaryEl.textContent = hi
      ? 'Spaced-repetition schedule ke hisaab se ye topics practice karne layak hain:'
      : 'Based on your spaced-repetition schedule, these topics are due:';

    listEl.innerHTML = '';
    queue.forEach(function (r) {
      var li = document.createElement('li');
      var scoreText = (r.ratio !== null) ? (' -- ' + Math.round(r.ratio * 100) + '% best') : '';
      var label = document.createElement('span');
      label.textContent = r.title + scoreText + ' (' + reasonText(r, hi) + ')';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Practice';
      btn.style.cssText = 'margin-left:8px;font-size:11px;padding:2px 8px;';
      btn.addEventListener('click', function () { practiceTopic(r.title); });
      li.appendChild(label);
      li.appendChild(btn);
      listEl.appendChild(li);
    });

    if (startBtn) {
      startBtn.hidden = false;
      var top = queue[0];
      startBtn.textContent = (hi ? 'Shuru karo: ' : 'Start: ') + top.title;
      startBtn.onclick = function () { practiceTopic(top.title); };
    }
  }

  function openAdaptSRS() {
    renderAdaptPanel();
    var panel = document.getElementById('nsl-adapt-panel');
    if (panel) panel.classList.add('open');
  }

  function stripOldStartButtonListener() {
    // The original inline script wired a click handler on #nsl-adapt-start
    // that always opened a fixed LED drill regardless of what's actually
    // due. Cloning the node drops that stale listener so only our
    // schedule-aware one (attached per-render in renderAdaptPanel) remains.
    var startBtn = document.getElementById('nsl-adapt-start');
    if (startBtn && startBtn.parentNode) {
      var fresh = startBtn.cloneNode(true);
      startBtn.parentNode.replaceChild(fresh, startBtn);
    }
  }

  function wire() {
    stripOldStartButtonListener();
    if (window.NilSparkLabAdaptive) {
      window.NilSparkLabAdaptive.open = openAdaptSRS;
    } else {
      window.NilSparkLabAdaptive = { open: openAdaptSRS, note: function () {} };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
