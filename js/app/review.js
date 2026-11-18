/* EE 211 — Review mode (SHELL-B).
 * 1 Your standing (Studied vs Understood, sections reviewed, notes, lessons at a glance)
 * 2 Revisit these (struggled questions with reasons + flagged sections)
 * 3 Key concepts (each lesson's recap section without its formula sheet)
 * 4 Formula sheet (every .formula-sheet of the topic's guides)
 * 5 Common mistakes (each lesson's mistakes section)
 * 6 Quick self-check (term -> definition cards from the definitions tables / lists)
 * Content comes unchanged from the study guides; only its arrangement is new. */
(function (global) {
  'use strict';
  var A = global.EEApp, U = A.ui, S = A.store, store = global.EEStore;
  var esc = U.esc, icon = U.icon, $ = U.$, $$ = U.$$;
  var doc = global.document;
  var cardOffset = {};   // tid -> {shown: {key: true}, cur: [keys on screen]} for "Show other cards" (session only)

  function prefs() { return store.state.prefs || (store.state.prefs = {}); }
  function cardsState(tid) {
    var r = store.state.review || (store.state.review = { cards: {} });
    r.cards = r.cards || {};
    return r.cards[tid] || (r.cards[tid] = {});
  }
  function lessonNotesCount(l) {
    var n = store.state.notes.lessons[l.id];
    return ((n && n.items) || []).length + (n && n.free && n.free.trim() ? 1 : 0);
  }
  function plainText(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
  /* plain-text key for a term cell: TeX source survives in the unrendered template, so keys are stable */
  function termKey(lessonId, html) { var d = doc.createElement('div'); d.innerHTML = html; return lessonId + ':' + plainText(d).slice(0, 80); }

  /* definitions -> [{term(html), def(html), unit, key, lessonId}] ; only clean, two-part rows */
  function extractDefs(tpl, l) {
    var sec = tpl.content.querySelector('section[data-kind="definitions"]');
    var out = [];
    if (!sec) return out;
    $$('table tr', sec).forEach(function (tr) {
      var tds = $$(':scope > td', tr);
      if (tds.length < 2) return;
      var term = tds[0].innerHTML.trim(), def = tds[1].innerHTML.trim();
      if (!plainText(tds[0]) || !plainText(tds[1])) return;
      var unit = tds[2] ? plainText(tds[2]) : '';
      out.push({ term: term, def: def, unit: unit && unit !== '—' && unit !== '-' ? tds[2].innerHTML.trim() : '', key: termKey(l.id, term), lessonId: l.id });
    });
    $$('dl', sec).forEach(function (dl) {
      var kids = $$(':scope > dt, :scope > dd', dl);
      for (var i = 0; i < kids.length - 1; i++) {
        if (kids[i].tagName === 'DT' && kids[i + 1].tagName === 'DD') out.push({ term: kids[i].innerHTML.trim(), def: kids[i + 1].innerHTML.trim(), unit: '', key: termKey(l.id, kids[i].innerHTML), lessonId: l.id });
      }
    });
    return out;
  }

  /* "Retry question" starts a new attempt (EEPractice.retry, the card's own "Try again") once the practice card is
   * mounted, when that question is solved or its solution was shown. An attempt in progress is only opened. */
  function retryIntent(e, qid, href) {
    var p = store.state.progress.practice[qid];
    if (!qid || !p || !p.cur || !(p.cur.solved || p.cur.revealed)) return;   // plain link
    if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;  // new tab / window: just open it
    e.preventDefault();
    A.go(href);
    var tries = 0;
    (function attempt() {
      if (global.location.hash.split('?')[0] !== href) return;               // the student went elsewhere
      if (global.EEPractice && global.EEPractice.retry && global.EEPractice.retry(qid)) { A.announce('New attempt started. The card is blank.'); return; }
      if (++tries < 60) setTimeout(attempt, 100);
    })();
  }

  function subSeg(ctx, onChange) {
    if (!ctx.topic || !ctx.topic.subs) return null;
    var opts = [{ value: 'all', label: 'All' }].concat(ctx.topic.subs.map(function (s) { return { value: s.id, label: s.title }; }));
    return U.seg({ label: 'Show lessons from', options: opts, value: ctx.sub || 'all', small: true, cls: 'sub-seg', onChange: function (v) {
      prefs().lcSub = v; store.save(600); ctx.sub = v; ctx.setQuery({ sub: v === 'all' ? null : v }); onChange(v);
    } });
  }

  function render(ctx) {
    var tid = ctx.tid;
    ctx.setTitle('');
    ctx.el.innerHTML = '<div class="page review">' +
      '<header class="page-head"><p class="eyebrow">Review · ' + esc(ctx.topic.name) + '</p><h1>Review</h1>' +
      '<p class="lede">Check where you stand, go back to what gave you trouble, and go over the essentials of every lesson in one place.</p></header>' +
      '<div class="rv-bar"><nav class="rv-jump" aria-label="Jump to"></nav></div>' +
      '<div class="rv-body"></div></div>';
    var page = $('.review', ctx.el), body = $('.rv-body', ctx.el);
    var seg = subSeg(ctx, function () { build(); });
    if (seg) $('.rv-bar', ctx.el).insertBefore(seg, $('.rv-bar', ctx.el).firstChild);
    var gen = 0;

    function build() {
      var my = ++gen;
      var sub = ctx.sub && ctx.sub !== 'all' ? ctx.sub : null;
      var ls = A.data.topicLessons(tid, sub || 'all');
      var st = A.progress.topicStats(tid);
      var reviewed = 0, totalSecs = 0, notes = 0, done = 0;
      ls.forEach(function (l) {
        var p = store.state.progress.lessons[l.id];
        reviewed += p ? Object.keys(p.secs || {}).filter(function (k) { return p.secs[k]; }).length : 0;
        totalSecs += l.secCount || 0;
        notes += lessonNotesCount(l);
        if (p && p.done) done++;
      });
      var tn = store.state.notes.topics[tid]; if (tn && tn.trim()) notes++;
      var wsum = 0, wtot = 0;
      ls.forEach(function (l) { var d = A.data.relevantDuration(l); wtot += d; wsum += d * A.progress.lessonWatched(l); });
      var watched = wtot ? wsum / wtot : 0;
      var subLabel = sub ? ' (' + A.data.subTitle(tid, sub) + ')' : '';

      var sections = [
        { id: 'rv-standing', title: 'Your standing' },
        { id: 'rv-revisit', title: 'Revisit these' },
        { id: 'rv-exams', title: 'From past exams' },
        { id: 'rv-recap', title: 'Key concepts' },
        { id: 'rv-formulas', title: 'Formula sheet' },
        { id: 'rv-mistakes', title: 'Common mistakes' },
        { id: 'rv-check', title: 'Quick self-check' }
      ];
      body.innerHTML =
        '<section class="rv-sec" id="rv-standing" aria-labelledby="rv-standing-h"><h2 id="rv-standing-h" class="sec-title">Your standing' + esc(subLabel) + '</h2><div class="standing-grid">' +
        ' <div class="card std std-studied"><div class="std-fig">' + U.ring(ls.length ? done / ls.length : 0, { size: 56, stroke: 5 }) + '</div><div><p class="std-label">Studied</p><p class="std-value">' + done + ' of ' + U.plural(ls.length, 'lesson') + ' complete</p><p class="small muted">' + U.pct(watched) + '% of the relevant video watched. Studied counts what you have gone through.</p></div></div>' +
        ' <div class="card std std-understood"><div class="std-fig">' + U.diamonds(st.core, st.help) + '</div><div><p class="std-label">Understood</p><p class="std-value">' + st.core + ' of 4 scenarios solved on your own</p><p class="small muted">' + (st.help ? st.help + ' more solved with help. ' : '') + (st.bonus ? st.bonus + ' bonus solved. ' : '') + 'Understood counts what you have shown you can do without the solution.</p></div></div>' +
        ' <div class="card std"><div class="std-fig std-num">' + reviewed + '</div><div><p class="std-label">Guide sections reviewed</p><p class="std-value">' + reviewed + ' of ' + totalSecs + '</p><p class="small muted">Tick "Reviewed" on a section in Understand. You have ' + U.plural(notes, 'note') + ' here.</p></div></div>' +
        '</div>' +
        '<details class="rv-glance"' + (ls.length <= 5 ? ' open' : '') + '><summary>Lessons at a glance</summary><div class="glance-wrap"><table class="glance"><thead><tr><th scope="col">Lesson</th><th scope="col">Complete</th><th scope="col">Watched</th><th scope="col">Sections reviewed</th><th scope="col">Flags</th><th scope="col">Notes</th></tr></thead><tbody>' +
        ls.map(function (l) {
          var p = store.state.progress.lessons[l.id] || {};
          var rv = Object.keys(p.secs || {}).filter(function (k) { return p.secs[k]; }).length, fl = Object.keys(p.flags || {}).filter(function (k) { return p.flags[k]; }).length;
          var w = A.progress.lessonWatched(l), sc = l.secCount || 0;
          return '<tr><th scope="row"><a href="' + A.href.understand(l.id) + '"><span class="mono cl-num">' + A.data.lessonIndex(l).n + '</span> ' + esc(l.title) + '</a></th>' +
            '<td>' + (p.done ? '<span class="ok-text">' + icon('check') + '<span class="sr-only">yes</span></span>' : '<span class="muted">—</span>') + '</td>' +
            '<td class="mono">' + U.pct(w) + '%</td>' +
            '<td><span class="mini-bar" aria-hidden="true"><span style="width:' + (sc ? Math.round(rv / sc * 100) : 0) + '%"></span></span> <span class="mono">' + rv + '/' + sc + '</span></td>' +
            '<td class="mono">' + (fl || '<span class="muted">0</span>') + '</td><td class="mono">' + (lessonNotesCount(l) || '<span class="muted">0</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div></details></section>' +
        '<section class="rv-sec" id="rv-revisit" aria-labelledby="rv-revisit-h"><h2 id="rv-revisit-h" class="sec-title">Revisit these</h2><div class="rv-revisit"><p class="muted small">Checking…</p></div></section>' +
        '<section class="rv-sec" id="rv-exams" aria-label="From past exams" hidden><div class="xm-from-slot"></div></section>' +
        '<section class="rv-sec" id="rv-recap" aria-labelledby="rv-recap-h"><div class="sec-head"><h2 id="rv-recap-h" class="sec-title">Key concepts</h2><span class="rv-oc"></span></div><p class="small muted rv-intro">The recap of each lesson, as written in its study guide.</p><div class="rv-recap"><p class="muted small">Loading…</p></div></section>' +
        '<section class="rv-sec" id="rv-formulas" aria-labelledby="rv-formulas-h"><h2 id="rv-formulas-h" class="sec-title">Formula sheet</h2><p class="small muted rv-intro">Every formula sheet from this topic\'s guides, with variables and units.</p><div class="rv-formulas"><p class="muted small">Loading…</p></div></section>' +
        '<section class="rv-sec" id="rv-mistakes" aria-labelledby="rv-mistakes-h"><div class="sec-head"><h2 id="rv-mistakes-h" class="sec-title">Common mistakes</h2><span class="rv-oc"></span></div><div class="rv-mistakes"><p class="muted small">Loading…</p></div></section>' +
        '<section class="rv-sec" id="rv-check" aria-labelledby="rv-check-h" hidden><div class="sec-head"><h2 id="rv-check-h" class="sec-title">Quick self-check</h2><span class="rv-check-tally small muted" aria-live="polite"></span></div><p class="small muted rv-intro">Say the meaning out loud, then turn the card. Cards you mark "Review again" come back first.</p><div class="rv-cards"></div></section>';

      var jump = $('.rv-jump', ctx.el);
      jump.innerHTML = sections.map(function (s) { return '<button type="button" class="chip-link" data-target="' + s.id + '">' + esc(s.title) + '</button>'; }).join('');
      jump.onclick = function (e) {
        var b = e.target.closest('button[data-target]'); if (!b) return;
        var t = doc.getElementById(b.getAttribute('data-target')); if (!t || t.hidden) return;
        var hdr = doc.getElementById('hdr'), mb = doc.querySelector('.modebar'), bar = $('.rv-bar', ctx.el);
        // header + sticky mode bar + the sticky jump bar itself (static on phones) + a little air
        var off = (hdr ? hdr.getBoundingClientRect().height : 56) + (mb && getComputedStyle(mb).position === 'sticky' ? mb.offsetHeight : 0) +
          (bar && getComputedStyle(bar).position === 'sticky' ? bar.offsetHeight : 0) + 12;
        global.scrollTo({ top: global.scrollY + t.getBoundingClientRect().top - off, behavior: U.reducedMotion() ? 'auto' : 'smooth' });
        var h = t.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (x) {} }
      };

      /* ---- past exam questions on this topic (js/app/exams.js); the section and its jump chip stay hidden when there are none ---- */
      var xmSec = doc.getElementById('rv-exams'), xmJump = $('.rv-jump [data-target="rv-exams"]', ctx.el);
      if (xmJump) xmJump.hidden = true;
      if (A.exams && xmSec) A.exams.topicCard(tid, $('.xm-from-slot', xmSec), ctx).then(function () {
        if (!ctx.alive() || my !== gen) return;
        var on = !$('.xm-from-slot', xmSec).hidden;
        xmSec.hidden = !on; if (xmJump) xmJump.hidden = !on;
      });

      /* ---- 2. revisit ---- */
      var lessonIds = ls.map(function (l) { return l.id; });
      var items = (S.revisitList(tid) || []).filter(function (it) { return it.type !== 'section' || lessonIds.indexOf(it.lessonId) >= 0; });
      items.sort(function (a, b) { return (a.type === 'question' ? 0 : 1) - (b.type === 'question' ? 0 : 1); });
      var rv = $('.rv-revisit', ctx.el);
      var p1 = A.data.practiceQuestions(tid).catch(function () { return []; }).then(function (qs) {
        if (!ctx.alive() || my !== gen) return;
        if (!items.length) {
          rv.innerHTML = U.empty({ icon: 'check', title: 'Nothing to revisit right now', text: 'Questions that took two or more wrong tries, two or more hints or the solution, and guide sections you flag, show up here. Keep going: practice is where understanding shows.',
            actions: U.btn('Go to Practice', { small: true, kind: 'primary', icon: 'practice', href: A.href.practice(tid) }) });
          return;
        }
        rv.innerHTML = '<ul class="rev-list">' + items.map(function (it, i) {
          if (it.type === 'question') {
            var q = qs.filter(function (x) { return x.qid === it.qid; })[0];
            var rs = it.reasons && it.reasons.length ? it.reasons : S.reasons(store.state.progress.practice[it.qid]);
            return '<li class="rev-item rev-q" data-i="' + i + '"><span class="rev-glyph">' + icon('practice') + '</span><span class="rev-text"><span class="rev-kind">Practice · ' + (q ? (q.bonus ? 'Bonus' : 'Question ' + esc(q.num)) : esc(it.qid)) + (q && q.sub ? ' · ' + esc(q.sub) : '') + '</span><span class="rev-title">' + (q ? q.titleHTML : esc(it.qid)) + '</span>' +
              '<span class="rev-reasons">' + rs.map(function (r) { return '<span class="chip warn">' + esc(r) + '</span>'; }).join('') + '</span></span>' +
              '<span class="rev-actions">' + U.btn('Retry question', { small: true, kind: 'primary', icon: 'practice', cls: 'rv-retry', href: A.href.practice(tid, it.qid), attrs: ' data-qid="' + esc(it.qid) + '"' }) +
              (q && q.review ? U.btn('Review the concept', { small: true, kind: 'ghost', icon: 'understand', cls: 'rv-peek', attrs: ' data-lesson="' + esc(q.review.lessonId) + '" data-sec="' + esc(q.review.secId || '') + '"' }) : '') +
              (q && q.watch && q.watch.lessonId ? U.btn('Watch the explanation', { small: true, kind: 'ghost', icon: 'play', cls: 'rv-watch', attrs: ' data-lesson="' + esc(q.watch.lessonId) + '" data-t="' + (q.watch.t || 0) + '"' }) : '') + '</span></li>';
          }
          var L = A.data.lesson(it.lessonId);
          return '<li class="rev-item rev-s"><span class="rev-glyph">' + icon('flag') + '</span><span class="rev-text"><span class="rev-kind">Flagged section' + (L ? ' · ' + esc(L.title) : '') + '</span><span class="rev-title" data-l="' + esc(it.lessonId) + '" data-s="' + esc(it.secId) + '">' + esc(it.secId) + '</span></span>' +
            '<span class="rev-actions">' + U.btn('Peek', { small: true, kind: 'ghost', icon: 'understand', cls: 'rv-peek', attrs: ' data-lesson="' + esc(it.lessonId) + '" data-sec="' + esc(it.secId) + '"', title: 'Read the section here' }) +
            U.btn('Open section', { small: true, kind: 'ghost', icon: 'right', href: A.href.understand(it.lessonId, it.secId) }) +
            U.btn('Mark done', { small: true, kind: 'primary', icon: 'check', cls: 'rv-unflag', attrs: ' data-lesson="' + esc(it.lessonId) + '" data-sec="' + esc(it.secId) + '"', title: 'Remove the flag and mark the section reviewed' }) + '</span></li>';
        }).join('') + '</ul>';
        A.renderContent(rv, null);
        $$('.rev-title[data-l]', rv).forEach(function (el) {
          A.data.guideSections(el.getAttribute('data-l')).then(function (secs) {
            var s = secs.filter(function (x) { return x.id === el.getAttribute('data-s'); })[0];
            if (s && el.isConnected) { el.innerHTML = s.titleHTML; A.renderContent(el, null); }
          }).catch(function () {});
        });
        $$('.rv-retry', rv).forEach(function (b) { b.addEventListener('click', function (e) { retryIntent(e, b.getAttribute('data-qid'), b.getAttribute('href')); }); });
        $$('.rv-peek', rv).forEach(function (b) { b.onclick = function () { A.peek.open({ lessonId: b.getAttribute('data-lesson'), secId: b.getAttribute('data-sec') || null }); }; });
        $$('.rv-watch', rv).forEach(function (b) { b.onclick = function () { if (global.EEDock) global.EEDock.load(b.getAttribute('data-lesson'), { t: +b.getAttribute('data-t') || 0, play: true }); }; });
        $$('.rv-unflag', rv).forEach(function (b) {
          b.onclick = function () {
            var lid = b.getAttribute('data-lesson'), sid = b.getAttribute('data-sec');
            var p = S.lp(lid); p.flags = p.flags || {}; p.secs = p.secs || {};
            var wasRev = !!p.secs[sid];
            delete p.flags[sid]; p.secs[sid] = true; p.updated = Date.now(); store.save();
            var li = b.closest('li');
            li.classList.add('removing');
            setTimeout(function () { li.hidden = true; if (!$$('.rev-item:not([hidden])', rv).length) build(); }, U.reducedMotion() ? 0 : 200);
            A.toast('Section marked done', { action: 'Undo', onAction: function () { p.flags[sid] = true; if (!wasRev) delete p.secs[sid]; store.save(); build(); } });
          };
        });
      });

      /* ---- 3–6: from the guides ---- */
      var p2 = Promise.all(ls.map(function (l) { return A.data.guideTemplate(l.id).then(function (tpl) { return { l: l, tpl: tpl }; }, function () { return { l: l, tpl: null }; }); })).then(function (res) {
        if (!ctx.alive() || my !== gen) return;
        var rc = $('.rv-recap', ctx.el), fs = $('.rv-formulas', ctx.el), mk = $('.rv-mistakes', ctx.el);
        rc.innerHTML = ''; fs.innerHTML = ''; mk.innerHTML = '';
        var defs = [];
        res.forEach(function (r, i) {
          if (!r.tpl) return;
          var root = r.tpl.content;
          var recap = root.querySelector('section[data-kind="recap"]');
          var mist = root.querySelector('section[data-kind="mistakes"]');
          var n = A.data.lessonIndex(r.l).n;
          function block(sec, strip) {
            var d = U.h('<details class="rv-block"' + (i === 0 ? ' open' : '') + '><summary><span class="mono cl-num">' + n + '</span><span class="rv-lesson">' + esc(r.l.title) + '</span><a class="rv-open small" href="' + A.href.understand(r.l.id, sec.id) + '">Open in guide</a></summary><div class="guide rv-content" data-lesson="' + r.l.id + '"></div></details>');
            var c = sec.cloneNode(true);
            c.removeAttribute('id');
            var h2 = c.querySelector(':scope > h2'); if (h2) h2.remove();
            if (strip) $$(strip, c).forEach(function (x) { x.remove(); });
            $$('[id]', c).forEach(function (x) { x.removeAttribute('id'); });   // avoid duplicate ids with other views
            $('.rv-content', d).appendChild(c);
            return d;
          }
          if (recap) rc.appendChild(block(recap, '.formula-sheet'));
          $$('.formula-sheet', root).forEach(function (f) {
            var host = f.closest('section.g-sec');
            var d = U.h('<div class="rv-fs"><h3 class="rv-fs-title"><span class="mono cl-num">' + n + '</span> ' + esc(r.l.title) + ' <a class="small" href="' + A.href.understand(r.l.id, host ? host.id : null) + '">Open section</a></h3><div class="guide" data-lesson="' + r.l.id + '"></div></div>');
            var c = f.cloneNode(true); $$('[id]', c).forEach(function (x) { x.removeAttribute('id'); }); c.removeAttribute('id');
            $('.guide', d).appendChild(c);
            fs.appendChild(d);
          });
          if (mist) mk.appendChild(block(mist));
          defs = defs.concat(extractDefs(r.tpl, r.l));
        });
        [rc, fs, mk].forEach(function (b) {
          if (!b.children.length) b.innerHTML = '<p class="muted small">Nothing here for these lessons.</p>';
          $$('[data-lesson]', b).forEach(function (g) { if (g.classList.contains('guide')) A.renderContent(g, g.getAttribute('data-lesson')); });
        });
        // open / close all for the collapsible lists
        [['#rv-recap', rc], ['#rv-mistakes', mk]].forEach(function (pair) {
          var slot = $(pair[0] + ' .rv-oc', ctx.el);
          if (!slot || $$('details', pair[1]).length < 2) return;
          slot.innerHTML = U.btn('Open all', { small: true, kind: 'ghost', cls: 'oc-open', icon: 'down' }) + U.btn('Close all', { small: true, kind: 'ghost', cls: 'oc-close', icon: 'up' });
          $('.oc-open', slot).onclick = function () { $$('details', pair[1]).forEach(function (d) { d.open = true; }); };
          $('.oc-close', slot).onclick = function () { $$('details', pair[1]).forEach(function (d) { d.open = false; }); };
        });
        selfCheck(defs);
      });

      /* ---- 6. self-check cards ---- */
      function selfCheck(defs, advance) {
        var secEl = doc.getElementById('rv-check');
        if (!secEl || defs.length < 4) { if (secEl) secEl.hidden = true; return; }
        secEl.hidden = false;
        var state = cardsState(tid);
        var box = $('.rv-cards', secEl);
        // order: "again" first, then unseen (interleaved across lessons), then "known"
        var byLesson = {}, order = [];
        defs.forEach(function (d) { (byLesson[d.lessonId] = byLesson[d.lessonId] || []).push(d); });
        var keys = Object.keys(byLesson), maxLen = Math.max.apply(null, keys.map(function (k) { return byLesson[k].length; }));
        for (var i = 0; i < maxLen; i++) keys.forEach(function (k) { if (byLesson[k][i]) order.push(byLesson[k][i]); });
        // "Show other cards" pages through every term: cards already shown in this round are skipped until all have been shown
        var ordered = order.filter(function (d) { return state[d.key] === 'again'; })
          .concat(order.filter(function (d) { return !state[d.key]; }), order.filter(function (d) { return state[d.key] === 'known'; }));
        var sess = cardOffset[tid] || (cardOffset[tid] = { shown: {}, cur: [] });
        if (advance) sess.cur.forEach(function (k) { sess.shown[k] = true; });
        var rest = ordered.filter(function (d) { return !sess.shown[d.key]; });
        if (!rest.length) {   // every term shown: start a new round, not with the cards on screen right now
          sess.shown = {};
          rest = ordered.filter(function (d) { return sess.cur.indexOf(d.key) < 0; });
          if (!rest.length) rest = ordered;
        }
        var deck = rest.slice(0, 8);
        sess.cur = deck.map(function (d) { return d.key; });
        var lastOfRound = rest.length <= 8;
        function tally() {
          var k = 0, a = 0; defs.forEach(function (d) { if (state[d.key] === 'known') k++; else if (state[d.key] === 'again') a++; });
          $('.rv-check-tally', secEl).textContent = k + ' known · ' + a + ' to review again · ' + defs.length + ' terms in total';
        }
        box.innerHTML = '<div class="fc-grid"></div>' + (ordered.length > 8 ? '<div class="fc-more">' +
          U.btn(lastOfRound ? 'Start again from the first cards' : 'Show other cards', { small: true, kind: 'ghost', cls: 'fc-next', icon: 'review' }) + '</div>' : '');
        var grid = $('.fc-grid', box);
        deck.forEach(function (d, i) {
          var L = A.data.lesson(d.lessonId);
          var c = U.h('<div class="fc" data-state="' + (state[d.key] || '') + '">' +
            '<div class="fc-front"><p class="fc-from small muted">' + esc(L ? L.title : '') + '</p><p class="fc-term guide" data-lesson="' + d.lessonId + '"></p>' +
            U.btn('Show the meaning', { small: true, cls: 'fc-flip', icon: 'right' }) + '</div>' +
            '<div class="fc-back" hidden><p class="fc-term-s guide" data-lesson="' + d.lessonId + '"></p><div class="fc-def guide" data-lesson="' + d.lessonId + '"></div>' +
            '<div class="fc-acts">' + U.btn('I knew it', { small: true, kind: 'primary', cls: 'fc-known', icon: 'check' }) + U.btn('Review again', { small: true, kind: 'ghost', cls: 'fc-again', icon: 'review' }) + '</div></div>' +
            '<span class="fc-mark small"></span></div>');
          $('.fc-term', c).innerHTML = d.term;
          $('.fc-term-s', c).innerHTML = d.term;
          $('.fc-def', c).innerHTML = d.def + (d.unit ? '<p class="fc-unit small muted">Unit: ' + d.unit + '</p>' : '');
          $$('.guide', c).forEach(function (g) { A.renderContent(g, d.lessonId); });
          function mark() { var s = state[d.key]; c.setAttribute('data-state', s || ''); $('.fc-mark', c).textContent = s === 'known' ? 'Known' : (s === 'again' ? 'Review again' : ''); }
          mark();
          $('.fc-flip', c).onclick = function () {
            $('.fc-front', c).hidden = true; $('.fc-back', c).hidden = false; c.classList.add('flipped');
            if (!U.reducedMotion()) { c.classList.remove('fc-anim'); void c.offsetWidth; c.classList.add('fc-anim'); }
            try { $('.fc-known', c).focus({ preventScroll: true }); } catch (e) {}
          };
          function answer(v) {
            state[d.key] = v; store.save(); mark(); tally();
            $('.fc-front', c).hidden = false; $('.fc-back', c).hidden = true; c.classList.remove('flipped');
            A.announce(v === 'known' ? 'Marked as known' : 'Will come back first next time');
            var nx = grid.children[i + 1] && $('.fc-flip', grid.children[i + 1]);
            if (nx) { try { nx.focus({ preventScroll: true }); } catch (e) {} }
          }
          $('.fc-known', c).onclick = function () { answer('known'); };
          $('.fc-again', c).onclick = function () { answer('again'); };
          grid.appendChild(c);
        });
        var nextBtn = $('.fc-next', box);
        if (nextBtn) nextBtn.onclick = function () {
          selfCheck(defs, true);
          var f = $('.fc-flip', box); if (f) { try { f.focus({ preventScroll: true }); } catch (e) {} }
          A.announce('Showing ' + U.plural($$('.fc', box).length, 'other card'));
        };
        tally();
      }
      return Promise.all([p1, p2]);
    }
    return build();
  }

  A.registerMode('review', { render: render });
})(window);
