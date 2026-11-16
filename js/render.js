/* Shared renderer for HTML content fragments (guides, practice): KaTeX math, diagrams, timestamp links. */
(function (global) {
  'use strict';

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = (h ? String(m).padStart(2, '0') : String(m));
    return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
  }

  function parseTime(str) {
    if (typeof str === 'number') return str;
    str = String(str).trim();
    if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);
    var parts = str.split(':').map(Number);
    if (parts.some(isNaN)) return NaN;
    var t = 0;
    parts.forEach(function (p) { t = t * 60 + p; });
    return t;
  }

  function renderMath(root) {
    var errors = [];
    if (!global.renderMathInElement) return ['KaTeX auto-render not loaded'];
    global.renderMathInElement(root, {
      delimiters: [
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option', 'svg'],
      errorCallback: function (msg, err) { errors.push(String(msg) + ' ' + (err && err.message || '')); }
    });
    Array.prototype.forEach.call(root.querySelectorAll('.katex-error'), function (el) {
      errors.push('KaTeX: ' + (el.getAttribute('title') || el.textContent).slice(0, 160));
    });
    return errors;
  }

  /* Normalise <a class="ts" data-t="..."> links: fill text if empty, add aria label. */
  function decorateTimestamps(root, lessonId, duration) {
    var problems = [];
    Array.prototype.forEach.call(root.querySelectorAll('a.ts'), function (a) {
      var t = parseTime(a.getAttribute('data-t'));
      if (isNaN(t)) { problems.push('bad data-t "' + a.getAttribute('data-t') + '"'); return; }
      if (duration && t > duration + 1) problems.push('timestamp ' + fmtTime(t) + ' beyond video length ' + fmtTime(duration));
      a.setAttribute('data-t', String(t));
      if (!a.textContent.trim()) a.textContent = fmtTime(t);
      if (lessonId && !a.getAttribute('data-lesson')) a.setAttribute('data-lesson', lessonId);
      a.setAttribute('href', '#');
      a.setAttribute('role', 'button');
      a.setAttribute('title', 'Play the video from ' + fmtTime(t));
    });
    return problems;
  }

  function renderContent(root, opts) {
    opts = opts || {};
    var errs = [];
    if (global.EEDiagrams) errs = errs.concat(global.EEDiagrams.renderDiagrams(root));
    errs = errs.concat(decorateTimestamps(root, opts.lessonId, opts.duration));
    errs = errs.concat(renderMath(root));
    return errs;
  }

  global.EERender = { renderContent: renderContent, renderMath: renderMath, fmtTime: fmtTime, parseTime: parseTime };
})(window);
