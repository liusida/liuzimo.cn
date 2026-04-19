(function () {
  /**
   * Password gate for the gallery UI. Set to false to show the lock form again.
   * Keep in sync with the inline early script in gallery.html / gallery-zh.html (LOCK_DISABLED).
   */
  var LOCK_DISABLED = false;

  var STORAGE_KEY = 'liuzimo_gallery_unlock';
  var KEY_STORAGE = 'liuzimo_gallery_key';
  var PASSWORD = 'happyeggie';

  function setUnlocked(password) {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
      sessionStorage.setItem(KEY_STORAGE, password);
    } catch (e) {}
    document.documentElement.classList.add('gallery-unlocked');
    document.dispatchEvent(new Event('gallery-unlock'));
  }

  function applyLockDisabled() {
    if (!LOCK_DISABLED) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
      sessionStorage.setItem(KEY_STORAGE, PASSWORD);
    } catch (e) {}
    document.documentElement.classList.add('gallery-unlocked');
  }

  function init() {
    if (LOCK_DISABLED) return;
    var form = document.getElementById('gallery-lock-form');
    var input = document.getElementById('gallery-lock-input');
    var err = document.getElementById('gallery-lock-err');
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === '1') {
        document.documentElement.classList.add('gallery-unlocked');
      }
    } catch (e) {}
    if (!form || !input) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (err) err.hidden = true;
      if (input.value === PASSWORD) {
        var pwd = input.value;
        input.value = '';
        setUnlocked(pwd);
      } else if (err) {
        err.hidden = false;
      }
    });
    try {
      if (sessionStorage.getItem(STORAGE_KEY) !== '1') {
        input.focus();
      }
    } catch (e2) {}
  }

  applyLockDisabled();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
