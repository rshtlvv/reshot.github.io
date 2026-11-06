/* ============================================================
   reshop — главная: интро, поиск, карточки
   ============================================================ */

(function () {
  'use strict';

  const RS = window.RS;
  const $ = (selector, root) => (root || document).querySelector(selector);

  function hexToRgba(hex, alpha) {
    const clean = String(hex || '').replace('#', '');
    const full = clean.length === 3 ? clean.split('').map((char) => char + char).join('') : clean.slice(0, 6);
    const value = parseInt(full, 16);
    if (Number.isNaN(value)) return 'rgba(136, 71, 255, ' + alpha + ')';
    return 'rgba(' + ((value >> 16) & 255) + ', ' + ((value >> 8) & 255) + ', ' + (value & 255) + ', ' + alpha + ')';
  }

  function pluralRu(n, forms) {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }

  RS.ready()
    .then((store) => {
      renderIntro(store);
      initCatalog(store);
      RS.initChrome();
      document.documentElement.classList.remove('is-booting');
    })
    .catch((error) => {
      console.error(error);
      RS.initChrome();
      document.documentElement.classList.remove('is-booting');
    });

  function renderIntro(store) {
    const settings = store.data.settings || {};
    const intro = settings.intro || {};
    const title = $('[data-intro-title]');
    if (title) title.innerHTML = RS.accentText(intro.title || 'Привет. Это *reshop*.');
    const text = $('[data-intro-text]');
    if (text) text.textContent = intro.text || '';
  }

  function initCatalog(store) {
    const data = store.data;
    const settings = data.settings || {};
    const items = data.items.slice();
    const grid = $('#items');
    const empty = $('#empty');
    const more = $('#more');
    const moreBtn = $('#more-btn');
    const search = $('#search');
    const searchWrap = $('#search-wrap');
    const searchClear = $('#search-clear');
    const heroSelect = $('#hero-select');
    const filtersBtn = $('#filters-btn');
    const filtersPanel = $('#filters');
    const onlyAvailable = $('#only-available');
    const sortSelect = $('#sort');
    const resetBtn = $('#reset');
    const emptyReset = $('#empty-reset');
    const found = $('#found');

    const state = {
      query: '',
      hero: 'all',
      sort: 'default',
      onlyAvailable: true,
      visible: 8,
    };

    const heroes = Array.from(new Set(items.map((item) => item.hero).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru'));
    if (heroSelect) {
      heroSelect.innerHTML =
        '<option value="all">все герои</option>' +
        heroes.map((hero) => '<option value="' + RS.esc(hero) + '">' + RS.esc(hero) + '</option>').join('');
    }

    function filtered() {
      const query = state.query.trim().toLowerCase();
      let list = items.filter((item) => {
        if (state.onlyAvailable && item.status === 'sold') return false;
        if (state.hero !== 'all' && item.hero !== state.hero) return false;
        if (!query) return true;
        return (RS.plainText(item.name) + ' ' + item.hero).toLowerCase().includes(query);
      });
      if (state.sort === 'price-asc') list.sort((a, b) => a.price - b.price);
      else if (state.sort === 'price-desc') list.sort((a, b) => b.price - a.price);
      else if (state.sort === 'name') list.sort((a, b) => RS.plainText(a.name).localeCompare(RS.plainText(b.name), 'ru'));
      return list;
    }

    function cardHtml(item, index) {
      const name = RS.plainText(item.name);
      const actions = item.actions || 'telegram';
      const sold = item.status === 'sold';
      const telegram = RS.telegramFor(item);
      const trade = item.trade || settings.steam || '';
      const stock = item.stock > 1 ? item.stock + ' шт.' : '';
      const rarity = RS.RARITIES[item.rarity] || RS.RARITIES.rare;
      const accent = RS.accentFor(item) || rarity.color;
      const accentSoft = hexToRgba(accent, 0.18);
      const accentGlow = hexToRgba(accent, 0.32);
      const currency = (settings.currency || '₽');
      const meta = [];
      if (item.hero) meta.push('<span>' + RS.esc(item.hero) + '</span>');
      if (stock) meta.push('<span>' + RS.esc(stock) + '</span>');
      const links = [];
      if (!sold && (actions === 'trade' || actions === 'both') && trade) {
        links.push('<a href="' + RS.esc(trade) + '" target="_blank" rel="noopener">трейд</a>');
      }
      if (!sold && (actions === 'telegram' || actions === 'both') && telegram) {
        links.push('<a href="' + RS.esc(telegram) + '" target="_blank" rel="noopener">телеграм</a>');
      }
      return (
        '<article class="card' + (sold ? ' is-sold' : '') + '" data-id="' + RS.esc(item.id) + '" style="--rarity:' + accent + ';--rarity-soft:' + accentSoft + ';--rarity-glow:' + accentGlow + '">' +
        '<div class="card__media">' +
        '<img src="' + RS.esc(item.image || RS.PLACEHOLDER) + '" alt="' + RS.esc(name) + '" loading="' + (index < 4 ? 'eager' : 'lazy') + '" width="600" height="400" data-guard>' +
        '<span class="card__rarity"><i></i>' + RS.esc(rarity.label) + '</span>' +
        (sold ? '<div class="card__sold"><span>продано</span></div>' : '') +
        '</div>' +
        '<div class="card__body">' +
        '<h3 class="card__title" style="color:var(--rarity)">' + RS.esc(name) + '</h3>' +
        '<div class="card__meta">' +
        meta.join('<span class="dot"></span>') +
        '</div>' +
        '<div class="card__bottom">' +
        '<span class="price">' + RS.money(item.price) + ' <i>' + RS.esc(currency) + '</i></span>' +
        '<div class="card__actions">' + (links.length ? links.join('') : '<span class="card__status">' + (sold ? 'продан' : '—') + '</span>') + '</div>' +
        '</div>' +
        '</div>' +
        '</article>'
      );
    }

    function render() {
      const list = filtered();
      const shown = list.slice(0, state.visible);
      if (grid) {
        grid.innerHTML = shown.map(cardHtml).join('');
        grid.setAttribute('aria-busy', 'false');
      }
      if (found) {
        found.innerHTML = list.length + ' ' + pluralRu(list.length, ['предмет', 'предмета', 'предметов']);
      }
      if (empty) empty.hidden = list.length !== 0;
      if (more) {
        const rest = list.length - shown.length;
        more.hidden = rest <= 0;
        if (rest > 0) moreBtn.textContent = 'показать ещё ' + rest;
      }
      RS.guardImages(grid);
    }

    function reset() {
      state.query = '';
      state.hero = 'all';
      state.sort = 'default';
      state.onlyAvailable = true;
      state.visible = 8;
      if (search) search.value = '';
      if (searchWrap) searchWrap.classList.remove('has-value');
      if (heroSelect) heroSelect.value = 'all';
      if (sortSelect) sortSelect.value = 'default';
      if (onlyAvailable) onlyAvailable.checked = true;
      render();
    }

    if (search) {
      search.addEventListener('input', () => {
        const value = search.value;
        if (searchWrap) searchWrap.classList.toggle('has-value', value.length > 0);
        state.query = value;
        state.visible = 8;
        clearTimeout(search._timer);
        search._timer = setTimeout(render, 90);
      });
      search.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') reset();
      });
    }
    if (searchClear) searchClear.addEventListener('click', reset);
    if (heroSelect) {
      heroSelect.addEventListener('change', () => {
        state.hero = heroSelect.value;
        state.visible = 8;
        render();
      });
    }
    if (onlyAvailable) {
      onlyAvailable.addEventListener('change', () => {
        state.onlyAvailable = onlyAvailable.checked;
        state.visible = 8;
        render();
      });
    }
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        state.sort = sortSelect.value;
        render();
      });
    }
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        state.visible += 8;
        render();
      });
    }
    if (resetBtn) resetBtn.addEventListener('click', reset);
    if (emptyReset) emptyReset.addEventListener('click', reset);

    if (filtersBtn && filtersPanel) {
      const close = () => {
        filtersPanel.hidden = true;
        filtersBtn.setAttribute('aria-expanded', 'false');
      };
      filtersBtn.addEventListener('click', () => {
        const open = filtersPanel.hidden;
        filtersPanel.hidden = !open;
        filtersBtn.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('click', (event) => {
        if (filtersPanel.hidden) return;
        if (event.target.closest('#filters') || event.target.closest('#filters-btn')) return;
        close();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') close();
      });
    }

    render();
  }
})();
