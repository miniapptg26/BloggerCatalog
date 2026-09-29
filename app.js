'use strict';

/* ===== Обозначения платформ ===== */
const PLATFORM_EMOJI = {
  youtube: '▶️',
  tiktok: '🎵',
  telegram: '✈️',
  instagram: '📸',
  twitch: '🎮'
};

const PLATFORM_LABELS = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  instagram: 'Instagram',
  twitch: 'Twitch'
};

const PLATFORM_COLORS = {
  youtube: '#ff0033',
  tiktok: '#00f2ea',
  telegram: '#2aa0e6',
  instagram: '#e1306c',
  twitch: '#9147ff'
};

const DEFAULT_EMOJI = '🎭';

/* ===== Медиа: изображение или эмодзи-заглушка ===== */
function buildEmojiEl(item, sizeClass) {
  const span = document.createElement('span');
  span.className = 'media-emoji' + (sizeClass ? ' ' + sizeClass : '');
  span.textContent = item.emoji || PLATFORM_EMOJI[item.platform] || DEFAULT_EMOJI;
  return span;
}

/*
 * buildMediaEl(item, sizeClass):
 * - image — непустая строка: создаём <img> с lazy-загрузкой, без referrer,
 *   width/height = 80 (карточка) или 120 (модалка), alt = item.name.
 *   До загрузки — класс .img-loading (opacity 0), после 'load' — .img-loaded
 *   (opacity 1, переход 0.2s). При ошибке заменяет себя эмодзи-заглушкой
 *   с dataset.fallback='1' (повторно не грузим).
 * - 'http://' (не https) — сразу эмодзи-фолбэк, небезопасный контент не грузим.
 * - иначе — span.media-emoji.
 */
function buildMediaEl(item, sizeClass) {
  const rawImage = typeof item.image === 'string' ? item.image.trim() : '';
  const isModal = sizeClass && String(sizeClass).indexOf('modal') !== -1;
  const dim = isModal ? 120 : 80;

  // Небезопасный http:// — не грузим, сразу эмодзи-фолбэк
  if (rawImage.indexOf('http://') === 0) {
    return emojiFallback(item, sizeClass);
  }

  if (rawImage !== '') {
    const img = document.createElement('img');
    img.className = (sizeClass || '') + ' img-loading';
    img.src = rawImage;
    img.alt = item.name != null ? String(item.name) : '';
    img.width = dim;
    img.height = dim;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('load', function () {
      this.classList.remove('img-loading');
      this.classList.add('img-loaded');
    }, false);
    img.addEventListener('error', function () {
      img.replaceWith(emojiFallback(item, sizeClass));
    }, false);
    return img;
  }
  return buildEmojiEl(item, sizeClass);
}

/* Эмодзи-фолбэк с пометкой, что картинка не загружалась */
function emojiFallback(item, sizeClass) {
  const el = buildEmojiEl(item, sizeClass);
  el.dataset.fallback = '1';
  return el;
}

/* ===== Ключи localStorage (только личные настройки пользователя) ===== */
const FAVS_KEY = 'blogger_favs';    // JSON-массив id избранных блогеров
const THEME_KEY = 'blogger_theme';  // 'dark' | 'light'

/* ===== Состояние ===== */
const state = {
  bloggers: [],        // все блогеры из bloggers.json
  search: '',          // текущий запрос
  platform: 'Все',     // активная платформа-чип
  niche: 'Все ниши',   // активная ниша (второй ряд чипов)
  favOnly: false,      // чип «Избранное»
  verifiedOnly: false, // toggle-чип «Verified»
  sort: 'subs_desc',   // subs_desc | subs_asc | name | name_desc | id
  view: 'grid',        // 'grid' | 'rows' (только сессия, без localStorage)
  favs: new Set(loadFavs())  // id избранных блогеров
};

/* ===== Telegram WebApp ===== */
const tg = window.Telegram ? window.Telegram.WebApp : null;

/* ===== DOM ===== */
const catalogEl = document.getElementById('catalog');
const emptyStateEl = document.getElementById('emptyState');
const chipsEl = document.getElementById('chips');
const chips2El = document.getElementById('chips2');
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const sortSelect = document.getElementById('sortSelect');
const resetBtn = document.getElementById('resetBtn');
const countLabel = document.getElementById('countLabel');
const toastEl = document.getElementById('toast');
const luckyBtn = document.getElementById('luckyBtn');
const themeToggle = document.getElementById('themeToggle');
const statsBtn = document.getElementById('statsBtn');
const exportBtn = document.getElementById('exportBtn');
const viewToggle = document.getElementById('viewToggle');
const toTopBtn = document.getElementById('toTop');
const loaderEl = document.getElementById('loader');
const detailModal = document.getElementById('detailModal');
const detailCloseBtn = document.getElementById('detailCloseBtn');
const detailBody = document.getElementById('detailBody');
const statsModal = document.getElementById('statsModal');
const statsCloseBtn = document.getElementById('statsCloseBtn');
const statsBody = document.getElementById('statsBody');

