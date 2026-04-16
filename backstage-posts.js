(function () {
  var OWNER = 'liusida';
  var REPO = 'liuzimo.cn';
  var BRANCH = 'main';
  var TOKEN_KEY = 'liuzimo_github_pat';

  function api(path) {
    return 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + path;
  }

  function getToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setToken(v) {
    try {
      if (v) sessionStorage.setItem(TOKEN_KEY, v);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function headers(token) {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function slugify(raw) {
    var s = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (s.length > 60) s = s.slice(0, 60).replace(/-$/, '');
    return s || 'post-' + Date.now();
  }

  function nextId(title, zhTitle, entries) {
    var base = slugify(title) || slugify(zhTitle) || 'post-' + Date.now();
    var used = {};
    for (var i = 0; i < entries.length; i++) {
      if (entries[i] && entries[i].id) used[entries[i].id] = true;
    }
    if (!used[base]) return base;
    var n = 2;
    while (used[base + '-' + n]) n++;
    return base + '-' + n;
  }

  function fetchJsonFile(token, path) {
    return fetch(api(path), { headers: headers(token) }).then(function (res) {
      if (!res.ok) throw new Error('GitHub HTTP ' + res.status);
      return res.json();
    });
  }

  function decodeFileBody(data) {
    var b64 = data.content.replace(/\n/g, '');
    return decodeURIComponent(escape(atob(b64)));
  }

  function getManifestRemote(token) {
    return fetchJsonFile(token, 'posts/manifest.json').then(function (data) {
      return { data: data, text: decodeFileBody(data), sha: data.sha };
    });
  }

  function parseManifest(text) {
    var m = JSON.parse(text);
    if (!m || typeof m !== 'object') throw new Error('Bad manifest');
    if (!Array.isArray(m.entries)) m.entries = [];
    return m;
  }

  function putFile(token, path, text, message, sha) {
    var body = {
      message: message,
      content: utf8ToBase64(text),
      branch: BRANCH
    };
    if (sha) body.sha = sha;
    return fetch(api(path), {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (err) {
          var msg = (err && err.message) || res.statusText;
          throw new Error(msg);
        }, function () {
          throw new Error('GitHub HTTP ' + res.status);
        });
      }
      return res.json();
    });
  }

  function wire() {
    var tokenInput = document.getElementById('gh-token');
    var saveTokenBtn = document.getElementById('save-token');
    var clearTokenBtn = document.getElementById('clear-token');
    var postTitle = document.getElementById('post-title');
    var postBody = document.getElementById('post-body');
    var postZhTitle = document.getElementById('post-zhtitle');
    var postZhBody = document.getElementById('post-zhbody');
    var postDate = document.getElementById('post-date');
    var publishBtn = document.getElementById('publish');
    var statusEl = document.getElementById('publish-status');

    if (tokenInput) {
      tokenInput.value = getToken();
    }

    if (saveTokenBtn && tokenInput) {
      saveTokenBtn.addEventListener('click', function () {
        setToken(tokenInput.value.trim());
        if (statusEl) statusEl.textContent = 'Token saved in this browser session only.';
      });
    }

    if (clearTokenBtn) {
      clearTokenBtn.addEventListener('click', function () {
        setToken('');
        if (tokenInput) tokenInput.value = '';
        if (statusEl) statusEl.textContent = 'Token cleared.';
      });
    }

    if (!publishBtn || !postTitle || !postBody || !statusEl) return;

    publishBtn.addEventListener('click', function () {
      var token = getToken() || (tokenInput && tokenInput.value.trim());
      if (!token) {
        statusEl.textContent = 'Add a GitHub token and click “Save token”.';
        return;
      }

      var title = postTitle.value.trim();
      var body = postBody.value;
      if (!title) {
        statusEl.textContent = 'Title is required.';
        return;
      }

      var dateVal = postDate && postDate.value ? postDate.value : '';
      var dateIso;
      try {
        dateIso = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();
      } catch (e) {
        dateIso = new Date().toISOString();
      }

      statusEl.textContent = 'Publishing…';
      publishBtn.disabled = true;

      var zhT = postZhTitle ? postZhTitle.value.trim() : '';
      var zhB = postZhBody ? postZhBody.value : '';

      getManifestRemote(token)
        .then(function (got) {
          var manifest = parseManifest(got.text);
          var id = nextId(title, zhT, manifest.entries);
          var postObj = {
            id: id,
            dateIso: dateIso,
            title: title,
            body: body
          };
          if (zhT) postObj.zhTitle = zhT;
          if (zhB && String(zhB).trim()) postObj.zhBody = zhB;

          var postJson = JSON.stringify(postObj, null, 2);
          var postPath = 'posts/' + id + '.json';

          return putFile(token, postPath, postJson, 'Add post ' + id, null).then(function () {
            manifest.entries.push({ id: id, dateIso: dateIso });
            manifest.entries.sort(function (a, b) {
              return new Date(b.dateIso || 0) - new Date(a.dateIso || 0);
            });
            var manText = JSON.stringify(manifest, null, 2) + '\n';
            return putFile(token, 'posts/manifest.json', manText, 'Update manifest for ' + id, got.sha);
          });
        })
        .then(function () {
          statusEl.textContent = 'Published. The site will update after GitHub Pages deploys (usually within a minute).';
          postTitle.value = '';
          postBody.value = '';
          if (postZhTitle) postZhTitle.value = '';
          if (postZhBody) postZhBody.value = '';
        })
        .catch(function (err) {
          statusEl.textContent = 'Error: ' + (err && err.message ? err.message : String(err));
        })
        .then(function () {
          publishBtn.disabled = false;
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
