(function () {
  var STORAGE_KEY = 'liuzimo_main_section';
  var SECTION_IDS = ['top', 'my-journey', 'notes'];
  var pendingRestore = null;

  function getMainSectionId() {
    var bestId = 'top';
    var best = 0;
    for (var i = 0; i < SECTION_IDS.length; i++) {
      var el = document.getElementById(SECTION_IDS[i]);
      if (!el) continue;
      var r = el.getBoundingClientRect();
      var vh = window.innerHeight || 0;
      var visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(0, r.top));
      if (visible > best) {
        best = visible;
        bestId = SECTION_IDS[i];
      }
    }
    return bestId;
  }

  function scrollToMainSection(id) {
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  function readPending() {
    try {
      var s = sessionStorage.getItem(STORAGE_KEY);
      if (!s) return;
      sessionStorage.removeItem(STORAGE_KEY);
      if (SECTION_IDS.indexOf(s) !== -1) pendingRestore = s;
    } catch (e) {}
  }

  function onPostsRendered() {
    if (pendingRestore == null) return;
    var id = pendingRestore;
    pendingRestore = null;
    scrollToMainSection(id);
  }

  function initRestore() {
    readPending();
    if (pendingRestore == null) return;
    var idForFirstPass = pendingRestore;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        scrollToMainSection(idForFirstPass);
      });
    });
  }

  function bindClicks() {
    var links = document.querySelectorAll('a.lang-switch');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function () {
        try {
          sessionStorage.setItem(STORAGE_KEY, getMainSectionId());
        } catch (e) {}
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initRestore();
      bindClicks();
    });
  } else {
    initRestore();
    bindClicks();
  }

  window.liuzimoAfterMainPostsRender = onPostsRendered;
})();
