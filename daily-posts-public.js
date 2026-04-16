(function () {
  function isZhPage() {
    var lang = document.documentElement.getAttribute('lang') || '';
    return lang.indexOf('zh') === 0 || document.body.classList.contains('zh');
  }

  function pickTitle(p) {
    if (isZhPage() && p.zhTitle && String(p.zhTitle).trim()) {
      return String(p.zhTitle).trim();
    }
    return (p.title && String(p.title).trim()) ? String(p.title).trim() : 'Untitled';
  }

  function pickBody(p) {
    if (isZhPage() && p.zhBody != null && String(p.zhBody).trim()) {
      return String(p.zhBody);
    }
    return p.body != null ? String(p.body) : '';
  }

  function render(posts, err) {
    var wrap = document.getElementById('daily-posts');
    if (!wrap) return;

    wrap.innerHTML = '';

    if (err) {
      var pe = document.createElement('p');
      pe.className = 'daily-fetch-err';
      pe.textContent = isZhPage()
        ? '无法加载文章（请确认已部署 posts/manifest.json）。'
        : 'Could not load posts (check that posts/manifest.json is deployed).';
      wrap.appendChild(pe);
      return;
    }

    if (!posts.length) {
      var empty = document.createElement('p');
      empty.className = 'daily-empty';
      empty.textContent = isZhPage() ? '暂无文章。' : 'No posts yet.';
      wrap.appendChild(empty);
      return;
    }

    var sorted = posts.slice().sort(function (a, b) {
      return new Date(b.dateIso || 0) - new Date(a.dateIso || 0);
    });

    sorted.forEach(function (p) {
      if (!p || typeof p !== 'object') return;

      var art = document.createElement('article');
      art.className = 'daily-post';

      var t = document.createElement('time');
      t.className = 'daily-post-time';
      if (p.dateIso) t.setAttribute('datetime', p.dateIso);
      try {
        var d = new Date(p.dateIso || Date.now());
        var locale = isZhPage() ? 'zh-CN' : undefined;
        var fmt = new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZoneName: 'short'
        });
        var label = fmt.format(d);
        if (!label || !String(label).trim()) {
          label = d.toISOString();
        }
        t.textContent = label;
      } catch (e) {
        try {
          t.textContent = new Date(p.dateIso || Date.now()).toISOString();
        } catch (e2) {
          t.textContent = '';
        }
      }

      var h3 = document.createElement('h3');
      h3.className = 'daily-post-title';
      h3.textContent = pickTitle(p);

      var bodyEl = document.createElement('div');
      bodyEl.className = 'daily-post-body';
      bodyEl.textContent = pickBody(p);

      art.appendChild(t);
      art.appendChild(h3);
      art.appendChild(bodyEl);
      wrap.appendChild(art);
    });
  }

  var fetchNoCache = { cache: 'no-store' };

  function loadPost(base, id) {
    var url = new URL('posts/' + encodeURIComponent(id) + '.json', base);
    return fetch(url.toString(), fetchNoCache).then(function (res) {
      if (!res.ok) throw new Error('post ' + id);
      return res.json();
    });
  }

  function run() {
    var base = window.location.href;
    var manifestUrl = new URL('posts/manifest.json', base);
    fetch(manifestUrl.toString(), fetchNoCache)
      .then(function (res) {
        if (!res.ok) throw new Error('manifest');
        return res.json();
      })
      .then(function (manifest) {
        if (!manifest || !Array.isArray(manifest.entries)) throw new Error('bad manifest');
        var entries = manifest.entries.filter(function (e) {
          return e && e.id;
        });
        if (!entries.length) return [];

        return Promise.all(
          entries.map(function (e) {
            return loadPost(base, e.id);
          })
        );
      })
      .then(function (posts) {
        render(Array.isArray(posts) ? posts : [], false);
      })
      .catch(function () {
        render(null, true);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
