(function () {
  var KEY = 'liuzimo_daily_posts';

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function save(posts) {
    try {
      localStorage.setItem(KEY, JSON.stringify(posts));
    } catch (e) {}
  }

  function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return String(Date.now()) + '-' + String(Math.random()).slice(2, 10);
  }

  function render() {
    var wrap = document.getElementById('daily-posts');
    if (!wrap) return;

    var posts = load();
    wrap.innerHTML = '';

    posts.forEach(function (p) {
      var art = document.createElement('article');
      art.className = 'daily-post';

      var t = document.createElement('time');
      if (p.dateIso) t.setAttribute('datetime', p.dateIso);
      try {
        t.textContent = new Date(p.dateIso || Date.now()).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short'
        });
      } catch (err) {
        t.textContent = '';
      }

      var h3 = document.createElement('h3');
      h3.className = 'daily-post-title';
      h3.textContent = (p.title && String(p.title).trim()) ? String(p.title).trim() : 'Entry';

      var bodyEl = document.createElement('div');
      bodyEl.className = 'daily-post-body';
      bodyEl.textContent = p.body != null ? String(p.body) : '';

      art.appendChild(t);
      art.appendChild(h3);
      art.appendChild(bodyEl);
      wrap.appendChild(art);
    });
  }

  window.liuzimoPublishPost = function (title, body) {
    var b = (body || '').trim();
    if (!b) return false;
    var posts = load();
    posts.unshift({
      id: newId(),
      dateIso: new Date().toISOString(),
      title: (title || '').trim(),
      body: b
    });
    save(posts);
    return true;
  };

  window.liuzimoDailyPostsReload = render;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
