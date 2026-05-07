(function () {
  var GALLERY_UNLOCK_KEY = 'liuzimo_gallery_unlock';
  var GALLERY_KEY_STORAGE = 'liuzimo_gallery_key';
  var MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var SORT_STORAGE = 'liuzimo_gallery_sort';
  var SORT_MODES = ['exif-asc', 'exif-desc'];
  var started = false;
  var runGeneration = 0;
  var listenersBound = false;
  var sortBound = false;
  var blobUrls = {};

  function getGalleryKey() {
    try {
      return sessionStorage.getItem(GALLERY_KEY_STORAGE);
    } catch (e) {
      return null;
    }
  }

  function isGalleryUnlocked() {
    try {
      return sessionStorage.getItem(GALLERY_UNLOCK_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function revokeBlobUrls() {
    Object.keys(blobUrls).forEach(function (k) {
      try {
        URL.revokeObjectURL(blobUrls[k]);
      } catch (e) {}
    });
    blobUrls = {};
  }

  function parseExifDatetime(s) {
    if (!s || typeof s !== 'string') return null;
    var m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s.trim());
    if (!m) return null;
    return {
      y: +m[1],
      mo: +m[2],
      d: +m[3],
      h: +m[4],
      mi: +m[5],
      sec: +m[6]
    };
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatTimeEn(p) {
    if (!p) return '';
    return MONTHS_EN[p.mo - 1] + ' ' + p.d + ', ' + p.y + ', ' + pad2(p.h) + ':' + pad2(p.mi);
  }

  function formatTimeZh(p) {
    if (!p) return '';
    return p.y + '年' + p.mo + '月' + p.d + '日 ' + pad2(p.h) + ':' + pad2(p.mi);
  }

  function isZhPage() {
    var lang = document.documentElement.getAttribute('lang') || '';
    return lang.indexOf('zh') === 0;
  }

  function imgBaseUrl() {
    return new URL('images/', window.location.href);
  }

  function exifSortKey(it, oldestFirst) {
    if (it.datetimeExif) return it.datetimeExif;
    return oldestFirst ? '9999:99:99 99:99:99' : '0000:00:00 00:00:00';
  }

  function sortItems(items, mode) {
    var arr = items.slice();
    if (mode === 'exif-asc') {
      arr.sort(function (a, b) {
        var ka = exifSortKey(a, true);
        var kb = exifSortKey(b, true);
        var c = ka.localeCompare(kb);
        return c !== 0 ? c : a.file.localeCompare(b.file);
      });
    } else if (mode === 'exif-desc') {
      arr.sort(function (a, b) {
        var ka = exifSortKey(a, false);
        var kb = exifSortKey(b, false);
        var c = kb.localeCompare(ka);
        return c !== 0 ? c : a.file.localeCompare(b.file);
      });
    }
    return arr;
  }

  function readStoredSort() {
    try {
      var v = sessionStorage.getItem(SORT_STORAGE);
      if (v && SORT_MODES.indexOf(v) !== -1) return v;
    } catch (e) {}
    return 'exif-desc';
  }

  function writeStoredSort(mode) {
    try {
      sessionStorage.setItem(SORT_STORAGE, mode);
    } catch (e) {}
  }

  function parseHiddenFilenames(text) {
    var hidden = {};
    if (!text || typeof text !== 'string') return hidden;
    text.split(/\r?\n/).forEach(function (line) {
      var t = line.trim();
      if (!t || t.charAt(0) === '#') return;
      hidden[t] = true;
    });
    return hidden;
  }

  function filterVisibleItems(items, hidden) {
    if (!hidden || !items) return items || [];
    return items.filter(function (it) {
      return it && it.file && !hidden[it.file];
    });
  }

  function b64ToBuf(b64) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }

  function deriveAesKey(passphrase, enc) {
    var salt = b64ToBuf(enc.pbkdf2.salt);
    var encPw = new TextEncoder().encode(passphrase);
    return crypto.subtle.importKey('raw', encPw, 'PBKDF2', false, ['deriveKey']).then(function (keyMaterial) {
      return crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: enc.pbkdf2.iterations,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
    });
  }

  function decryptEncFileToBlob(fileUrl, aesKey) {
    return fetch(fileUrl, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('fetch');
        return res.arrayBuffer();
      })
      .then(function (buf) {
        var u8 = new Uint8Array(buf);
        if (u8.length < 13) throw new Error('short');
        var nonce = u8.subarray(0, 12);
        var ct = u8.subarray(12);
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aesKey, ct);
      })
      .then(function (dec) {
        return new Blob([dec], { type: 'image/jpeg' });
      });
  }

  function openLightbox(imgSrc, altText, timeLine) {
    var lb = document.getElementById('gallery-lightbox');
    var im = document.querySelector('#gallery-lightbox .gallery-lightbox-img');
    var cap = document.querySelector('#gallery-lightbox .gallery-lightbox-caption');
    if (!lb || !im || !cap) return;
    im.src = imgSrc;
    im.alt = altText || '';
    cap.innerHTML = '';
    var strong = document.createElement('strong');
    strong.textContent = timeLine || '';
    cap.appendChild(strong);
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    im.focus();
  }

  function closeLightbox() {
    var lb = document.getElementById('gallery-lightbox');
    if (!lb) return;
    lb.hidden = true;
    document.body.style.overflow = '';
    var im = document.querySelector('#gallery-lightbox .gallery-lightbox-img');
    if (im) im.removeAttribute('src');
  }

  function bindLightboxOnce() {
    if (listenersBound) return;
    listenersBound = true;
    var backdrop = document.querySelector('#gallery-lightbox .gallery-lightbox-backdrop');
    var closeBtn = document.querySelector('#gallery-lightbox .gallery-lightbox-close');
    if (backdrop) backdrop.addEventListener('click', closeLightbox);
    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeLightbox();
    });
  }

  function renderGridPlain(items, base, zh) {
    var grid = document.getElementById('gallery-grid');
    if (!grid) return;
    grid.innerHTML = '';

    items.forEach(function (item) {
      var file = item.file;
      if (!file) return;
      var parsed = parseExifDatetime(item.datetimeExif);
      var timeLine = zh ? formatTimeZh(parsed) : formatTimeEn(parsed);
      if (!timeLine && item.datetimeExif) timeLine = item.datetimeExif;

      var wrap = document.createElement('div');
      wrap.className = 'gallery-item';
      wrap.setAttribute('role', 'listitem');

      var thumbWrap = document.createElement('div');
      thumbWrap.className = 'gallery-thumb-wrap';

      var img = document.createElement('img');
      img.className = 'gallery-thumb-img';
      img.src = new URL(file, base).toString();
      img.alt = timeLine || file;
      img.loading = 'lazy';
      img.decoding = 'async';

      var cap = document.createElement('figcaption');
      cap.className = 'gallery-caption';
      var t1 = document.createElement('div');
      t1.className = 'gallery-caption-time';
      t1.textContent = timeLine || (zh ? '无时间信息' : 'No time in file');

      cap.appendChild(t1);

      thumbWrap.appendChild(img);
      wrap.appendChild(thumbWrap);
      wrap.appendChild(cap);
      grid.appendChild(wrap);

      function onOpen() {
        openLightbox(img.src, img.alt, timeLine || '');
      }

      thumbWrap.addEventListener('click', onOpen);
      thumbWrap.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      });
      thumbWrap.tabIndex = 0;
      thumbWrap.setAttribute('role', 'button');
      thumbWrap.setAttribute('aria-label', (zh ? '查看大图：' : 'View large: ') + file);
    });
  }

  function runChunked(items, chunkSize, fn, expectedGen) {
    var i = 0;
    function step() {
      if (expectedGen !== runGeneration) return Promise.resolve();
      if (i >= items.length) return Promise.resolve();
      var chunk = items.slice(i, i + chunkSize);
      i += chunk.length;
      return Promise.all(chunk.map(fn)).then(step);
    }
    return step();
  }

  function renderGridEncrypted(items, base, zh, encMeta, passphrase, expectedGen) {
    var grid = document.getElementById('gallery-grid');
    if (!grid) return Promise.resolve();
    if (expectedGen !== runGeneration) return Promise.resolve();
    revokeBlobUrls();
    grid.innerHTML = '';

    return deriveAesKey(passphrase, encMeta).then(function (aesKey) {
      if (expectedGen !== runGeneration) return Promise.resolve();
      return runChunked(
        items,
        5,
        function (item) {
          if (expectedGen !== runGeneration) return Promise.resolve();
          var file = item.file;
          if (!file) return Promise.resolve();
          var parsed = parseExifDatetime(item.datetimeExif);
          var timeLine = zh ? formatTimeZh(parsed) : formatTimeEn(parsed);
          if (!timeLine && item.datetimeExif) timeLine = item.datetimeExif;

          var wrap = document.createElement('div');
          wrap.className = 'gallery-item';
          wrap.setAttribute('role', 'listitem');

          var thumbWrap = document.createElement('div');
          thumbWrap.className = 'gallery-thumb-wrap';
          thumbWrap.style.background = 'rgba(10, 12, 20, 0.55)';

          var cap = document.createElement('figcaption');
          cap.className = 'gallery-caption';
          var t1 = document.createElement('div');
          t1.className = 'gallery-caption-time';
          t1.textContent = timeLine || (zh ? '无时间信息' : 'No time in file');
          cap.appendChild(t1);

          var url = new URL(file, base).toString();
          return decryptEncFileToBlob(url, aesKey).then(function (blob) {
            if (expectedGen !== runGeneration) return;
            var objUrl = URL.createObjectURL(blob);
            blobUrls[file] = objUrl;

            var img = document.createElement('img');
            img.className = 'gallery-thumb-img';
            img.src = objUrl;
            img.alt = timeLine || file;
            img.loading = 'lazy';
            img.decoding = 'async';

            thumbWrap.appendChild(img);
            thumbWrap.style.background = '';

            function onOpen() {
              openLightbox(objUrl, img.alt, timeLine || '');
            }

            thumbWrap.addEventListener('click', onOpen);
            thumbWrap.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen();
              }
            });
            thumbWrap.tabIndex = 0;
            thumbWrap.setAttribute('role', 'button');
            thumbWrap.setAttribute('aria-label', (zh ? '查看大图：' : 'View large: ') + file);

            wrap.appendChild(thumbWrap);
            wrap.appendChild(cap);
            grid.appendChild(wrap);
          });
        },
        expectedGen
      );
    });
  }

  function run() {
    if (!isGalleryUnlocked()) return;
    var grid = document.getElementById('gallery-grid');
    var noteEl = document.getElementById('gallery-tz-note');
    var sortEl = document.getElementById('gallery-sort');
    if (!grid) return;

    var myGen = ++runGeneration;
    var zh = isZhPage();
    var base = imgBaseUrl();
    var manifestUrl = new URL('gallery.json', base);
    var hiddenUrl = new URL('gallery-hidden.txt', base);

    Promise.all([
      fetch(manifestUrl.toString(), { cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error('manifest');
        return res.json();
      }),
      fetch(hiddenUrl.toString(), { cache: 'no-store' })
        .then(function (res) {
          return res.ok ? res.text() : '';
        })
        .catch(function () {
          return '';
        })
    ])
      .then(function (pair) {
        if (myGen !== runGeneration) return;
        var data = pair[0];
        var hiddenText = pair[1];
        var hiddenMap = parseHiddenFilenames(hiddenText);

        if (data && data.encryption) {
          var pass = getGalleryKey();
          if (!pass) {
            grid.innerHTML =
              '<p class="gallery-load-err">' +
              (zh
                ? '请重新输入画廊密码以解密照片。'
                : 'Enter the gallery password again to decrypt photos.') +
              '</p>';
            try {
              sessionStorage.removeItem(GALLERY_UNLOCK_KEY);
            } catch (e) {}
            document.documentElement.classList.remove('gallery-unlocked');
            return;
          }
        }

        if (myGen !== runGeneration) return;
        started = true;
        bindLightboxOnce();

        if (noteEl && data) {
          var note = zh ? data.timezoneNoteZh : data.timezoneNoteEn;
          if (note) noteEl.textContent = note;
        }

        var rawItems = filterVisibleItems((data && data.items) || [], hiddenMap);
        var mode = readStoredSort();
        var encMeta = data && data.encryption;

        function applySort(m) {
          if (myGen !== runGeneration) return Promise.resolve();
          var sorted = sortItems(rawItems, m);
          if (encMeta) {
            var pwd = getGalleryKey();
            if (!pwd) return Promise.resolve();
            return renderGridEncrypted(sorted, base, zh, encMeta, pwd, myGen).catch(function () {
              if (myGen !== runGeneration) return;
              grid.innerHTML =
                '<p class="gallery-load-err">' +
                (zh ? '无法解密照片，请确认密码与加密时相同。' : 'Could not decrypt photos. Check that the password matches the one used to encrypt.') +
                '</p>';
              started = false;
              try {
                sessionStorage.removeItem(GALLERY_UNLOCK_KEY);
                sessionStorage.removeItem(GALLERY_KEY_STORAGE);
              } catch (e) {}
              document.documentElement.classList.remove('gallery-unlocked');
            });
          }
          renderGridPlain(sorted, base, zh);
          return Promise.resolve();
        }

        if (sortEl) {
          if (SORT_MODES.indexOf(mode) !== -1) sortEl.value = mode;
          if (!sortBound) {
            sortBound = true;
            sortEl.addEventListener('change', function () {
              var m = sortEl.value;
              if (SORT_MODES.indexOf(m) === -1) return;
              writeStoredSort(m);
              applySort(m);
            });
          }
        }

        var initial = sortEl && SORT_MODES.indexOf(sortEl.value) !== -1 ? sortEl.value : mode;
        return applySort(initial);
      })
      .catch(function () {
        if (myGen !== runGeneration) return;
        grid.innerHTML =
          '<p class="gallery-load-err">' +
          (zh ? '无法加载相册数据（images/gallery.json）。' : 'Could not load gallery data (images/gallery.json).') +
          '</p>';
      });
  }

  function tryRun() {
    run();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryRun);
  } else {
    tryRun();
  }
  document.addEventListener('gallery-unlock', function () {
    started = false;
    run();
  });
})();
