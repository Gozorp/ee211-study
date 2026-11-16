/* EE 211 — Practice mode page: header, status, question pills; cards are built by EEPractice.mount (practice.js). */
(function (global) {
  'use strict';
  var A = global.EEApp, U = A.ui, S = A.store, store = global.EEStore;
  var esc = U.esc, icon = U.icon, $ = U.$, $$ = U.$$;

  function scrollToQ(qid, smooth) {
    var go = function () {
      var q = document.getElementById(qid); if (!q) return;
      var cs = getComputedStyle(document.documentElement), pills = document.getElementById('prPills');
      var hdr = (parseFloat(cs.getPropertyValue('--header-h')) || 56) + (U.isPhone() ? 0 : (parseFloat(cs.getPropertyValue('--modebar-h')) || 48)) + (pills ? pills.offsetHeight : 0) + 12;
      var r = q.getBoundingClientRect();
      if (Math.abs(r.top - hdr) > 24) global.scrollTo({ top: global.scrollY + r.top - hdr, behavior: smooth && !U.reducedMotion() ? 'smooth' : 'auto' });
    };
    setTimeout(go, 80); setTimeout(go, 500);
    setTimeout(function () { var q = document.getElementById(qid); if (q) { q.classList.add('flash-target'); setTimeout(function () { q.classList.remove('flash-target'); }, 1700); } }, 520);
  }

  function render(ctx) {
    var tid = ctx.tid, t = ctx.topic;
    ctx.setTitle('');
    ctx.manageScroll = !!ctx.params[0];
    ctx.el.innerHTML =
      '<div class="page practice-page">' +
      ' <header class="page-head pr-head"><div class="pr-head-text"><p class="eyebrow">Practice · ' + esc(t.name) + '</p>' +
      '  <h1>Four scenarios, from concept to multistep</h1>' +
      '  <p class="lede">Each scenario gets harder: a concept check, a direct calculation, a multistep problem, then troubleshooting or a special case. Try it first; hints open one at a time, and every question has a full worked solution.</p></div>' +
      '  <div class="pr-status" id="prStatus" aria-live="polite"></div></header>' +
      ' <nav class="pr-pills" id="prPills" aria-label="Questions"></nav>' +
      ' <details class="pr-help"><summary>How answers are checked</summary><ul>' +
      '  <li>Type numbers with or without units. SI prefixes are understood: <code>4.7k</code>, <code>4700 Ω</code>, <code>2.5 mA</code>, <code>3.3u</code>, <code>1.2e-3 s</code>.</li>' +
      '  <li>Answers within the stated tolerance (usually ±2 %) are accepted. Wrong answers get specific feedback when the mistake is recognisable (wrong prefix, sign, factor of 2, a typical method error), with a link to the lesson section that explains it.</li>' +
      '  <li>“Solved on your own” means you got it right without opening the solution (hints are fine). It counts toward <b>Understood</b> in the topic header; viewing the solution counts as “solved with help”.</li>' +
      '  <li>Your typed answers are saved as drafts, so you can switch to Watch or Understand and come back.</li></ul></details>' +
      ' <div id="prBody" class="pr-body"><p class="muted">Loading the questions…</p></div>' +
      '</div>';
    var body = $('#prBody', ctx.el), pills = $('#prPills', ctx.el), status = $('#prStatus', ctx.el);
    var qs = [];

    function stat() {
      if (!ctx.alive()) return;
      var u = S.topicUnderstanding(tid, A.data.questionIds(tid)) || {};
      var bonus = qs.filter(function (q) { return q.bonus; });
      var bonusSolved = bonus.filter(function (q) { var p = store.state.progress.practice[q.qid]; return p && p.solved; }).length;
      status.innerHTML =
        '<div class="pr-stat main">' + U.diamonds(u.core || 0, u.help || 0) + '<span><b>' + (u.core || 0) + ' of 4</b> solved on your own</span></div>' +
        '<div class="pr-stat"><span class="pr-num">' + (u.help || 0) + '</span><span>solved with help</span></div>' +
        '<div class="pr-stat"><span class="pr-num">' + (u.revisit || 0) + '</span><span>to revisit</span></div>' +
        (bonus.length ? '<div class="pr-stat"><span class="pr-num">' + bonusSolved + '/' + bonus.length + '</span><span>bonus solved</span></div>' : '');
      pills.innerHTML = qs.map(function (q) {
        var st = A.progress.questionState(q.qid);
        return '<a class="qpill s-' + st + '" href="' + A.href.practice(tid, q.qid) + '" data-qid="' + q.qid + '" title="' + esc(q.title) + ' — ' + A.progress.QSTATE_LABEL[st] + '">' +
          '<span class="qpill-num">' + esc(q.num) + '</span><span class="qpill-state">' + A.progress.QSTATE_LABEL[st] + '</span></a>';
      }).join('');
    }
    pills.addEventListener('click', function (e) {
      var a = e.target.closest('.qpill'); if (!a) return;
      e.preventDefault();
      var qid = a.getAttribute('data-qid');
      ctx.setPath(A.href.practice(tid, qid));
      scrollToQ(qid, true);
    });

    var ready = Promise.all([A.data.practiceHTML(tid), A.data.practiceQuestions(tid)]).then(function (res) {
      if (!ctx.alive()) return;
      qs = res[1];
      body.innerHTML = res[0];
      A.renderContent(body, null);
      var firstBonus = body.querySelector('article.q[id*="-b"]');
      if (firstBonus) {
        var nb = body.querySelectorAll('article.q[id*="-b"]').length;
        firstBonus.parentNode.insertBefore(U.h('<h2 class="bonus-head">Bonus scenario' + (nb > 1 ? 's' : '') + ' <span class="small muted">Extra practice for a related lesson; not part of the four core scenarios.</span></h2>'), firstBonus);
      }
      if (!global.EEPractice) { body.insertAdjacentHTML('afterbegin', '<p class="diagram-error">The practice engine did not load.</p>'); return; }
      var probs = global.EEPractice.mount(body, {
        store: store,
        onProgress: function () { stat(); A.progress.refresh(); },
        renderContent: function (n) { A.renderContent(n, null); },
        onReview: function (o) { if (o && o.lessonId) A.peek.open({ lessonId: o.lessonId, secId: o.secId || null }); },
        onWatch: function (o) { if (o && o.lessonId && global.EEDock) global.EEDock.load(o.lessonId, { t: o.t || 0, play: true }); }
      });
      if (probs && probs.length && global.console) console.warn('practice problems', probs);
      // lc: label each scenario with its sub-area
      qs.forEach(function (q) {
        if (!q.sub) return;
        var card = document.getElementById(q.qid), hd = card && card.querySelector('header');
        if (hd && !hd.querySelector('.q-sub')) { var c = U.h('<span class="chip q-sub">' + esc(q.sub) + '</span>'); var h2 = hd.querySelector('h2'); if (h2 && h2.nextSibling) hd.insertBefore(c, h2.nextSibling); else hd.appendChild(c); }
      });
      stat();
      if (ctx.params[0]) scrollToQ(ctx.params[0], false);
    }).catch(function (e) {
      body.innerHTML = '<p class="diagram-error">The practice questions could not be loaded (' + esc(e.message) + ').</p>';
    });
    return ready;
  }

  function update(ctx, prev) {
    var qid = ctx.params[0];
    if (qid !== prev.params[0]) { if (qid) scrollToQ(qid, true); return true; }
    return true;
  }

  A.registerMode('practice', { render: render, update: update });
})(window);