let detailItem = null; // текущий блогер в модалке деталей

/* ===== Избранное ===== */
function loadFavs() {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite) : [];
  } catch (e) {
    return [];
  }
}

function saveFavs() {
  try {
    localStorage.setItem(FAVS_KEY, JSON.stringify([...state.favs]));
  } catch (e) {}
}

function toggleFav(id) {
  const wasFav = state.favs.has(id);
  if (wasFav) state.favs.delete(id);
  else state.favs.add(id);
  saveFavs();
  renderChips();
  renderCatalog();
  // Анимация «сердечко наполнилось» (0.3s)
  if (!wasFav) {
    const card = catalogEl.querySelector('.card[data-id="' + id + '"]');
    if (card) {
      const btn = card.querySelector('.fav-btn');
      if (btn) {
        btn.classList.add('pop');
        setTimeout(function () { btn.classList.remove('pop'); }, 320);
      }
    }
  }
}

/* ===== Инициализация Telegram ===== */
function initTelegram() {
  if (!tg) return;

  tg.ready();
  if (typeof tg.expand === 'function') tg.expand();

  // Применяем тему Telegram через CSS-переменные (фоллбэки уже в style.css)
  const tp = tg.themeParams || {};
  const themeMap = {
    '--tg-theme-bg-color': tp.bg_color,
    '--tg-theme-text-color': tp.text_color,
    '--tg-theme-hint-color': tp.hint_color,
    '--tg-theme-link-color': tp.link_color,
    '--tg-theme-button-color': tp.button_color,
    '--tg-theme-button-text-color': tp.button_text_color,
    '--tg-theme-secondary-bg-color': tp.secondary_bg_color
  };
  Object.entries(themeMap).forEach(([cssVar, value]) => {
    if (value) document.documentElement.style.setProperty(cssVar, value);
  });

  // BackButton: модалки по очереди, иначе закрытие приложения
  if (tg.BackButton && typeof tg.close === 'function') {
    tg.BackButton.onClick(() => {
      if (detailModal.classList.contains('open')) {
        closeDetail();
        return;
      }
      if (statsModal.classList.contains('open')) {
        closeStats();
        return;
      }
      tg.close();
    });
  }
}

/* ===== Тема ===== */
function applyTheme() {
  let saved = 'dark';
  try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
  document.documentElement.classList.toggle('light', saved === 'light');
  updateThemeIcon();
}

function toggleTheme() {
  const light = document.documentElement.classList.toggle('light');
  try { localStorage.setItem(THEME_KEY, light ? 'light' : 'dark'); } catch (e) {}
  updateThemeIcon();
}

function updateThemeIcon() {
  if (!themeToggle) return;
  themeToggle.textContent = document.documentElement.classList.contains('light') ? '☀️' : '🌙';
}

/* ===== Прелоадер ===== */
function showLoader(visible) {
  if (!loaderEl) return;
  loaderEl.classList.toggle('hide', !visible);
  loaderEl.setAttribute('aria-hidden', String(!visible));
}

/* ===== Нормализация данных (устойчивость к ручной правке JSON) ===== */
function normalizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  raw.forEach((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return;
    const numId = Number(item.id);
    const id = (Number.isFinite(numId) && !Number.isNaN(numId)) ? numId : index + 1;
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    out.push({
      id: id,
      displayName: (typeof item.displayName === 'string' && item.displayName.trim() !== '') ? item.displayName : 'Без названия',
      name: typeof item.name === 'string' ? item.name : '',
      niche: (typeof item.niche === 'string' && item.niche.trim() !== '') ? item.niche : 'Другое',
      platform: (typeof item.platform === 'string' && item.platform.trim() !== '') ? item.platform : 'telegram',
      subscribers: num(item.subscribers),
      verified: item.verified === true,
      description: typeof item.description === 'string' ? item.description : '',
      url: typeof item.url === 'string' ? item.url : '',
      image: typeof item.image === 'string' ? item.image : '',
      emoji: typeof item.emoji === 'string' ? item.emoji : ''
    });
  });
  return out;
}

/*
 * parseJsonFile(text, filename):
 * возвращает { ok: true, data } или { ok: false, message } —
 * при невалидном JSON интерфейс не падает, а показывает понятное сообщение.
 */
