(function () {
  var STORAGE_KEY = 'liuzimo_gallery_unlock';
  var PASSWORD = 'happyeggie';

  function setUnlocked() {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch (e) {}
    document.documentElement.classList.add('gallery-unlocked');
    document.dispatchEvent(new Event('gallery-unlock'));
  }

  function init() {
    var form = document.getElementById('gallery-lock-form');
    var input = document.getElementById('gallery-lock-input');
    var err = document.getElementById('gallery-lock-err');
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === '1') {
        document.documentElement.classList.add('gallery-unlocked');
        return;
      }
    } catch (e) {}
    if (!form || !input) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (err) err.hidden = true;
      if (input.value === PASSWORD) {
        input.value = '';
        setUnlocked();
      } else if (err) {
        err.hidden = false;
      }
    });
    try {
      input.focus();
    } catch (e2) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
