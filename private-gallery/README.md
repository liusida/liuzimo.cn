# Private gallery storage (not on GitHub Pages)

JPEGs listed in `images/gallery-hidden.txt` can be **moved out of the public site** with:

```bash
.venv-gallery/bin/python scripts/move-hidden-gallery-images.py
.venv-gallery/bin/python scripts/build-gallery-json.py
```

Then commit the changes under `images/` (removed files) and updated `images/gallery.json`. Files in this folder are **gitignored** and are not deployed, so they no longer have a public URL.

Keep a backup of this folder on your machine if you care about those originals.

## Encrypted files on GitHub (alternative)

To keep photo blobs in the repo but **not viewable** without the passphrase, use AES-256-GCM via `scripts/encrypt-gallery.py`. The passphrase must match the gallery lock password (`GALLERY_KEY` env var, same as `gallery-lock.js`). See the script docstring. After encrypting, commit `images/enc/*.enc` and `images/gallery.json` (v2); remove plaintext JPEGs from `images/` when you are ready.