function parseJsonFile(text, filename) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    const msg = err && err.message ? err.message : 'неизвестная ошибка';
    return { ok: false, message: 'Ошибка в файле ' + filename + ': ' + msg + '. Проверьте запятые, кавычки и скобки.' };
  }
  if (!Array.isArray(data)) {
    return { ok: false, message: 'Ошибка в файле ' + filename + ': ожидался массив записей. Проверьте запятые, кавычки и скобки.' };
  }
  return { ok: true, data: normalizeItems(data) };
}

/* ===== Загрузка блогеров ===== */
async function loadBloggers() {
  showLoader(true);
  try {
    const response = await fetch('bloggers.json');
    if (!response.ok) {
      throw new Error('Ошибка HTTP ' + response.status);
    }
    const parsed = parseJsonFile(await response.text(), 'bloggers.json');
    if (!parsed.ok) {
      showLoader(false);
      showLoadError(parsed.message, true);
      return;
    }
    state.bloggers = parsed.data;
  } catch (err) {
    showLoader(false);
    showLoadError(err && err.message ? err.message : 'неизвестная ошибка', false);
    return;
  }
  showLoader(false);
  renderChips();
  renderChips2();
  renderAll();
}

function showLoadError(message, isParseError) {
  catalogEl.replaceChildren();
  emptyStateEl.hidden = true;

  const box = document.createElement('div');
  box.className = 'error-box';

  const emoji = document.createElement('div');
  emoji.className = 'error-emoji';
  emoji.textContent = '⚠️';
  box.appendChild(emoji);

  if (isParseError) {
    const p = document.createElement('p');
    p.textContent = message;
    box.appendChild(p);
  } else {
    const title = document.createElement('p');
    title.textContent = 'Не удалось загрузить каталог';

    const sub = document.createElement('p');
    sub.className = 'error-sub';
    sub.textContent = message + '. Проверьте, что файл bloggers.json лежит рядом с index.html.';
    box.append(title, sub);
  }

  catalogEl.appendChild(box);
}

/* ===== Чипы платформ (+ счётчики на весь каталог) ===== */
function renderChips() {
  chipsEl.replaceChildren();

  // Чип «❤ Избранное» — в начале списка, счётчик = число избранных
  const favChip = document.createElement('button');
  favChip.type = 'button';
  favChip.className = 'chip fav-chip' + (state.favOnly ? ' active' : '');
  favChip.dataset.fav = '';
  favChip.setAttribute('aria-pressed', String(state.favOnly));
  const favLabel = document.createElement('span');
  favLabel.textContent = '❤ Избранное';
  favChip.appendChild(favLabel);
  const favBadge = document.createElement('span');
  favBadge.className = 'chip-badge';
  favBadge.textContent = state.favs.size;
  favChip.appendChild(favBadge);
  chipsEl.appendChild(favChip);

  const platforms = ['Все', ...new Set(
    state.bloggers.map((b) => b.platform).filter(Boolean)
  )];

  platforms.forEach((platform) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + ((platform === state.platform && !state.favOnly) ? ' active' : '');
    chip.dataset.platform = platform;
    const labelSpan = document.createElement('span');
    labelSpan.textContent = platform === 'Все'
      ? platform
      : (PLATFORM_EMOJI[platform] || '') + ' ' + (PLATFORM_LABELS[platform] || platform);
    chip.appendChild(labelSpan);
    // Счётчик: сколько блогеров на этой платформе во ВСЁМ каталоге
    if (platform !== 'Все') {
      const count = state.bloggers.filter((b) => b.platform === platform).length;
      const counter = document.createElement('span');
      counter.className = 'chip-count';
      counter.textContent = count;
      chip.appendChild(counter);
    }
    chipsEl.appendChild(chip);
  });

  // Тоггл-чип «✓ Verified»
  const verifiedChip = document.createElement('button');
  verifiedChip.type = 'button';
  verifiedChip.className = 'chip toggle-chip' + (state.verifiedOnly ? ' active' : '');
  verifiedChip.dataset.toggle = 'verified';
  verifiedChip.setAttribute('aria-pressed', String(state.verifiedOnly));
  verifiedChip.textContent = state.verifiedOnly ? '✓ Verified' : 'Verified';
  chipsEl.appendChild(verifiedChip);
}

/* ===== Второй ряд чипов: ниши ===== */
function renderChips2() {
  if (!chips2El) return;
  chips2El.replaceChildren();

  const niches = [...new Set(
    state.bloggers.map((b) => b.niche).filter(Boolean)
  )];

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'chip' + (state.niche === 'Все ниши' ? ' active' : '');
  allChip.dataset.niche = 'Все ниши';
  allChip.textContent = 'Все ниши';
  chips2El.appendChild(allChip);

  niches.forEach((niche) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (state.niche === niche ? ' active' : '');
    chip.dataset.niche = niche;
    chip.textContent = niche;
    chips2El.appendChild(chip);
  });
}

