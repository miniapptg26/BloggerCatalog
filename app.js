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

/* ===== Состояние ===== */
const state = {
  bloggers: [],   // все блогеры из bloggers.json
  search: '',     // текущий запрос
  platform: 'Все', // активная платформа-чип
  sort: 'subs'    // subs | name | id
};

/* ===== Telegram WebApp ===== */
const tg = window.Telegram ? window.Telegram.WebApp : null;

/* ===== DOM ===== */
const catalogEl = document.getElementById('catalog');
const emptyStateEl = document.getElementById('emptyState');
const chipsEl = document.getElementById('chips');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const countLabel = document.getElementById('countLabel');
const toastEl = document.getElementById('toast');

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

  // BackButton: закрывает приложение
  if (tg.BackButton && typeof tg.close === 'function') {
    tg.BackButton.onClick(() => tg.close());
  }
}

/* ===== Загрузка блогеров ===== */
async function loadBloggers() {
  try {
    const response = await fetch('bloggers.json');
    if (!response.ok) {
      throw new Error('Ошибка HTTP ' + response.status);
    }
    const data = await response.json();
    state.bloggers = Array.isArray(data) ? data : [];
  } catch (err) {
    showLoadError(err && err.message ? err.message : 'неизвестная ошибка');
    return;
  }
  renderChips();
  renderAll();
}

function showLoadError(message) {
  catalogEl.replaceChildren();
  emptyStateEl.hidden = true;

  const box = document.createElement('div');
  box.className = 'error-box';

  const emoji = document.createElement('div');
  emoji.className = 'error-emoji';
  emoji.textContent = '⚠️';

  const title = document.createElement('p');
  title.textContent = 'Не удалось загрузить каталог';

  const sub = document.createElement('p');
  sub.className = 'error-sub';
  sub.textContent = message + '. Проверьте, что файл bloggers.json лежит рядом с index.html.';

  box.append(emoji, title, sub);
  catalogEl.appendChild(box);
}

/* ===== Чипы платформ ===== */
function renderChips() {
  chipsEl.replaceChildren();

  const platforms = ['Все', ...new Set(
    state.bloggers.map((b) => b.platform).filter(Boolean)
  )];

  platforms.forEach((platform) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (platform === state.platform ? ' active' : '');
    const label = platform === 'Все'
      ? platform
      : (PLATFORM_EMOJI[platform] || '') + ' ' + (PLATFORM_LABELS[platform] || platform);
    chip.textContent = label;
    chip.dataset.platform = platform;
    chipsEl.appendChild(chip);
  });
}

/* ===== Фильтры и сортировка ===== */
function getFiltered() {
  const query = state.search.trim().toLowerCase();

  const filtered = state.bloggers.filter((blogger) => {
    const byPlatform = state.platform === 'Все' || blogger.platform === state.platform;
    const label = PLATFORM_LABELS[blogger.platform] || '';
    const haystack = String(
      (blogger.displayName || '') + ' ' +
      (blogger.name || '') + ' ' +
      (blogger.niche || '') + ' ' +
      (blogger.platform || '') + ' ' + label
    ).toLowerCase();
    const bySearch = !query || haystack.includes(query);
    return byPlatform && bySearch;
  });

  const sort = state.sort;
  filtered.sort((a, b) => {
    if (sort === 'name') {
      return String(a.displayName || a.name || '').localeCompare(
        String(b.displayName || b.name || ''), 'ru'
      );
    }
    if (sort === 'id') {
      return Number(b.id) - Number(a.id); // «Сначала новые»
    }
    return Number(b.subscribers || 0) - Number(a.subscribers || 0); // subs
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

/* ===== Рендер ===== */
function renderAll() {
  renderCount();
  renderCatalog();
}

function renderCount() {
  const n = state.bloggers.length;
  if (countLabel) {
    countLabel.textContent = n + ' ' + plural(n, 'блогер', 'блогера', 'блогеров');
  }
}

function renderCatalog() {
  const filtered = getFiltered();

  catalogEl.replaceChildren();

  if (filtered.length === 0) {
    emptyStateEl.hidden = false;
    return;
  }
  emptyStateEl.hidden = true;

  filtered.forEach((blogger) => catalogEl.appendChild(createCard(blogger)));
}

function createCard(blogger) {
  const card = document.createElement('article');
  card.className = 'card';

  // --- Аватар 72px ---
  const avatar = document.createElement('div');
  avatar.className = 'card-avatar';

  const emojiBox = document.createElement('div');
  emojiBox.className = 'card-avatar-emoji';
  emojiBox.textContent = blogger.emoji || DEFAULT_EMOJI;

  if (blogger.image) {
    const img = document.createElement('img');
    img.className = 'card-avatar-img';
    img.alt = blogger.displayName || 'Блогер';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = blogger.image;
    img.addEventListener('error', () => img.replaceWith(emojiBox));
    avatar.appendChild(img);
  } else {
    avatar.appendChild(emojiBox);
  }

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

/* ===== События ===== */
chipsEl.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  state.platform = chip.dataset.platform;
  renderChips();
  renderCatalog();
});

searchInput.addEventListener('input', (event) => {
  state.search = event.target.value;
  renderCatalog();
});

sortSelect.addEventListener('change', (event) => {
  state.sort = event.target.value;
  renderCatalog();
});

catalogEl.addEventListener('click', (event) => {
  const openBtn = event.target.closest('.open-btn');
  if (openBtn) {
    openProfile(openBtn.dataset.url);
    return;
  }
  const copyBtn = event.target.closest('.copy-btn');
  if (copyBtn) {
    copyNick(copyBtn.dataset.nick);
  }
});

/* ===== Старт ===== */
initTelegram();
loadBloggers();