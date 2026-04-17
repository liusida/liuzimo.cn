#!/usr/bin/env node
/**
 * Reads posts/posts.txt (English only) and writes posts/<id>.json + manifest.
 * Preserves zhTitle/zhBody from existing posts/<id>.json when re-syncing.
 * Usage: node scripts/sync-drafts.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const draftPath = path.join(root, 'posts', 'posts.txt');
const postsDir = path.join(root, 'posts');

function slugify(raw) {
  let s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > 60) s = s.slice(0, 60).replace(/-$/, '');
  return s || 'post-' + Date.now();
}

function stripCommentLines(text) {
  return text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

function parseBlocks(text) {
  const cleaned = stripCommentLines(text);
  const re = /\[\[POST\]\]\s*([\s\S]*?)\[\[\/POST\]\]/g;
  const blocks = [];
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    blocks.push(m[1].trim());
  }
  return blocks;
}

function parseOneBlock(block) {
  const lines = block.split('\n');
  const headers = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') break;
    const cm = /^(\w+)\s*:\s*(.*)$/.exec(line);
    if (!cm) break;
    headers[cm[1]] = cm[2];
  }

  const bodyLines = lines.slice(i + 1);
  const body = bodyLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');

  return { headers, body };
}

function buildPost(headers, body, usedIds) {
  const title = (headers.title || '').trim();
  if (!title) throw new Error('Each [[POST]] needs title: …');

  let id = (headers.id || '').trim();
  if (!id) id = slugify(title);
  const base = id;
  let n = 2;
  while (usedIds.has(id)) id = base + '-' + n++;
  usedIds.add(id);

  let dateIso = (headers.date || '').trim();
  if (!dateIso) {
    dateIso = new Date().toISOString();
  } else {
    const t = Date.parse(dateIso);
    if (Number.isNaN(t)) throw new Error('Bad date for post "' + id + '": ' + headers.date);
    dateIso = new Date(t).toISOString();
  }

  return {
    id,
    dateIso,
    title,
    body
  };
}

function mergeExistingZh(jsonPath, base) {
  if (!fs.existsSync(jsonPath)) return base;
  try {
    const prev = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const out = { ...base };
    if (prev.zhTitle != null && String(prev.zhTitle).trim()) out.zhTitle = prev.zhTitle;
    if (prev.zhBody != null && String(prev.zhBody).trim()) out.zhBody = prev.zhBody;
    return out;
  } catch {
    return base;
  }
}

function main() {
  if (!fs.existsSync(draftPath)) {
    console.error('Missing file: posts/posts.txt');
    process.exit(1);
  }

  const raw = fs.readFileSync(draftPath, 'utf8');
  const blocks = parseBlocks(raw);
  const posts = [];
  const usedIds = new Set();

  for (const block of blocks) {
    if (!block.length) continue;
    const { headers, body } = parseOneBlock(block);
    posts.push(buildPost(headers, body, usedIds));
  }

  posts.sort((a, b) => new Date(b.dateIso) - new Date(a.dateIso));

  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

  const manifest = {
    version: 1,
    entries: posts.map((p) => ({ id: p.id, dateIso: p.dateIso }))
  };

  fs.writeFileSync(path.join(postsDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const existing = fs.readdirSync(postsDir);
  for (const f of existing) {
    if (!f.endsWith('.json') || f === 'manifest.json') continue;
    const id = f.replace(/\.json$/, '');
    if (!posts.some((p) => p.id === id)) {
      fs.unlinkSync(path.join(postsDir, f));
      console.warn('Removed orphan file:', f);
    }
  }

  for (const p of posts) {
    const jsonPath = path.join(postsDir, p.id + '.json');
    const merged = mergeExistingZh(jsonPath, p);
    const out = JSON.stringify(merged, null, 2) + '\n';
    fs.writeFileSync(jsonPath, out, 'utf8');
  }

  console.log('Wrote', posts.length, 'post(s) to posts/ (English from posts/posts.txt; zh preserved when present).');
}

main();