/* ===== Фильтры и сортировка ===== */
function getFiltered() {
  const query = state.search.trim().toLowerCase();

  const filtered = state.bloggers.filter((blogger) => {
    const byPlatform = state.platform === 'Все' || blogger.platform === state.platform;
    const byNiche = state.niche === 'Все ниши' || blogger.niche === state.niche;
    const byFav = !state.favOnly || state.favs.has(blogger.id);
    const byVerified = !state.verifiedOnly || blogger.verified === true;
    const label = PLATFORM_LABELS[blogger.platform] || '';
    const haystack = String(
      (blogger.displayName || '') + ' ' +
      (blogger.name || '') + ' ' +
      (blogger.niche || '') + ' ' +
      (blogger.platform || '') + ' ' + label
    ).toLowerCase();
    const bySearch = !query || haystack.includes(query);
    return byPlatform && byNiche && byFav && byVerified && bySearch;
  });

  const sort = state.sort;
  filtered.sort((a, b) => {
    const nameA = String(a.displayName || a.name || '');
    const nameB = String(b.displayName || b.name || '');

    let cmp = 0;
    if (sort === 'name') {
      cmp = nameA.localeCompare(nameB, 'ru');
    } else if (sort === 'name_desc') {
      cmp = nameB.localeCompare(nameA, 'ru');
    } else if (sort === 'id') {
      cmp = Number(b.id) - Number(a.id); // «Новые»
    } else if (sort === 'subs_asc') {
      cmp = Number(a.subscribers || 0) - Number(b.subscribers || 0);
    } else {
      cmp = Number(b.subscribers || 0) - Number(a.subscribers || 0); // subs_desc
    }
    if (cmp !== 0) return cmp;
    return Number(a.id) - Number(b.id);
  });

  return filtered;
}

