#!/usr/bin/env node
/**
 * Merges [[POST]] … [[/POST]] blocks from posts/posts.txt into existing posts/<id>.json
 * and posts/manifest.json. Old posts live only in JSON; posts.txt is not a full archive.
 * After a successful run, all [[POST]] blocks are removed from posts.txt (instructions stay).
 * Preserves zhTitle/zhBody on write when re-merging from disk.
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

function parseDateHeader(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new Error('Bad date: ' + raw);
  return new Date(t).toISOString();
}

function loadAllFromDisk() {
  const byId = {};
  if (!fs.existsSync(postsDir)) return byId;
  for (const f of fs.readdirSync(postsDir)) {
    if (!f.endsWith('.json') || f === 'manifest.json') continue;
    try {
      const full = path.join(postsDir, f);
      const p = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (p && p.id) byId[p.id] = p;
    } catch {
      // skip invalid
    }
  }
  return byId;
}

/**
 * Merges one [[POST]] block into base (mutates). usedIds = all id strings already taken.
 */
function applyBlock(block, base, usedIds) {
  if (!block.length) return;
  const { headers, body } = parseOneBlock(block);
  const title = (headers.title || '').trim();
  if (!title) throw new Error('Each [[POST]] needs title: …');

  const explicitId = (headers.id || '').trim();
  const dateFromHeader = parseDateHeader(headers.date);

  if (explicitId) {
    if (Object.prototype.hasOwnProperty.call(base, explicitId)) {
      const prev = base[explicitId];
      base[explicitId] = {
        ...prev,
        id: explicitId,
        title,
        body,
        dateIso: dateFromHeader != null ? dateFromHeader : prev.dateIso
      };
      return;
    }
    if (usedIds.has(explicitId)) {
      throw new Error('Duplicate or conflicting id: ' + explicitId);
    }
    usedIds.add(explicitId);
    const dateIso = dateFromHeader != null ? dateFromHeader : new Date().toISOString();
    base[explicitId] = { id: explicitId, dateIso, title, body };
    return;
  }

  let id = slugify(title);
  const orig = id;
  let n = 2;
  while (usedIds.has(id)) id = orig + '-' + n++;
  usedIds.add(id);
  const dateIso = dateFromHeader != null ? dateFromHeader : new Date().toISOString();
  base[id] = { id, dateIso, title, body };
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

/**
 * Remove only "real" blocks: the opening [[POST]] must be at the start of a line
 * (so we do not match the words inside # instruction lines that mention the markers).
 */
function stripPostBlocksFromFile(raw) {
  let out = raw.replace(/^[\t ]*\[\[POST\]\][\s\S]*?^[\t ]*\[\[\/POST\]\]/gm, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.replace(/\s+$/, '') + '\n';
}

function main() {
  if (!fs.existsSync(draftPath)) {
    console.error('Missing file: posts/posts.txt');
    process.exit(1);
  }

  const raw = fs.readFileSync(draftPath, 'utf8');
  const blocks = parseBlocks(raw);
  const base = loadAllFromDisk();
  const usedIds = new Set(Object.keys(base));

  for (const block of blocks) {
    try {
      applyBlock(block, base, usedIds);
    } catch (e) {
      console.error(e.message || e);
      process.exit(1);
    }
  }

  const posts = Object.values(base).sort((a, b) => new Date(b.dateIso) - new Date(a.dateIso));

  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

  const manifest = {
    version: 1,
    entries: posts.map((p) => ({ id: p.id, dateIso: p.dateIso }))
  };

  fs.writeFileSync(path.join(postsDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  for (const p of posts) {
    const jsonPath = path.join(postsDir, p.id + '.json');
    const toWrite = { id: p.id, dateIso: p.dateIso, title: p.title, body: p.body };
    const merged = mergeExistingZh(jsonPath, toWrite);
    fs.writeFileSync(jsonPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  }

  if (blocks.length) {
    fs.writeFileSync(draftPath, stripPostBlocksFromFile(raw), 'utf8');
    console.log('Published', blocks.length, 'draft block(s); cleared [[POST]] from posts/posts.txt. Total posts:', posts.length);
  } else {
    console.log('No [[POST]] blocks in posts.txt. Wrote', posts.length, 'post(s) to manifest/JSON (unchanged if nothing edited).');
  }
}

main();
