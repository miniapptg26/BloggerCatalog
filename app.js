'use strict';

/* ===== Настройки ===== */
const CONFIG = {
  // Админ-режим: запись блогеров через GitHub REST API (commit в bloggers.json)
  adminUsername: 'g179p',       // username или числовой id администратора
  repoOwner: '',                // владелец GitHub-репозитория (вводится в админ-панели)
  repoName: 'blogger-catalog',  // репозиторий, куда пишутся блогеры
  jsonPath: 'bloggers.json'     // файл каталога внутри репозитория
};

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

/* ===== Определение администратора ===== */
const tgUser = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe)
  ? window.Telegram.WebApp.initDataUnsafe.user
  : null;
const isAdmin = !!(tgUser && (tgUser.username === CONFIG.adminUsername || String(tgUser.id) === CONFIG.adminUsername));

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

  // BackButton: сначала закрывает админ-модалку, иначе закрывает приложение
  if (tg.BackButton && typeof tg.close === 'function') {
    tg.BackButton.onClick(() => {
      if (adminModal && adminModal.classList.contains('open')) {
        closeAdmin();
        return;
      }
      tg.close();
    });
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
  fillNicheList();
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

/* ===== Админ-режим: добавление блогеров через GitHub API ===== */

/* DOM админ-панели */
const adminOpenBtn = document.getElementById('adminOpenBtn');
const adminModal = document.getElementById('adminModal');
const adminCloseBtn = document.getElementById('adminCloseBtn');
const checkGitHubBtn = document.getElementById('checkGitHubBtn');
const saveBtn = document.getElementById('saveBtn');
const githubStatusEl = document.getElementById('githubStatus');
const ghTokenInput = document.getElementById('ghToken');
const ghOwnerInput = document.getElementById('ghOwner');
const ghRepoInput = document.getElementById('ghRepo');

/* DOM секции «Записи в каталоге» */
const loadItemsBtn = document.getElementById('loadItemsBtn');
const itemsStatusEl = document.getElementById('itemsStatus');
const itemsListEl = document.getElementById('itemsList');
let adminItemsCache = []; // последний список, загруженный из GitHub

/* Показываем кнопку ➕ только администратору */
function setAdminVisible() {
  if (isAdmin && adminOpenBtn) adminOpenBtn.classList.remove('hidden');
}

function openAdmin() {
  if (!isAdmin) return;
  if (ghTokenInput) ghTokenInput.value = localStorage.getItem('gh_token') || '';
  if (ghOwnerInput) ghOwnerInput.value = localStorage.getItem('gh_owner') || '';
  if (ghRepoInput) ghRepoInput.value = localStorage.getItem('gh_repo') || CONFIG.repoName;
  if (githubStatusEl) {
    githubStatusEl.textContent = '';
    githubStatusEl.classList.remove('ok', 'err');
  }
  adminModal.classList.add('open');
  adminModal.setAttribute('aria-hidden', 'false');
  if (tg && tg.BackButton) tg.BackButton.show();
}

function closeAdmin() {
  adminModal.classList.remove('open');
  adminModal.setAttribute('aria-hidden', 'true');
  if (tg && tg.BackButton) tg.BackButton.hide();
}

/* UTF-8-safe base64: кириллица и эмодзи */
function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decodeBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function setGithubStatus(message, kind) {
  if (!githubStatusEl) return;
  githubStatusEl.textContent = message;
  githubStatusEl.classList.remove('ok', 'err');
  if (kind === 'ok') githubStatusEl.classList.add('ok');
  else if (kind === 'err') githubStatusEl.classList.add('err');
}

function getRepoInputs() {
  return {
    token: (ghTokenInput && ghTokenInput.value || '').trim(),
    owner: (ghOwnerInput && ghOwnerInput.value || '').trim(),
    repo: (ghRepoInput && ghRepoInput.value || '').trim()
  };
}

function saveRepoToLocalStorage() {
  const r = getRepoInputs();
  localStorage.setItem('gh_token', r.token);
  localStorage.setItem('gh_owner', r.owner);
  localStorage.setItem('gh_repo', r.repo);
}

function githubHeaders(token) {
  return {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function githubErrorMessage(response) {
  let message = '';
  try {
    const data = await response.json();
    if (data && data.message) message = data.message;
  } catch (e) {
    // ответ не JSON
  }
  const text = message ? (response.status + ' ' + message) : ('HTTP ' + response.status);
  if (response.status === 401) return text + ' — проверьте токен';
  return text;
}

const API_LIST_NOUN = CONFIG.jsonPath === 'bloggers.json' ? 'блогеров' : 'товаров';

/* Чтение текущего JSON из репозитория: 200 → массив + sha, 404 → [] + null */
async function fetchCatalog(owner, repo, token, allowMissing) {
  const url = 'https://api.github.com/repos/' + encodeURIComponent(owner) +
    '/' + encodeURIComponent(repo) + '/contents/' + encodeURIComponent(CONFIG.jsonPath) + '?ref=main';
  const response = await fetch(url, { headers: githubHeaders(token) });
  if (response.ok) {
    const meta = await response.json();
    const arr = JSON.parse(decodeBase64(meta.content));
    return { items: Array.isArray(arr) ? arr : [], sha: meta.sha };
  }
  if (response.status === 404) {
    if (allowMissing) return { items: [], sha: null };
    throw new Error(await githubErrorMessage(response));
  }
  throw new Error(await githubErrorMessage(response));
}

async function checkGitHubConnection() {
  const { token, owner, repo } = getRepoInputs();
  if (!token || !owner || !repo) {
    setGithubStatus('Заполните token, owner и repo', 'err');
    return;
  }
  setGithubStatus('Проверяем связь…');
  try {
    const { items } = await fetchCatalog(owner, repo, token, false);
    setGithubStatus('Связь OK: ' + items.length + ' ' + API_LIST_NOUN, 'ok');
  } catch (err) {
    setGithubStatus((err && err.message) || 'Ошибка соединения', 'err');
  }
}

function collectNewBlogger() {
  const val = (id) => (document.getElementById(id).value || '').trim();
  const displayName = val('adminDisplayName');
  let name = val('adminName');
  const subscribers = Number(document.getElementById('adminSubscribers').value);

  if (!displayName) {
    setGithubStatus('Укажите имя блогера', 'err');
    return null;
  }
  if (!name) {
    setGithubStatus('Укажите ник (например, @username)', 'err');
    return null;
  }
  if (!Number.isFinite(subscribers) || subscribers < 0) {
    setGithubStatus('Укажите корректное число подписчиков', 'err');
    return null;
  }
  if (name.charAt(0) !== '@') name = '@' + name;

  const item = {
    displayName: displayName,
    name: name,
    niche: val('adminNiche'),
    platform: document.getElementById('adminPlatform').value,
    subscribers: subscribers,
    verified: document.getElementById('adminVerified').checked
  };
  const description = val('adminDescription');
  if (description) item.description = description;
  const url = val('adminUrl');
  if (url) item.url = url;
  const emoji = val('adminEmoji');
  if (emoji) item.emoji = emoji;
  return item;
}

async function publishToGitHub(newItem) {
  const { token, owner, repo } = getRepoInputs();
  if (!token || !owner || !repo) {
    setGithubStatus('Заполните token, owner и repo', 'err');
    return;
  }
  saveRepoToLocalStorage();

  let catalog;
  try {
    catalog = await fetchCatalog(owner, repo, token, true);
  } catch (err) {
    setGithubStatus('Ошибка чтения каталога: ' + ((err && err.message) || 'нет соединения'), 'err');
    return;
  }

  const items = catalog.items;
  newItem.id = items.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0) + 1;
  if (newItem.available === undefined) newItem.available = true;
  items.push(newItem);

  const content = encodeBase64(JSON.stringify(items, null, 2));
  const putBody = { message: 'Add item via Mini App', content: content };
  if (catalog.sha) putBody.sha = catalog.sha;

  try {
    const response = await fetch(
      'https://api.github.com/repos/' + encodeURIComponent(owner) +
        '/' + encodeURIComponent(repo) + '/contents/' + encodeURIComponent(CONFIG.jsonPath),
      {
        method: 'PUT',
        headers: Object.assign(githubHeaders(token), { 'Content-Type': 'application/json' }),
        body: JSON.stringify(putBody)
      }
    );
    if (response.ok) {
      setGithubStatus('✅ Сохранено! Каталог обновится…', 'ok');
      showToast('Сохранено!');
      setTimeout(function () { location.reload(); }, 1800);
    } else {
      setGithubStatus('Ошибка: ' + await githubErrorMessage(response), 'err');
    }
  } catch (err) {
    setGithubStatus('Ошибка: ' + ((err && err.message) || 'нет соединения'), 'err');
  }
}

/* datalist с существующими нишами */
function fillNicheList() {
  const list = document.getElementById('nicheList');
  if (!list) return;
  list.replaceChildren();
  const niches = [...new Set(state.bloggers.map((b) => b.niche).filter(Boolean))];
  niches.forEach((niche) => {
    const option = document.createElement('option');
    option.value = niche;
    list.appendChild(option);
  });
}

/* ===== Админ: записи в каталоге (загрузка списка и удаление) ===== */

function itemsCountLabel(n) {
  if (n === 0) return 'Каталог пуст';
  if (CONFIG.jsonPath === 'bloggers.json') {
    return n + ' ' + plural(n, 'блогер', 'блогера', 'блогеров');
  }
  return n + ' ' + plural(n, 'товар', 'товара', 'товаров');
}

function setItemsStatus(message, kind) {
  if (!itemsStatusEl) return;
  itemsStatusEl.textContent = message;
  itemsStatusEl.classList.remove('ok', 'err');
  if (kind === 'ok') itemsStatusEl.classList.add('ok');
  else if (kind === 'err') itemsStatusEl.classList.add('err');
}

/* Имя записи для строки списка и подтверждения удаления */
function adminItemName(item) {
  if (!item) return 'Без имени';
  const display = item.displayName || '';
  const nick = item.name || '';
  return (display ? display + ' ' : '') + nick;
}

/* Дополнительный контекст: платформа + подписчики */
function adminItemMeta(item) {
  if (!item) return '';
  const parts = [];
  const platform = PLATFORM_LABELS[item.platform] || item.platform;
  if (platform) parts.push(platform);
  if (item.subscribers !== undefined && item.subscribers !== null && item.subscribers !== '') {
    parts.push('👥 ' + formatSubs(item.subscribers));
  }
  return parts.join(' · ');
}

/* Загрузка списка записей: token/owner/repo берём из localStorage */
async function loadItems() {
  const token = localStorage.getItem('gh_token') || '';
  const owner = localStorage.getItem('gh_owner') || '';
  const repo = localStorage.getItem('gh_repo') || '';
  if (!token || !owner || !repo) {
    setItemsStatus('Сначала подключите GitHub', 'err');
    renderItems([]);
    return;
  }
  if (loadItemsBtn) loadItemsBtn.disabled = true;
  setItemsStatus('Загружаем список…');
  try {
    const url = 'https://api.github.com/repos/' + encodeURIComponent(owner) +
      '/' + encodeURIComponent(repo) + '/contents/' + encodeURIComponent(CONFIG.jsonPath) + '?ref=main';
    const response = await fetch(url, { headers: githubHeaders(token) });
    if (response.status === 404) {
      setItemsStatus('Файл не найден', 'err');
      renderItems([]);
      return;
    }
    if (response.status === 401 || response.status === 403) {
      setItemsStatus('Проверьте токен и права (нужно Contents: Read and write)', 'err');
      renderItems([]);
      return;
    }
    if (!response.ok) {
      setItemsStatus('Ошибка загрузки: ' + await githubErrorMessage(response), 'err');
      renderItems([]);
      return;
    }
    const meta = await response.json();
    const arr = JSON.parse(decodeBase64(meta.content));
    const items = Array.isArray(arr) ? arr : [];
    adminItemsCache = items;
    setItemsStatus(itemsCountLabel(items.length), 'ok');
    renderItems(items);
  } catch (err) {
    setItemsStatus('Ошибка загрузки: ' + ((err && err.message) || 'нет соединения'), 'err');
  } finally {
    if (loadItemsBtn) loadItemsBtn.disabled = false;
  }
}

/* Рендер строк списка: новые сверху (по убыванию id) */
function renderItems(items) {
  if (!itemsListEl) return;
  itemsListEl.replaceChildren();

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'items-empty';
    empty.textContent = 'Каталог пуст';
    itemsListEl.appendChild(empty);
    return;
  }

  const sorted = items.slice().sort((a, b) => Number(b.id) - Number(a.id));
  let index = 0;
  sorted.forEach((item) => {
    index += 1;
    const row = document.createElement('div');
    row.className = 'items-row';

    const num = document.createElement('span');
    num.className = 'items-num';
    num.textContent = '#' + ((item.id !== undefined && item.id !== null) ? item.id : index);

    const info = document.createElement('div');
    info.className = 'items-info';

    const name = document.createElement('span');
    name.className = 'items-name';
    name.textContent = adminItemName(item);

    const meta = document.createElement('span');
    meta.className = 'items-sub';
    meta.textContent = adminItemMeta(item);

    info.append(name, meta);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'items-del';
    del.title = 'Удалить';
    del.setAttribute('aria-label', 'Удалить запись');
    del.textContent = '🗑';
    del.dataset.id = String(item.id);

    row.append(num, info, del);
    itemsListEl.appendChild(row);
  });
}

/* Подтверждение: нативный confirm есть и в браузере, и в Telegram WebView */
function askDeleteConfirm(itemName) {
  const message = 'Удалить запись «' + itemName + '»? Это действие нельзя отменить.';
  if (typeof window.confirm === 'function') return window.confirm(message);
  return false; // без нативного confirm удаление не выполняем (безопасный фолбэк)
}

/* Удаление записи через Contents API (commit 'Remove item via Mini App') */
async function removeItem(id) {
  const target = adminItemsCache.find((item) => Number(item.id) === Number(id));
  if (!target) {
    setItemsStatus('Запись не найдена в списке', 'err');
    return;
  }
  if (!askDeleteConfirm(adminItemName(target))) return;

  const { token, owner, repo } = getRepoInputs();
  if (!token || !owner || !repo) {
    setItemsStatus('Сначала подключите GitHub', 'err');
    return;
  }
  saveRepoToLocalStorage();
  setItemsStatus('Удаляем…');

  let catalog;
  try {
    catalog = await fetchCatalog(owner, repo, token, false);
  } catch (err) {
    setItemsStatus('Ошибка чтения каталога: ' + ((err && err.message) || 'нет соединения'), 'err');
    return;
  }

  const nextItems = catalog.items.filter((item) => Number(item.id) !== Number(id));
  if (nextItems.length === catalog.items.length) {
    setItemsStatus('Запись #' + id + ' не найдена в репозитории', 'err');
    return;
  }

  const content = encodeBase64(JSON.stringify(nextItems, null, 2));
  const putBody = { message: 'Remove item via Mini App', content: content, sha: catalog.sha };

  try {
    const response = await fetch(
      'https://api.github.com/repos/' + encodeURIComponent(owner) +
        '/' + encodeURIComponent(repo) + '/contents/' + encodeURIComponent(CONFIG.jsonPath),
      {
        method: 'PUT',
        headers: Object.assign(githubHeaders(token), { 'Content-Type': 'application/json' }),
        body: JSON.stringify(putBody)
      }
    );
    if (response.ok) {
      setItemsStatus('✅ Запись удалена', 'ok');
      showToast('Удалено');
      setTimeout(loadItems, 1500);
    } else {
      setItemsStatus('Ошибка: ' + await githubErrorMessage(response), 'err');
    }
  } catch (err) {
    setItemsStatus('Ошибка: ' + ((err && err.message) || 'нет соединения'), 'err');
  }
}

/* События админ-панели */
if (adminOpenBtn) adminOpenBtn.addEventListener('click', openAdmin);
if (adminCloseBtn) adminCloseBtn.addEventListener('click', closeAdmin);
if (adminModal) adminModal.addEventListener('click', (event) => {
  if (event.target && event.target.hasAttribute('data-admin-close')) closeAdmin();
});
if (checkGitHubBtn) checkGitHubBtn.addEventListener('click', checkGitHubConnection);
if (saveBtn) {
  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled) return;
    saveRepoToLocalStorage();
    const item = collectNewBlogger();
    if (!item) return;
    saveBtn.disabled = true;
    try {
      await publishToGitHub(item);
    } finally {
      saveBtn.disabled = false;
    }
  });
}
if (loadItemsBtn) loadItemsBtn.addEventListener('click', loadItems);
if (itemsListEl) {
  itemsListEl.addEventListener('click', (event) => {
    const btn = event.target.closest ? event.target.closest('.items-del') : null;
    if (btn && btn.dataset && btn.dataset.id) removeItem(btn.dataset.id);
  });
}

/* ===== Старт ===== */
initTelegram();
setAdminVisible();
loadBloggers();