/* ===== Форматирование подписчиков ===== */
function formatSubs(value) {
  const n = Number(value || 0);
  if (n >= 1000000) {
    const m = n / 1000000;
    const rounded = m >= 10 ? Math.round(m) : (Math.round(m * 10) / 10);
    return (String(rounded).replace('.', ',') ) + ' млн';
  }
  if (n >= 1000) {
    const k = n / 1000;
    const rounded = k >= 100 ? Math.round(k) : (Math.round(k * 10) / 10);
    return String(rounded).replace('.', ',') + ' тыс.';
  }
  return String(n);
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/* ===== Сброс фильтров ===== */
function hasActiveFilters() {
  return Boolean(state.search.trim()) ||
    state.platform !== 'Все' ||
    state.favOnly ||
    state.verifiedOnly ||
    state.sort !== 'subs_desc' ||
    state.niche !== 'Все ниши';
}

function updateResetBtn() {
  if (!resetBtn) return;
  resetBtn.classList.toggle('hidden', !hasActiveFilters());
}

function resetFilters() {
  state.search = '';
  if (searchInput) searchInput.value = '';
  state.platform = 'Все';
  state.niche = 'Все ниши';
  state.favOnly = false;
  state.verifiedOnly = false;
  state.sort = 'subs_desc';
  if (sortSelect) sortSelect.value = 'subs_desc';
  updateSearchClear();
  updateResetBtn();
  renderChips();
  renderChips2();
  renderAll();
}

/* ===== Вид: сетка / строки (только сессия) ===== */
function toggleView() {
  state.view = (state.view === 'rows') ? 'grid' : 'rows';
  applyView();
}

function applyView() {
  catalogEl.classList.toggle('rows', state.view === 'rows');
  if (viewToggle) viewToggle.textContent = (state.view === 'rows') ? '☰' : '▦';
}

/* ===== Поиск: очистка «✕» + дебаунс ===== */
function updateSearchClear(value) {
  if (!searchClear) return;
  const hasText = value !== undefined ? String(value).length > 0 : Boolean(searchInput && searchInput.value.length > 0);
  searchClear.classList.toggle('hidden', !hasText);
}

let searchTimer = null;

/* ===== Рендер ===== */
function renderAll() {
  renderCount();
  renderCatalog();
}

function renderCount() {
  if (!countLabel) return;
  const n = getFiltered().length;
  if (state.favOnly) {
    countLabel.textContent = n + ' в избранном';
  } else {
    countLabel.textContent = n + ' ' + plural(n, 'блогер', 'блогера', 'блогеров');
  }
}

function renderCatalog() {
  renderCount();
  const query = state.search.trim().toLowerCase();

  const filtered = getFiltered();

  catalogEl.replaceChildren();

  if (filtered.length === 0) {
    emptyStateEl.hidden = false;
    updateResetBtn();
    return;
  }
  emptyStateEl.hidden = true;

  filtered.forEach((blogger, i) => {
    const card = createCard(blogger);
    // Стаггер-анимация: порядковый номер в --i
    card.style.setProperty('--i', String(i));
    // Подсветка поиска: имя, ник, ниша — безопасно (без innerHTML)
    if (query) {
      const nameEl = card.querySelector('.card-name');
      const nickEl = card.querySelector('.card-nick');
      const nicheEl = card.querySelector('.card-niche');
      if (nameEl) markText(nameEl, query);
      if (nickEl && nickEl.textContent.trim()) markText(nickEl, query);
      if (nicheEl && nicheEl.textContent.trim()) markText(nicheEl, query);
    }
    catalogEl.appendChild(card);
  });
  updateResetBtn();
}

/* ===== Подсветка поиска (безопасно: обход текстовых узлов, без innerHTML) ===== */
function markText(element, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return;

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((node) => {
    const text = node.nodeValue || '';
    if (!text.toLowerCase().includes(q)) return;

    const fragment = document.createDocumentFragment();
    let rest = text;
    let index = rest.toLowerCase().indexOf(q);

    while (index !== -1) {
      if (index > 0) fragment.appendChild(document.createTextNode(rest.slice(0, index)));
      const mark = document.createElement('mark');
      mark.textContent = rest.slice(index, index + q.length);
      fragment.appendChild(mark);
      rest = rest.slice(index + q.length);
      index = rest.toLowerCase().indexOf(q);
    }
    if (rest) fragment.appendChild(document.createTextNode(rest));
    node.parentNode.replaceChild(fragment, node);
  });
}

/* ===== Карточка блогера ===== */
function createCard(blogger) {
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.id = blogger.id;

  // Сердечко избранного (top-right, поверх подложки)
  const favBtn = document.createElement('button');
  const isFav = state.favs.has(blogger.id);
  favBtn.type = 'button';
  favBtn.className = 'fav-btn' + (isFav ? ' active' : '');
  favBtn.dataset.id = blogger.id;
  favBtn.setAttribute('aria-label', isFav ? 'Убрать из избранного' : 'Добавить в избранное');
  favBtn.setAttribute('aria-pressed', String(isFav));
  favBtn.textContent = isFav ? '❤' : '🤍';
  card.appendChild(favBtn);

  // --- Аватар 78px (квадратный; фото или эмодзи-заглушка) ---
  const avatar = document.createElement('div');
  avatar.className = 'card-avatar';
  avatar.appendChild(buildMediaEl(blogger, 'card-avatar-img'));

  // --- Бейдж платформы ---
  const badge = document.createElement('span');
  badge.className = 'platform-badge';
  badge.textContent = PLATFORM_LABELS[blogger.platform] || (blogger.platform || '');
  const color = PLATFORM_COLORS[blogger.platform];
  if (color) {
    badge.style.setProperty('color', color);
    badge.style.setProperty('border-color', color);
  }
  avatar.appendChild(badge);

  // --- Инфо: имя, ник, ниша, подписчики, описание ---
  const info = document.createElement('div');
  info.className = 'card-info';

  const nameRow = document.createElement('div');
  nameRow.className = 'card-name-row';

  const name = document.createElement('h3');
  name.className = 'card-name';
  name.textContent = blogger.displayName || blogger.name || 'Без имени';
  nameRow.appendChild(name);

  if (blogger.verified) {
    const verified = document.createElement('span');
    verified.className = 'verified';
    verified.textContent = '✓';
    verified.setAttribute('aria-label', 'Верифицированный профиль');
    nameRow.appendChild(verified);
  }
  info.appendChild(nameRow);

  const nick = document.createElement('p');
  nick.className = 'card-nick';
  nick.textContent = blogger.name || '';
  info.appendChild(nick);

  const niche = document.createElement('p');
  niche.className = 'card-niche';
  niche.textContent = blogger.niche || '';
  info.appendChild(niche);

  const stats = document.createElement('div');
  stats.className = 'card-stats';
  stats.textContent = '👥 ' + formatSubs(blogger.subscribers) + ' подписчиков';
  info.appendChild(stats);

  const desc = document.createElement('p');
  desc.className = 'card-desc';
  desc.textContent = blogger.description || '';
  info.appendChild(desc);

  // --- Кнопки: «Открыть» и копирование ника ---
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'open-btn';
  openBtn.textContent = 'Открыть';
  openBtn.dataset.url = blogger.url || '';
  actions.appendChild(openBtn);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = '📋';
  copyBtn.title = 'Скопировать ник';
  copyBtn.setAttribute('aria-label', 'Скопировать ник');
  copyBtn.dataset.nick = blogger.name || '';
  actions.appendChild(copyBtn);

  card.append(avatar, info, actions);
  return card;
}

/* ===== Открытие профиля ===== */
function openProfile(url) {
  if (!url) return;
  if (url.indexOf('t.me') !== -1) {
    if (tg && typeof tg.openTelegramLink === 'function') {
      tg.openTelegramLink(url);
      return;
    }
  }
  window.open(url, '_blank', 'noopener');
}

/* ===== Копирование ===== */
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // переходим к fallback ниже
    }
  }
  // Fallback для сред без Clipboard API
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (err) {
    ok = false;
  }
  textarea.remove();
  return ok;
}

