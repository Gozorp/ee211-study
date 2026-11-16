/* EE 211 — reusable lesson-notes component (timestamped notes + free-form notes).
 * Used by Watch, My Notes (topic) and All notes. Exposed as EEApp.notesUI.
 *
 *   EEApp.notesUI.lesson(el, lessonId, opts) -> { refresh(), focusNew(t), add(t, text, sec), setFilter(q), destroy() }
 *   opts: { composer: bool (new-note box), free: bool (free-form textarea), getTime(): seconds|null,
 *           compact: bool, showEmpty: bool, filter: string, onChange() }
 */
(function (global) {
  'use strict';
  var A = global.EEApp, U = A.ui, S = A.store, esc = U.esc, icon = U.icon;

  function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 420) + 'px'; }
  function dock() { return global.EEDock; }

  function lesson(el, lessonId, opts) {
    opts = opts || {};
    var L = A.data.lesson(lessonId);
    var filter = (opts.filter || '').toLowerCase();
    var captured = null;   // time captured for the composer
    var alive = true;

    el.classList.add('notes-ui');
    el.innerHTML =
      (opts.composer ? '<form class="nu-new" novalidate>' +
        '<label class="nu-new-label" for="nuNew-' + lessonId + '">New note <span class="nu-at mono"></span></label>' +
        '<textarea id="nuNew-' + lessonId + '" class="nu-new-ta" rows="2" placeholder="Type while you watch. The note is pinned to the video time shown."></textarea>' +
        '<div class="nu-new-row">' + U.btn('Add note', { kind: 'primary', small: true, icon: 'plus', cls: 'nu-add' }) +
        U.btn('Use current time', { small: true, kind: 'ghost', icon: 'clock', cls: 'nu-now' }) +
        U.btn('Add without time', { small: true, kind: 'ghost', cls: 'nu-notime' }) + '<span class="nu-hint muted small">Ctrl+Enter adds</span></div></form>' : '') +
      '<ul class="nu-list" aria-label="Timestamped notes' + (L ? ' for ' + esc(L.title) : '') + '"></ul>' +
      (opts.free ? '<div class="nu-free"><label class="nu-free-label" for="nuFree-' + lessonId + '">Lesson notes <span class="muted small">(free-form)</span></label>' +
        '<textarea id="nuFree-' + lessonId + '" class="nu-free-ta" rows="4" placeholder="Summaries, questions for office hours, formulas to memorise…"></textarea></div>' : '');

    var list = el.querySelector('.nu-list');

    function timeNow() { var t = opts.getTime ? opts.getTime() : null; return t == null ? null : Math.floor(t); }
    function showCaptured() {
      var at = el.querySelector('.nu-at'); if (!at) return;
      var t = captured != null ? captured : timeNow();
      at.textContent = t != null ? 'at ' + U.fmt(t) : '';
      var add = el.querySelector('.nu-add span'); if (add) add.textContent = t != null ? 'Add note at ' + U.fmt(t) : 'Add note';
    }

    function itemEl(it) {
      var li = U.h('<li class="nu-item" data-id="' + esc(it.id) + '"></li>');
      var head = '<div class="nu-meta">' +
        (it.t != null ? '<button type="button" class="nu-time mono" title="Play from ' + U.fmt(it.t) + '">' + icon('play') + U.fmt(it.t) + '</button>' : '<span class="chip">No time</span>') +
        (it.sec ? '<button type="button" class="nu-sec" title="Open the guide section this note belongs to">' + icon('understand') + '<span>Guide section</span></button>' : '') +
        '<span class="nu-spacer"></span><button type="button" class="icon-btn nu-del" aria-label="Delete note' + (it.t != null ? ' at ' + U.fmt(it.t) : '') + '">' + icon('trash') + '</button></div>' +
        '<textarea class="nu-text" rows="1" aria-label="Note text' + (it.t != null ? ' at ' + U.fmt(it.t) : '') + '"></textarea>';
      li.innerHTML = head;
      var ta = li.querySelector('.nu-text');
      ta.value = it.text || '';
      ta.addEventListener('input', function () { S.updateNote(lessonId, it.id, ta.value); autoGrow(ta); if (opts.onChange) opts.onChange(); });
      ta.addEventListener('keydown', function (e) { if (e.key === 'Escape') ta.blur(); });
      /* a note left empty (e.g. "Add a note" then clicking away) is discarded instead of kept as a blank card */
      ta.addEventListener('blur', function () {
        setTimeout(function () {
          if (!alive || ta.value.trim() || !li.isConnected || li.contains(document.activeElement)) return;
          S.deleteNote(lessonId, it.id);
          refresh();
          if (opts.onChange) opts.onChange();
        }, 150);
      });
      var tb = li.querySelector('.nu-time');
      if (tb) tb.onclick = function () { if (dock()) dock().load(lessonId, { t: it.t, play: true }); };
      var sb = li.querySelector('.nu-sec');
      if (sb) {
        A.data.guideSections(lessonId).then(function (secs) {
          var s = secs.filter(function (x) { return x.id === it.sec; })[0];
          var span = sb.querySelector('span'); if (s && span) span.textContent = s.title;
        }).catch(function () {});
        sb.onclick = function () { A.peek.open({ lessonId: lessonId, secId: it.sec }); };
      }
      li.querySelector('.nu-del').onclick = function () {
        var removed = S.deleteNote(lessonId, it.id) || it;
        li.classList.add('removing');
        setTimeout(function () { refresh(); }, U.reducedMotion() ? 0 : 160);
        if (opts.onChange) opts.onChange();
        A.toast('Note deleted', { action: 'Undo', onAction: function () { S.restoreNote(lessonId, removed); refresh(removed.id); if (opts.onChange) opts.onChange(); } });
      };
      setTimeout(function () { autoGrow(ta); }, 0);
      return li;
    }

    function refresh(flashId) {
      if (!alive) return;
      var items = S.sortedNotes(lessonId).filter(function (it) { return !filter || (it.text || '').toLowerCase().indexOf(filter) >= 0; });
      list.innerHTML = '';
      if (!items.length) {
        if (opts.showEmpty !== false) list.innerHTML = '<li class="nu-empty">' + (filter ? 'No notes match.' : (opts.emptyText || 'No timestamped notes yet.')) + '</li>';
      }
      items.forEach(function (it) {
        var li = itemEl(it);
        if (flashId && flashId === it.id) {
          li.classList.add('flash');
          setTimeout(function () { var ta = li.querySelector('.nu-text'); ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {} }, 40);
        }
        list.appendChild(li);
      });
      var free = el.querySelector('.nu-free-ta');
      if (free && document.activeElement !== free) { var n = A.data && global.EEStore.state.notes.lessons[lessonId]; free.value = (n && n.free) || ''; setTimeout(function () { autoGrow(free); }, 0); }
    }

    function add(t, text, sec) {
      var it = S.addNote(lessonId, { t: t, text: text || '', sec: sec || null });
      refresh(it && it.id);
      if (opts.onChange) opts.onChange();
      A.announce('Note added' + (t != null ? ' at ' + U.fmt(t) : ''));
      return it;
    }

    if (opts.composer) {
      var form = el.querySelector('.nu-new'), nta = el.querySelector('.nu-new-ta');
      nta.addEventListener('focus', function () { if (captured == null && !nta.value) { captured = timeNow(); showCaptured(); } });
      nta.addEventListener('input', function () { autoGrow(nta); });
      function submit(noTime) {
        var t = noTime ? null : (captured != null ? captured : timeNow());
        var txt = nta.value.trim();
        if (!txt) {                         /* nothing typed: don't save a blank note, ask for text instead */
          nta.focus();
          A.announce('Type the note first, then add it.');
          var hint = el.querySelector('.nu-hint');
          if (hint) { hint.textContent = 'Type the note first'; setTimeout(function () { hint.textContent = 'Ctrl+Enter adds'; }, 2200); }
          return;
        }
        add(t, txt);
        nta.value = ''; captured = null; showCaptured(); autoGrow(nta);
      }
      el.querySelector('.nu-add').onclick = function () { submit(false); };
      el.querySelector('.nu-notime').onclick = function () { submit(true); };
      el.querySelector('.nu-now').onclick = function () { captured = timeNow(); showCaptured(); nta.focus(); };
      nta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(false); } });
      form.addEventListener('submit', function (e) { e.preventDefault(); submit(false); });
      showCaptured();
    }
    if (opts.free) {
      var fta = el.querySelector('.nu-free-ta');
      fta.addEventListener('input', function () { S.setFree(lessonId, fta.value); autoGrow(fta); if (opts.onChange) opts.onChange(); });
    }
    refresh();

    return {
      refresh: refresh,
      add: add,
      focusNew: function (t) {
        var nta2 = el.querySelector('.nu-new-ta');
        if (!nta2) return;
        captured = t != null ? Math.floor(t) : timeNow(); showCaptured();
        setTimeout(function () { nta2.focus({ preventScroll: true }); nta2.scrollIntoView({ block: 'nearest' }); }, 30);
      },
      tick: function () { if (captured == null) showCaptured(); },
      setFilter: function (q) { filter = (q || '').toLowerCase(); refresh(); },
      count: function () { return S.sortedNotes(lessonId).length; },
      destroy: function () { alive = false; }
    };
  }

  /* Export helpers shared by All notes and topic notes */
  function lessonHasNotes(l) { var n = global.EEStore.state.notes.lessons[l.id]; return !!(n && ((n.free && n.free.trim()) || (n.items || []).length)); }
  function exportMarkdown(tids, title) {
    var st = global.EEStore.state;
    var out = '# ' + (title || 'EE 211 study notes') + '\n\nExported ' + new Date().toLocaleString() + '\n';
    A.TOPICS.forEach(function (t) {
      if (tids && tids.indexOf(t.id) < 0) return;
      var parts = [];
      var tn = st.notes.topics[t.id];
      if (tn && tn.trim()) parts.push('### Topic notes\n\n' + tn.trim() + '\n');
      A.data.topicLessons(t.id).forEach(function (l) {
        if (!lessonHasNotes(l)) return;
        var n = st.notes.lessons[l.id];
        var s = '### ' + l.title + '\n\nVideo: [' + l.ytTitle + '](' + A.data.ytUrl(l) + ')\n\n';
        S.sortedNotes(l.id).forEach(function (it) {
          s += '- ' + (it.t != null ? '[' + U.fmt(it.t) + '](' + A.data.ytUrl(l, it.t) + ') ' : '') + (it.text || '').replace(/\n/g, '\n  ') + '\n';
        });
        if (n.free && n.free.trim()) s += '\n**Lesson notes**\n\n' + n.free.trim() + '\n';
        parts.push(s);
      });
      if (parts.length) out += '\n## ' + t.title + '\n\n' + parts.join('\n');
    });
    return out;
  }
  function exportText(tids, title) { return exportMarkdown(tids, title).replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 <$2>').replace(/\*\*/g, '').replace(/^#+ /gm, ''); }
  function exportHTML(tids, title) {
    var st = global.EEStore.state, body = '';
    A.TOPICS.forEach(function (t) {
      if (tids && tids.indexOf(t.id) < 0) return;
      var sec = '';
      var tn = st.notes.topics[t.id];
      if (tn && tn.trim()) sec += '<h3>Topic notes</h3><p>' + esc(tn).replace(/\n/g, '<br>') + '</p>';
      A.data.topicLessons(t.id).forEach(function (l) {
        if (!lessonHasNotes(l)) return;
        var n = st.notes.lessons[l.id];
        sec += '<h3>' + esc(l.title) + '</h3><p class="v">Video: <a href="' + A.data.ytUrl(l) + '">' + esc(l.ytTitle) + '</a></p><ul>';
        S.sortedNotes(l.id).forEach(function (it) {
          sec += '<li>' + (it.t != null ? '<a href="' + A.data.ytUrl(l, it.t) + '"><b>' + U.fmt(it.t) + '</b></a> ' : '') + esc(it.text || '').replace(/\n/g, '<br>') + '</li>';
        });
        sec += '</ul>' + (n.free && n.free.trim() ? '<h4>Lesson notes</h4><p>' + esc(n.free).replace(/\n/g, '<br>') + '</p>' : '');
      });
      if (sec) body += '<h2>' + esc(t.title) + '</h2>' + sec;
    });
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(title || 'EE 211 notes') + '</title>' +
      '<style>body{font:16px/1.6 system-ui,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#121821;background:#fff}h1{font-size:1.6rem}h2{border-bottom:2px solid #3a55d0;padding-bottom:4px;margin-top:2em}h3{margin-bottom:2px}.v{color:#5c687a;font-size:.9em;margin-top:0}a{color:#2457c5}li{margin:4px 0}</style></head><body><h1>' + esc(title || 'EE 211 study notes') + '</h1><p>Exported ' + esc(new Date().toLocaleString()) + '</p>' + (body || '<p>No notes yet.</p>') + '</body></html>';
  }

  A.notesUI = { lesson: lesson, lessonHasNotes: lessonHasNotes, exportMarkdown: exportMarkdown, exportText: exportText, exportHTML: exportHTML, autoGrow: autoGrow };
})(window);
