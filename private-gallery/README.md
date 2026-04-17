# Private gallery storage (not on GitHub Pages)

JPEGs listed in `images/gallery-hidden.txt` can be **moved out of the public site** with:

```bash
.venv-gallery/bin/python scripts/move-hidden-gallery-images.py
.venv-gallery/bin/python scripts/build-gallery-json.py
```

Then commit the changes under `images/` (removed files) and updated `images/gallery.json`. Files in this folder are **gitignored** and are not deployed, so they no longer have a public URL.

Keep a backup of this folder on your machine if you care about those originals.