function copyNick(bloggerName) {
  const clean = String(bloggerName || '').replace(/^@+/, '');
  const nick = '@' + clean;
  copyText(nick).then((ok) => {
    showToast(ok ? 'Ник скопирован: ' + nick : 'Не удалось скопировать ник');
  });
}

/* ===== Тост ===== */
let toastTimer = null;

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

/* ===== Модалка деталей ===== */
function openDetail(blogger) {
  detailItem = blogger;
  renderDetail(blogger);
  detailModal.classList.add('open');
  detailModal.setAttribute('aria-hidden', 'false');
  updateBackButton();
}

function closeDetail() {
  detailModal.classList.remove('open');
  detailModal.setAttribute('aria-hidden', 'true');
  detailItem = null;
  updateBackButton();
}

function updateBackButton() {
  if (!tg || !tg.BackButton) return;
  const anyOpen = detailModal.classList.contains('open') ||
    statsModal.classList.contains('open');
  if (anyOpen) {
    tg.BackButton.show();
  } else {
    tg.BackButton.hide();
  }
}

function renderDetail(blogger) {
  detailBody.replaceChildren();

  // Медиа-шапка: фото или эмодзи-заглушка (buildMediaEl, 120px)
  const media = document.createElement('div');
  media.className = 'detail-media blogger-media';
  media.appendChild(buildMediaEl(blogger, 'modal-media'));
  detailBody.appendChild(media);

  // Имя + крупная verified-галочка
  const nameRow = document.createElement('div');
  nameRow.className = 'detail-name-row';

  const name = document.createElement('h2');
  name.className = 'detail-name';
  name.textContent = blogger.displayName || blogger.name || 'Без имени';
  nameRow.appendChild(name);

  if (blogger.verified) {
    const verified = document.createElement('span');
    verified.className = 'detail-verified';
    verified.textContent = '✓';
    verified.setAttribute('aria-label', 'Верифицированный профиль');
    nameRow.appendChild(verified);
  }
  detailBody.appendChild(nameRow);

  // Бейдж платформы с цветом
  const platformBadge = document.createElement('span');
  platformBadge.className = 'detail-platform';
  platformBadge.textContent = PLATFORM_LABELS[blogger.platform] || (blogger.platform || '');
  const color = PLATFORM_COLORS[blogger.platform];
  if (color) {
    platformBadge.style.color = color;
    platformBadge.style.borderColor = color;
    platformBadge.style.background = color + '1f';
    platformBadge.style.boxShadow = '0 0 14px ' + color + '55';
  }
  detailBody.appendChild(platformBadge);

  // Ник
  const nick = document.createElement('p');
  nick.className = 'detail-nick';
  nick.textContent = blogger.name || '';
  detailBody.appendChild(nick);

  // Кликабельная ниша: «📁 <ниша>»
  if (blogger.niche) {
    const nicheBtn = document.createElement('button');
    nicheBtn.type = 'button';
    nicheBtn.className = 'detail-niche-btn';
    nicheBtn.textContent = '📁 ' + blogger.niche;
    detailBody.appendChild(nicheBtn);
  }

  // Подписчики
  const stats = document.createElement('p');
  stats.className = 'detail-stats';
  stats.textContent = '👥 ' + formatSubs(blogger.subscribers) + ' подписчиков';
  detailBody.appendChild(stats);

  // Описание — полное
  if (blogger.description) {
    const desc = document.createElement('p');
    desc.className = 'detail-desc';
    desc.textContent = blogger.description;
    detailBody.appendChild(desc);
  }

  // Кнопки
  const actions = document.createElement('div');
  actions.className = 'detail-actions';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'detail-open-btn';
  openBtn.textContent = 'Открыть';
  actions.appendChild(openBtn);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'detail-copy-btn';
  copyBtn.textContent = 'Скопировать ник';
  actions.appendChild(copyBtn);

  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.className = 'detail-share-btn';
  shareBtn.textContent = 'Поделиться';
  actions.appendChild(shareBtn);

  detailBody.appendChild(actions);
}

