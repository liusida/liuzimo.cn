#!/usr/bin/env python3
from __future__ import annotations

r"""
Encrypt JPEGs in images/ to images/enc/*.jpg.enc and write images/gallery.json (v2).

Uses AES-256-GCM; key derived with PBKDF2-HMAC-SHA256 (100k iterations). The viewer
enters the same passphrase in the browser (gallery lock) to decrypt.

Requires: pip install piexif cryptography

Usage (from repo root):
  export GALLERY_KEY='your-passphrase'
  .venv-gallery/bin/python scripts/encrypt-gallery.py

Optional:
  --delete-plaintext   Remove original JPEGs from images/ after successful encrypt.

Afterwards: commit images/enc/, images/gallery.json; originals stay local only if you use --delete-plaintext.
"""

import argparse
import base64
import json
import os
import secrets
import sys

try:
    import piexif
except ImportError:
    print("Install piexif: pip install piexif", file=sys.stderr)
    sys.exit(1)

try:
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
except ImportError:
    print("Install cryptography: pip install cryptography", file=sys.stderr)
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(ROOT, "images")
ENC_DIR = os.path.join(IMAGES_DIR, "enc")
OUT_JSON = os.path.join(IMAGES_DIR, "gallery.json")
HIDDEN_TXT = os.path.join(IMAGES_DIR, "gallery-hidden.txt")

PBKDF2_ITERATIONS = 100_000
SALT_LEN = 16
NONCE_LEN = 12


def load_hidden_filenames(path: str) -> set[str]:
    hidden: set[str] = set()
    if not os.path.isfile(path):
        return hidden
    with open(path, encoding="utf-8") as f:
        for line in f:
            t = line.strip()
            if not t or t.startswith("#"):
                continue
            hidden.add(t)
    return hidden


def list_jpegs() -> list[str]:
    out: list[str] = []
    for fn in sorted(os.listdir(IMAGES_DIR)):
        path = os.path.join(IMAGES_DIR, fn)
        if not os.path.isfile(path):
            continue
        if fn in ("gallery.json", "gallery-hidden.txt"):
            continue
        if fn.lower().endswith((".jpg", ".jpeg")):
            out.append(fn)
    return out


def read_exif_datetime(path: str) -> str | None:
    try:
        d = piexif.load(path)
    except Exception:
        return None
    ex = d.get("Exif", {})
    dt = ex.get(piexif.ExifIFD.DateTimeOriginal)
    if dt and isinstance(dt, bytes):
        dt = dt.decode()
    return dt if dt else None


def derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
        backend=default_backend(),
    )
    return kdf.derive(password.encode("utf-8"))


def encrypt_file(key: bytes, plaintext: bytes) -> bytes:
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(NONCE_LEN)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return nonce + ciphertext


def main() -> None:
    parser = argparse.ArgumentParser(description="Encrypt gallery JPEGs for static hosting.")
    parser.add_argument(
        "--delete-plaintext",
        action="store_true",
        help="Remove original JPEGs from images/ after success.",
    )
    args = parser.parse_args()

    key_env = os.environ.get("GALLERY_KEY", "").strip()
    if not key_env:
        print("Set GALLERY_KEY to the passphrase (same as the gallery lock password).", file=sys.stderr)
        sys.exit(1)

    hidden = load_hidden_filenames(HIDDEN_TXT)
    jpegs = [fn for fn in list_jpegs() if fn not in hidden]
    if not jpegs:
        print("No JPEG files to encrypt in images/ (after gallery-hidden.txt).", file=sys.stderr)
        sys.exit(1)

    os.makedirs(ENC_DIR, exist_ok=True)
    salt = secrets.token_bytes(SALT_LEN)
    aes_key = derive_key(key_env, salt)

    rows: list[dict] = []
    for fn in jpegs:
        src = os.path.join(IMAGES_DIR, fn)
        out_name = fn + ".enc"
        rel_file = "enc/" + out_name
        dst = os.path.join(ENC_DIR, out_name)

        with open(src, "rb") as f:
            plain = f.read()
        blob = encrypt_file(aes_key, plain)
        with open(dst, "wb") as f:
            f.write(blob)

        dt = read_exif_datetime(src)
        rows.append({"file": rel_file, "datetimeExif": dt, "enc": True})

    def sort_key(r: dict) -> tuple:
        return (r.get("datetimeExif") or "", r["file"])

    rows.sort(key=sort_key)

    data = {
        "version": 2,
        "encryption": {
            "algorithm": "AES-256-GCM",
            "pbkdf2": {
                "hash": "SHA-256",
                "iterations": PBKDF2_ITERATIONS,
                "salt": base64.b64encode(salt).decode("ascii"),
            },
        },
        "timezoneNoteEn": "Times are from the camera EXIF (local clock; no timezone stored).",
        "timezoneNoteZh": "时间为照片 EXIF 中的相机本地时间（文件未含时区信息）。",
        "items": rows,
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("Wrote", OUT_JSON, len(rows), "encrypted items")
    print("Salt (also in gallery.json):", data["encryption"]["pbkdf2"]["salt"][:20] + "...")

    if args.delete_plaintext:
        for fn in jpegs:
            path = os.path.join(IMAGES_DIR, fn)
            os.remove(path)
            print("Removed:", path)


if __name__ == "__main__":
    main()
