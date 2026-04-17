(function () {
  var MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var SORT_STORAGE = 'liuzimo_gallery_sort';
  var SORT_MODES = ['exif-asc', 'exif-desc'];

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

  /** Missing EXIF time sorts last for both orders. */
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
    return 'exif-asc';
  }

  function writeStoredSort(mode) {
    try {
      sessionStorage.setItem(SORT_STORAGE, mode);
    } catch (e) {}
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

  function renderGrid(items, base, zh) {
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

  function run() {
    var grid = document.getElementById('gallery-grid');
    var noteEl = document.getElementById('gallery-tz-note');
    var sortEl = document.getElementById('gallery-sort');
    if (!grid) return;

    var zh = isZhPage();
    var base = imgBaseUrl();
    var manifestUrl = new URL('gallery.json', base);

    fetch(manifestUrl.toString(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('manifest');
        return res.json();
      })
      .then(function (data) {
        if (noteEl && data) {
          var note = zh ? data.timezoneNoteZh : data.timezoneNoteEn;
          if (note) noteEl.textContent = note;
        }
        var rawItems = (data && data.items) || [];
        var mode = readStoredSort();
        if (sortEl) {
          if (SORT_MODES.indexOf(mode) !== -1) sortEl.value = mode;
          sortEl.addEventListener('change', function () {
            var m = sortEl.value;
            if (SORT_MODES.indexOf(m) === -1) return;
            writeStoredSort(m);
            renderGrid(sortItems(rawItems, m), base, zh);
          });
        }
        var initial = sortEl && SORT_MODES.indexOf(sortEl.value) !== -1 ? sortEl.value : mode;
        renderGrid(sortItems(rawItems, initial), base, zh);
      })
      .catch(function () {
        grid.innerHTML = '<p class="gallery-load-err">' + (zh ? '无法加载相册数据（images/gallery.json）。' : 'Could not load gallery data (images/gallery.json).') + '</p>';
      });

    var backdrop = document.querySelector('#gallery-lightbox .gallery-lightbox-backdrop');
    var closeBtn = document.querySelector('#gallery-lightbox .gallery-lightbox-close');
    if (backdrop) backdrop.addEventListener('click', closeLightbox);
    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeLightbox();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
