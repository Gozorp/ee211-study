/* Persistent state in localStorage (per browser, per origin). */
(function (global) {
  'use strict';
  var KEY = 'ee211.v1';
  var state = null;
  var available = true;
  var listeners = [];
  var saveTimer = null;
  var lastSaved = null;

  function blank() {
    return { version: 1, notes: { lessons: {}, topics: {} }, progress: { lessons: {}, practice: {} }, prefs: { follow: true } };
  }

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : blank();
      var b = blank();
      state.notes = state.notes || b.notes;
      state.notes.lessons = state.notes.lessons || {};
      state.notes.topics = state.notes.topics || {};
      state.progress = state.progress || b.progress;
      state.progress.lessons = state.progress.lessons || {};
      state.progress.practice = state.progress.practice || {};
      state.prefs = state.prefs || b.prefs;
      // probe write access
      global.localStorage.setItem(KEY + '.probe', '1');
      global.localStorage.removeItem(KEY + '.probe');
    } catch (e) {
      available = false;
      state = state || blank();
    }
    return state;
  }

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      global.localStorage.setItem(KEY, JSON.stringify(state));
      lastSaved = new Date();
      available = true;
    } catch (e) {
      available = false;
    }
    listeners.forEach(function (f) { try { f(available, lastSaved); } catch (e) {} });
    return available;
  }

  function save(delay) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, delay == null ? 350 : delay);
  }

  function lessonNotes(id) {
    var n = state.notes.lessons[id];
    if (!n) n = state.notes.lessons[id] = { free: '', items: [], updated: null };
    n.items = n.items || [];
    return n;
  }
  function lessonProgress(id) {
    var p = state.progress.lessons[id];
    if (!p) p = state.progress.lessons[id] = { done: false, secs: {}, pos: 0, updated: null };
    p.secs = p.secs || {};
    return p;
  }
  function practiceProgress(qid) {
    var p = state.progress.practice[qid];
    if (!p) p = state.progress.practice[qid] = { attempts: 0, solved: false, hints: 0, revealed: false, last: {} };
    p.last = p.last || {};
    return p;
  }

  function exportJSON() { return JSON.stringify(state, null, 2); }
  function importJSON(text, merge) {
    var data = JSON.parse(text);
    if (!data || !data.notes || !data.progress) throw new Error('This file is not an EE211 study-site backup.');
    if (!merge) { state = data; }
    else {
      Object.keys(data.notes.lessons || {}).forEach(function (id) {
        var cur = lessonNotes(id), inc = data.notes.lessons[id];
        if (inc.free && inc.free !== cur.free) cur.free = cur.free ? cur.free + '\n\n--- imported ---\n' + inc.free : inc.free;
        var have = {};
        cur.items.forEach(function (it) { have[it.id] = 1; });
        (inc.items || []).forEach(function (it) { if (!have[it.id]) cur.items.push(it); });
        cur.items.sort(function (a, b) { return (a.t == null ? 1e9 : a.t) - (b.t == null ? 1e9 : b.t); });
      });
      Object.keys(data.notes.topics || {}).forEach(function (id) {
        var inc = data.notes.topics[id] || '';
        var cur = state.notes.topics[id] || '';
        if (inc && inc !== cur) state.notes.topics[id] = cur ? cur + '\n\n--- imported ---\n' + inc : inc;
      });
      Object.keys(data.progress.lessons || {}).forEach(function (id) {
        var cur = lessonProgress(id), inc = data.progress.lessons[id];
        cur.done = cur.done || inc.done;
        Object.keys(inc.secs || {}).forEach(function (k) { if (inc.secs[k]) cur.secs[k] = true; });
        if (!cur.pos && inc.pos) cur.pos = inc.pos;
      });
      Object.keys(data.progress.practice || {}).forEach(function (id) {
        var cur = practiceProgress(id), inc = data.progress.practice[id];
        cur.attempts = Math.max(cur.attempts, inc.attempts || 0);
        cur.solved = cur.solved || inc.solved;
        cur.hints = Math.max(cur.hints, inc.hints || 0);
        cur.revealed = cur.revealed || inc.revealed;
      });
    }
    saveNow();
  }

  load();
  global.EEStore = {
    get state() { return state; },
    get available() { return available; },
    get lastSaved() { return lastSaved; },
    save: save, saveNow: saveNow,
    lessonNotes: lessonNotes, lessonProgress: lessonProgress, practiceProgress: practiceProgress,
    exportJSON: exportJSON, importJSON: importJSON,
    onSave: function (f) { listeners.push(f); },
    reset: function () { state = blank(); saveNow(); }
  };
  global.addEventListener('beforeunload', function () { if (saveTimer) saveNow(); });
  global.addEventListener('pagehide', function () { if (saveTimer) saveNow(); });
})(window);
