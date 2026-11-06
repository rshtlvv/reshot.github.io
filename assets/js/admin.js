/* ============================================================
   reshop — панель: предметы, главная, настройки, публикация
   ============================================================ */

(function () {
  'use strict';

  const RS = window.RS;
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const TITLES = { items: 'предметы', home: 'главная', settings: 'настройки' };
  const ACTION_LABELS = { telegram: 'тг', trade: 'трейд', both: 'тг + трейд' };
  const ICONS = {
    up: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12.5V3.5M3.5 8 8 3.5 12.5 8"/></svg>',
    down: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3.5v9M3.5 8 8 12.5 12.5 8"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13"/><path d="M10 11v5M14 11v5"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  };

  const VIEWS = {};
  let store = null;
  let currentTab = 'items';
  let editingId = null;
  let imageValue = '';
  let saveTimer = null;
  let pendingSave = false;
  let confirmResolve = null;

  RS.ready()
    .then((state) => {
      store = state;
      bindGlobal();
      if (RS.isAuthed()) showApp();
      else showAuth();
    })
    .catch((error) => {
      console.error(error);
      showAuth();
    });

  /* ---------------- вход ---------------- */

  function showAuth() {
    const auth = $('#auth');
    const app = $('#app');
    if (auth) auth.hidden = false;
    if (app) app.hidden = true;
    setTimeout(() => {
      const input = $('#login-password');
      if (input && document.activeElement === document.body) input.focus();
    }, 100);
  }

  function showApp() {
    const auth = $('#auth');
    const app = $('#app');
    if (auth) auth.hidden = true;
    if (app) app.hidden = false;
    buildSelects();
    bindViewEvents();
    updateBadges();
    updateSyncUI();
    const initial = (location.hash || '').replace('#', '');
    renderTab(TITLES[initial] ? initial : 'items');
  }

  function bindGlobal() {
    const form = $('#login-form');
    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = $('#login-password');
        const error = $('#login-error');
        const button = $('#login-btn');
        if (!input || !input.value) return;
        button.disabled = true;
        button.textContent = 'проверяю…';
        const ok = await RS.login(input.value);
        button.disabled = false;
        button.textContent = 'войти';
        if (!ok) {
          input.value = '';
          if (error) error.hidden = false;
          input.focus();
          return;
        }
        if (error) error.hidden = true;
        showApp();
      });
    }

    const logout = $('#logout');
    if (logout) {
      logout.addEventListener('click', () => {
        RS.logout();
        location.reload();
      });
    }

    window.addEventListener('hashchange', () => {
      if (!RS.isAuthed()) return;
      const tab = (location.hash || '').replace('#', '');
      if (TITLES[tab] && tab !== currentTab) renderTab(tab);
    });

    document.addEventListener('click', (event) => {
      const publishBtn = event.target.closest('[data-publish]');
      if (publishBtn) {
        event.preventDefault();
        publish();
      }
    });

    const drawer = $('#drawer');
    const scrim = $('#drawer-scrim');
    const close = $('#drawer-close');
    if (scrim) scrim.addEventListener('click', closeDrawer);
    if (close) close.addEventListener('click', closeDrawer);
    const cancel = $('#f-cancel');
    if (cancel) cancel.addEventListener('click', closeDrawer);

    const file = $('#f-file');
    if (file) {
      file.addEventListener('change', () => {
        if (file.files && file.files[0]) handleImageFile(file.files[0]);
        file.value = '';
      });
    }
    const pick = $('#f-pick');
    if (pick) pick.addEventListener('click', () => file && file.click());
    const drop = $('#drop');
    if (drop) {
      drop.addEventListener('click', (event) => {
        if (event.target.closest('.drop__overlay')) return;
        if (file) file.click();
      });
      ['dragenter', 'dragover'].forEach((type) =>
        drop.addEventListener(type, (event) => {
          event.preventDefault();
          drop.classList.add('is-drag');
        })
      );
      ['dragleave', 'drop'].forEach((type) =>
        drop.addEventListener(type, (event) => {
          event.preventDefault();
          drop.classList.remove('is-drag');
        })
      );
      drop.addEventListener('drop', (event) => {
        const dropped = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (dropped) handleImageFile(dropped);
      });
    }
    const removeImage = $('#f-remove');
    if (removeImage) {
      removeImage.addEventListener('click', (event) => {
        event.stopPropagation();
        setImage('');
      });
    }
    const imageUrl = $('#f-image');
    if (imageUrl) imageUrl.addEventListener('input', () => setImage(imageUrl.value.trim(), true));

    const itemForm = $('#item-form');
    if (itemForm) itemForm.addEventListener('submit', saveItem);
    const raritySelect = $('#f-rarity');
    if (raritySelect) raritySelect.addEventListener('change', updateRarityPreview);
    const deleteBtn = $('#f-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', () => editingId && deleteItem(editingId, true));

    const ok = $('#confirm-ok');
    const cancelConfirm = $('#confirm-cancel');
    if (ok) ok.addEventListener('click', () => settleConfirm(true));
    if (cancelConfirm) cancelConfirm.addEventListener('click', () => settleConfirm(false));

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!$('#confirm').hidden) {
        settleConfirm(false);
        return;
      }
      if ($('#drawer').classList.contains('is-open')) closeDrawer();
    });
  }

  /* ---------------- вкладки ---------------- */

  function renderTab(tab) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      commitSave();
    }
    currentTab = tab;
    closeDrawer();
    $$('.admin-nav a').forEach((link) => link.classList.toggle('is-active', link.dataset.tab === tab));
    const title = $('#view-title');
    if (title) title.textContent = TITLES[tab];
    if (location.hash !== '#' + tab) {
      try {
        history.replaceState(null, '', '#' + tab);
      } catch (error) {
        /* noop */
      }
    }
    const view = $('#view');
    if (!view) return;
    view.innerHTML = '';
    VIEWS[tab](view);
    setSaveState(tab === 'items' ? '' : 'автосохранение');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- предметы ---------------- */

  VIEWS.items = function (view) {
    view.innerHTML =
      '<div class="admin-toolbar">' +
      '<div class="field">' + ICONS.search +
      '<label class="sr-only" for="admin-search">поиск</label>' +
      '<input id="admin-search" type="search" placeholder="поиск по названию или герою" autocomplete="off">' +
      '</div>' +
      '<button class="btn btn--primary btn--sm" type="button" id="add-item">' + ICONS.plus + 'добавить</button>' +
      '<span class="save-state" id="items-total" style="margin-left:auto"></span>' +
      '</div>' +
      '<div class="rows" id="rows"></div>' +
      '<div class="empty" id="rows-empty" hidden style="margin-top:16px">' +
      '<h3>пока пусто</h3><p>добавьте первый предмет.</p>' +
      '<button class="btn btn--primary btn--sm" type="button" data-add-item>добавить</button>' +
      '</div>';

    const search = $('#admin-search');
    if (search) search.addEventListener('input', paintRows);
    const add = $('#add-item');
    if (add) add.addEventListener('click', () => openEditor(null));
    const emptyAdd = $('[data-add-item]');
    if (emptyAdd) emptyAdd.addEventListener('click', () => openEditor(null));
    paintRows();
  };

  function paintRows() {
    const rows = $('#rows');
    if (!rows) return;
    const query = ($('#admin-search') && $('#admin-search').value.trim().toLowerCase()) || '';
    const all = store.data.items;
    const currency = (store.data.settings && store.data.settings.currency) || '₽';
    const list = query
      ? all.filter((item) => (RS.plainText(item.name) + ' ' + item.hero).toLowerCase().includes(query))
      : all;

    rows.innerHTML = list
      .map((item) => {
        const index = all.indexOf(item);
        const status = RS.STATUS[item.status] || RS.STATUS.in_stock;
        const tone = status.tone === 'ok' ? ' is-ok' : status.tone === 'warn' ? ' is-warn' : '';
        const stock = item.stock > 0 ? item.stock + ' шт.' : 'нет';
        const rarity = RS.RARITIES[item.rarity] || RS.RARITIES.rare;
        const actions = ACTION_LABELS[item.actions] || ACTION_LABELS.telegram;
        return (
          '<div class="item-row' + (item.status === 'sold' ? ' is-sold' : '') + '" data-row-id="' + RS.esc(item.id) + '">' +
          '<div class="item-row__thumb"><img src="' + RS.esc(item.image || RS.PLACEHOLDER) + '" alt="" loading="lazy" data-guard></div>' +
          '<div class="item-row__name"><b>' + RS.esc(RS.plainText(item.name)) + '</b><span>' + RS.esc(item.hero || '—') + ' · ' + RS.esc(item.slot || '—') + ' · ' + RS.esc(stock) + ' · <em style="font-style:normal;color:' + rarity.color + '">' + RS.esc(rarity.label) + '</em></span></div>' +
          '<div class="item-row__price">' + RS.money(item.price) + ' ' + RS.esc(currency) + '</div>' +
          '<div class="item-row__actions-label">' + RS.esc(actions) + '</div>' +
          '<div class="item-row__status' + tone + '">' + RS.esc(status.label) + '</div>' +
          '<div class="item-row__actions">' +
          '<button class="mini-btn" type="button" data-up="' + RS.esc(item.id) + '" aria-label="выше"' + (index === 0 ? ' disabled' : '') + '>' + ICONS.up + '</button>' +
          '<button class="mini-btn" type="button" data-down="' + RS.esc(item.id) + '" aria-label="ниже"' + (index === all.length - 1 ? ' disabled' : '') + '>' + ICONS.down + '</button>' +
          '<button class="mini-btn" type="button" data-edit="' + RS.esc(item.id) + '" aria-label="изменить">' + ICONS.edit + '</button>' +
          '<button class="mini-btn mini-btn--danger" type="button" data-del="' + RS.esc(item.id) + '" aria-label="удалить">' + ICONS.trash + '</button>' +
          '</div></div>'
        );
      })
      .join('');

    const empty = $('#rows-empty');
    if (empty) empty.hidden = list.length > 0;
    const total = $('#items-total');
    if (total) {
      total.textContent = query
        ? 'найдено ' + list.length + ' из ' + all.length
        : all.length + ' ' + plural(all.length, ['предмет', 'предмета', 'предметов']);
    }
    RS.guardImages(rows);
    updateBadges();
  }

  function buildSelects() {
    const status = $('#f-status');
    if (status) {
      status.innerHTML = Object.keys(RS.STATUS)
        .map((key) => '<option value="' + key + '">' + RS.STATUS[key].label + '</option>')
        .join('');
    }
    const actions = $('#f-actions');
    if (actions) {
      actions.innerHTML =
        '<option value="telegram">только Telegram</option>' +
        '<option value="trade">только трейд</option>' +
        '<option value="both">трейд + Telegram</option>';
    }
    const rarity = $('#f-rarity');
    if (rarity) {
      rarity.innerHTML = RS.RARITY_ORDER
        .map((key) => '<option value="' + key + '">' + RS.RARITIES[key].label + '</option>')
        .join('');
    }
    const datalist = $('#hero-options');
    const names = Array.from(new Set(store.data.items.map((item) => item.hero).filter(Boolean))).sort();
    if (datalist) datalist.innerHTML = names.map((name) => '<option value="' + RS.esc(name) + '"></option>').join('');
  }

  function updateRarityPreview() {
    const select = $('#f-rarity');
    const box = $('#rarity-preview');
    const label = $('#rarity-preview-label');
    if (!select || !box) return;
    const rarity = RS.RARITIES[select.value] || RS.RARITIES.rare;
    box.style.setProperty('--r', rarity.color);
    if (label) label.textContent = rarity.label;
  }

  function openEditor(id) {
    const item = id ? store.data.items.find((entry) => entry.id === id) : null;
    editingId = item ? item.id : null;
    buildSelects();

    $('#drawer').classList.add('is-open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    $('#drawer-mode').textContent = item ? 'редактирование' : 'новый предмет';
    $('#drawer-title').textContent = item ? RS.plainText(item.name) : 'добавить предмет';
    $('#f-delete').hidden = !item;
    $('#form-error').hidden = true;

    $('#f-name').value = item ? item.name : '';
    $('#f-hero').value = item ? item.hero : '';
    $('#f-slot').value = item ? item.slot : '';
    $('#f-status').value = item ? item.status : 'in_stock';
    $('#f-rarity').value = item ? item.rarity || 'rare' : 'rare';
    $('#f-actions').value = item ? item.actions || 'telegram' : 'telegram';
    $('#f-price').value = item ? item.price : '';
    $('#f-stock').value = item ? item.stock : 1;
    $('#f-trade').value = item ? item.trade || '' : '';
    $('#f-telegram').value = item ? item.telegram || '' : '';
    $('#f-trade-ban').checked = Boolean(item && item.tradeBan);
    $('#f-gift').checked = Boolean(item && item.gift);
    updateRarityPreview();
    setImage(item ? item.image : '');

    const body = $('.drawer__body');
    if (body) body.scrollTop = 0;
    if (window.matchMedia('(pointer: fine)').matches) {
      setTimeout(() => $('#f-name').focus({ preventScroll: true }), 80);
    }
  }

  function closeDrawer() {
    const drawer = $('#drawer');
    if (!drawer || !drawer.classList.contains('is-open')) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    editingId = null;
  }

  function setImage(value, fromInput) {
    imageValue = value || '';
    const preview = $('#f-preview');
    const empty = $('#f-empty');
    const input = $('#f-image');
    const isData = /^data:/i.test(imageValue);
    if (preview) {
      if (imageValue) {
        preview.src = imageValue;
        preview.hidden = false;
        preview.onerror = () => {
          preview.hidden = true;
          if (empty) empty.hidden = false;
        };
      } else {
        preview.hidden = true;
        preview.removeAttribute('src');
      }
    }
    if (empty) empty.hidden = Boolean(imageValue);
    if (input && !fromInput) input.value = isData ? '' : imageValue;
  }

  async function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
      RS.toast('это не картинка', 'error');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      RS.toast('файл больше 8 МБ', 'error');
      return;
    }
    const note = $('#image-note');
    try {
      if (note) note.textContent = 'обрабатываю…';
      const compressed = await RS.compressImage(file, 1200, 0.86);
      const cfg = store.cfg;
      if (cfg.owner && cfg.repo && cfg.token) {
        if (note) note.textContent = 'загружаю в github…';
        const base = RS.slug(RS.plainText($('#f-name').value)) || 'item';
        const name = base + '-' + Date.now().toString(36) + '.webp';
        const path = await RS.gh.uploadImage(compressed.blob, name);
        setImage(path);
        if (note) note.textContent = 'загружено → ' + path;
        RS.toast('картинка загружена', 'success');
      } else {
        const dataUrl = await RS.blobToDataUrl(compressed.blob);
        setImage(dataUrl);
        if (note) note.textContent = 'демо-режим: картинка сохранится внутри data.json';
        RS.toast('картинка добавлена в черновик', 'warn', 5000);
      }
    } catch (error) {
      if (note) note.textContent = 'не удалось обработать картинку';
      RS.toast('ошибка загрузки: ' + error.message, 'error', 6000);
    }
  }

  function saveItem(event) {
    event.preventDefault();
    const name = $('#f-name').value.trim();
    const plainName = RS.plainText(name).trim();
    const errorEl = $('#form-error');
    if (!plainName) {
      if (errorEl) {
        errorEl.textContent = 'укажите название';
        errorEl.hidden = false;
      }
      $('#f-name').focus();
      return;
    }
    const actions = $('#f-actions').value;
    const ownTrade = $('#f-trade').value.trim();
    const globalTrade = (store.data.settings && store.data.settings.steam) || '';
    if ((actions === 'trade' || actions === 'both') && !ownTrade && !globalTrade) {
      if (errorEl) {
        errorEl.textContent = 'добавьте ссылку трейда в «Главная» или в это поле';
        errorEl.hidden = false;
      }
      $('#f-trade').focus();
      return;
    }
    const payload = {
      id: editingId || uniqueId(name),
      name,
      hero: $('#f-hero').value.trim(),
      slot: $('#f-slot').value.trim(),
      price: Math.max(0, Number($('#f-price').value) || 0),
      image: imageValue || $('#f-image').value.trim(),
      status: $('#f-status').value,
      rarity: $('#f-rarity').value || 'rare',
      stock: Math.max(0, Math.floor(Number($('#f-stock').value) || 0)),
      actions,
      trade: ownTrade,
      telegram: $('#f-telegram').value.trim(),
      tradeBan: $('#f-trade-ban').checked,
      gift: $('#f-gift').checked,
    };

    const items = store.data.items;
    const index = items.findIndex((entry) => entry.id === editingId);
    if (index >= 0) items[index] = payload;
    else items.push(payload);

    store.data.updatedAt = new Date().toISOString();
    RS.setData(store.data);
    closeDrawer();
    paintRows();
    updateSyncUI();
    RS.toast(index >= 0 ? 'предмет обновлён' : 'предмет добавлен', 'success');
  }

  function uniqueId(name) {
    const base = RS.slug(RS.plainText(name)) || 'item';
    let id = base;
    let counter = 2;
    while (store.data.items.some((item) => item.id === id)) {
      id = base + '-' + counter;
      counter += 1;
    }
    return id;
  }

  async function deleteItem(id, fromDrawer) {
    const item = store.data.items.find((entry) => entry.id === id);
    if (!item) return;
    const confirmed = await askConfirm(
      'удалить предмет?',
      '«' + RS.plainText(item.name) + '» исчезнет из каталога.',
      'удалить'
    );
    if (!confirmed) return;
    store.data.items = store.data.items.filter((entry) => entry.id !== id);
    store.data.updatedAt = new Date().toISOString();
    RS.setData(store.data);
    if (fromDrawer) closeDrawer();
    paintRows();
    updateSyncUI();
    RS.toast('предмет удалён', 'success');
  }

  function moveItem(id, delta) {
    const items = store.data.items;
    const index = items.findIndex((entry) => entry.id === id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= items.length) return;
    const [item] = items.splice(index, 1);
    items.splice(next, 0, item);
    store.data.updatedAt = new Date().toISOString();
    RS.setData(store.data);
    paintRows();
  }

  /* ---------------- главная ---------------- */

  VIEWS.home = function (view) {
    const settings = store.data.settings || {};
    const intro = settings.intro || {};
    view.innerHTML =
      '<div class="panel">' +
      '<div class="panel__head"><div><h2>главная</h2><p>текст сверху и ссылки, которые видят покупатели.</p></div></div>' +
      '<div class="form-grid">' +
      '<label class="label">название<input class="input" id="s-name" value="' + RS.esc(settings.name) + '"></label>' +
      '<label class="label">валюта<input class="input" id="s-currency" value="' + RS.esc(settings.currency) + '"></label>' +
      '<label class="label span-2">заголовок <span class="hint">*слово* станет оранжевым</span><input class="input" id="s-intro-title" value="' + RS.esc(intro.title) + '" placeholder="Привет. Это *reshop*."></label>' +
      '<label class="label span-2">текст<textarea class="input" id="s-intro-text" rows="3">' + RS.esc(intro.text) + '</textarea></label>' +
      '<label class="label span-2">правила сделок <span class="hint">пока заглушка — Telegram; потом замените на ссылку</span><input class="input" id="s-rules" value="' + RS.esc(settings.rules) + '" placeholder="https://t.me/…"></label>' +
      '<label class="label span-2">инвентарь Steam<input class="input" id="s-inventory" value="' + RS.esc(settings.inventory) + '" placeholder="https://steamcommunity.com/profiles/…/inventory"></label>' +
      '<label class="label span-2">Telegram<input class="input" id="s-telegram" value="' + RS.esc(settings.telegram) + '" placeholder="https://t.me/…"></label>' +
      '<label class="label span-2">ссылка трейда Steam<input class="input" id="s-steam" value="' + RS.esc(settings.steam) + '" placeholder="https://steamcommunity.com/tradeoffer/…"></label>' +
      '<label class="label span-2">подпись в футере<textarea class="input" id="s-footer" rows="2">' + RS.esc(settings.footerNote) + '</textarea></label>' +
      '<label class="label span-2">текст для трейд-бана <span class="hint">при наведении или долгом нажатии на иконку</span><textarea class="input" id="s-hint-ban" rows="2">' + RS.esc((settings.hints && settings.hints.tradeBan) || '') + '</textarea></label>' +
      '<label class="label span-2">текст для подарка <span class="hint">при наведении или долгом нажатии на иконку</span><textarea class="input" id="s-hint-gift" rows="2">' + RS.esc((settings.hints && settings.hints.gift) || '') + '</textarea></label>' +
      '</div></div>' +
      '<div class="form-actions" style="border-top:0">' +
      '<span class="save-state">изменения сохраняются автоматически</span>' +
      '<a class="btn btn--ghost btn--sm" href="index.html" target="_blank" rel="noopener">открыть сайт</a>' +
      '</div>';
  };

  function collectHome() {
    const prev = store.data.settings || {};
    return Object.assign({}, prev, {
      name: val('s-name') || 'reshop',
      currency: val('s-currency') || '₽',
      intro: {
        title: val('s-intro-title'),
        text: val('s-intro-text'),
      },
      rules: val('s-rules'),
      inventory: val('s-inventory'),
      telegram: val('s-telegram'),
      steam: val('s-steam'),
      footerNote: val('s-footer'),
      hints: {
        tradeBan: val('s-hint-ban') || 'Сейчас предмет находится в трейд-бане. Свяжитесь со мной в Telegram, чтобы узнать подробности.',
        gift: val('s-hint-gift') || 'Этот предмет можно получить только подарком. Свяжитесь со мной в Telegram, чтобы узнать подробности.',
      },
    });
  }

  /* ---------------- настройки ---------------- */

  VIEWS.settings = function (view) {
    const cfg = store.cfg || {};
    const connected = Boolean(cfg.owner && cfg.repo && cfg.token);
    view.innerHTML =
      '<div class="settings-grid">' +
      '<div>' +
      '<div class="panel">' +
      '<div class="panel__head"><div><h2>GitHub</h2><p>куда публиковать data.json. токен хранится только в этом браузере.</p></div></div>' +
      '<div class="form-grid">' +
      '<label class="label">владелец<input class="input" id="g-owner" value="' + RS.esc(cfg.owner) + '" placeholder="username" autocomplete="off"></label>' +
      '<label class="label">репозиторий<input class="input" id="g-repo" value="' + RS.esc(cfg.repo) + '" placeholder="reshot.github.io" autocomplete="off"></label>' +
      '<label class="label">ветка<input class="input" id="g-branch" value="' + RS.esc(cfg.branch || 'main') + '" placeholder="main" autocomplete="off"></label>' +
      '<label class="label">путь<input class="input" id="g-path" value="' + RS.esc(cfg.path || 'data.json') + '" placeholder="data.json" autocomplete="off"></label>' +
      '<label class="label span-2">токен' +
      '<div class="token-row"><input class="input" id="g-token" type="password" value="' + RS.esc(cfg.token) + '" placeholder="github_pat_…" autocomplete="off" spellcheck="false">' +
      '<button class="icon-btn" type="button" id="g-token-toggle" aria-label="показать токен"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg></button></div>' +
      '<span class="hint">fine-grained token → Contents: Read and write</span></label>' +
      '</div>' +
      '<p class="image-note" id="conn-note" style="margin-top:12px">' + (connected ? 'подключено: ' + RS.esc(cfg.owner + '/' + cfg.repo) : 'демо-режим — правки только в этом браузере') + '</p>' +
      '</div>' +

      '<div class="panel">' +
      '<div class="panel__head"><div><h2>доступ</h2><p>пароль на вход. хранится локально, sha-256.</p></div></div>' +
      '<form id="password-form" class="form-grid">' +
      '<label class="label">новый пароль<input class="input" id="p-new" type="password" minlength="4" autocomplete="new-password" data-no-save></label>' +
      '<label class="label">повторите<input class="input" id="p-repeat" type="password" minlength="4" autocomplete="new-password" data-no-save></label>' +
      '<div class="span-2"><button class="btn btn--ghost btn--sm" type="submit">сменить пароль</button></div>' +
      '</form></div>' +

      '<div class="panel">' +
      '<div class="panel__head"><div><h2>данные</h2><p>резервная копия и синхронизация.</p></div></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
      '<button class="btn btn--ghost btn--sm" type="button" id="btn-export">скачать json</button>' +
      '<button class="btn btn--ghost btn--sm" type="button" id="btn-import">загрузить json</button>' +
      '<button class="btn btn--ghost btn--sm" type="button" id="btn-pull">скачать с github</button>' +
      '</div><input type="file" id="import-file" accept="application/json,.json" hidden>' +
      '</div>' +

      '<div class="panel danger-zone">' +
      '<div class="panel__head"><div><h2>сброс</h2><p>удалить локальные правки и вернуться к опубликованной версии.</p></div></div>' +
      '<button class="btn btn--danger btn--sm" type="button" id="btn-reset">сбросить правки</button>' +
      '</div>' +
      '</div>' +

      '<div class="settings-side">' +
      '<div class="panel">' +
      '<div class="panel__head"><div><h2>статус</h2></div></div>' +
      '<div class="status-list">' +
      '<div class="status-line">репозиторий <b id="st-repo">' + (connected ? RS.esc(cfg.owner + '/' + cfg.repo) : 'не подключён') + '</b></div>' +
      '<div class="status-line">ветка <b id="st-branch">' + RS.esc(cfg.branch || 'main') + '</b></div>' +
      '<div class="status-line">токен <b id="st-token" class="' + (cfg.token ? 'is-ok' : '') + '">' + (cfg.token ? 'задан' : 'не задан') + '</b></div>' +
      '<div class="status-line">сайт <b id="st-site">' + (connected ? RS.esc(RS.pagesUrl()) : '—') + '</b></div>' +
      '</div>' +
      '<div style="display:grid;gap:8px;margin-top:14px">' +
      '<button class="btn btn--ghost btn--sm" type="button" id="test-conn">проверить подключение</button>' +
      '<a class="btn btn--ghost btn--sm" id="btn-pages" href="' + (connected ? RS.esc(RS.pagesUrl()) : '#') + '" target="_blank" rel="noopener"' + (connected ? '' : ' hidden') + '>открыть сайт</a>' +
      '</div>' +
      '<p class="image-note" id="test-note" style="margin-top:10px"></p>' +
      '</div>' +
      '<div class="panel">' +
      '<div class="panel__head"><div><h2>публикация</h2></div></div>' +
      '<p class="image-note">изменения сохраняются в браузере. публикация записывает data.json в репозиторий.</p>' +
      '<button class="btn btn--primary btn--sm btn--block" type="button" data-publish style="margin-top:12px">опубликовать</button>' +
      '</div>' +
      '</div>' +
      '</div>';
  };

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function collectGithub() {
    return {
      owner: val('g-owner').replace(/^@/, ''),
      repo: val('g-repo'),
      branch: val('g-branch') || 'main',
      path: val('g-path') || 'data.json',
      token: document.getElementById('g-token') ? document.getElementById('g-token').value.trim() : store.cfg.token,
    };
  }

  /* ---------------- автосохранение ---------------- */

  function bindViewEvents() {
    const view = $('#view');
    if (!view) return;

    view.addEventListener('input', (event) => {
      if (event.target.closest('[data-no-save]')) return;
      if (currentTab !== 'home' && currentTab !== 'settings') return;
      pendingSave = true;
      setSaveState('сохранение…');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        commitSave();
      }, 500);
    });

    view.addEventListener('submit', (event) => {
      if (event.target.id === 'password-form') {
        event.preventDefault();
        changePassword();
      }
    });

    view.addEventListener('change', (event) => {
      if (event.target.id === 'import-file' && event.target.files && event.target.files[0]) {
        importJson(event.target.files[0]);
        event.target.value = '';
      }
    });

    view.addEventListener('click', (event) => {
      const target = event.target.closest('button, a');
      if (!target) return;
      if (target.dataset.edit) {
        openEditor(target.dataset.edit);
        return;
      }
      if (target.dataset.del) {
        deleteItem(target.dataset.del, false);
        return;
      }
      if (target.dataset.up) {
        moveItem(target.dataset.up, -1);
        return;
      }
      if (target.dataset.down) {
        moveItem(target.dataset.down, 1);
        return;
      }
      if (target.id === 'g-token-toggle') {
        const input = $('#g-token');
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
        return;
      }
      if (target.id === 'test-conn') {
        testConnection();
        return;
      }
      if (target.id === 'btn-export') {
        exportJson();
        return;
      }
      if (target.id === 'btn-import') {
        const input = $('#import-file');
        if (input) input.click();
        return;
      }
      if (target.id === 'btn-pull') {
        pullFromGithub();
        return;
      }
      if (target.id === 'btn-reset') {
        resetLocal();
        return;
      }
    });
  }

  function setSaveState(text) {
    const el = $('#save-state');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-saved', text === 'сохранено');
  }

  function commitSave() {
    if (!pendingSave) return;
    pendingSave = false;
    if (currentTab === 'home') {
      store.data.settings = collectHome();
      store.data.updatedAt = new Date().toISOString();
      RS.setData(store.data);
    } else if (currentTab === 'settings') {
      RS.saveCfg(collectGithub());
    } else {
      return;
    }
    updateBadges();
    updateSyncUI();
    setSaveState('сохранено');
    setTimeout(() => setSaveState(''), 2500);
  }

  async function changePassword() {
    const next = val('p-new');
    const repeat = val('p-repeat');
    if (next.length < 4) {
      RS.toast('пароль короче 4 символов', 'error');
      return;
    }
    if (next !== repeat) {
      RS.toast('пароли не совпадают', 'error');
      return;
    }
    await RS.changePassword(next);
    $('#p-new').value = '';
    $('#p-repeat').value = '';
    RS.toast('пароль обновлён', 'success');
  }

  /* ---------------- статус / публикация ---------------- */

  function updateBadges() {
    const count = $('#nav-items-count');
    if (count && store) count.textContent = store.data.items.length;
    const badge = $('#dirty-badge');
    if (badge) badge.hidden = !RS.state.hasDraft;
  }

  function updateSyncUI() {
    if (!store) return;
    const cfg = store.cfg || {};
    const connected = Boolean(cfg.owner && cfg.repo && cfg.token);
    const card = $('#sync-card');
    if (card) card.classList.toggle('is-connected', connected);
    const label = $('#sync-label');
    if (label) label.textContent = connected ? 'github подключён' : 'демо-режим';
    const note = $('#sync-note');
    if (note) {
      note.textContent = connected
        ? 'правки в этом браузере. «опубликовать» обновит data.json.'
        : 'правки только в этом браузере. подключите github в настройках.';
    }
    const pages = $('#pages-link');
    if (pages) {
      pages.hidden = !connected;
      if (connected) pages.href = RS.pagesUrl();
    }
    updateBadges();
  }

  function describeError(error) {
    if (!error) return 'неизвестная ошибка';
    if (error.status === 401) return 'токен не принят. проверьте права Contents: Read and write.';
    if (error.status === 404) return 'репозиторий не найден. проверьте владельца и имя.';
    if (error.status === 403) return 'github отклонил запрос: ' + error.message;
    if (error.status === 409) return 'конфликт версий. обновите страницу.';
    return error.message || String(error);
  }

  async function publish() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      commitSave();
    }
    const cfg = store.cfg || {};
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      RS.toast('сначала подключите github в настройках', 'error', 5000);
      renderTab('settings');
      return;
    }
    const buttons = $$('[data-publish]');
    buttons.forEach((button) => {
      button.disabled = true;
      button.dataset.label = button.textContent;
      button.textContent = 'публикую…';
    });
    try {
      const result = await RS.gh.publish(RS.state.data);
      const commit = result && result.result && result.result.commit;
      RS.toast('опубликовано. github pages обновится в течение минуты.', 'success', 6000);
      const note = $('#conn-note');
      if (note) {
        note.textContent = 'последняя публикация: ' + new Date().toLocaleTimeString('ru-RU') + (commit ? ' · ' + commit.sha.slice(0, 7) : '');
      }
      updateSyncUI();
    } catch (error) {
      console.error(error);
      RS.toast('не удалось опубликовать: ' + describeError(error), 'error', 8000);
    } finally {
      buttons.forEach((button) => {
        button.disabled = false;
        if (button.dataset.label) button.textContent = button.dataset.label;
      });
    }
  }

  async function testConnection() {
    const note = $('#test-note');
    const cfg = collectGithub();
    RS.saveCfg(cfg);
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      if (note) note.textContent = 'заполните владельца, репозиторий и токен';
      return;
    }
    if (note) note.textContent = 'проверяю…';
    try {
      const repo = await RS.gh.repo();
      const branchOk = !repo.default_branch || repo.default_branch === cfg.branch;
      if (note) {
        note.textContent =
          'успешно: ' + repo.full_name + '. ветка по умолчанию — ' + repo.default_branch + '.' +
          (branchOk ? '' : ' внимание: вы публикуете в ' + cfg.branch + '.');
      }
      RS.toast('подключение работает', 'success');
      updateSyncUI();
      const repoEl = $('#st-repo');
      if (repoEl) repoEl.textContent = repo.full_name;
      const branchEl = $('#st-branch');
      if (branchEl) branchEl.textContent = cfg.branch;
      const tokenEl = $('#st-token');
      if (tokenEl) {
        tokenEl.textContent = 'принят';
        tokenEl.className = 'is-ok';
      }
    } catch (error) {
      if (note) note.textContent = describeError(error);
      RS.toast(describeError(error), 'error', 7000);
    }
  }

  /* ---------------- данные ---------------- */

  function exportJson() {
    const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'reshop-data-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    RS.toast('файл скачан', 'success');
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const ok = await askConfirm('заменить данные?', 'текущие предметы и текст будут заменены.', 'импортировать');
        if (!ok) return;
        RS.setData(RS.normalize(parsed));
        RS.toast('данные импортированы', 'success');
        renderTab(currentTab);
        updateSyncUI();
      } catch (error) {
        RS.toast('не удалось прочитать json: ' + error.message, 'error', 6000);
      }
    };
    reader.readAsText(file);
  }

  async function pullFromGithub() {
    const cfg = store.cfg || {};
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      RS.toast('сначала подключите github', 'error');
      return;
    }
    try {
      const file = await RS.gh.getFile(cfg.path || 'data.json');
      if (!file.text) {
        RS.toast('в репозитории нет ' + (cfg.path || 'data.json'), 'warn');
        return;
      }
      const parsed = JSON.parse(file.text);
      const ok = await askConfirm('загрузить версию с github?', 'локальные правки будут заменены.', 'загрузить');
      if (!ok) return;
      RS.setData(RS.normalize(parsed));
      RS.toast('версия загружена', 'success');
      renderTab(currentTab);
      updateSyncUI();
    } catch (error) {
      RS.toast('не удалось скачать: ' + describeError(error), 'error', 7000);
    }
  }

  async function resetLocal() {
    const ok = await askConfirm('сбросить правки?', 'сайт вернётся к опубликованной версии.', 'сбросить');
    if (!ok) return;
    RS.clearLocal();
    RS.toast('правки сброшены', 'success');
    renderTab(currentTab);
    updateSyncUI();
  }

  /* ---------------- confirm ---------------- */

  function askConfirm(title, text, okLabel) {
    const dialog = $('#confirm');
    if (!dialog) return Promise.resolve(window.confirm(title + '\n' + text));
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    $('#confirm-ok').textContent = okLabel || 'подтвердить';
    dialog.hidden = false;
    $('#confirm-ok').focus();
    return new Promise((resolve) => {
      confirmResolve = resolve;
    });
  }

  function settleConfirm(value) {
    const dialog = $('#confirm');
    if (dialog) dialog.hidden = true;
    const resolve = confirmResolve;
    confirmResolve = null;
    if (resolve) resolve(value);
  }

  function plural(n, forms) {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }
})();
