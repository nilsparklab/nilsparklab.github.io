/* NIL SparkLab — daily streak tracker + local practice reminder.
   No backend required: reads/writes localStorage only, and (optionally,
   with the user's explicit permission) shows a browser Notification.
   Safe to run before DOM is fully parsed since it only touches
   localStorage until DOMContentLoaded. */
(function () {
  'use strict';

  var LS_KEY = 'nsl_streak_v1';
  var DAY_MS = 24 * 60 * 60 * 1000;

  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function daysBetween(aStr, bStr) {
    var a = new Date(aStr), b = new Date(bStr);
    return Math.round((b - a) / DAY_MS);
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return { streak: 0, lastVisit: null, notifyEnabled: false };
      var parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) throw new Error('bad state');
      return {
        streak: Number(parsed.streak) || 0,
        lastVisit: parsed.lastVisit || null,
        notifyEnabled: !!parsed.notifyEnabled
      };
    } catch (e) {
      return { streak: 0, lastVisit: null, notifyEnabled: false };
    }
  }

  function saveState(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable — degrade silently */ }
  }

  function updateStreakOnVisit(state) {
    var today = todayStr();
    if (state.lastVisit === today) return state; // already counted today
    if (state.lastVisit) {
      var gap = daysBetween(state.lastVisit, today);
      state.streak = (gap === 1) ? state.streak + 1 : 1;
    } else {
      state.streak = 1;
    }
    state.lastVisit = today;
    saveState(state);
    return state;
  }

  function renderBadge(state) {
    var badge = document.getElementById('nsl-streak-badge');
    if (!badge) return;
    if (state.streak >= 2) {
      badge.textContent = '🔥 ' + state.streak;
      badge.title = state.streak + '-day practice streak';
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function canNotify() {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  function renderReminderPrompt(state) {
    var prompt = document.getElementById('nsl-streak-remind-prompt');
    if (!prompt) return;
    var alreadyDecided = state.notifyEnabled || localStorage.getItem('nsl_streak_remind_dismissed') === '1';
    if (!canNotify() || alreadyDecided || state.streak < 2) {
      prompt.hidden = true;
      return;
    }
    prompt.hidden = false;
  }

  function wireReminderPrompt(state) {
    var enableBtn = document.getElementById('nsl-streak-remind-enable');
    var dismissBtn = document.getElementById('nsl-streak-remind-dismiss');
    var prompt = document.getElementById('nsl-streak-remind-prompt');
    if (enableBtn) {
      enableBtn.addEventListener('click', function () {
        if (!canNotify()) return;
        Notification.requestPermission().then(function (perm) {
          if (perm === 'granted') {
            state.notifyEnabled = true;
            saveState(state);
            try {
              new Notification('NIL SparkLab', {
                body: 'Reminders on! Roz thodi practice karke apna streak banaye rakho.',
                icon: 'icons/icon-192.png'
              });
            } catch (e) { /* notification display can fail on some platforms; permission is still saved */ }
          }
          if (prompt) prompt.hidden = true;
        }).catch(function () { if (prompt) prompt.hidden = true; });
      });
    }
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        try { localStorage.setItem('nsl_streak_remind_dismissed', '1'); } catch (e) {}
        if (prompt) prompt.hidden = true;
      });
    }
  }

  function init() {
    var state = loadState();
    state = updateStreakOnVisit(state);
    renderBadge(state);
    renderReminderPrompt(state);
    wireReminderPrompt(state);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