async function shareBlogger() {
  const blogger = detailItem;
  if (!blogger) return;
  const text = (blogger.displayName || blogger.name || '') +
    ' — ' + (blogger.niche || '') + ', ' + formatSubs(blogger.subscribers) +
    ' • Каталог блогеров';
  const ok = await copyText(text);
  showToast(ok ? 'Скопировано' : 'Не удалось скопировать');
}

/* ===== Статистика ===== */
function openStats() {
  renderStats();
  statsModal.classList.add('open');
  statsModal.setAttribute('aria-hidden', 'false');
  updateBackButton();
}

function closeStats() {
  statsModal.classList.remove('open');
  statsModal.setAttribute('aria-hidden', 'true');
  updateBackButton();
}

function makeStatRow(label, value, cls) {
  const row = document.createElement('div');
  row.className = 'stat-row';
  const lab = document.createElement('span');
  lab.className = 'stat-label';
  lab.textContent = label;
  const val = document.createElement('span');
  val.className = 'stat-value' + (cls ? ' ' + cls : '');
  val.textContent = value;
  row.append(lab, val);
  return row;
}

function renderStats() {
  statsBody.replaceChildren();

  const all = state.bloggers;
  const platformsCount = new Set(all.map((b) => b.platform).filter(Boolean)).size;
  const totalSubs = all.reduce((s, b) => s + (Number(b.subscribers) || 0), 0);
  const avgSubs = all.length > 0 ? totalSubs / all.length : 0;

  statsBody.appendChild(makeStatRow('Всего блогеров', String(all.length)));
  statsBody.appendChild(makeStatRow('Платформ', String(platformsCount)));
  statsBody.appendChild(makeStatRow('Суммарно подписчиков', formatSubs(totalSubs), 'accent'));
  statsBody.appendChild(makeStatRow('Средняя аудитория', formatSubs(avgSubs), 'accent'));

  // ТОП-5 по подписчикам с медалями 🥇🥈🥉
  const top5 = all.slice().sort((a, b) =>
    (Number(b.subscribers) || 0) - (Number(a.subscribers) || 0)
  ).slice(0, 5);

  if (top5.length > 0) {
    const title = document.createElement('div');
    title.className = 'top-title';
    title.textContent = 'ТОП-' + top5.length + ' по подписчикам';
    statsBody.appendChild(title);
  }

  const medals = ['🥇', '🥈', '🥉'];
  top5.forEach((b, index) => {
    const item = document.createElement('div');
    item.className = 'top-item';

    const medal = document.createElement('span');
    medal.className = 'medal';
    if (index < 3) {
      medal.classList.add(['', 'gold', 'silver', 'bronze'][index + 1]);
      medal.textContent = medals[index];
    } else {
      medal.textContent = String(index + 1);
    }
    item.appendChild(medal);

    const info = document.createElement('div');
    info.className = 'top-info';

    const nm = document.createElement('div');
    nm.className = 'top-name';
    nm.textContent = b.displayName || b.name || 'Без имени';

    const nick = document.createElement('div');
    nick.className = 'top-nick';
    nick.textContent = b.name || '';

    const subs = document.createElement('div');
    subs.className = 'top-subs';
    subs.textContent = '👥 ' + formatSubs(b.subscribers);

    info.append(nm, nick, subs);
    item.appendChild(info);

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'top-open-btn';
    openBtn.textContent = 'Открыть';
    openBtn.dataset.url = b.url || '';
    openBtn.dataset.topOpen = '';
    item.appendChild(openBtn);

    statsBody.appendChild(item);
  });
}

/* ===== Экспорт выборки ===== */
function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return dd + '.' + mm + '.' + date.getFullYear();
}

function exportSelection() {
  const items = getFiltered();
  if (items.length === 0) {
    showToast('Нет записей для экспорта');
    return;
  }

  const lines = ['Блогеры ' + formatDate(new Date()), ''];
  items.forEach((b) => {
    const nick = String(b.name || '');
    lines.push(
      (nick.charAt(0) === '@' ? nick : '@' + nick) +
      ' — ' + (b.niche || '—') +
      ' — ' + formatSubs(b.subscribers) +
      ' — ' + (b.url || '')
    );
  });

  const text = lines.join('\n');
  copyText(text).then((ok) => {
    showToast(ok ? 'Список скопирован (' + items.length + ')' : 'Не удалось скопировать список');
  });
}

