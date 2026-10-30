/* ============================================================
   reshop — витрина: каталог, фильтры, модалка, страница «Обо мне»
   ============================================================ */

(function () {
  'use strict';

  const RS = window.RS;
  const ICON_TG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.04 15.47l-.38 5.34c.54 0 .78-.23 1.06-.5l2.55-2.44 5.29 3.87c.97.53 1.66.25 1.92-.9L22.9 3.9c.31-1.42-.51-1.98-1.45-1.63L2.5 9.45c-1.39.54-1.37 1.31-.24 1.66l4.83 1.51L18.3 5.5c.52-.35 1-.16.61.19l-8.87 8.01z"/></svg>';
  const ICON_CHECK =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5"/></svg>';

  const page = document.body.dataset.page;

  function pluralRu(n, forms) {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }

  function hexToRgba(hex, alpha) {
    const clean = String(hex).replace('#', '');
    const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
    return 'rgba(' + ((num >> 16) & 255) + ',' + ((num >> 8) & 255) + ',' + (num & 255) + ',' + alpha + ')';
  }

  /* ============================================================
     Каталог
     ============================================================ */

  function initCatalog(store) {
    const data = store.data;
    const items = data.items.slice();
    const settings = data.settings || {};
    const els = {
      grid: document.getElementById('items'),
      count: document.getElementById('count'),
      found: document.getElementById('found'),
      search: document.getElementById('search'),
      searchWrap: document.getElementById('search-wrap'),
      clear: document.getElementById('search-clear'),
      chips: document.getElementById('chips'),
      hero: document.getElementById('hero-select'),
      sort: document.getElementById('sort'),
      empty: document.getElementById('empty'),
      more: document.getElementById('load-more'),
      moreBtn: document.getElementById('more-btn'),
      showcase: document.getElementById('showcase'),
      modal: document.getElementById('modal'),
    };

    const view = {
      query: '',
      rarity: 'all',
      hero: 'all',
      sort: 'default',
      visible: 12,
      focused: null,
    };

    const rarities = RS.RARITY_ORDER.filter((key) => items.some((item) => item.rarity === key));

    /* --- шапка каталога --- */
    const catTitle = document.getElementById('catalog-title');
    const catNote = document.getElementById('catalog-note');
    const catEyebrow = document.getElementById('catalog-eyebrow');
    if (catTitle) catTitle.textContent = settings.catalog.title || 'В наличии';
    if (catNote) catNote.textContent = settings.catalog.note || '';
    if (catEyebrow) catEyebrow.textContent = settings.catalog.eyebrow || 'Каталог';

    if (els.count) els.count.textContent = String(items.length);
    const countLabel = document.getElementById('count-label');
    if (countLabel) countLabel.textContent = pluralRu(items.length, ['предмет', 'предмета', 'предметов']);
    if (els.found) {
      els.found.innerHTML =
        'Найдено <b id="found-count">' + items.length + '</b> ' + pluralRu(items.length, ['предмет', 'предмета', 'предметов']);
    }
    const foundCount = () => document.getElementById('found-count');

    /* --- фильтр по редкости --- */
    if (els.chips) {
      els.chips.innerHTML =
        '<button class="chip chip--all is-active" type="button" data-rarity="all">Все предметы</button>' +
        rarities
          .map(
            (key) =>
              '<button class="chip" type="button" data-rarity="' +
              key +
              '" style="--dot:' +
              RS.RARITIES[key].color +
              '"><span class="chip__dot"></span>' +
              RS.RARITIES[key].label +
              '</button>'
          )
          .join('');
      els.chips.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-rarity]');
        if (!chip) return;
        view.rarity = chip.dataset.rarity;
        view.visible = 12;
        els.chips.querySelectorAll('.chip').forEach((el) => el.classList.toggle('is-active', el === chip));
        render();
      });
    }

    /* --- фильтр по герою --- */
    if (els.hero) {
      const heroes = Array.from(new Set(items.map((item) => item.hero).filter(Boolean))).sort((a, b) => a.localeCompare(b));
      els.hero.innerHTML =
        '<option value="all">Все герои</option>' +
        heroes.map((hero) => '<option value="' + RS.esc(hero) + '">' + RS.esc(hero) + '</option>').join('');
      els.hero.addEventListener('change', () => {
        view.hero = els.hero.value;
        view.visible = 12;
        render();
      });
    }

    /* --- поиск --- */
    let searchTimer = null;
    if (els.search) {
      els.search.addEventListener('input', () => {
        const value = els.search.value;
        els.searchWrap.classList.toggle('has-value', value.length > 0);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          view.query = value;
          view.visible = 12;
          render();
        }, 110);
      });
      els.search.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          els.search.value = '';
          els.searchWrap.classList.remove('has-value');
          view.query = '';
          render();
        }
      });
    }
    if (els.clear) {
      els.clear.addEventListener('click', () => {
        els.search.value = '';
        els.searchWrap.classList.remove('has-value');
        view.query = '';
        els.search.focus();
        render();
      });
    }

    /* --- сортировка --- */
    if (els.sort) {
      els.sort.addEventListener('change', () => {
        view.sort = els.sort.value;
        render();
      });
    }

    if (els.moreBtn) {
      els.moreBtn.addEventListener('click', () => {
        view.visible += 12;
        render();
      });
    }

    /* --- витрина в hero --- */
    renderShowcase();

    function renderShowcase() {
      if (!els.showcase) return;
      const alive = items.filter((item) => item.status !== 'sold');
      const hits = alive.filter((item) => item.hit);
      const main = hits[0] || alive[0] || items[0];
      if (!main) {
        els.showcase.hidden = true;
        const grid = document.querySelector('.hero__grid');
        if (grid) grid.classList.add('hero__grid--single');
        return;
      }
      const rest = items.filter((item) => item.id !== main.id);
      const back = rest.find((item) => item.status === 'in_stock') || rest[0];
      const side = rest.find((item) => item !== back && item.status === 'in_stock') || rest[1];
      const backEl = document.querySelector('[data-showcase-back]');
      const sideEl = document.querySelector('[data-showcase-side]');
      if (backEl) backEl.hidden = !back;
      if (sideEl) sideEl.hidden = !side;

      const mainTag = document.querySelector('[data-showcase-tag]');
      const mainImg = document.querySelector('[data-showcase-main] img');
      const mainMeta = document.querySelector('[data-showcase-main] .showcase__meta');
      if (mainImg) {
        mainImg.src = main.image || RS.PLACEHOLDER;
        mainImg.alt = RS.plainText(main.name) + (main.hero ? ' — ' + main.hero : '');
        mainImg.setAttribute('data-guard', '');
      }
      if (mainTag) {
        const rarity = RS.RARITIES[main.rarity] || RS.RARITIES.rare;
        const accent = RS.accentFor(main);
        mainTag.textContent = rarity.label;
        mainTag.style.color = accent;
        mainTag.style.borderColor = hexToRgba(accent, 0.35);
      }
      if (mainMeta) {
        mainMeta.innerHTML =
          '<span>' + RS.esc(main.hero || 'Dota 2') + ' · ' + RS.esc(RS.plainText(main.name)) + '</span>' +
          '<b>' + RS.money(main.price) + ' ' + RS.esc(settings.currency || '₽') + '</b>';
      }

      if (backEl && back) {
        backEl.querySelector('img').src = back.image || RS.PLACEHOLDER;
        backEl.querySelector('img').alt = RS.plainText(back.name);
        backEl.querySelector('img').setAttribute('data-guard', '');
        backEl.querySelector('.showcase__meta').innerHTML =
          '<span>' + RS.esc(back.hero || 'Dota 2') + '</span><b>' + RS.money(back.price) + ' ' + RS.esc(settings.currency || '₽') + '</b>';
      }
      if (sideEl && side) {
        sideEl.querySelector('img').src = side.image || RS.PLACEHOLDER;
        sideEl.querySelector('img').alt = RS.plainText(side.name);
        sideEl.querySelector('img').setAttribute('data-guard', '');
        sideEl.querySelector('.showcase__meta').innerHTML =
          '<span>' + RS.esc(side.hero || 'Dota 2') + '</span><b>' + RS.money(side.price) + ' ' + RS.esc(settings.currency || '₽') + '</b>';
      }
      const badge = document.querySelector('[data-showcase-badge]');
      if (badge) {
        const off = RS.discount(main);
        if (off > 0) {
          badge.textContent = '−' + off + '%';
          badge.hidden = false;
        } else {
          badge.hidden = true;
        }
      }
      RS.guardImages(els.showcase);
    }

    /* --- карточка --- */
    function cardHtml(item, index) {
      const rarity = RS.RARITIES[item.rarity] || RS.RARITIES.rare;
      const accent = RS.accentFor(item);
      const plainName = RS.plainText(item.name);
      const sold = item.status === 'sold';
      const reserved = item.status === 'reserved';
      const stockLabel = item.stock > 0 ? item.stock + ' шт.' : '0 шт.';
      const topRight = item.hit
        ? '<span class="tag tag--hit">Хит</span>'
        : reserved
        ? '<span class="tag tag--reserved">Резерв</span>'
        : '';
      return (
        '<article class="card item-enter' + (sold ? ' is-sold' : '') + '"' +
        ' style="--r:' + accent + ';--r-soft:' + hexToRgba(accent, 0.13) + ';--i:' + Math.min(index, 10) + '"' +
        ' data-id="' + RS.esc(item.id) + '">' +
        '<div class="card__media">' +
        '<img src="' + RS.esc(item.image || RS.PLACEHOLDER) + '" alt="' + RS.esc(plainName) + (item.hero ? ' — ' + RS.esc(item.hero) : '') + '" loading="' + (index < 4 ? 'eager' : 'lazy') + '" width="760" height="507" data-guard>' +
        '<div class="card__tags"><span class="tag tag--rarity">' + RS.esc(rarity.label) + '</span>' + topRight + '</div>' +
        (sold ? '<div class="card__sold"><span>Продано</span></div>' : '') +
        '</div>' +
        '<div class="card__body">' +
        '<h3 class="card__title" style="color:' + accent + '">' + RS.colorize(item.name) + '</h3>' +
        '<dl class="card__meta">' +
        '<div><dt>Герой</dt><dd>' + RS.esc(item.hero || '—') + '</dd></div>' +
        '<div><dt>Слот</dt><dd>' + RS.esc(item.slot || '—') + '</dd></div>' +
        '<div><dt>Редкость</dt><dd style="color:' + accent + '">' + RS.esc(rarity.label) + '</dd></div>' +
        '<div><dt>Количество</dt><dd class="' + (item.stock > 0 ? '' : 'is-empty-stock') + '">' + RS.esc(stockLabel) + '</dd></div>' +
        '</dl>' +
        '<div class="card__foot">' +
        RS.priceHtml(item) +
        '<a class="card__buy" href="' + RS.esc(RS.telegramFor(item)) + '" target="_blank" rel="noopener" aria-label="Написать в Telegram: ' + RS.esc(plainName) + '">' + ICON_TG + '</a>' +
        '</div></div>' +
        '<a class="card__open" href="?item=' + encodeURIComponent(item.id) + '" aria-label="Открыть ' + RS.esc(plainName) + '"></a>' +
        '</article>'
      );
    }

    /* --- рендер --- */
    function filtered() {
      const q = view.query.trim().toLowerCase();
      let list = items.filter((item) => {
        if (view.rarity !== 'all' && item.rarity !== view.rarity) return false;
        if (view.hero !== 'all' && item.hero !== view.hero) return false;
        if (!q) return true;
        return (RS.plainText(item.name) + ' ' + item.hero + ' ' + item.slot + ' ' + RS.plainText(item.description)).toLowerCase().includes(q);
      });
      if (view.sort === 'price-asc') list.sort((a, b) => a.price - b.price);
      else if (view.sort === 'price-desc') list.sort((a, b) => b.price - a.price);
      else if (view.sort === 'name') list.sort((a, b) => RS.plainText(a.name).localeCompare(RS.plainText(b.name), 'ru'));
      else {
        list = list
          .map((item, index) => ({ item, index }))
          .sort((a, b) => {
            const soldA = a.item.status === 'sold' ? 1 : 0;
            const soldB = b.item.status === 'sold' ? 1 : 0;
            const hitA = a.item.hit ? 0 : 1;
            const hitB = b.item.hit ? 0 : 1;
            return soldA - soldB || hitA - hitB || a.index - b.index;
          })
          .map((entry) => entry.item);
      }
      return list;
    }

    function render() {
      const list = filtered();
      const shown = list.slice(0, view.visible);
      if (els.grid) {
        els.grid.innerHTML = shown.map(cardHtml).join('');
        els.grid.setAttribute('aria-busy', 'false');
      }
      const fc = foundCount();
      if (fc) fc.textContent = String(list.length);
      const empty = els.empty;
      if (empty) {
        empty.hidden = list.length !== 0;
        if (!list.length) {
          const reset = empty.querySelector('[data-reset]');
          if (reset) reset.onclick = resetFilters;
        }
      }
      if (els.more) {
        const rest = list.length - shown.length;
        els.more.hidden = rest <= 0;
        if (rest > 0) {
          els.moreBtn.innerHTML =
            'Показать ещё ' + rest + ' ' + pluralRu(rest, ['предмет', 'предмета', 'предметов']) +
            '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v10M3.5 8.5 8 13l4.5-4.5"/></svg>';
        }
      }
      RS.guardImages(els.grid);
    }

    function resetFilters() {
      view.query = '';
      view.rarity = 'all';
      view.hero = 'all';
      view.visible = 12;
      if (els.search) {
        els.search.value = '';
        els.searchWrap.classList.remove('has-value');
      }
      if (els.hero) els.hero.value = 'all';
      if (els.chips) els.chips.querySelectorAll('.chip').forEach((chip) => chip.classList.toggle('is-active', chip.dataset.rarity === 'all'));
      render();
    }

    /* --- модалка --- */
    const modal = els.modal;
    let lastFocus = null;
    if (modal) RS.guardImages(modal);

    function openItem(item, options) {
      if (!modal) return;
      const opts = options || {};
      const rarity = RS.RARITIES[item.rarity] || RS.RARITIES.rare;
      const accent = RS.accentFor(item);
      const sold = item.status === 'sold';
      const reserved = item.status === 'reserved';
      const status = RS.STATUS[item.status] || RS.STATUS.in_stock;

      const mediaSrc = item.image || RS.PLACEHOLDER;
      modal.querySelector('[data-modal-img]').src = mediaSrc;
      modal.querySelector('[data-modal-img]').alt = RS.plainText(item.name) + (item.hero ? ' — ' + item.hero : '');
      const bg = modal.querySelector('[data-modal-bg]');
      if (bg) bg.style.backgroundImage = 'url("' + mediaSrc.replace(/"/g, '%22') + '")';
      const tag = modal.querySelector('[data-modal-tag]');
      tag.textContent = rarity.label;
      tag.style.color = accent;
      tag.style.borderColor = hexToRgba(accent, 0.4);
      modal.querySelector('[data-modal-hero]').textContent = [item.hero, item.slot].filter(Boolean).join(' · ') || 'Dota 2';
      const title = modal.querySelector('[data-modal-title]');
      title.innerHTML = RS.colorize(item.name);
      title.style.color = accent;
      const desc = modal.querySelector('[data-modal-desc]');
      desc.innerHTML = RS.colorize(item.description || 'Описание скоро появится.', true);
      modal.querySelector('[data-modal-price]').innerHTML = RS.priceHtml(item);
      const statusEl = modal.querySelector('[data-modal-status]');
      statusEl.textContent = status.label;
      statusEl.className = 'modal__status' + (sold ? ' is-sold' : reserved ? ' is-reserved' : '');
      modal.querySelector('[data-modal-meta]').innerHTML =
        '<div><dt>Герой</dt><dd>' + RS.esc(item.hero || '—') + '</dd></div>' +
        '<div><dt>Слот</dt><dd>' + RS.esc(item.slot || '—') + '</dd></div>' +
        '<div><dt>Редкость</dt><dd style="color:' + accent + '">' + RS.esc(rarity.label) + '</dd></div>' +
        '<div><dt>Количество</dt><dd>' + RS.esc(item.stock > 0 ? item.stock + ' шт.' : 'Нет в наличии') + '</dd></div>';
      const cta = modal.querySelector('[data-modal-cta]');
      cta.href = RS.telegramFor(item);
      cta.innerHTML = (sold ? 'Спросить о наличии ' : 'Написать в Telegram ') + ICON_TG;
      modal.querySelector('[data-modal-hint]').textContent = sold
        ? 'Этого предмета нет в наличии — можно заказать похожий.'
        : 'Передача через Steam-трейд или подарком · 5–15 минут';

      lastFocus = document.activeElement;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
      const closeBtn = modal.querySelector('[data-modal-close]');
      if (closeBtn) closeBtn.focus({ preventScroll: true });
      if (!opts.fromHistory) {
        try {
          history.replaceState(null, '', '?item=' + encodeURIComponent(item.id));
        } catch (error) {
          /* file:// может не поддерживать replaceState */
        }
      }
      RS.guardImages(modal);
    }

    function closeModal() {
      if (!modal || !modal.classList.contains('is-open')) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      try {
        history.replaceState(null, '', location.pathname);
      } catch (error) {
        /* noop */
      }
    }

    if (modal) {
      modal.addEventListener('click', (event) => {
        if (event.target.closest('[data-modal-close]')) closeModal();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeModal();
      });
    }

    if (els.grid) {
      els.grid.addEventListener('click', (event) => {
        const open = event.target.closest('.card__open');
        if (!open) return;
        event.preventDefault();
        const id = open.closest('[data-id]').dataset.id;
        const item = items.find((entry) => entry.id === id);
        if (item) openItem(item);
      });
    }

    render();

    // ссылка на товар из URL
    try {
      const wanted = new URLSearchParams(location.search).get('item');
      if (wanted) {
        const item = items.find((entry) => entry.id === wanted);
        if (item) setTimeout(() => openItem(item, { fromHistory: true }), 60);
      }
    } catch (error) {
      /* noop */
    }
  }

  /* ============================================================
     Обо мне
     ============================================================ */

  function initAbout(store) {
    const about = store.data.about || {};
    const settings = store.data.settings || {};
    const $ = (selector) => document.querySelector(selector);

    const titleEl = $('[data-about-title]');
    if (titleEl) titleEl.innerHTML = RS.accentText(about.title || 'Привет, я reshot');
    const eyebrow = $('[data-about-eyebrow]');
    if (eyebrow) eyebrow.textContent = about.eyebrow || 'Обо мне';
    const lead = $('[data-about-lead]');
    if (lead) lead.textContent = about.lead || '';
    const name = $('[data-about-name]');
    if (name) name.textContent = '@' + (about.name || settings.name || 'reshop');
    const role = $('[data-about-role]');
    if (role) role.textContent = about.role || '';
    const avatar = $('[data-about-avatar]');
    if (avatar) {
      if (about.avatar) {
        avatar.innerHTML = '<img src="' + RS.esc(about.avatar) + '" alt="' + RS.esc(about.name || '') + '" data-guard>';
      } else {
        avatar.textContent = String(about.name || settings.name || 'r').trim().charAt(0).toUpperCase();
      }
    }

    const textWrap = $('[data-about-text]');
    if (textWrap) {
      textWrap.innerHTML = (about.paragraphs || [])
        .filter(Boolean)
        .map((paragraph) => '<p>' + RS.esc(paragraph) + '</p>')
        .join('');
    }

    const statsWrap = $('[data-about-stats]');
    if (statsWrap) {
      statsWrap.innerHTML = (about.stats || [])
        .map(
          (stat) =>
            '<div class="stat" data-reveal><div class="stat__value" data-count="' + RS.esc(stat.value) + '">' + RS.esc(stat.value) + '</div><div class="stat__label">' + RS.esc(stat.label) + '</div></div>'
        )
        .join('');
    }

    const stepsWrap = $('[data-about-steps]');
    if (stepsWrap) {
      stepsWrap.innerHTML = (about.steps || [])
        .map(
          (step, index) =>
            '<article class="step" data-num="0' + (index + 1) + '" data-reveal style="--d:' + index * 0.08 + 's">' +
            '<div class="step__num">ШАГ 0' + (index + 1) + '</div>' +
            '<h3>' + RS.esc(step.title) + '</h3>' +
            '<p>' + RS.esc(step.text) + '</p>' +
            '</article>'
        )
        .join('');
    }

    const faqWrap = $('[data-about-faq]');
    if (faqWrap) {
      faqWrap.innerHTML = (about.faq || [])
        .map(
          (entry, index) =>
            '<div class="faq__item">' +
            '<button class="faq__q" type="button" aria-expanded="false" aria-controls="faq-a-' + index + '">' +
            '<span>' + RS.esc(entry.q) + '</span><span class="faq__icon" aria-hidden="true"></span></button>' +
            '<div class="faq__a" id="faq-a-' + index + '"><div><p>' + RS.esc(entry.a) + '</p></div></div>' +
            '</div>'
        )
        .join('');
      faqWrap.addEventListener('click', (event) => {
        const button = event.target.closest('.faq__q');
        if (!button) return;
        const item = button.closest('.faq__item');
        const isOpen = item.classList.contains('is-open');
        faqWrap.querySelectorAll('.faq__item').forEach((entry) => {
          entry.classList.remove('is-open');
          entry.querySelector('.faq__q').setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          item.classList.add('is-open');
          button.setAttribute('aria-expanded', 'true');
        }
      });
    }

    const ctaTitle = $('[data-cta-title]');
    if (ctaTitle) ctaTitle.textContent = about.ctaTitle || 'Готов к сделке?';
    const ctaText = $('[data-cta-text]');
    if (ctaText) ctaText.textContent = about.ctaText || '';
    const ctaArt = $('[data-cta-art]');
    if (ctaArt) {
      const item = store.data.items.find((entry) => entry.image) || store.data.items[0];
      if (item && item.image) {
        ctaArt.src = item.image;
        ctaArt.alt = '';
      } else {
        ctaArt.remove();
      }
    }

    RS.guardImages(document);

    // появление цифр
    const counters = document.querySelectorAll('[data-count]');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            animateCount(entry.target);
            io.unobserve(entry.target);
          });
        },
        { threshold: 0.5 }
      );
      counters.forEach((el) => io.observe(el));
    } else {
      counters.forEach(animateCount);
    }
  }

  function animateCount(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const raw = el.dataset.count || el.textContent;
    const match = raw.match(/^([\d\s]+(?:[.,]\d+)?)(.*)$/);
    if (!match) return;
    const decimals = /[.,]\d+$/.test(match[1]) ? 1 : 0;
    const suffix = match[2] || '';
    // анимируем только числа с символами (+, %, ₽) — «6 лет» оставляем как есть
    if (/[a-zа-яё]/i.test(suffix)) return;
    const target = Number(match[1].replace(/\s/g, '').replace(',', '.'));
    if (!isFinite(target)) return;
    const duration = 1300;
    const start = performance.now();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    function frame(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = target * eased;
      const text = decimals
        ? value.toFixed(1).replace('.', ',')
        : Math.round(value).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
      el.textContent = text + suffix;
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ============================================================
     Старт
     ============================================================ */

  RS.ready()
    .then((store) => {
      if (page === 'home') {
        initHome(store);
        initCatalog(store);
      }
      if (page === 'about') initAbout(store);
      RS.initChrome();
      document.documentElement.classList.remove('is-booting');
    })
    .catch((error) => {
      console.error(error);
      RS.initChrome();
      document.documentElement.classList.remove('is-booting');
    });

  function initHome(store) {
    const settings = store.data.settings || {};
    const hero = settings.hero || {};
    const $ = (selector) => document.querySelector(selector);
    const title = $('[data-hero-title]');
    if (title) title.innerHTML = RS.accentText(hero.title || '');
    const eyebrow = $('[data-hero-eyebrow]');
    if (eyebrow) eyebrow.textContent = hero.eyebrow || '';
    const text = $('[data-hero-text]');
    if (text) text.textContent = hero.text || '';
    const note = $('[data-hero-note]');
    if (note) note.innerHTML = hero.note ? ICON_CHECK + '<span>' + RS.esc(hero.note) + '</span>' : '';
    const facts = $('[data-hero-facts]');
    if (facts) {
      const list = hero.facts || [];
      facts.innerHTML = list
        .map(
          (fact) =>
            '<div class="fact"><span class="fact__value">' + RS.esc(fact.value) + '</span><span class="fact__label">' + RS.esc(fact.label) + '</span></div>'
        )
        .join('');
      facts.hidden = list.length === 0;
    }
    const footerNote = document.querySelector('[data-footer-note]');
    if (footerNote && settings.footerNote) footerNote.textContent = settings.footerNote;
  }
})();
