#!/usr/bin/env node
/**
 * Публикация сайта в GitHub через API.
 *
 * Токен НЕ хранится в репозитории. Варианты:
 *   1) переменная окружения RESHOP_GITHUB_TOKEN
 *   2) файл %USERPROFILE%\.reshop-token (только токен, без кавычек)
 *
 * Запуск:
 *   node tools/deploy-github.mjs --dry-run   — показать, что будет загружено
 *   node tools/deploy-github.mjs             — закоммитить и запушить
 *
 * Переменные:
 *   RESHOP_GITHUB_REPO    (по умолчанию rshtlvv/reshot.github.io)
 *   RESHOP_GITHUB_BRANCH  (по умолчанию main)
 *   RESHOP_GITHUB_MESSAGE (сообщение коммита)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const REPO = process.env.RESHOP_GITHUB_REPO || 'rshtlvv/reshot.github.io';
const BRANCH = process.env.RESHOP_GITHUB_BRANCH || 'main';
const MESSAGE = process.env.RESHOP_GITHUB_MESSAGE || 'deploy: reshop site ' + new Date().toISOString().slice(0, 19);
const DRY_RUN = process.argv.includes('--dry-run');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'tmp', '_repo-check', '_local-backup']);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db']);

function walk(dir, base = '') {
  const result = [];
  for (const entry of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? path.join(base, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('_')) continue;
      result.push(...walk(dir, rel));
    } else {
      if (SKIP_FILES.has(entry.name)) continue;
      if (entry.name.startsWith('_') || entry.name.endsWith('.zip')) continue;
      result.push(rel.replace(/\\/g, '/'));
    }
  }
  return result;
}

function readToken() {
  const clean = (value) => String(value || '').trim().replace(/^["']|["']$/g, '');
  if (process.env.RESHOP_GITHUB_TOKEN) return clean(process.env.RESHOP_GITHUB_TOKEN);
  for (const name of ['.reshop-token', '.reshop-token.txt']) {
    const file = path.join(os.homedir(), name);
    if (fs.existsSync(file)) return clean(fs.readFileSync(file, 'utf8'));
  }
  return '';
}

async function api(method, endpoint, body) {
  const token = readToken();
  const res = await fetch('https://api.github.com' + endpoint, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = { message: text };
  }
  if (!res.ok) {
    const message = (data && data.message) || 'HTTP ' + res.status;
    throw new Error(message + ' (' + res.status + ')');
  }
  return data;
}

const files = walk(ROOT).sort();
if (DRY_RUN) {
  console.log('Репозиторий:', REPO, '| ветка:', BRANCH);
  console.log('Файлов к загрузке:', files.length);
  for (const file of files) console.log('  ' + file);
  process.exit(0);
}

if (!readToken()) {
  console.error('Не найден GitHub-токен.');
  console.error('Создайте fine-grained token (Contents: Read and write) и сохраните его в');
  console.error(path.join(os.homedir(), '.reshop-token'));
  console.error('или задайте переменную RESHOP_GITHUB_TOKEN.');
  process.exit(1);
}

try {
  const ref = await api('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const headSha = ref.object.sha;
  const headCommit = await api('GET', `/repos/${REPO}/git/commits/${headSha}`);
  const baseTree = headCommit.tree.sha;

  const tree = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(ROOT, file));
    const blob = await api('POST', `/repos/${REPO}/git/blobs`, {
      content: content.toString('base64'),
      encoding: 'base64',
    });
    tree.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  const newTree = await api('POST', `/repos/${REPO}/git/trees`, { base_tree: baseTree, tree });
  const commit = await api('POST', `/repos/${REPO}/git/commits`, {
    message: MESSAGE,
    tree: newTree.sha,
    parents: [headSha],
  });
  await api('PATCH', `/repos/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha });

  console.log('Загружено файлов:', tree.length);
  console.log('Коммит:', commit.html_url);
  console.log('GitHub Pages обновится в течение минуты.');
} catch (error) {
  console.error('Ошибка публикации:', error.message);
  process.exit(1);
}