/* ===== «Мне повезёт» ===== */
function spinLucky(items) {
  const icons = ['🎲', '🎰', '⭐', '🎯', '🍀'];
  let step = 0;
  const total = 4; // 3-4 прокрутки эмодзи

  luckyBtn.classList.add('spinning');
  const timer = setInterval(() => {
    luckyBtn.textContent = icons[step % icons.length];
    step += 1;
    if (step >= total) {
      clearInterval(timer);
      luckyBtn.classList.remove('spinning');
      luckyBtn.textContent = '🎲';
      const picked = items[Math.floor(Math.random() * items.length)];
      openDetail(picked);
    }
  }, 120);
}

/* ===== События ===== */
document.addEventListener('scroll', function () {
  if (!toTopBtn) return;
  toTopBtn.classList.toggle('show', window.scrollY > 600);
}, { passive: true });

toTopBtn.addEventListener('click', function () {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

chipsEl.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  if (chip.hasAttribute('data-fav')) {
    state.favOnly = !state.favOnly;
    if (state.favOnly) {
      state.platform = 'Все';
    }
  } else if (chip.hasAttribute('data-toggle')) {
    state.verifiedOnly = !state.verifiedOnly;
  } else if (chip.dataset.platform !== undefined) {
    state.platform = chip.dataset.platform;
    state.favOnly = false;
  }
  renderChips();
  renderCatalog();
});

chips2El.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip || chip.dataset.niche === undefined) return;
  state.niche = chip.dataset.niche;
  renderChips2();
  renderCatalog();
});

searchInput.addEventListener('input', (event) => {
  const value = event.target.value;
  updateSearchClear(value);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = value;
    renderCatalog();
  }, 250);
});

searchClear.addEventListener('click', () => {
  clearTimeout(searchTimer);
  searchInput.value = '';
  state.search = '';
  updateSearchClear('');
  renderCatalog();
  searchInput.focus();
});

sortSelect.addEventListener('change', (event) => {
  state.sort = event.target.value;
  renderCatalog();
});

resetBtn.addEventListener('click', resetFilters);

viewToggle.addEventListener('click', toggleView);

catalogEl.addEventListener('click', (event) => {
  const favBtn = event.target.closest('.fav-btn');
  if (favBtn) {
    toggleFav(Number(favBtn.dataset.id));
    return;
  }

  const openBtn = event.target.closest('.open-btn');
  if (openBtn) {
    openProfile(openBtn.dataset.url);
    return;
  }

  const copyBtn = event.target.closest('.copy-btn');
  if (copyBtn) {
    copyNick(copyBtn.dataset.nick);
    return;
  }

  const card = event.target.closest('.card');
  if (card && card.dataset.id) {
    const blogger = state.bloggers.find((b) => Number(b.id) === Number(card.dataset.id));
    if (blogger) openDetail(blogger);
  }
});

detailBody.addEventListener('click', (event) => {
  const openBtn = event.target.closest('.detail-open-btn');
  if (openBtn) {
    openProfile(detailItem ? detailItem.url : '');
    return;
  }
  const copyBtn = event.target.closest('.detail-copy-btn');
  if (copyBtn) {
    if (detailItem) copyNick(detailItem.name);
    return;
  }
  const nicheBtn = event.target.closest('.detail-niche-btn');
  if (nicheBtn) {
    if (detailItem && detailItem.niche) {
      const niche = detailItem.niche;
      closeDetail();
      state.search = niche;
      searchInput.value = niche;
      updateSearchClear(niche);
      renderCatalog();
      showToast('Ниша: ' + niche);
    }
    return;
  }
  const shareBtn = event.target.closest('.detail-share-btn');
  if (shareBtn) {
    shareBlogger();
  }
});

detailCloseBtn.addEventListener('click', closeDetail);
detailModal.addEventListener('click', (event) => {
  if (event.target && event.target.hasAttribute('data-close-detail')) closeDetail();
});

statsBtn.addEventListener('click', openStats);
statsCloseBtn.addEventListener('click', closeStats);
statsModal.addEventListener('click', (event) => {
  if (event.target && event.target.hasAttribute('data-close-stats')) closeStats();
});

statsBody.addEventListener('click', (event) => {
  const openBtn = event.target.closest('.top-open-btn');
  if (openBtn) openProfile(openBtn.dataset.url);
});

exportBtn.addEventListener('click', exportSelection);

luckyBtn.addEventListener('click', () => {
  const items = getFiltered();
  if (items.length === 0) {
    showToast('Нет записей для выбора');
    return;
  }
  spinLucky(items);
});

themeToggle.addEventListener('click', toggleTheme);

/* ===== Старт ===== */
applyTheme();
initTelegram();
applyView();
updateSearchClear();
updateResetBtn();
loadBloggers();