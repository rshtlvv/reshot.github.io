/* ============================================================
   reshop — админ-панель: предметы, «Обо мне», настройки, GitHub
   ============================================================ */

(function () {
  'use strict';

  const RS = window.RS;
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const TITLES = { items: 'Предметы', about: 'Обо мне', settings: 'Настройки' };
  const VIEWS = {};

  let store = null;
  let currentTab = 'items';
  let editingId = null;
  let imageValue = '';
  let saveTimer = null;
  let pendingSave = false;
  let confirmResolve = null;

  const ICONS = {
    up: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12.5V3.5M3.5 8 8 3.5 12.5 8"/></svg>',
    down: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3.5v9M3.5 8 8 12.5 12.5 8"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13"/><path d="M10 11v5M14 11v5"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  };

  /* ============================================================
     Запуск
     ============================================================ */

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

  function showAuth() {
    const auth = $('#auth');
    const app = $('#app');
    if (auth) auth.hidden = false;
    if (app) app.hidden = true;
    setTimeout(() => {
      const input = $('#login-password');
      if (input && document.activeElement === document.body) input.focus();
    }, 120);
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
        button.textContent = 'Проверяю…';
        const ok = await RS.login(input.value);
        button.disabled = false;
        button.textContent = 'Войти';
        if (!ok) {
          input.value = '';
          if (error) error.hidden = false;
          const card = $('.auth__card');
          if (card) {
            card.classList.remove('shake');
            void card.offsetWidth;
            card.classList.add('shake');
          }
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
      const insertBtn = event.target.closest('[data-insert-color]');
      if (insertBtn) {
        event.preventDefault();
        insertColor(insertBtn.dataset.insertColor);
        return;
      }
      const publishBtn = event.target.closest('[data-publish]');
      if (publishBtn) {
        event.preventDefault();
        publish();
      }
    });

    // drawer
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
    if (imageUrl) {
      imageUrl.addEventListener('input', () => setImage(imageUrl.value.trim(), true));
    }

    const colorInput = $('#f-color');
    const colorPick = $('#f-color-pick');
    if (colorInput && colorPick) {
      colorPick.addEventListener('input', () => {
        colorInput.value = colorPick.value.toUpperCase();
      });
      colorInput.addEventListener('input', () => {
        const hex = RS.normalizeHex(colorInput.value);
        if (hex) colorPick.value = hex;
      });
    }
    const colorClear = $('#f-color-clear');
    if (colorClear) {
      colorClear.addEventListener('click', () => {
        if (colorInput) colorInput.value = '';
        if (colorPick) {
          const rarity = RS.RARITIES[$('#f-rarity').value] || RS.RARITIES.arcana;
          colorPick.value = rarity.color;
        }
      });
    }
    const raritySelect = $('#f-rarity');
    if (raritySelect && colorPick && colorInput) {
      raritySelect.addEventListener('change', () => {
        if (!RS.normalizeHex(colorInput.value)) {
          const rarity = RS.RARITIES[raritySelect.value] || RS.RARITIES.arcana;
          colorPick.value = rarity.color;
        }
      });
    }

    const itemForm = $('#item-form');
    if (itemForm) itemForm.addEventListener('submit', (event) => saveItem(event));
    const deleteBtn = $('#f-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (editingId) deleteItem(editingId, true);
      });
    }

    // confirm
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

  /* ============================================================
     Вкладки
     ============================================================ */

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
    setSaveState(tab === 'items' ? '' : 'Автосохранение');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ============================================================
     Предметы
     ============================================================ */

  VIEWS.items = function (view) {
    view.innerHTML =
      '<div class="admin-toolbar">' +
      '<div class="field">' + ICONS.search +
      '<label class="sr-only" for="admin-search">Поиск предметов</label>' +
      '<input id="admin-search" type="search" placeholder="Поиск по названию или герою…" autocomplete="off">' +
      '</div>' +
      '<button class="btn btn--primary btn--sm" type="button" id="add-item">' + ICONS.plus + 'Добавить предмет</button>' +
      '<span class="save-state" id="items-total" style="margin-left:auto"></span>' +
      '</div>' +
      '<div class="rows" id="rows"></div>' +
      '<div class="empty" id="rows-empty" hidden style="margin-top:16px">' +
      '<h3>Пока пусто</h3><p>Добавьте первый предмет — он сразу появится в черновике каталога.</p>' +
      '<button class="btn btn--primary btn--sm" type="button" data-add-item>Добавить предмет</button>' +
      '</div>';

    const search = $('#admin-search');
    if (search) {
      search.addEventListener('input', paintRows);
    }
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
      ? all.filter((item) => (RS.plainText(item.name) + ' ' + item.hero + ' ' + item.slot).toLowerCase().includes(query))
      : all;

    rows.innerHTML = list
      .map((item) => {
        const index = all.indexOf(item);
        const rarity = RS.RARITIES[item.rarity] || RS.RARITIES.rare;
        const accent = RS.accentFor(item);
        const status = RS.STATUS[item.status] || RS.STATUS.in_stock;
        const tone = status.tone === 'ok' ? ' is-ok' : status.tone === 'warn' ? ' is-warn' : '';
        const stock = item.stock > 0 ? item.stock + ' шт.' : 'нет в наличии';
        return (
          '<div class="item-row' + (item.status === 'sold' ? ' is-sold' : '') + '" data-row-id="' + RS.esc(item.id) + '">' +
          '<div class="item-row__thumb"><img src="' + RS.esc(item.image || RS.PLACEHOLDER) + '" alt="" loading="lazy" data-guard></div>' +
          '<div class="item-row__name"><b style="color:' + accent + '">' + RS.colorize(item.name) + '</b><span>' + RS.esc(item.hero || '—') + ' · ' + RS.esc(item.slot || '—') + ' · ' + RS.esc(stock) + (item.hit ? ' · хит' : '') + '</span></div>' +
          '<div class="item-row__rarity" style="--r:' + accent + '">' + RS.esc(rarity.label) + '</div>' +
          '<div class="item-row__price">' + RS.money(item.price) + ' ' + RS.esc(currency) + '</div>' +
          '<div class="item-row__status' + tone + '">' + RS.esc(status.label) + '</div>' +
          '<div class="item-row__actions">' +
          '<button class="mini-btn" type="button" data-up="' + RS.esc(item.id) + '" aria-label="Выше"' + (index === 0 ? ' disabled' : '') + '>' + ICONS.up + '</button>' +
          '<button class="mini-btn" type="button" data-down="' + RS.esc(item.id) + '" aria-label="Ниже"' + (index === all.length - 1 ? ' disabled' : '') + '>' + ICONS.down + '</button>' +
          '<button class="mini-btn" type="button" data-edit="' + RS.esc(item.id) + '" aria-label="Изменить">' + ICONS.edit + '</button>' +
          '<button class="mini-btn mini-btn--danger" type="button" data-del="' + RS.esc(item.id) + '" aria-label="Удалить">' + ICONS.trash + '</button>' +
          '</div></div>'
        );
      })
      .join('');

    const empty = $('#rows-empty');
    if (empty) empty.hidden = list.length > 0;
    const total = $('#items-total');
    if (total) {
      total.textContent = query
        ? 'Найдено ' + list.length + ' из ' + all.length
        : all.length + ' ' + plural(all.length, ['предмет', 'предмета', 'предметов']);
    }
    RS.guardImages(rows);
    updateBadges();
  }

  function buildSelects() {
    const rarity = $('#f-rarity');
    if (rarity && !rarity.options.length) {
      rarity.innerHTML = RS.RARITY_ORDER.map(
        (key) => '<option value="' + key + '">' + RS.RARITIES[key].label + '</option>'
      ).join('');
    }
    const status = $('#f-status');
    if (status && !status.options.length) {
      status.innerHTML = Object.keys(RS.STATUS)
        .map((key) => '<option value="' + key + '">' + RS.STATUS[key].label + '</option>')
        .join('');
    }
    const names = Array.from(new Set(store.data.items.map((item) => item.hero).filter(Boolean))).sort();
    const datalist = $('#hero-options');
    if (datalist) datalist.innerHTML = names.map((name) => '<option value="' + RS.esc(name) + '"></option>').join('');
  }

  function openEditor(id) {
    const item = id ? store.data.items.find((entry) => entry.id === id) : null;
    editingId = item ? item.id : null;
    buildSelects();

    $('#drawer').classList.add('is-open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    $('#drawer-mode').textContent = item ? 'Редактирование' : 'Новый предмет';
    $('#drawer-title').textContent = item ? RS.plainText(item.name) : 'Добавить предмет';
    $('#f-delete').hidden = !item;
    $('#form-error').hidden = true;

    $('#f-name').value = item ? item.name : '';
    $('#f-hero').value = item ? item.hero : '';
    $('#f-slot').value = item ? item.slot : '';
    $('#f-rarity').value = item ? item.rarity : 'arcana';
    $('#f-status').value = item ? item.status : 'in_stock';
    $('#f-price').value = item ? item.price : '';
    $('#f-old-price').value = item ? item.oldPrice || '' : '';
    $('#f-stock').value = item ? item.stock : 1;
    $('#f-color').value = item && item.color ? item.color : '';
    const accent = item ? RS.accentFor(item) : RS.RARITIES.arcana.color;
    const colorPick = $('#f-color-pick');
    if (colorPick) colorPick.value = accent;
    document.querySelectorAll('.color-tools .color-input').forEach((picker) => {
      picker.value = accent;
    });
    $('#f-description').value = item ? item.description : '';
    $('#f-telegram').value = item ? item.telegram : '';
    $('#f-hit').checked = item ? Boolean(item.hit) : false;
    setImage(item ? item.image : '');

    const bodyEl = $('.drawer__body');
    if (bodyEl) bodyEl.scrollTop = 0;
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

  function insertColor(targetId) {
    const input = document.getElementById(targetId);
    if (!input) return;
    const tools = document.querySelector('[data-color-for="' + targetId + '"]');
    const picker = tools && tools.querySelector('input[type="color"]');
    const hex = (picker ? picker.value : '#ADE55C').toUpperCase();
    const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
    const selected = input.value.slice(start, end);
    const open = '{#' + hex + '}';
    const close = '{/}';
    if (selected) {
      input.setRangeText(open + selected + close, start, end, 'end');
    } else {
      input.setRangeText(open + close, start, end, 'end');
      const caret = start + open.length;
      input.setSelectionRange(caret, caret);
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  function setImage(value, fromInput) {
    imageValue = value || '';
    const preview = $('#f-preview');
    const empty = $('#f-empty');
    const url = $('#f-image');
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
    if (url && !fromInput) url.value = isData ? '' : imageValue;
  }

  async function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
      RS.toast('Это не изображение.', 'error');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      RS.toast('Файл больше 8 МБ — выберите поменьше.', 'error');
      return;
    }
    const note = $('#image-note');
    try {
      if (note) note.textContent = 'Обрабатываю изображение…';
      const compressed = await RS.compressImage(file, 1200, 0.86);
      const cfg = store.cfg;
      if (cfg.owner && cfg.repo && cfg.token) {
        if (note) note.textContent = 'Загружаю в GitHub…';
        const base = RS.slug(RS.plainText($('#f-name').value)) || 'item';
        const name = base + '-' + Date.now().toString(36) + '.webp';
        const path = await RS.gh.uploadImage(compressed.blob, name);
        setImage(path);
        if (note) note.textContent = 'Загружено в репозиторий → ' + path;
        RS.toast('Изображение загружено в репозиторий.', 'success');
      } else {
        const dataUrl = await RS.blobToDataUrl(compressed.blob);
        setImage(dataUrl);
        if (note) note.textContent = 'Демо-режим: изображение сохранится внутри data.json. Подключите GitHub, чтобы загружать файлы в assets/items.';
        RS.toast('Изображение добавлено в черновик (демо-режим).', 'warn', 5000);
      }
    } catch (error) {
      if (note) note.textContent = 'Не удалось обработать изображение.';
      RS.toast('Ошибка загрузки: ' + error.message, 'error', 6000);
    }
  }

  function saveItem(event) {
    event.preventDefault();
    const name = $('#f-name').value.trim();
    const plainName = RS.plainText(name).trim();
    const errorEl = $('#form-error');
    if (!plainName) {
      if (errorEl) {
        errorEl.textContent = 'Укажите название предмета.';
        errorEl.hidden = false;
      }
      $('#f-name').focus();
      return;
    }
    const colorRaw = $('#f-color').value.trim();
    const color = RS.normalizeHex(colorRaw);
    if (colorRaw && !color) {
      if (errorEl) {
        errorEl.textContent = 'Цвет должен быть в формате HEX: #ADE55C или #A5C.';
        errorEl.hidden = false;
      }
      $('#f-color').focus();
      return;
    }
    const price = Math.max(0, Number($('#f-price').value) || 0);
    const oldPrice = Math.max(0, Number($('#f-old-price').value) || 0);
    const stock = Math.max(0, Math.floor(Number($('#f-stock').value) || 0));
    const payload = {
      id: editingId || uniqueId(name),
      name,
      hero: $('#f-hero').value.trim(),
      slot: $('#f-slot').value.trim(),
      rarity: $('#f-rarity').value,
      price,
      oldPrice,
      image: imageValue || $('#f-image').value.trim(),
      status: $('#f-status').value,
      hit: $('#f-hit').checked,
      description: $('#f-description').value.trim(),
      telegram: $('#f-telegram').value.trim(),
      stock,
      color,
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
    RS.toast(index >= 0 ? 'Предмет обновлён.' : 'Предмет добавлен.', 'success');
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
      'Удалить предмет?',
      '«' + RS.plainText(item.name) + '» исчезнет из каталога. Это действие нельзя отменить, но изменения ещё можно не публиковать.',
      'Удалить'
    );
    if (!confirmed) return;
    store.data.items = store.data.items.filter((entry) => entry.id !== id);
    store.data.updatedAt = new Date().toISOString();
    RS.setData(store.data);
    if (fromDrawer) closeDrawer();
    paintRows();
    updateSyncUI();
    RS.toast('Предмет удалён.', 'success');
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

  /* ============================================================
     Обо мне
     ============================================================ */

  VIEWS.about = function (view) {
    const about = store.data.about || {};
    view.innerHTML =
      '<div class="panel">' +
      '<div class="panel__head"><div><h2>Страница «Обо мне»</h2><p>Текст, который видят покупатели. Слово в *звёздочках* станет акцентным.</p></div></div>' +
      '<div class="form-grid">' +
      '<label class="label">Надзаголовок<input class="input" id="a-eyebrow" value="' + RS.esc(about.eyebrow) + '"></label>' +
      '<label class="label">Имя / ник<input class="input" id="a-name" value="' + RS.esc(about.name) + '"></label>' +
      '<label class="label span-2">Заголовок<input class="input" id="a-title" value="' + RS.esc(about.title) + '"></label>' +
      '<label class="label span-2">Короткое описание<input class="input" id="a-role" value="' + RS.esc(about.role) + '"></label>' +
      '<label class="label span-2">Лид-абзац<textarea class="input" id="a-lead" rows="2">' + RS.esc(about.lead) + '</textarea></label>' +
      '<label class="label span-2">Абзацы <span class="hint">разделяйте пустой строкой</span><textarea class="input" id="a-paragraphs" rows="6">' + RS.esc((about.paragraphs || []).join('\n\n')) + '</textarea></label>' +
      '<label class="label span-2">Ссылка на аватар <span class="hint">необязательно — по умолчанию монограмма</span><input class="input" id="a-avatar" value="' + RS.esc(about.avatar || '') + '" placeholder="assets/… или https://…"></label>' +
      '</div></div>' +

      '<div class="panel">' +
      '<div class="panel__head"><div><h2>Цифры</h2><p>Короткие факты под первым экраном.</p></div><button class="btn btn--ghost btn--sm" type="button" data-add="stats">' + ICONS.plus + 'Добавить</button></div>' +
      '<div class="repeater" data-list="stats">' + repeaterRows('stats', about.stats, ['value', 'label']) + '</div>' +
      '</div>' +

      '<div class="panel">' +
      '<div class="panel__head"><div><h2>Шаги сделки</h2><p>Как проходит покупка — три шага.</p></div><button class="btn btn--ghost btn--sm" type="button" data-add="steps">' + ICONS.plus + 'Добавить шаг</button></div>' +
      '<div class="repeater" data-list="steps">' + repeaterRows('steps', about.steps, ['title', 'text']) + '</div>' +
      '</div>' +

      '<div class="panel">' +
      '<div class="panel__head"><div><h2>FAQ</h2><p>Частые вопросы и ответы.</p></div><button class="btn btn--ghost btn--sm" type="button" data-add="faq">' + ICONS.plus + 'Добавить вопрос</button></div>' +
      '<div class="repeater" data-list="faq">' + repeaterRows('faq', about.faq, ['q', 'a']) + '</div>' +
      '</div>' +

      '<div class="panel">' +
      '<div class="panel__head"><div><h2>Блок призыва</h2><p>Нижний блок на странице «Обо мне».</p></div></div>' +
      '<div class="form-grid">' +
      '<label class="label span-2">Заголовок<input class="input" id="a-cta-title" value="' + RS.esc(about.ctaTitle) + '"></label>' +
      '<label class="label span-2">Текст<textarea class="input" id="a-cta-text" rows="2">' + RS.esc(about.ctaText) + '</textarea></label>' +
      '</div></div>' +

      '<div class="form-actions" style="border-top:0">' +
      '<span class="save-state">Изменения сохраняются автоматически в этом браузере</span>' +
      '<a class="btn btn--ghost btn--sm" href="about.html" target="_blank" rel="noopener">Открыть страницу</a>' +
      '</div>';
  };

  function repeaterRows(type, list, fields) {
    const rows = Array.isArray(list) ? list : [];
    if (!rows.length) {
      return '<p class="image-note" data-empty-row>Пока нет записей — добавьте первую.</p>';
    }
    return rows
      .map((row) => {
        const wide = type !== 'stats';
        return (
          '<div class="repeater__row' + (wide ? ' repeater__row--wide' : '') + '">' +
          fields
            .map((field) => {
              const tag = field === 'text' || field === 'a' ? 'textarea' : 'input';
              const value = RS.esc(row[field] || '');
              const placeholder = { value: '2 400+', label: 'сделок', title: 'Название шага', text: 'Что происходит', q: 'Вопрос', a: 'Ответ' }[field] || '';
              if (tag === 'textarea') {
                return '<textarea class="input" data-field="' + field + '" rows="2" placeholder="' + placeholder + '">' + value + '</textarea>';
              }
              return '<input class="input" data-field="' + field + '" value="' + value + '" placeholder="' + placeholder + '">';
            })
            .join('') +
          '<button class="mini-btn mini-btn--danger" type="button" data-remove-row aria-label="Удалить строку">' + ICONS.trash + '</button>' +
          '</div>'
        );
      })
      .join('');
  }

  /* ============================================================
     Настройки
     ============================================================ */

  VIEWS.settings = function (view) {
    const settings = store.data.settings || {};
    const hero = settings.hero || {};
    const cfg = store.cfg || {};
    const connected = Boolean(cfg.owner && cfg.repo && cfg.token);
    view.innerHTML =
      '<div class="settings-grid">' +
      '<div>' +
      '<div class="panel">' +
      '<div class="panel__head"><div><h2>GitHub</h2><p>Куда публиковать data.json. Токен хранится только в этом браузере и никуда не отправляется, кроме api.github.com.</p></div></div>' +
      '<div class="form-grid">' +
      '<label class="label">Владелец <span class="hint">логин GitHub</span><input class="input" id="g-owner" value="' + RS.esc(cfg.owner) + '" placeholder="username" autocomplete="off"></label>' +
      '<label class="label">Репозиторий<input class="input" id="g-repo" value="' + RS.esc(cfg.repo) + '" placeholder="reshop" autocomplete="off"></label>' +
      '<label class="label">Ветка<input class="input" id="g-branch" value="' + RS.esc(cfg.branch || 'main') + '" placeholder="main" autocomplete="off"></label>' +
      '<label class="label">Путь к данным<input class="input" id="g-path" value="' + RS.esc(cfg.path || 'data.json') + '" placeholder="data.json" autocomplete="off"></label>' +
      '<label class="label span-2">Personal access token' +
      '<div class="token-row"><input class="input" id="g-token" type="password" value="' + RS.esc(cfg.token) + '" placeholder="github_pat_…" autocomplete="off" spellcheck="false">' +
      '<button class="icon-btn" type="button" id="g-token-toggle" aria-label="Показать токен"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg></button></div>' +
      '<span class="hint">Fine-grained token → Contents: Read and write. Больше прав не нужно.</span></label>' +
      '</div>' +
      '<p class="image-note" id="conn-note" style="margin-top:12px">' + (connected ? 'Подключено: ' + RS.esc(cfg.owner + '/' + cfg.repo) : 'Сейчас активен демо-режим — сайт использует локальные данные.') + '</p>' +
      '</div>' +

      '<div class="panel">' +
      '<div class="panel__head"><div><h2>Магазин</h2><p>Название и контакт, которые подставляются на сайт.</p></div></div>' +
      '<div class="form-grid">' +
      '<label class="label">Название<input class="input" id="s-name" value="' + RS.esc(settings.name) + '"></label>' +
      '<label class="label">Валюта<input class="input" id="s-currency" value="' + RS.esc(settings.currency) + '"></label>' +
      '<label class="label span-2">Telegram <span class="hint">ссылка или @ник</span><input class="input" id="s-telegram" value="' + RS.esc(settings.telegram) + '" placeholder="https://t.me/reshot"></label>' +
      '<label class="label span-2">Ссылка Steam <span class="hint">кнопка Steam в футере — вставьте свою trade-ссылку</span><input class="input" id="s-steam" value="' + RS.esc(settings.steam) + '" placeholder="https://steamcommunity.com/tradeoffer/new/?partner=...&amp;token=..."></label>' +
      '<label class="label span-2">Подпись в футере<textarea class="input" id="s-footer" rows="2">' + RS.esc(settings.footerNote) + '</textarea></label>' +
      '</div></div>' +

      '<div class="panel">' +
      '<div class="panel__head"><div><h2>Главная страница</h2><p>Заголовок первого экрана. Слово в *звёздочках* станет акцентным.</p></div></div>' +
      '<div class="form-grid">' +
      '<label class="label span-2">Надзаголовок<input class="input" id="h-eyebrow" value="' + RS.esc(hero.eyebrow) + '"></label>' +
      '<label class="label span-2">Заголовок <span class="hint">можно переносить строкой</span><textarea class="input" id="h-title" rows="2">' + RS.esc(hero.title) + '</textarea></label>' +
      '<label class="label span-2">Текст<textarea class="input" id="h-text" rows="3">' + RS.esc(hero.text) + '</textarea></label>' +
      '<label class="label span-2">Строка преимуществ<input class="input" id="h-note" value="' + RS.esc(hero.note) + '"></label>' +
      '</div>' +
      '<div class="panel__head" style="margin-top:18px"><div><h2>Цифры</h2></div><button class="btn btn--ghost btn--sm" type="button" data-add="facts">' + ICONS.plus + 'Добавить</button></div>' +
      '<div class="repeater" data-list="facts">' + repeaterRows('facts', hero.facts, ['value', 'label']) + '</div>' +
      '</div>' +

      '<div class="panel">' +
      '<div class="panel__head"><div><h2>Доступ</h2><p>Пароль на вход в админку. Проверяется локально, SHA-256.</p></div></div>' +
      '<form id="password-form" class="form-grid">' +
      '<label class="label">Новый пароль<input class="input" id="p-new" type="password" minlength="4" autocomplete="new-password" data-no-save></label>' +
      '<label class="label">Повторите пароль<input class="input" id="p-repeat" type="password" minlength="4" autocomplete="new-password" data-no-save></label>' +
      '<div class="span-2"><button class="btn btn--ghost btn--sm" type="submit">Сменить пароль</button></div>' +
      '</form></div>' +

      '<div class="panel">' +
      '<div class="panel__head"><div><h2>Данные</h2><p>Резервная копия, импорт и синхронизация.</p></div></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
      '<button class="btn btn--ghost btn--sm" type="button" id="btn-export">Скачать JSON</button>' +
      '<button class="btn btn--ghost btn--sm" type="button" id="btn-import">Загрузить JSON</button>' +
      '<button class="btn btn--ghost btn--sm" type="button" id="btn-pull">Скачать с GitHub</button>' +
      '</div>' +
      '<input type="file" id="import-file" accept="application/json,.json" hidden>' +
      '</div>' +

      '<div class="panel danger-zone">' +
      '<div class="panel__head"><div><h2>Сброс</h2><p>Удалить локальные правки и вернуться к опубликованной версии сайта.</p></div></div>' +
      '<button class="btn btn--danger btn--sm" type="button" id="btn-reset">Сбросить локальные правки</button>' +
      '</div>' +
      '</div>' +

      '<div class="settings-side">' +
      '<div class="panel">' +
      '<div class="panel__head"><div><h2>Статус</h2></div></div>' +
      '<div class="status-list">' +
      '<div class="status-line">Репозиторий <b id="st-repo">' + (connected ? RS.esc(cfg.owner + '/' + cfg.repo) : 'не подключён') + '</b></div>' +
      '<div class="status-line">Ветка <b id="st-branch">' + RS.esc(cfg.branch || 'main') + '</b></div>' +
      '<div class="status-line">Токен <b id="st-token" class="' + (cfg.token ? 'is-ok' : '') + '">' + (cfg.token ? 'задан' : 'не задан') + '</b></div>' +
      '<div class="status-line">Сайт <b id="st-site">' + (connected ? RS.esc(RS.pagesUrl()) : '—') + '</b></div>' +
      '</div>' +
      '<div style="display:grid;gap:8px;margin-top:14px">' +
      '<button class="btn btn--ghost btn--sm" type="button" id="test-conn">Проверить подключение</button>' +
      '<a class="btn btn--ghost btn--sm" id="btn-pages" href="' + (connected ? RS.esc(RS.pagesUrl()) : '#') + '" target="_blank" rel="noopener"' + (connected ? '' : ' hidden') + '>Открыть GitHub Pages</a>' +
      '</div>' +
      '<p class="image-note" id="test-note" style="margin-top:10px"></p>' +
      '</div>' +
      '<div class="panel">' +
      '<div class="panel__head"><div><h2>Публикация</h2></div></div>' +
      '<p class="image-note">Изменения сначала сохраняются в браузере. Публикация записывает data.json в репозиторий — GitHub Pages обновит сайт за 30–60 секунд.</p>' +
      '<button class="btn btn--primary btn--sm btn--block" type="button" data-publish style="margin-top:12px">Опубликовать изменения</button>' +
      '</div>' +
      '</div>' +
      '</div>';
  };

  /* ============================================================
     Сбор данных из форм
     ============================================================ */

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function readRepeater(name, fields) {
    return $$('[data-list="' + name + '"] .repeater__row')
      .map((row) => {
        const obj = {};
        fields.forEach((field) => {
          const el = row.querySelector('[data-field="' + field + '"]');
          obj[field] = el ? el.value.trim() : '';
        });
        return obj;
      })
      .filter((obj) => Object.keys(obj).some((key) => obj[key]));
  }

  function collectAbout() {
    return {
      eyebrow: val('a-eyebrow'),
      title: val('a-title') || 'Привет, я reshot',
      name: val('a-name') || 'reshot',
      role: val('a-role'),
      lead: val('a-lead'),
      paragraphs: val('a-paragraphs')
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean),
      avatar: val('a-avatar'),
      stats: readRepeater('stats', ['value', 'label']),
      steps: readRepeater('steps', ['title', 'text']),
      faq: readRepeater('faq', ['q', 'a']),
      ctaTitle: val('a-cta-title'),
      ctaText: val('a-cta-text'),
    };
  }

  function collectSettings() {
    const prev = store.data.settings || {};
    return Object.assign({}, prev, {
      name: val('s-name') || 'reshop',
      currency: val('s-currency') || '₽',
      telegram: val('s-telegram'),
      steam: val('s-steam'),
      footerNote: val('s-footer'),
      hero: Object.assign({}, prev.hero || {}, {
        eyebrow: val('h-eyebrow'),
        title: val('h-title'),
        text: val('h-text'),
        note: val('h-note'),
        facts: readRepeater('facts', ['value', 'label']),
      }),
    });
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

  /* ============================================================
     Автосохранение
     ============================================================ */

  function bindViewEvents() {
    const view = $('#view');
    if (!view) return;

    view.addEventListener('input', (event) => {
      if (event.target.closest('[data-no-save]')) return;
      if (currentTab !== 'about' && currentTab !== 'settings') return;
      pendingSave = true;
      setSaveState('Сохранение…');
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
      if (target) {
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
        if (target.dataset.add) {
          addRow(target.dataset.add);
          return;
        }
        if (target.hasAttribute('data-remove-row')) {
          removeRow(target);
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
      }
    });
  }

  function setSaveState(text) {
    const el = $('#save-state');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-saved', text === 'Сохранено');
  }

  function commitSave() {
    if (!pendingSave) return;
    pendingSave = false;
    if (currentTab === 'about') {
      store.data.about = collectAbout();
    } else if (currentTab === 'settings') {
      store.data.settings = collectSettings();
      RS.saveCfg(collectGithub());
    } else {
      return;
    }
    store.data.updatedAt = new Date().toISOString();
    RS.setData(store.data);
    updateBadges();
    updateSyncUI();
    setSaveState('Сохранено');
    setTimeout(() => setSaveState(''), 2500);
  }

  function addRow(type) {
    if (currentTab === 'about') {
      store.data.about = collectAbout();
      const list = store.data.about[type] || [];
      list.push(type === 'stats' ? { value: '', label: '' } : type === 'steps' ? { title: '', text: '' } : { q: '', a: '' });
      store.data.about[type] = list;
    } else {
      store.data.settings = collectSettings();
      const facts = store.data.settings.hero.facts || [];
      facts.push({ value: '', label: '' });
      store.data.settings.hero.facts = facts;
    }
    store.data.updatedAt = new Date().toISOString();
    RS.setData(store.data);
    updateBadges();
    if (currentTab === 'about') renderTab('about');
    else renderTab('settings');
  }

  function removeRow(button) {
    const row = button.closest('.repeater__row');
    const list = row && row.parentElement;
    if (!row || !list) return;
    const index = Array.prototype.indexOf.call(list.children, row);
    if (currentTab === 'about') {
      const about = collectAbout();
      const type = list.dataset.list;
      about[type] = about[type].filter((entry, i) => i !== index);
      store.data.about = about;
    } else {
      const settings = collectSettings();
      const facts = settings.hero.facts.filter((entry, i) => i !== index);
      settings.hero.facts = facts;
      store.data.settings = settings;
    }
    store.data.updatedAt = new Date().toISOString();
    RS.setData(store.data);
    updateBadges();
    if (currentTab === 'about') renderTab('about');
    else renderTab('settings');
  }

  async function changePassword() {
    const next = val('p-new');
    const repeat = val('p-repeat');
    if (next.length < 4) {
      RS.toast('Пароль должен быть не короче 4 символов.', 'error');
      return;
    }
    if (next !== repeat) {
      RS.toast('Пароли не совпадают.', 'error');
      return;
    }
    await RS.changePassword(next);
    $('#p-new').value = '';
    $('#p-repeat').value = '';
    RS.toast('Пароль обновлён. Он хранится в этом браузере.', 'success');
  }

  /* ============================================================
     Статус, публикация, GitHub
     ============================================================ */

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
    if (label) label.textContent = connected ? 'GitHub подключён' : 'Демо-режим';
    const note = $('#sync-note');
    if (note) {
      note.textContent = connected
        ? 'Правки хранятся в этом браузере. «Опубликовать» обновит data.json в репозитории.'
        : 'Правки сохраняются только в этом браузере. Подключите GitHub в настройках, чтобы обновлять сайт для всех.';
    }
    const pages = $('#pages-link');
    if (pages) {
      pages.hidden = !connected;
      if (connected) pages.href = RS.pagesUrl();
    }
    updateBadges();
  }

  function describeError(error) {
    if (!error) return 'Неизвестная ошибка.';
    if (error.status === 401) return 'Токен не принят. Проверьте, что он не истёк и у него есть право Contents: Read and write.';
    if (error.status === 404) return 'Репозиторий или файл не найдены. Проверьте владельца, имя репозитория и доступ токена.';
    if (error.status === 403) return 'GitHub отклонил запрос: ' + error.message;
    if (error.status === 409) return 'Конфликт версий файла. Обновите страницу и попробуйте снова.';
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
      RS.toast('Сначала подключите GitHub в настройках: владелец, репозиторий и токен.', 'error', 6000);
      renderTab('settings');
      return;
    }
    const buttons = $$('[data-publish]');
    buttons.forEach((button) => {
      button.disabled = true;
      button.dataset.label = button.textContent;
      button.textContent = 'Публикую…';
    });
    try {
      const result = await RS.gh.publish(RS.state.data);
      const commit = result && result.result && result.result.commit;
      RS.toast('Опубликовано. GitHub Pages обновится в течение минуты.', 'success', 6500);
      const note = $('#conn-note');
      if (note) {
        note.textContent = 'Последняя публикация: ' + new Date().toLocaleTimeString('ru-RU') + (commit ? ' · коммит ' + commit.sha.slice(0, 7) : '');
      }
      updateSyncUI();
      updateBadges();
    } catch (error) {
      console.error(error);
      RS.toast('Не удалось опубликовать: ' + describeError(error), 'error', 8000);
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
      if (note) note.textContent = 'Заполните владельца, репозиторий и токен.';
      RS.toast('Не хватает данных для подключения.', 'error');
      return;
    }
    if (note) note.textContent = 'Проверяю доступ…';
    try {
      const repo = await RS.gh.repo();
      const branchOk = !repo.default_branch || repo.default_branch === cfg.branch;
      if (note) {
        note.textContent =
          'Успешно: ' + repo.full_name + '. Ветка по умолчанию — ' + repo.default_branch + '.' +
          (branchOk ? '' : ' Внимание: вы публикуете в ветку ' + cfg.branch + ' — проверьте настройки Pages.');
      }
      RS.toast('Подключение работает.', 'success');
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

  /* ============================================================
     Данные: экспорт, импорт, сброс
     ============================================================ */

  function exportJson() {
    const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'reshop-data-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    RS.toast('Файл с данными скачан.', 'success');
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const ok = await askConfirm(
          'Заменить данные?',
          'Текущие предметы и текст «Обо мне» будут заменены содержимым файла. Локальная копия сохранится только после подтверждения.',
          'Импортировать'
        );
        if (!ok) return;
        RS.setData(RS.normalize(parsed));
        RS.toast('Данные импортированы в черновик.', 'success');
        renderTab(currentTab);
        updateSyncUI();
      } catch (error) {
        RS.toast('Не удалось прочитать JSON: ' + error.message, 'error', 6000);
      }
    };
    reader.readAsText(file);
  }

  async function pullFromGithub() {
    const cfg = store.cfg || {};
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      RS.toast('Сначала подключите GitHub в настройках.', 'error');
      return;
    }
    try {
      const file = await RS.gh.getFile(cfg.path || 'data.json');
      if (!file.text) {
        RS.toast('В репозитории пока нет ' + (cfg.path || 'data.json') + '.', 'warn');
        return;
      }
      const parsed = JSON.parse(file.text);
      const ok = await askConfirm(
        'Загрузить версию с GitHub?',
        'Локальные правки будут заменены опубликованной версией сайта.',
        'Загрузить'
      );
      if (!ok) return;
      RS.setData(RS.normalize(parsed));
      RS.toast('Опубликованная версия загружена в браузер.', 'success');
      renderTab(currentTab);
      updateSyncUI();
    } catch (error) {
      RS.toast('Не удалось скачать: ' + describeError(error), 'error', 7000);
    }
  }

  async function resetLocal() {
    const ok = await askConfirm(
      'Сбросить локальные правки?',
      'Все изменения в этом браузере будут удалены. Сайт вернётся к опубликованной версии из data.json.',
      'Сбросить'
    );
    if (!ok) return;
    RS.clearLocal();
    RS.toast('Локальные правки сброшены.', 'success');
    renderTab(currentTab);
    updateSyncUI();
  }

  /* ============================================================
     Confirm
     ============================================================ */

  function askConfirm(title, text, okLabel) {
    const dialog = $('#confirm');
    if (!dialog) return Promise.resolve(window.confirm(title + '\n' + text));
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    $('#confirm-ok').textContent = okLabel || 'Подтвердить';
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
