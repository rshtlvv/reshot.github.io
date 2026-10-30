/* ============================================================
   reshop — ядро: данные, хранилище, GitHub API, шапка, утилиты
   ============================================================ */

window.RS = (function () {
  'use strict';

  const RARITIES = {
    common: { label: 'Common', color: '#b0c3d9' },
    uncommon: { label: 'Uncommon', color: '#5e98d9' },
    rare: { label: 'Rare', color: '#4b69ff' },
    mythical: { label: 'Mythical', color: '#8847ff' },
    legendary: { label: 'Legendary', color: '#d32ce6' },
    immortal: { label: 'Immortal', color: '#e4ae39' },
    arcana: { label: 'Arcana', color: '#ade55c' },
    ancient: { label: 'Ancient', color: '#eb4b4b' },
    genuine: { label: 'Genuine', color: '#4d7455' },
    exalted: { label: 'Exalted', color: '#d2d2d2' },
  };
  const RARITY_ORDER = ['arcana', 'immortal', 'legendary', 'mythical', 'rare', 'ancient', 'exalted', 'genuine', 'uncommon', 'common'];

  const STATUS = {
    in_stock: { label: 'В наличии', tone: 'ok' },
    reserved: { label: 'Зарезервирован', tone: 'warn' },
    sold: { label: 'Продано', tone: 'mute' },
  };

  const KEY = {
    data: 'reshop.data.v1',
    gh: 'reshop.github.v1',
    pass: 'reshop.pass.v1',
    session: 'reshop.session.v1',
  };
  const DEFAULT_PASS_HASH = 'ce321122de5cd6c190b72b6441160c4edb6535d546395f2054a4b05ba965c3c7'; // reshop
  const GITHUB_DEFAULT = { owner: '', repo: '', branch: 'main', path: 'data.json', token: '' };

  const state = {
    data: null,
    published: null,
    local: null,
    hasDraft: false,
    cfg: Object.assign({}, GITHUB_DEFAULT),
  };

  /* ---------------- утилиты ---------------- */

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESC[c]);
  }

  function accentText(value) {
    return esc(value)
      .replace(/\*([^*\n]+)\*/g, '<span class="accent">$1</span>')
      .replace(/\n/g, '<br>');
  }

  /* Цветной текст: {#ADE55C}слово{/} — HEX-код в фигурных скобках. */
  const COLOR_TAG = /\{#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\}([\s\S]*?)\{\/\}/g;

  function plainText(value) {
    return String(value == null ? '' : value)
      .replace(/\{#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\}/g, '')
      .replace(/\{\/\}/g, '');
  }

  function colorize(value, multiline) {
    const html = esc(value).replace(COLOR_TAG, (match, hex, text) => '<span style="color:#' + hex + '">' + text + '</span>');
    return multiline ? html.replace(/\n/g, '<br>') : html.replace(/\n/g, ' ');
  }

  function normalizeHex(value) {
    let hex = String(value || '').trim();
    if (!hex) return '';
    if (!hex.startsWith('#')) hex = '#' + hex;
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) ? hex.toUpperCase() : '';
  }

  function accentFor(item) {
    const custom = normalizeHex(item && item.color);
    if (custom) return custom;
    const rarity = RARITIES[item && item.rarity] || RARITIES.rare;
    return rarity.color;
  }

  const nf = new Intl.NumberFormat('ru-RU');
  function money(value) {
    return nf.format(Math.round(Number(value) || 0)).replace(/\u00a0/g, ' ');
  }

  function priceHtml(item) {
    const cur = (state.data && state.data.settings.currency) || '₽';
    const old = Number(item.oldPrice) > Number(item.price)
      ? `<s>${money(item.oldPrice)} ${esc(cur)}</s>`
      : '';
    return `<span class="price"><b>${money(item.price)} <i>${esc(cur)}</i></b>${old}</span>`;
  }

  function discount(item) {
    if (!Number(item.oldPrice) || Number(item.oldPrice) <= Number(item.price)) return 0;
    return Math.round((1 - Number(item.price) / Number(item.oldPrice)) * 100);
  }

  function slug(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[а-яё]/g, (c) => ({ а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' }[c] || c))
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  function uid() {
    return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalizeTelegram(value) {
    let base = String(value || '').trim();
    if (!base) return '#';
    if (/^@/.test(base)) return 'https://t.me/' + base.slice(1);
    if (/^https?:\/\//i.test(base)) return base;
    if (/^t\.me\//i.test(base)) return 'https://' + base;
    if (/^[a-z0-9_.-]+\.[a-z]{2,}(\/|$)/i.test(base)) return 'https://' + base;
    return 'https://t.me/' + base.replace(/^@/, '');
  }

  function telegramFor(item) {
    let base = normalizeTelegram((item && item.telegram) || (state.data && state.data.settings.telegram) || '');
    const text = item
      ? 'Привет! Интересует «' + plainText(item.name) + '»' + (item.hero ? ' (' + item.hero + ')' : '') + ' из reshop.'
      : '';
    if (text && /(^|\/\/)t\.me\//i.test(base)) {
      return base + (base.includes('?') ? '&' : '?') + 'text=' + encodeURIComponent(text);
    }
    return base;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeDeep(base, patch) {
    if (Array.isArray(base) || Array.isArray(patch)) return patch === undefined ? base : patch;
    if (typeof base !== 'object' || base === null) return patch === undefined ? base : patch;
    if (typeof patch !== 'object' || patch === null) return base;
    const out = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(patch)]);
    keys.forEach((key) => {
      const b = base[key];
      const p = patch[key];
      out[key] = p === undefined ? b : b && typeof b === 'object' && !Array.isArray(b) ? mergeDeep(b, p) : p;
    });
    return out;
  }

  /* ---------------- нормализация данных ---------------- */

  function normalizeItem(item, index) {
    const name = String(item.name || 'Без названия').trim();
    const rarity = RARITIES[item.rarity] ? item.rarity : 'rare';
    const stockRaw = item.stock;
    const stock = stockRaw === undefined || stockRaw === null || stockRaw === ''
      ? 1
      : Math.max(0, Math.floor(Number(stockRaw) || 0));
    return {
      id: String(item.id || slug(plainText(name)) || uid()),
      name,
      hero: String(item.hero || ''),
      slot: String(item.slot || ''),
      rarity,
      price: Math.max(0, Number(item.price) || 0),
      oldPrice: Math.max(0, Number(item.oldPrice) || 0),
      image: String(item.image || ''),
      status: STATUS[item.status] ? item.status : 'in_stock',
      hit: Boolean(item.hit),
      description: String(item.description || ''),
      telegram: String(item.telegram || ''),
      stock,
      color: normalizeHex(item.color),
    };
  }

  function normalize(raw) {
    const seed = window.RESHOP_SEED || {};
    const data = mergeDeep(clone(seed), raw || {});
    if (!Array.isArray(data.items) || data.items.length === 0) {
      data.items = Array.isArray(raw && raw.items) ? raw.items : seed.items || [];
    }
    const seedItems = Array.isArray(seed.items) ? seed.items : [];
    data.items = data.items
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const fallback = seedItems.find((entry) => entry && entry.id && entry.id === item.id);
        const missingStock = item.stock === undefined || item.stock === null || item.stock === '';
        return normalizeItem(missingStock && fallback ? Object.assign({}, item, { stock: fallback.stock }) : item);
      });
    data.about = data.about || {};
    data.about.paragraphs = Array.isArray(data.about.paragraphs) ? data.about.paragraphs : [];
    data.about.stats = Array.isArray(data.about.stats) ? data.about.stats : [];
    data.about.steps = Array.isArray(data.about.steps) ? data.about.steps : [];
    data.about.faq = Array.isArray(data.about.faq) ? data.about.faq : [];
    data.settings = data.settings || {};
    data.settings.hero = data.settings.hero || {};
    data.settings.hero.facts = Array.isArray(data.settings.hero.facts) ? data.settings.hero.facts : [];
    data.settings.catalog = data.settings.catalog || {};
    return data;
  }

  /* ---------------- загрузка / сохранение ---------------- */

  let readyPromise = null;

  async function fetchPublished() {
    try {
      const res = await fetch('data.json?v=' + Date.now(), { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (error) {
      /* локальный запуск по file:// — используем встроенный seed */
    }
    return window.RESHOP_SEED || null;
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(KEY.data);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function readCfg() {
    try {
      const raw = localStorage.getItem(KEY.gh);
      return raw ? Object.assign({}, GITHUB_DEFAULT, JSON.parse(raw)) : Object.assign({}, GITHUB_DEFAULT);
    } catch (error) {
      return Object.assign({}, GITHUB_DEFAULT);
    }
  }

  function saveCfg(cfg) {
    state.cfg = Object.assign({}, GITHUB_DEFAULT, cfg);
    localStorage.setItem(KEY.gh, JSON.stringify(state.cfg));
  }

  async function load() {
    const published = normalize((await fetchPublished()) || {});
    const localRaw = readLocal();
    let local = null;
    if (localRaw) {
      try {
        local = normalize(localRaw);
      } catch (error) {
        local = null;
      }
    }
    state.published = published;
    state.local = local;
    state.data = local || published;
    state.cfg = readCfg();
    state.hasDraft = Boolean(local) && JSON.stringify(local) !== JSON.stringify(published);
    return state;
  }

  function ready() {
    if (!readyPromise) readyPromise = load();
    return readyPromise;
  }

  function setData(next, options) {
    const opts = options || {};
    state.data = normalize(next);
    state.local = state.data;
    state.hasDraft = JSON.stringify(state.data) !== JSON.stringify(state.published);
    if (opts.persist !== false) {
      try {
        localStorage.setItem(KEY.data, JSON.stringify(state.data));
      } catch (error) {
        toast('Не удалось сохранить локально: ' + error.message, 'error', 6000);
      }
    }
    updateChrome();
    return state.data;
  }

  function clearLocal() {
    localStorage.removeItem(KEY.data);
    state.local = null;
    state.data = state.published;
    state.hasDraft = false;
    updateChrome();
    return state.data;
  }

  async function republishBaseline(json) {
    state.published = normalize(JSON.parse(json));
    state.hasDraft = JSON.stringify(state.data) !== JSON.stringify(state.published);
    updateChrome();
  }

  /* ---------------- тосты ---------------- */

  let toastStack = null;
  function toast(message, type, duration) {
    if (!toastStack) {
      toastStack = document.createElement('div');
      toastStack.className = 'toast-stack';
      toastStack.setAttribute('role', 'status');
      toastStack.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastStack);
    }
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast--' + type : '');
    el.innerHTML = '<span class="toast__dot"></span><span>' + esc(message) + '</span>';
    toastStack.appendChild(el);
    const life = duration || 3800;
    const timer = setTimeout(remove, life);
    function remove() {
      clearTimeout(timer);
      el.classList.add('toast--out');
      setTimeout(() => el.remove(), 320);
    }
    el.addEventListener('click', remove);
  }

  /* ---------------- GitHub API ---------------- */

  function ghHeaders() {
    const cfg = state.cfg;
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
    return headers;
  }

  async function ghRequest(path, options) {
    const opts = options || {};
    let res;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 25000) : null;
    try {
      res = await fetch('https://api.github.com' + path, {
        method: opts.method || 'GET',
        headers: Object.assign(ghHeaders(), opts.headers || {}),
        body: opts.body,
        signal: controller ? controller.signal : undefined,
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('GitHub не ответил за 25 секунд. Проверьте интернет и попробуйте снова.');
      }
      throw new Error('Нет соединения с GitHub. Проверьте интернет.');
    } finally {
      if (timer) clearTimeout(timer);
    }
    let payload = null;
    try {
      payload = await res.json();
    } catch (error) {
      payload = null;
    }
    if (!res.ok) {
      const message = (payload && payload.message) || 'HTTP ' + res.status;
      const err = new Error(message);
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  function repoPath(extra) {
    const cfg = state.cfg;
    const base = '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo);
    return base + (extra || '');
  }

  async function ghRepo() {
    if (!state.cfg.owner || !state.cfg.repo) throw new Error('Укажите владельца и репозиторий.');
    return ghRequest(repoPath());
  }

  async function ghGetFile(filePath) {
    const cfg = state.cfg;
    try {
      const data = await ghRequest(
        repoPath('/contents/' + filePath.replace(/^\/+/, '') + '?ref=' + encodeURIComponent(cfg.branch || 'main'))
      );
      const text = decodeBase64(data.content || '');
      return { sha: data.sha, text: text };
    } catch (error) {
      if (error.status === 404) return { sha: null, text: null };
      throw error;
    }
  }

  async function ghPutFile(filePath, base64, message) {
    const cfg = state.cfg;
    const clean = filePath.replace(/^\/+/, '');
    const existing = await ghGetFile(clean);
    const body = {
      message: message || 'reshop: обновление данных',
      content: base64,
      branch: cfg.branch || 'main',
    };
    if (existing.sha) body.sha = existing.sha;
    const result = await ghRequest(repoPath('/contents/' + clean), {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return { result, created: !existing.sha };
  }

  async function ghPublish(data) {
    const json = JSON.stringify(data, null, 2) + '\n';
    const base64 = base64Utf8(json);
    const res = await ghPutFile(state.cfg.path || 'data.json', base64, 'reshop: обновление каталога и страницы «Обо мне»');
    await republishBaseline(json);
    return res;
  }

  async function ghUploadImage(blob, fileName) {
    const buffer = await blob.arrayBuffer();
    const base64 = base64Bytes(new Uint8Array(buffer));
    const path = 'assets/items/' + fileName;
    await ghPutFile(path, base64, 'reshop: новое изображение предмета (' + fileName + ')');
    return path;
  }

  function pagesUrl() {
    const cfg = state.cfg;
    if (!cfg.owner || !cfg.repo) return '';
    if (/\.github\.io$/i.test(cfg.repo)) return 'https://' + cfg.owner + '.github.io/';
    return 'https://' + cfg.owner + '.github.io/' + cfg.repo + '/';
  }

  function decodeBase64(input) {
    const clean = String(input || '').replace(/\s/g, '');
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  function base64Bytes(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64Utf8(text) {
    return base64Bytes(new TextEncoder().encode(text));
  }

  /* ---------------- авторизация ---------------- */

  async function sha256Hex(text) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function isAuthed() {
    try {
      return sessionStorage.getItem(KEY.session) === '1';
    } catch (error) {
      return false;
    }
  }

  async function login(password) {
    const stored = localStorage.getItem(KEY.pass) || DEFAULT_PASS_HASH;
    const hash = await sha256Hex(password || '');
    if (hash !== stored) return false;
    sessionStorage.setItem(KEY.session, '1');
    return true;
  }

  function logout() {
    sessionStorage.removeItem(KEY.session);
  }

  async function changePassword(next) {
    localStorage.setItem(KEY.pass, await sha256Hex(next || ''));
  }

  /* ---------------- сжатие изображений ---------------- */

  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Не удалось прочитать изображение'));
      };
      img.src = url;
    });
  }

  async function compressImage(file, maxSize, quality) {
    const img = await loadImageFile(file);
    const limit = maxSize || 1000;
    const scale = Math.min(1, limit / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0b0f';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality || 0.86));
    if (!blob) throw new Error('Браузер не поддерживает WebP');
    return { blob, width, height };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.readAsDataURL(blob);
    });
  }

  /* ---------------- шапка, меню, анимации ---------------- */

  const headerState = { initialized: false };

  function initChrome() {
    if (headerState.initialized) {
      updateChrome();
      return;
    }
    headerState.initialized = true;

    const header = document.querySelector('.header');
    const progress = document.querySelector('.progress');
    const burger = document.querySelector('.burger');
    const menu = document.querySelector('.menu');

    function onScroll() {
      const top = window.scrollY || document.documentElement.scrollTop;
      if (header) header.classList.toggle('is-scrolled', top > 12);
      if (progress) {
        const height = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.transform = 'scaleX(' + (height > 0 ? Math.min(1, top / height) : 0) + ')';
      }
    }
    let ticking = false;
    window.addEventListener(
      'scroll',
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          onScroll();
          ticking = false;
        });
      },
      { passive: true }
    );
    onScroll();

    if (burger && menu) {
      const close = () => {
        burger.classList.remove('is-open');
        menu.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
        menu.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('no-scroll');
      };
      burger.addEventListener('click', () => {
        const open = !menu.classList.contains('is-open');
        burger.classList.toggle('is-open', open);
        menu.classList.toggle('is-open', open);
        burger.setAttribute('aria-expanded', String(open));
        menu.setAttribute('aria-hidden', String(!open));
        document.body.classList.toggle('no-scroll', open);
      });
      menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') close();
      });
    }

    const observer = 'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add('is-in');
                observer.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
        )
      : null;

    document.querySelectorAll('[data-reveal]').forEach((el) => {
      if (observer) observer.observe(el);
      else el.classList.add('is-in');
    });

    // лёгкий параллакс витрины
    const showcase = document.querySelector('.showcase');
    if (showcase && window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const layers = showcase.querySelectorAll('[data-depth]');
      showcase.addEventListener('pointermove', (event) => {
        const rect = showcase.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        layers.forEach((layer) => {
          const depth = Number(layer.dataset.depth) || 10;
          layer.style.transform = 'translate3d(' + (-x * depth) + 'px,' + (-y * depth) + 'px,0)';
        });
      });
      showcase.addEventListener('pointerleave', () => {
        layers.forEach((layer) => {
          layer.style.transform = '';
        });
      });
    }

    updateChrome();
  }

  function updateChrome() {
    if (!state.data) return;
    const settings = state.data.settings || {};
    const tg = telegramFor(null);
    document.querySelectorAll('[data-telegram]').forEach((el) => {
      el.href = tg;
      if (!el.dataset.keepLabel) el.setAttribute('aria-label', 'Написать в Telegram');
    });
    const steamRaw = String(settings.steam || '').trim();
    const steam = steamRaw
      ? (/^https?:\/\//i.test(steamRaw) ? steamRaw : 'https://' + steamRaw)
      : 'https://steamcommunity.com/';
    document.querySelectorAll('[data-steam]').forEach((el) => {
      el.href = steam;
    });
    document.querySelectorAll('[data-site-name]').forEach((el) => {
      el.textContent = settings.name || 'reshop';
    });
    const chip = document.querySelector('[data-draft-chip]');
    if (chip) chip.hidden = !state.hasDraft;
    document.querySelectorAll('[data-year]').forEach((el) => {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /* ---------------- изображения: запасной вариант ---------------- */

  const PLACEHOLDER =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#191d26"/><stop offset="1" stop-color="#0b0d12"/></linearGradient></defs><rect width="300" height="200" fill="url(#g)"/><g fill="none" stroke="#3a4150" stroke-width="1.5"><circle cx="150" cy="100" r="34"/><path d="M150 62v-10M150 148v-10M188 100h10M102 100h10"/></g><text x="150" y="106" text-anchor="middle" font-family="monospace" font-size="10" fill="#5b6373" letter-spacing="3">RESHOP</text></svg>'
    );

  function guardImages(root) {
    (root || document).querySelectorAll('img[data-guard]').forEach((img) => {
      if (img.dataset.guarded) return;
      img.dataset.guarded = '1';
      img.addEventListener('error', () => {
        img.src = PLACEHOLDER;
        img.classList.add('is-placeholder');
      });
    });
  }

  return {
    RARITIES,
    RARITY_ORDER,
    STATUS,
    KEY,
    DEFAULT_PASS_HASH,
    state,
    esc,
    accentText,
    plainText,
    colorize,
    normalizeHex,
    accentFor,
    money,
    priceHtml,
    discount,
    slug,
    uid,
    telegramFor,
    normalizeTelegram,
    normalize,
    normalizeItem,
    ready,
    load,
    setData,
    clearLocal,
    saveCfg,
    readCfg,
    fetchPublished,
    gh: {
      repo: ghRepo,
      getFile: ghGetFile,
      putFile: ghPutFile,
      publish: ghPublish,
      uploadImage: ghUploadImage,
      request: ghRequest,
    },
    pagesUrl,
    base64Utf8,
    initChrome,
    updateChrome,
    toast,
    isAuthed,
    login,
    logout,
    changePassword,
    sha256Hex,
    compressImage,
    blobToDataUrl,
    guardImages,
    PLACEHOLDER,
  };
})();
