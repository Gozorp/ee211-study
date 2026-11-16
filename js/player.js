/* YouTube IFrame Player wrapper: one player, re-used across lessons. */
(function (global) {
  'use strict';
  var apiPromise = null;
  var yt = null, ready = false, currentVideo = null, hostEl = null;
  var pendingSeek = null;
  var tickers = [];
  var tickTimer = null;
  var errorCb = null;
  var mountSeq = 0;

  function loadApi() {
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function (resolve, reject) {
      if (global.YT && global.YT.Player) return resolve(global.YT);
      var prev = global.onYouTubeIframeAPIReady;
      global.onYouTubeIframeAPIReady = function () { if (prev) try { prev(); } catch (e) {} resolve(global.YT); };
      var s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = function () { reject(new Error('Could not load the YouTube player (are you offline?)')); };
      document.head.appendChild(s);
      setTimeout(function () { if (!(global.YT && global.YT.Player)) reject(new Error('The YouTube player did not load within 20 s.')); }, 20000);
    });
    return apiPromise;
  }

  function startTicker() {
    if (tickTimer) return;
    tickTimer = setInterval(function () {
      if (!ready || !yt || !yt.getCurrentTime) return;
      var t = 0, st = -1;
      try { t = yt.getCurrentTime() || 0; st = yt.getPlayerState(); } catch (e) { return; }
      tickers.forEach(function (f) { try { f(t, st); } catch (e) {} });
    }, 400);
  }

  /* Mount (or re-use) the player inside container for videoId, cued at startSeconds. */
  function mount(container, videoId, startSeconds, onError) {
    errorCb = onError;
    startSeconds = Math.max(0, Math.floor(startSeconds || 0));
    destroy();
    var token = ++mountSeq;
    return loadApi().then(function (YT) {
      if (token !== mountSeq || !document.body.contains(container)) return null;
      hostEl = document.createElement('div');
      container.appendChild(hostEl);
      return new Promise(function (resolve) {
        yt = new YT.Player(hostEl, {
          videoId: videoId,
          width: '100%', height: '100%',
          playerVars: { rel: 0, playsinline: 1, modestbranding: 1, start: startSeconds, origin: location.origin, enablejsapi: 1, cc_load_policy: 0 },
          events: {
            onReady: function () {
              ready = true; currentVideo = videoId;
              if (pendingSeek != null) { var p = pendingSeek; pendingSeek = null; seek(p.t, p.play); }
              startTicker();
              resolve(yt);
            },
            onError: function (e) { if (errorCb) errorCb(e.data); }
          }
        });
      });
    });
  }

  function destroy() {
    if (yt && yt.destroy) { try { yt.destroy(); } catch (e) {} }
    yt = null; ready = false; currentVideo = null; hostEl = null; pendingSeek = null;
  }

  function seek(t, play) {
    if (!ready || !yt || !yt.seekTo) { pendingSeek = { t: t, play: play !== false }; return; }
    yt.seekTo(Math.max(0, t), true);
    if (play !== false) yt.playVideo();
  }

  global.EEPlayer = {
    mount: mount,
    destroy: destroy,
    seek: seek,
    time: function () { try { return ready && yt ? yt.getCurrentTime() || 0 : 0; } catch (e) { return 0; } },
    state: function () { try { return ready && yt ? yt.getPlayerState() : -1; } catch (e) { return -1; } },
    play: function () { if (ready && yt) yt.playVideo(); },
    pause: function () { if (ready && yt) yt.pauseVideo(); },
    toggle: function () { if (!ready || !yt) return; if (yt.getPlayerState() === 1) yt.pauseVideo(); else yt.playVideo(); },
    nudge: function (d) { if (ready && yt) seek((yt.getCurrentTime() || 0) + d, yt.getPlayerState() === 1); },
    setRate: function (r) { if (ready && yt && yt.setPlaybackRate) yt.setPlaybackRate(r); },
    rate: function () { return ready && yt && yt.getPlaybackRate ? yt.getPlaybackRate() : 1; },
    onTick: function (f) { tickers.push(f); return function () { tickers = tickers.filter(function (g) { return g !== f; }); }; },
    get videoId() { return currentVideo; },
    get ready() { return ready; }
  };
})(window);
