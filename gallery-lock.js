(function () {
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

  function init() {
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
