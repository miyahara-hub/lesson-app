/* ============================================================
   SALON LESSON MANAGER  —  SPA
   ============================================================ */

// ── CONSTANTS ─────────────────────────────────────────────
const API = (window.__API_BASE__ || '') + '/api';
const DEADLINE_OPTS = [
  { value: '1day',   label: '前日' },
  { value: '3days',  label: '3日前' },
  { value: '1week',  label: '1週間前' },
  { value: '2weeks', label: '2週間前' },
  { value: '1month', label: '1ヶ月前' },
];
const ROLE_LABELS  = { instructor: 'スタイリスト', participant: 'アシスタント', temp_instructor: '臨時スタイリスト' };
const ADMIN_LABELS = { super_admin: '全体管理者', store_admin: '店舗管理者' };
const LEVEL_OPTS   = ['初級', '中級', '上級', '全レベル'];
const FORMAT_OPTS  = ['個別', 'グループ', 'オンライン'];
const DOW_JA       = ['日','月','火','水','木','金','土'];

// ── STATE ─────────────────────────────────────────────────
const S = {
  user: null,
  users: [], stores: [], lessonTypes: [], lessons: [], adjustments: [],
  view: null, viewParams: {}, history: [],
  selectedStore: null,
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth() + 1,
  selectingDates: [],
  adminTab: 0,
  editTarget: null,
  adminAuthed: false,
  adminAuthError: '',
};

// ── API CLIENT ────────────────────────────────────────────
async function http(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'エラーが発生しました');
  return data;
}
const api = {
  get:  (p)    => http('GET',    p),
  post: (p, d) => http('POST',   p, d),
  put:  (p, d) => http('PUT',    p, d),
  del:  (p)    => http('DELETE', p),
};

// ── LOAD DATA ─────────────────────────────────────────────
async function loadAll() {
  const [users, stores, types, lessons, adjustments] = await Promise.all([
    api.get('/users'), api.get('/stores'), api.get('/lesson-types'),
    api.get('/lessons'), api.get('/adjustments'),
  ]);
  S.users = users; S.stores = stores; S.lessonTypes = types;
  S.lessons = lessons; S.adjustments = adjustments;
}

// ── NAVIGATION ────────────────────────────────────────────
function go(view, params = {}) {
  if (S.view) S.history.push({ view: S.view, params: S.viewParams });
  S.view = view; S.viewParams = params;
  paint();
}
function replace(view, params = {}) {
  S.view = view; S.viewParams = params;
  paint();
}
function goBack() {
  if (!S.history.length) { replace('storeSelect'); return; }
  const p = S.history.pop();
  S.view = p.view; S.viewParams = p.params;
  paint();
}
window.goBack = goBack;

// ── UTILITIES ─────────────────────────────────────────────
function esc(s) { return s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function u(id) { return S.users.find(x => x.id === id); }
function uName(id) { const x = u(id); return x ? x.name : '不明'; }
function lt(id) { return S.lessonTypes.find(x => x.id === id); }
function ltName(id) { const x = lt(id); return x ? x.name : '—'; }
function store(id) { return S.stores.find(x => x.id === id); }
function isInstructor(user) {
  return user && (user.role === 'instructor' || user.role === 'temp_instructor');
}
function isAdmin() { return S.user && (S.user.adminRole === 'super_admin' || S.user.adminRole === 'store_admin'); }
function isSuperAdmin() { return S.user && S.user.adminRole === 'super_admin'; }

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return `${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日（${DOW_JA[dt.getDay()]}）`;
}
function fmtShort(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return `${dt.getMonth()+1}/${dt.getDate()}（${DOW_JA[dt.getDay()]}）`;
}
function toDateStr(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function deadlineDate(lesson) {
  const days = { '1day':1,'3days':3,'1week':7,'2weeks':14,'1month':30 }[lesson.deadline] || 0;
  const d = new Date(lesson.date + 'T23:59:59');
  d.setDate(d.getDate() - days);
  return d;
}
function isDeadlinePassed(lesson) { return new Date() > deadlineDate(lesson); }
function isFull(lesson) { return lesson.participants.length >= lesson.capacity; }
function isRegistered(lesson) { return S.user && lesson.participants.includes(S.user.id); }
function dlLabel(key) { const o = DEADLINE_OPTS.find(x => x.value === key); return o ? o.label : key; }

// ── SORTING ───────────────────────────────────────────────
function sortByFurigana(users) {
  return [...users].sort((a, b) =>
    (a.furigana || a.name).localeCompare(b.furigana || b.name, 'ja')
  );
}

// Store-filtered helpers (respects S.selectedStore)
function storeFilteredLessons() {
  if (!S.selectedStore || S.selectedStore === 'all') return S.lessons;
  return S.lessons.filter(l => l.storeId === S.selectedStore);
}
function storeFilteredAdjs() {
  if (!S.selectedStore || S.selectedStore === 'all') return S.adjustments;
  return S.adjustments.filter(a => a.storeId === S.selectedStore);
}

// ── TOAST ─────────────────────────────────────────────────
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => {
    t.classList.remove('visible');
    setTimeout(() => t.remove(), 350);
  }, 2800);
}

// ── CALENDAR COMPONENT ────────────────────────────────────
// mode: 'view' | 'select-single' | 'select-multi' | 'availability' | 'vote'
function renderCalendar(year, month, opts = {}) {
  const {
    mode = 'view',
    lessonDates = [],
    selected = [],
    availabilityMap = {},   // date -> count (pattern A aggregated)
    totalMembers = 0,
    candidates = [],        // pattern B candidate dates
    voteMap = {},           // date -> count
  } = opts;

  const firstDay = new Date(year, month - 1, 1);
  const lastDay  = new Date(year, month, 0);
  const numDays  = lastDay.getDate();
  // Monday-start: (getDay()+6)%7  →  Mon=0 … Sun=6
  const startDow = (firstDay.getDay() + 6) % 7;

  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth()+1, today.getDate());

  let rows = '';
  let col = startDow;
  let cells = Array(startDow).fill('<td></td>').join('');

  for (let d = 1; d <= numDays; d++) {
    const dateStr = toDateStr(year, month, d);
    const dow = (new Date(year, month-1, d).getDay() + 6) % 7; // 0=Mon,6=Sun
    const isSun = dow === 6;
    const isSat = dow === 5;

    let cls = 'cal-day';
    if (isSat) cls += ' sat';
    if (isSun) cls += ' sun';
    if (dateStr === todayStr) cls += ' today';

    let inner = String(d);
    let dot = '';

    if (mode === 'view') {
      if (lessonDates.includes(dateStr)) { cls += ' has-lesson'; dot = '<span class="cal-day-dot"></span>'; }
    } else if (mode === 'select-single' || mode === 'select-multi') {
      if (selected.includes(dateStr)) cls += ' selected';
    } else if (mode === 'availability') {
      const count = availabilityMap[dateStr] || 0;
      if (count > 0 && totalMembers > 0) {
        const pct = count / totalMembers;
        if (pct >= 1)      cls += ' all-ok';
        else if (pct >= 0.5) cls += ' partial-ok';
        else               cls += ' few-ok';
        dot = `<span class="cal-count">${count}</span>`;
      }
    } else if (mode === 'vote') {
      const isCandidate = candidates.includes(dateStr);
      const isVoted     = selected.includes(dateStr);
      if (isCandidate) cls += isVoted ? ' voted' : ' candidate';
      inner = d + (voteMap[dateStr] ? `<span class="cal-count">${voteMap[dateStr]}</span>` : '');
    }

    const clickable = mode !== 'view';
    const onclick   = clickable ? `onclick="calDayClick('${dateStr}')"` : '';
    cells += `<td><span class="${cls}" ${onclick}>${inner}${dot}</span></td>`;
    col++;
    if (col === 7) { rows += `<tr>${cells}</tr>`; cells = ''; col = 0; }
  }
  if (cells) { while (col < 7) { cells += '<td></td>'; col++; } rows += `<tr>${cells}</tr>`; }

  const monthName = `${year}年${month}月`;
  return `
    <div class="cal-nav">
      <button class="cal-nav-btn" onclick="calPrev()">&#8592;</button>
      <span class="cal-title heading">${monthName}</span>
      <button class="cal-nav-btn" onclick="calNext()">&#8594;</button>
    </div>
    <table class="cal-grid">
      <thead><tr>
        ${['月','火','水','木','金','土','日'].map(d=>`<th>${d}</th>`).join('')}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

window.calDayClick = function(dateStr) {
  const view = S.view;
  if (view === 'publishLesson') {
    const isEditing = !!S.viewParams.id;
    if (isEditing) {
      S.selectingDates = [dateStr];
      const el = document.getElementById('lesson-date-display');
      if (el) el.textContent = fmtDate(dateStr);
      const inp = document.getElementById('lesson-date-input');
      if (inp) inp.value = dateStr;
      repaintCalBlock('lesson-cal', 'select-single', S.selectingDates);
    } else {
      toggleDate(dateStr);
      const el = document.getElementById('lesson-date-display');
      if (el) el.textContent = S.selectingDates.length
        ? S.selectingDates.sort().map(fmtDate).join('、')
        : '日付を選んでください（複数選択可）';
      const inp = document.getElementById('lesson-date-input');
      if (inp) inp.value = S.selectingDates[0] || '';
      repaintCalBlock('lesson-cal', 'select-multi', S.selectingDates);
    }
  } else if (view === 'adjustmentDetail') {
    toggleDate(dateStr);
    const adj = S.adjustments.find(a => a.id === S.viewParams.id);
    if (!adj) return;
    if (adj.pattern === 'B') {
      repaintCalBlock('adj-cal', 'vote', S.selectingDates, adj);
    } else {
      repaintCalBlock('adj-cal', 'select-multi', S.selectingDates);
    }
  } else if (view === 'createAdjustment') {
    toggleDate(dateStr);
    repaintCalBlock('adj-create-cal', 'select-multi', S.selectingDates);
  }
};

window.calPrev = function() {
  S.calMonth--;
  if (S.calMonth < 1) { S.calMonth = 12; S.calYear--; }
  repaintCurrentCal();
};
window.calNext = function() {
  S.calMonth++;
  if (S.calMonth > 12) { S.calMonth = 1; S.calYear++; }
  repaintCurrentCal();
};

function toggleDate(dateStr) {
  const i = S.selectingDates.indexOf(dateStr);
  if (i > -1) S.selectingDates.splice(i, 1);
  else S.selectingDates.push(dateStr);
}

function repaintCalBlock(id, mode, selected, adj) {
  const el = document.getElementById(id);
  if (!el) return;
  const opts = { mode, selected };
  if (mode === 'vote' && adj) {
    opts.candidates = adj.candidates || [];
    const voteMap = {};
    Object.values(adj.votes||{}).forEach(dates => dates.forEach(d => voteMap[d] = (voteMap[d]||0)+1));
    opts.voteMap = voteMap;
  }
  el.innerHTML = renderCalendar(S.calYear, S.calMonth, opts);
}

function repaintCurrentCal() {
  const view = S.view;
  if (view === 'publishLesson') {
    const isEditing = !!S.viewParams.id;
    repaintCalBlock('lesson-cal', isEditing ? 'select-single' : 'select-multi', S.selectingDates);
  } else if (view === 'lessonList' || view === 'myLessons' || view === 'stylistSchedule') {
    paint();
  } else if (view === 'adjustmentDetail') {
    const adj = S.adjustments.find(a => a.id === S.viewParams.id);
    if (!adj) return;
    if (adj.pattern === 'A') {
      const availMap = buildAvailMap(adj);
      const el = document.getElementById('adj-cal');
      if (el) el.innerHTML = renderCalendar(S.calYear, S.calMonth, {
        mode: 'availability', availabilityMap: availMap, totalMembers: adj.members.length,
      });
      const myEl = document.getElementById('adj-my-cal');
      if (myEl) myEl.innerHTML = renderCalendar(S.calYear, S.calMonth, {
        mode: 'select-multi', selected: S.selectingDates,
      });
    } else {
      const adj2 = S.adjustments.find(a => a.id === S.viewParams.id);
      repaintCalBlock('adj-cal', 'vote', S.selectingDates, adj2);
    }
  } else if (view === 'createAdjustment') {
    repaintCalBlock('adj-create-cal', 'select-multi', S.selectingDates);
  }
}

function buildAvailMap(adj) {
  const map = {};
  Object.values(adj.availabilities || {}).forEach(dates => {
    dates.forEach(d => { map[d] = (map[d] || 0) + 1; });
  });
  return map;
}

// ── PAINT (main render) ───────────────────────────────────
function paint() {
  const app = document.getElementById('app');
  const v = S.view, p = S.viewParams;

  let header = '', content = '';
  switch(v) {
    case 'storeSelect':
      header  = headerStoreSelect();
      content = viewStoreSelect();
      break;
    case 'login':
      header  = headerLogin();
      content = viewLogin();
      break;
    case 'home':
      header  = headerHome();
      content = viewHome();
      break;
    case 'lessonList':
      header  = headerPage('レッスン一覧');
      content = viewLessonList(p);
      break;
    case 'lessonDetail':
      header  = headerPage('レッスン詳細');
      content = viewLessonDetail(p);
      break;
    case 'publishLesson':
      header  = headerPage(p.id ? 'レッスン編集' : p.duplicateId ? 'レッスン複製' : 'レッスン公開');
      content = viewPublishLesson(p);
      break;
    case 'myLessons':
      header  = headerPage('担当レッスン');
      content = viewMyLessons();
      break;
    case 'stylistSchedule':
      header  = headerPage('スタイリストのスケジュール');
      content = viewStylistSchedule(p);
      break;
    case 'adjustmentList':
      header  = headerPage('合同レッスン調整');
      content = viewAdjustmentList();
      break;
    case 'adjustmentDetail':
      header  = headerPage('日程調整');
      content = viewAdjustmentDetail(p);
      break;
    case 'createAdjustment':
      header  = headerPage('調整を作成');
      content = viewCreateAdjustment();
      break;
    case 'admin':
      header  = headerPage('管理画面');
      content = S.adminAuthed ? viewAdmin() : viewAdminAuth();
      break;
    default:
      content = '<div class="page"><p>Not found</p></div>';
  }

  app.innerHTML = `<div id="header">${header}</div><div id="content" class="fade-in">${content}</div>`;
}

// ── HEADERS ───────────────────────────────────────────────
function headerStoreSelect() {
  return `<div class="header-login">
    <h1 class="app-title heading">LESSON</h1>
    <p class="app-subtitle">Salon Schedule Manager</p>
  </div>`;
}
function headerLogin() {
  const sel = S.selectedStore === 'all'
    ? '全店舗' : (S.stores.find(s => s.id === S.selectedStore)?.name || '');
  return `<div class="header-login" style="position:relative">
    <button class="btn-back" onclick="go('storeSelect')"
      style="position:absolute;left:0;top:50%;transform:translateY(-50%);font-size:18px">&#8592;</button>
    <h1 class="app-title heading">LESSON</h1>
    <p class="app-subtitle">${esc(sel) || 'Salon Schedule Manager'}</p>
  </div>`;
}
function headerHome() {
  const store = S.stores.find(s => s.id === S.user.storeId);
  return `<div class="header-home">
    <div>
      <p class="header-greeting">${store ? esc(store.name) : ''}</p>
      <h2 class="header-name heading">${esc(S.user.name)}</h2>
      <span class="role-badge ${S.user.role}">${ROLE_LABELS[S.user.role] || S.user.role}</span>
    </div>
    <button class="btn-icon" onclick="logout()" title="ログアウト">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
    </button>
  </div>`;
}
function headerPage(title) {
  return `<div class="header-page">
    <button class="btn-back" onclick="goBack()">&#8592;</button>
    <h2 class="header-title heading">${esc(title)}</h2>
    <div style="width:32px"></div>
  </div>`;
}

// ── VIEW: STORE SELECT ────────────────────────────────────
function viewStoreSelect() {
  let html = '<div class="page">';
  html += '<p style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--accent);padding:20px 0 16px;text-align:center">店舗を選んでください</p>';

  html += `<button class="card card-tap w-full" style="text-align:left;margin-bottom:8px" onclick="selectStore('all')">
    <div class="flex-between">
      <div>
        <div style="font-size:14px;font-weight:300;letter-spacing:0.05em">全店舗</div>
        <div class="text-xs text-accent" style="margin-top:2px">ALL STORES</div>
      </div>
      <span class="menu-chevron">›</span>
    </div>
  </button>`;

  S.stores.forEach(st => {
    html += `<button class="card card-tap w-full" style="text-align:left;margin-bottom:8px" onclick="selectStore('${st.id}')">
      <div class="flex-between">
        <div>
          <div style="font-size:14px;font-weight:300;letter-spacing:0.05em">${esc(st.name)}</div>
          <div class="text-xs text-accent" style="margin-top:2px">${esc(st.area || '')}</div>
        </div>
        <span class="menu-chevron">›</span>
      </div>
    </button>`;
  });

  html += '</div>';
  return html;
}

window.selectStore = function(storeId) {
  S.selectedStore = storeId;
  S.history = [];
  go('login');
};

// ── VIEW: LOGIN ────────────────────────────────────────────
function viewLogin() {
  const groups = [
    { label: 'スタイリスト', role: 'instructor' },
    { label: '臨時スタイリスト', role: 'temp_instructor' },
    { label: 'アシスタント', role: 'participant' },
  ];
  let html = '<div class="page">';
  html += '<p style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--accent);padding:20px 0 16px;text-align:center">名前を選んでください</p>';

  groups.forEach(g => {
    const members = sortByFurigana(S.users.filter(u =>
      u.role === g.role &&
      (S.selectedStore === 'all' || !S.selectedStore || u.storeId === S.selectedStore)
    ));
    if (!members.length) return;
    html += `<p class="section-label">${g.label}</p>`;
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:12px 0">';
    members.forEach(user => {
      html += `<button class="card" style="padding:16px 8px;text-align:center;cursor:pointer;border:1px solid var(--border)"
        onclick="loginAs('${user.id}')">
        <span style="font-size:12px;font-weight:300;line-height:1.4">${esc(user.name)}</span>
      </button>`;
    });
    html += '</div>';
  });

  html += `<div style="padding:32px 0 8px">
    <button class="btn btn-ghost w-full" onclick="go('admin')">
      ADMIN — 管理画面
    </button>
  </div>`;
  html += '</div>';
  return html;
}

window.loginAs = function(userId) {
  S.user = S.users.find(u => u.id === userId);
  if (!S.user) return;
  S.history = [];
  S.adminAuthed = false;
  S.adminAuthError = '';
  go('home');
};
window.logout = function() {
  S.user = null; S.history = [];
  S.adminAuthed = false;
  S.adminAuthError = '';
  go('storeSelect');
};

// ── VIEW: HOME ─────────────────────────────────────────────
function viewHome() {
  const u = S.user;
  const isInst = isInstructor(u);
  let items = [];

  if (isInst) {
    items.push({ label: 'レッスンを公開する', sub: 'Publish Lesson', view: 'publishLesson' });
    items.push({ label: '担当レッスン一覧', sub: 'My Lessons', view: 'myLessons' });
  }
  items.push({ label: 'レッスン一覧', sub: 'Lesson Schedule', view: 'lessonList' });
  items.push({ label: '合同レッスン調整', sub: 'Group Scheduling', view: 'adjustmentList' });

  if (isAdmin()) {
    items.push({ label: '管理画面', sub: 'Admin', view: 'admin' });
  }

  let html = '<div class="page"><ul class="menu-list" style="margin-top:8px">';
  items.forEach(item => {
    html += `<li class="menu-item">
      <button onclick="go('${item.view}')">
        <span>
          <span class="menu-item-label">${esc(item.label)}</span>
          <br><span class="menu-item-sub">${esc(item.sub)}</span>
        </span>
        <span class="menu-chevron">›</span>
      </button>
    </li>`;
  });
  html += '</ul></div>';
  return html;
}

// ── VIEW: LESSON LIST ─────────────────────────────────────
function viewLessonList(p) {
  const y = S.calYear, m = S.calMonth;
  const monthLessons = storeFilteredLessons().filter(l => {
    const d = new Date(l.date + 'T00:00:00');
    return d.getFullYear() === y && d.getMonth()+1 === m;
  });
  const lessonDates = [...new Set(monthLessons.map(l => l.date))];

  // Instructor filter — only show instructors from the current store scope
  const instructors = sortByFurigana(S.users.filter(u =>
    isInstructor(u) &&
    (S.selectedStore === 'all' || !S.selectedStore || u.storeId === S.selectedStore)
  ));
  const filterInst = p.instructorId || '';

  let displayLessons = monthLessons;
  if (filterInst) displayLessons = displayLessons.filter(l => l.instructorId === filterInst);
  displayLessons = [...displayLessons].sort((a, b) => a.date.localeCompare(b.date));

  let html = '<div class="page">';

  // Instructor filter
  html += `<div style="padding:12px 0 0">
    <select class="form-select" onchange="filterByInstructor(this.value)" style="font-size:12px">
      <option value="">すべてのスタイリスト</option>
      ${instructors.map(i => `<option value="${i.id}" ${filterInst===i.id?'selected':''}>${esc(i.name)}</option>`).join('')}
    </select>
    ${filterInst ? `<button class="btn btn-sm btn-ghost" style="margin-top:8px;width:100%" onclick="go('stylistSchedule',{userId:'${filterInst}'})">このスタイリストのスケジュールを見る</button>` : ''}
  </div>`;

  // Calendar
  html += `<div id="lesson-cal-view">${renderCalendar(y, m, { mode:'view', lessonDates })}</div>`;

  // Lesson cards
  if (displayLessons.length === 0) {
    html += `<div class="empty-state"><div class="empty-state-icon">📅</div>
      <p class="empty-state-text">レッスンがありません</p></div>`;
  } else {
    html += '<div style="margin-top:16px">';
    displayLessons.forEach(l => { html += lessonCard(l, true); });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

window.filterByInstructor = function(id) {
  S.viewParams.instructorId = id;
  replace('lessonList', S.viewParams);
};

function lessonCard(l, showRegBtn = false) {
  const type     = lt(l.typeId);
  const inst     = u(l.instructorId);
  const filled   = l.participants.length;
  const cap      = l.capacity;
  const pct      = Math.round(filled / cap * 100);
  const reg      = isRegistered(l);
  const full     = isFull(l);
  const passed   = isDeadlinePassed(l);
  const tempInst = l.tempInstructorId ? u(l.tempInstructorId) : null;

  const isJoint      = !!l.adjId;
  const isOtherStore = S.user && l.storeId && l.storeId !== S.user.storeId;
  const showStoreName = S.selectedStore === 'all';
  const lessonStore  = S.stores.find(s => s.id === l.storeId);

  let statusBadge = '';
  if (reg)          statusBadge = '<span class="tag tag-success">申込済み</span>';
  else if (full)    statusBadge = '<span class="tag tag-danger">満員</span>';
  else if (passed)  statusBadge = '<span class="tag">締切済み</span>';

  // Right-side badges (stack vertically if multiple)
  const rightBadges = `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
    ${statusBadge}
    ${isOtherStore ? '<span class="tag" style="border-color:var(--accent);color:var(--accent);font-size:8px">他店舗</span>' : ''}
  </div>`;

  return `<div class="card card-tap" onclick="go('lessonDetail',{id:'${l.id}'})">
    <div class="card-header">
      <div style="flex:1;min-width:0">
        <div class="card-title">
          ${esc(type ? type.name : '—')}
          ${isJoint ? '<span class="tag tag-dark" style="font-size:8px;vertical-align:middle;margin-left:6px">合同</span>' : ''}
        </div>
        <div class="card-meta">
          ${fmtShort(l.date)}&nbsp;／&nbsp;${esc(inst ? inst.name : '—')}${tempInst ? ' <span style="color:var(--accent)">(代: '+esc(tempInst.name)+')</span>' : ''}
          ${showStoreName && lessonStore ? `&nbsp;／&nbsp;<span style="color:var(--accent)">${esc(lessonStore.name)}</span>` : ''}
        </div>
      </div>
      ${rightBadges}
    </div>
    <div style="font-size:11px;color:var(--accent);margin-bottom:6px">
      定員 ${filled}/${cap} 名　締切: ${dlLabel(l.deadline)}
    </div>
    <div class="cap-bar"><div class="cap-bar-fill ${full?'full':''}" style="width:${pct}%"></div></div>
  </div>`;
}

// ── VIEW: LESSON DETAIL ────────────────────────────────────
function viewLessonDetail(p) {
  const l = S.lessons.find(x => x.id === p.id);
  if (!l) return '<div class="page"><p>レッスンが見つかりません</p></div>';

  const type  = lt(l.typeId);
  const inst  = u(l.instructorId);
  const tempI = l.tempInstructorId ? u(l.tempInstructorId) : null;
  const reg   = isRegistered(l);
  const full  = isFull(l);
  const passed = isDeadlinePassed(l);
  const isOwner      = S.user && l.instructorId === S.user.id;
  const isOtherStore = S.user && l.storeId && l.storeId !== S.user.storeId;
  const lStore       = S.stores.find(s => s.id === l.storeId);

  const deadlineStr = fmtDate((() => {
    const d = deadlineDate(l);
    return toDateStr(d.getFullYear(), d.getMonth()+1, d.getDate());
  })());

  let html = '<div class="page">';
  html += `<div class="card" style="margin-top:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <p class="section-label" style="margin-bottom:0;border-bottom:none;padding-bottom:0">LESSON INFO</p>
      <div style="display:flex;gap:6px">
        ${isOtherStore ? '<span class="tag" style="border-color:var(--accent);color:var(--accent)">他店舗</span>' : ''}
        ${lStore ? `<span class="tag">${esc(lStore.name)}</span>` : ''}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <tr><td class="text-xs text-accent" style="padding:8px 0 8px;width:90px">種類</td>
          <td style="font-size:13px">${esc(type ? type.name : '—')}</td></tr>
      <tr style="border-top:1px solid var(--border)">
          <td class="text-xs text-accent" style="padding:8px 0">形式</td>
          <td style="font-size:13px">${esc(type ? type.format : '—')}&nbsp;&nbsp;<span class="tag">${esc(type ? type.level : '')}</span></td></tr>
      <tr style="border-top:1px solid var(--border)">
          <td class="text-xs text-accent" style="padding:8px 0">日付</td>
          <td style="font-size:13px">${fmtDate(l.date)}</td></tr>
      <tr style="border-top:1px solid var(--border)">
          <td class="text-xs text-accent" style="padding:8px 0">スタイリスト</td>
          <td style="font-size:13px">
            ${esc(inst ? inst.name : '—')}
            ${inst ? `<button class="btn btn-sm btn-ghost" style="margin-left:8px;font-size:10px;padding:2px 8px" onclick="go('stylistSchedule',{userId:'${l.instructorId}'})">スケジュール</button>` : ''}
          </td></tr>
      ${tempI ? `<tr style="border-top:1px solid var(--border)">
          <td class="text-xs text-accent" style="padding:8px 0">代行</td>
          <td style="font-size:13px">${esc(tempI.name)}</td></tr>` : ''}
      <tr style="border-top:1px solid var(--border)">
          <td class="text-xs text-accent" style="padding:8px 0">定員</td>
          <td style="font-size:13px">${l.participants.length} / ${l.capacity} 名</td></tr>
      <tr style="border-top:1px solid var(--border)">
          <td class="text-xs text-accent" style="padding:8px 0">申込締切</td>
          <td style="font-size:13px">${deadlineStr}</td></tr>
      ${l.memo ? `<tr style="border-top:1px solid var(--border)">
          <td class="text-xs text-accent" style="padding:8px 0">メモ</td>
          <td style="font-size:13px;white-space:pre-wrap">${esc(l.memo)}</td></tr>` : ''}
    </table>
  </div>`;

  // Participants
  html += `<div class="card" style="margin-top:0">
    <p class="section-label" style="margin-bottom:10px">アシスタント ${l.participants.length}名</p>
    ${l.participants.length ? `<div class="participants-row">${l.participants.map(id =>
      `<span class="participant-chip">${esc(uName(id))}</span>`).join('')}</div>`
      : '<p class="text-sm text-accent">まだアシスタントがいません</p>'}
  </div>`;

  // Actions
  html += '<div style="padding:16px 0;display:flex;flex-direction:column;gap:8px">';
  if (reg) {
    html += `<button class="btn btn-danger" onclick="cancelLesson('${l.id}')">申込をキャンセルする</button>`;
  } else if (!full && !passed) {
    html += `<button class="btn btn-primary" onclick="registerLesson('${l.id}')">このレッスンに参加申し込み</button>`;
  } else if (full) {
    html += `<button class="btn" disabled style="opacity:0.4">満員のため申込できません</button>`;
  } else if (passed) {
    html += `<button class="btn" disabled style="opacity:0.4">申込期限を過ぎています</button>`;
  }

  // Instructor can add any member
  if (isOwner || isAdmin()) {
    html += `<button class="btn btn-ghost" onclick="showAddParticipant('${l.id}')">アシスタントを追加する</button>`;
  }

  // Google Calendar
  html += `<button class="btn btn-ghost" onclick="addToGoogleCal('${l.id}')">Google カレンダーに追加</button>`;

  if (isOwner || isAdmin()) {
    html += `<hr class="divider">
      <button class="btn btn-ghost" onclick="go('publishLesson',{id:'${l.id}'})">編集</button>
      <button class="btn btn-ghost" onclick="go('publishLesson',{duplicateId:'${l.id}'})">複製する</button>
      <button class="btn btn-danger" onclick="deleteLesson('${l.id}')">削除</button>`;
  }
  html += '</div></div>';
  return html;
}

window.registerLesson = async function(lessonId) {
  try {
    const updated = await api.post(`/lessons/${lessonId}/register`, { userId: S.user.id });
    S.lessons = S.lessons.map(l => l.id === lessonId ? updated : l);
    toast('申し込みが完了しました', 'success');
    replace('lessonDetail', { id: lessonId });
  } catch(e) { toast(e.message, 'error'); }
};

window.cancelLesson = async function(lessonId) {
  if (!confirm('申込をキャンセルしますか？')) return;
  try {
    const updated = await api.del(`/lessons/${lessonId}/register/${S.user.id}`);
    S.lessons = S.lessons.map(l => l.id === lessonId ? updated : l);
    toast('キャンセルしました');
    replace('lessonDetail', { id: lessonId });
  } catch(e) { toast(e.message, 'error'); }
};

window.deleteLesson = async function(lessonId) {
  if (!confirm('このレッスンを削除しますか？')) return;
  try {
    await api.del(`/lessons/${lessonId}`);
    S.lessons = S.lessons.filter(l => l.id !== lessonId);
    toast('削除しました');
    goBack();
  } catch(e) { toast(e.message, 'error'); }
};

window.showAddParticipant = function(lessonId) {
  const lesson = S.lessons.find(l => l.id === lessonId);
  if (!lesson) return;
  const eligible = sortByFurigana(S.users.filter(u => !lesson.participants.includes(u.id)));
  const html = `<div class="modal-overlay" onclick="if(event.target===this)this.remove()">
    <div class="modal">
      <p class="modal-title">アシスタントを追加</p>
      <ul class="check-list">
        ${eligible.map(u => `<li class="check-item" onclick="addParticipant('${lessonId}','${u.id}',this)">
          <span class="check-box" id="chk-${u.id}"></span>
          <span>
            <span class="check-label">${esc(u.name)}</span>
            <span class="check-sub">${ROLE_LABELS[u.role]||u.role}</span>
          </span>
        </li>`).join('')}
      </ul>
      <div style="margin-top:20px">
        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove();replace('lessonDetail',{id:'${lessonId}'})">完了</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.addParticipant = async function(lessonId, userId, el) {
  try {
    const updated = await api.post(`/lessons/${lessonId}/register`, { userId });
    S.lessons = S.lessons.map(l => l.id === lessonId ? updated : l);
    const box = el.querySelector('.check-box');
    if (box) box.classList.add('checked');
    toast(uName(userId) + ' を追加しました', 'success');
  } catch(e) { toast(e.message, 'error'); }
};

window.addToGoogleCal = function(lessonId) {
  const l = S.lessons.find(x => x.id === lessonId);
  if (!l) return;
  const type  = lt(l.typeId);
  const title = encodeURIComponent((type ? type.name : 'レッスン') + ' — ' + uName(l.instructorId));
  const d     = l.date.replace(/-/g, '');
  const nextD = (() => {
    const dt = new Date(l.date + 'T00:00:00');
    dt.setDate(dt.getDate() + 1);
    return toDateStr(dt.getFullYear(), dt.getMonth()+1, dt.getDate()).replace(/-/g,'');
  })();
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${d}/${nextD}&details=${encodeURIComponent(l.memo||'')}`;
  window.open(url, '_blank');
};

// ── VIEW: PUBLISH LESSON ──────────────────────────────────
function viewPublishLesson(p) {
  const editing    = p.id        ? S.lessons.find(l => l.id === p.id)        : null;
  const duplicating = p.duplicateId ? S.lessons.find(l => l.id === p.duplicateId) : null;
  const template   = editing || duplicating;
  const tempInstructors = S.users.filter(u => u.role === 'temp_instructor');

  if (editing) {
    if (!S.selectingDates.length) S.selectingDates = [editing.date];
  } else {
    S.selectingDates = [];
  }

  const isEditing  = !!editing;
  const calMode    = isEditing ? 'select-single' : 'select-multi';
  const sel        = S.selectingDates;

  const dateDisplayText = isEditing
    ? (sel[0] ? fmtDate(sel[0]) : '日付を選んでください')
    : (sel.length ? sel.slice().sort().map(fmtDate).join('、') : '日付を選んでください（複数選択可）');

  let html = '<div class="page" style="padding-top:16px">';

  // Lesson type
  html += `<div class="form-group">
    <label class="form-label">レッスン種類</label>
    <select class="form-select" id="f-type">
      <option value="">選択してください</option>
      ${S.lessonTypes.map(t => `<option value="${t.id}" ${template && template.typeId===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}
    </select>
  </div>`;

  // Date
  html += `<div class="form-group">
    <label class="form-label">日付${isEditing ? '' : '（複数選択可）'}</label>
    <p id="lesson-date-display" style="font-size:13px;padding:8px 0;color:${sel.length?'var(--black)':'var(--accent)'}">
      ${esc(dateDisplayText)}
    </p>
    <input type="hidden" id="lesson-date-input" value="${esc(sel[0]||'')}">
    <div id="lesson-cal">${renderCalendar(S.calYear, S.calMonth, { mode: calMode, selected: sel })}</div>
  </div>`;

  // Temp instructor
  html += `<div class="form-group">
    <label class="form-label">臨時スタイリスト（任意）</label>
    <select class="form-select" id="f-temp">
      <option value="">なし</option>
      ${tempInstructors.map(t => `<option value="${t.id}" ${template && template.tempInstructorId===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}
    </select>
  </div>`;

  // Capacity
  const capVal = template ? template.capacity : 5;
  html += `<div class="form-group">
    <label class="form-label">定員（最大10名）</label>
    <div class="capacity-display">
      <input type="range" min="1" max="10" value="${capVal}" id="f-cap"
        oninput="document.getElementById('f-cap-val').textContent=this.value">
      <span class="capacity-value" id="f-cap-val">${capVal}</span>
    </div>
  </div>`;

  // Deadline
  html += `<div class="form-group">
    <label class="form-label">申込締切</label>
    <select class="form-select" id="f-deadline">
      ${DEADLINE_OPTS.map(o => `<option value="${o.value}" ${template && template.deadline===o.value?'selected':''}>${o.label}</option>`).join('')}
    </select>
  </div>`;

  // Memo
  html += `<div class="form-group">
    <label class="form-label">メモ</label>
    <textarea class="form-textarea" id="f-memo" placeholder="任意のメモを入力">${esc(template ? template.memo : '')}</textarea>
  </div>`;

  html += `<div style="padding-bottom:32px">
    <button class="btn btn-primary" onclick="submitLesson('${editing ? editing.id : ''}')">
      ${isEditing ? 'UPDATE — 更新する' : 'PUBLISH — 公開する'}
    </button>
  </div></div>`;
  return html;
}

window.submitLesson = async function(editId) {
  const typeId   = document.getElementById('f-type').value;
  const tempId   = document.getElementById('f-temp').value;
  const capacity = parseInt(document.getElementById('f-cap').value);
  const deadline = document.getElementById('f-deadline').value;
  const memo     = document.getElementById('f-memo').value;

  if (!typeId) { toast('レッスン種類を選んでください', 'error'); return; }

  try {
    if (editId) {
      const date = document.getElementById('lesson-date-input').value;
      if (!date) { toast('日付を選んでください', 'error'); return; }
      const body = { typeId, date, capacity, deadline, memo,
        instructorId: S.user.id, storeId: S.user.storeId, tempInstructorId: tempId || null };
      const updated = await api.put(`/lessons/${editId}`, body);
      S.lessons = S.lessons.map(l => l.id === editId ? { ...l, ...updated } : l);
      toast('更新しました', 'success');
    } else {
      const dates = S.selectingDates;
      if (!dates.length) { toast('日付を選んでください', 'error'); return; }
      for (const date of dates) {
        const body = { typeId, date, capacity, deadline, memo,
          instructorId: S.user.id, storeId: S.user.storeId, tempInstructorId: tempId || null };
        const created = await api.post('/lessons', body);
        S.lessons.push(created);
      }
      toast(dates.length > 1 ? `${dates.length}件のレッスンを公開しました` : '公開しました', 'success');
    }
    S.selectingDates = [];
    go('myLessons');
  } catch(e) { toast(e.message, 'error'); }
};

// ── VIEW: MY LESSONS ──────────────────────────────────────
function viewMyLessons() {
  const myLessons = S.lessons
    .filter(l => l.instructorId === S.user.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const y = S.calYear, m = S.calMonth;
  const monthLessons = myLessons.filter(l => {
    const d = new Date(l.date + 'T00:00:00');
    return d.getFullYear() === y && d.getMonth()+1 === m;
  });
  const lessonDates = monthLessons.map(l => l.date);

  let html = '<div class="page">';
  html += `<div>${renderCalendar(y, m, { mode:'view', lessonDates })}</div>`;

  html += `<div style="margin-top:12px">
    <button class="btn btn-primary" style="margin-bottom:16px" onclick="go('publishLesson')">
      ＋ 新規レッスンを公開する
    </button>`;

  if (monthLessons.length === 0) {
    html += `<div class="empty-state"><div class="empty-state-icon">📋</div>
      <p class="empty-state-text">今月のレッスンがありません</p></div>`;
  } else {
    monthLessons.sort((a,b) => a.date.localeCompare(b.date)).forEach(l => {
      html += lessonCard(l, false);
    });
  }
  html += '</div></div>';
  return html;
}

// ── VIEW: STYLIST SCHEDULE ────────────────────────────────
function viewStylistSchedule(p) {
  const stylist = S.users.find(u => u.id === p.userId);
  if (!stylist) return '<div class="page"><p>スタイリストが見つかりません</p></div>';

  const st = S.stores.find(s => s.id === stylist.storeId);
  const allLessons = S.lessons
    .filter(l => l.instructorId === p.userId)
    .sort((a, b) => a.date.localeCompare(b.date));

  const y = S.calYear, m = S.calMonth;
  const monthLessons = allLessons.filter(l => {
    const d = new Date(l.date + 'T00:00:00');
    return d.getFullYear() === y && d.getMonth()+1 === m;
  });
  const lessonDates = [...new Set(allLessons.map(l => l.date))];

  let html = '<div class="page">';
  html += `<div class="card" style="margin-top:16px">
    <div style="font-size:14px;font-weight:300">${esc(stylist.name)}</div>
    <div class="text-xs text-accent" style="margin-top:4px">スタイリスト${st ? '　' + esc(st.name) : ''}</div>
  </div>`;

  html += `<div id="lesson-cal-view">${renderCalendar(y, m, { mode:'view', lessonDates })}</div>`;

  if (monthLessons.length === 0) {
    html += `<div class="empty-state"><div class="empty-state-icon">📅</div>
      <p class="empty-state-text">今月のレッスンがありません</p></div>`;
  } else {
    html += '<div style="margin-top:12px">';
    monthLessons.forEach(l => { html += lessonCard(l, false); });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ── VIEW: ADJUSTMENT LIST ─────────────────────────────────
function viewAdjustmentList() {
  const list = storeFilteredAdjs().sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  let html = '<div class="page" style="padding-top:8px">';
  html += `<button class="btn btn-primary" style="margin:12px 0 16px" onclick="go('createAdjustment')">
    ＋ 新規調整を作成する
  </button>`;

  if (!list.length) {
    html += `<div class="empty-state"><div class="empty-state-icon">🗓</div>
      <p class="empty-state-text">調整がありません</p></div>`;
  } else {
    list.forEach(adj => {
      const inst = u(adj.instructorId);
      const memberCount = (adj.members || []).length;
      const answered = adj.pattern === 'A'
        ? Object.keys(adj.availabilities || {}).length
        : Object.keys(adj.votes || {}).length;
      const adjStore = S.selectedStore === 'all' ? S.stores.find(s => s.id === adj.storeId) : null;
      html += `<div class="card card-tap" onclick="go('adjustmentDetail',{id:'${adj.id}'})">
        <div class="card-header">
          <div>
            <div class="card-title">${esc(adj.title)}</div>
            <div class="card-meta">
              パターン${adj.pattern}　／　${esc(inst ? inst.name : '—')}
              ${adjStore ? `　<span style="color:var(--accent)">${esc(adjStore.name)}</span>` : ''}
            </div>
          </div>
          ${adjStatusTag(adj.status)}
        </div>
        <p class="text-xs text-accent" style="margin-top:6px">
          ${memberCount}名 参加　${answered}/${memberCount} 回答済み
        </p>
      </div>`;
    });
  }
  html += '</div>';
  return html;
}

// ── VIEW: ADJUSTMENT DETAIL ───────────────────────────────
function viewAdjustmentDetail(p) {
  const adj = S.adjustments.find(a => a.id === p.id);
  if (!adj) return '<div class="page"><p>調整が見つかりません</p></div>';

  const inst = u(adj.instructorId);
  const myDates = adj.pattern === 'A'
    ? (adj.availabilities[S.user.id] || [])
    : (adj.votes[S.user.id] || []);
  S.selectingDates = [...myDates];

  const isOwner = S.user && adj.instructorId === S.user.id;

  let html = '<div class="page" style="padding-top:12px">';

  // Info card
  html += `<div class="card">
    <div class="card-header" style="margin-bottom:8px">
      <div class="card-title">${esc(adj.title)}</div>
      ${adjStatusTag(adj.status)}
    </div>
    <div class="card-meta">
      担当: ${esc(inst ? inst.name : '—')}　パターン${adj.pattern}
    </div>
    <div class="participants-row" style="margin-top:10px">
      ${(adj.members||[]).map(id => `<span class="participant-chip">${esc(uName(id))}</span>`).join('')}
    </div>
    ${adj.lessonId ? `<div style="margin-top:10px"><button class="btn btn-sm btn-ghost" onclick="go('lessonDetail',{id:'${adj.lessonId}'})">→ レッスン詳細を見る</button></div>` : ''}
  </div>`;

  if (adj.pattern === 'A') {
    html += adjDetailPatternA(adj);
  } else {
    html += adjDetailPatternB(adj, isOwner);
  }

  // Owner actions: publish / close
  if (isOwner || isAdmin()) {
    html += '<hr class="divider">';
    if (adj.status === 'open') {
      html += `<button class="btn btn-primary" style="margin-bottom:8px" onclick="showPublishAdjModal('${adj.id}')">
        PUBLISH — このレッスンを公開する
      </button>`;
    } else if (adj.status === 'published') {
      html += `<button class="btn" style="margin-bottom:8px" onclick="closeAdjustment('${adj.id}')">
        CLOSE — 申し込みを締め切る
      </button>`;
    }
    html += `<button class="btn btn-danger" onclick="deleteAdj('${adj.id}')">この調整を削除</button>`;
  }
  html += '</div>';
  return html;
}

function adjDetailPatternA(adj) {
  const availMap = buildAvailMap(adj);
  const total    = (adj.members||[]).length;
  const y = S.calYear, m = S.calMonth;

  let html = '';
  // Aggregated view
  html += `<p class="section-label" style="margin-top:4px">集計カレンダー</p>
  <div class="legend">
    <span class="legend-item"><span class="legend-dot" style="background:var(--black)"></span>全員OK</span>
    <span class="legend-item"><span class="legend-dot" style="background:#C0C0BC"></span>一部OK</span>
    <span class="legend-item"><span class="legend-dot" style="background:var(--border)"></span>少数OK</span>
  </div>
  <div id="adj-cal">${renderCalendar(y, m, { mode:'availability', availabilityMap:availMap, totalMembers:total })}</div>`;

  // Input section
  html += `<p class="section-label" style="margin-top:16px">あなたの空き日を入力</p>
  <p class="text-sm text-accent" style="padding:8px 0">参加できる日を選んでください（複数選択可）</p>
  <div id="adj-my-cal">${renderCalendar(y, m, { mode:'select-multi', selected: S.selectingDates })}</div>
  <div style="margin-top:16px">
    <button class="btn btn-primary" onclick="submitAvailability('${adj.id}')">
      SAVE — 空き日を保存
    </button>
  </div>`;

  // Per-member status
  html += `<p class="section-label" style="margin-top:20px">回答状況</p>
  <table class="data-table" style="margin-top:8px">
    <tr><th>名前</th><th>選択日数</th></tr>
    ${(adj.members||[]).map(id => {
      const dates = adj.availabilities[id] || [];
      return `<tr><td>${esc(uName(id))}</td><td>${dates.length ? dates.length + '日' : '<span class="text-accent">未回答</span>'}</td></tr>`;
    }).join('')}
  </table>`;

  return html;
}

function adjDetailPatternB(adj, isOwner) {
  const y = S.calYear, m = S.calMonth;
  const voteMap = {};
  Object.values(adj.votes||{}).forEach(dates => dates.forEach(d => voteMap[d] = (voteMap[d]||0)+1));

  let html = '';

  if (isOwner && (!adj.candidates || !adj.candidates.length)) {
    html += `<p class="section-label" style="margin-top:4px">候補日を設定（スタイリスト）</p>
    <p class="text-sm text-accent" style="padding:8px 0">複数日を選んでください</p>
    <div id="adj-create-cal">${renderCalendar(y, m, { mode:'select-multi', selected: S.selectingDates })}</div>
    <div style="margin-top:16px">
      <button class="btn btn-primary" onclick="submitCandidates('${adj.id}')">
        CONFIRM — 候補日を確定
      </button>
    </div>`;
    return html;
  }

  // Voting view
  html += `<p class="section-label" style="margin-top:4px">候補日に投票</p>
  <p class="text-sm text-accent" style="padding:8px 0">参加できる日をタップしてください</p>
  <div id="adj-cal">${renderCalendar(y, m, {
    mode: 'vote',
    candidates: adj.candidates || [],
    selected: S.selectingDates,
    voteMap,
  })}</div>`;

  // Candidate list
  if (adj.candidates && adj.candidates.length) {
    html += `<p class="section-label" style="margin-top:16px">票数</p>
    <table class="data-table" style="margin-top:8px">
      <tr><th>日付</th><th>票数</th></tr>
      ${[...adj.candidates].sort().map(d => `<tr>
        <td>${fmtShort(d)}</td>
        <td>${voteMap[d]||0} 票</td>
      </tr>`).join('')}
    </table>`;
  }

  html += `<div style="margin-top:16px">
    <button class="btn btn-primary" onclick="submitVote('${adj.id}')">
      VOTE — 投票する
    </button>
  </div>`;

  // Per-member status
  html += `<p class="section-label" style="margin-top:20px">回答状況</p>
  <table class="data-table" style="margin-top:8px">
    <tr><th>名前</th><th>投票日数</th></tr>
    ${(adj.members||[]).map(id => {
      const dates = adj.votes[id] || [];
      return `<tr><td>${esc(uName(id))}</td><td>${dates.length ? dates.length+'日' : '<span class="text-accent">未回答</span>'}</td></tr>`;
    }).join('')}
  </table>`;

  return html;
}

window.submitAvailability = async function(adjId) {
  try {
    const updated = await api.post(`/adjustments/${adjId}/availability`, {
      userId: S.user.id, dates: S.selectingDates,
    });
    S.adjustments = S.adjustments.map(a => a.id === adjId ? updated : a);
    toast('保存しました', 'success');
    replace('adjustmentDetail', { id: adjId });
  } catch(e) { toast(e.message, 'error'); }
};

window.submitCandidates = async function(adjId) {
  if (!S.selectingDates.length) { toast('候補日を選んでください', 'error'); return; }
  try {
    const updated = await api.post(`/adjustments/${adjId}/candidates`, { dates: S.selectingDates });
    S.adjustments = S.adjustments.map(a => a.id === adjId ? updated : a);
    S.selectingDates = [];
    toast('候補日を設定しました', 'success');
    replace('adjustmentDetail', { id: adjId });
  } catch(e) { toast(e.message, 'error'); }
};

window.submitVote = async function(adjId) {
  try {
    const updated = await api.post(`/adjustments/${adjId}/vote`, {
      userId: S.user.id, dates: S.selectingDates,
    });
    S.adjustments = S.adjustments.map(a => a.id === adjId ? updated : a);
    toast('投票しました', 'success');
    replace('adjustmentDetail', { id: adjId });
  } catch(e) { toast(e.message, 'error'); }
};

window.deleteAdj = async function(adjId) {
  if (!confirm('この調整を削除しますか？')) return;
  try {
    await api.del(`/adjustments/${adjId}`);
    S.adjustments = S.adjustments.filter(a => a.id !== adjId);
    toast('削除しました');
    goBack();
  } catch(e) { toast(e.message, 'error'); }
};

// ── ADJUSTMENT STATUS HELPERS ─────────────────────────────
function adjStatusTag(status) {
  const map = {
    open:      { label: '調整中',  cls: 'tag-dark'    },
    published: { label: '公開中',  cls: 'tag-success'  },
    closed:    { label: '締切済み', cls: ''             },
  };
  const s = map[status] || { label: status, cls: '' };
  return `<span class="tag ${s.cls}">${s.label}</span>`;
}

// ── PUBLISH ADJUSTMENT ────────────────────────────────────
window.showPublishAdjModal = function(adjId) {
  const adj = S.adjustments.find(a => a.id === adjId);
  if (!adj) return;

  // Build suggestions from votes (B) or availabilities (A)
  let suggestions = [];
  if (adj.pattern === 'B') {
    const voteMap = {};
    Object.values(adj.votes||{}).forEach(ds => ds.forEach(d => voteMap[d] = (voteMap[d]||0)+1));
    suggestions = Object.entries(voteMap).sort((a,b)=>b[1]-a[1]).slice(0,3)
      .map(([d,c]) => ({ date: d, count: c, label: `${fmtShort(d)}（${c}票）` }));
  } else {
    const amap = buildAvailMap(adj);
    const total = (adj.members||[]).length;
    suggestions = Object.entries(amap).sort((a,b)=>b[1]-a[1]).slice(0,3)
      .map(([d,c]) => ({ date: d, count: c, label: `${fmtShort(d)}（${c}/${total}人）` }));
  }

  const sugHtml = suggestions.length ? `
    <p class="text-xs text-accent" style="margin-bottom:6px">おすすめ日程</p>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
      ${suggestions.map(s =>
        `<button class="btn btn-sm btn-ghost" onclick="document.getElementById('pub-date').value='${s.date}'">${esc(s.label)}</button>`
      ).join('')}
    </div>` : '';

  const defaultCap = Math.min((adj.members||[]).length || 5, 10);

  const html = `<div class="modal-overlay" onclick="if(event.target===this)this.remove()">
    <div class="modal">
      <p class="modal-title">合同レッスンを公開</p>
      ${sugHtml}
      <div class="form-group">
        <label class="form-label">確定日</label>
        <input type="date" class="form-input" id="pub-date" value="${suggestions[0]?.date||''}">
      </div>
      <div class="form-group">
        <label class="form-label">レッスン種類</label>
        <select class="form-select" id="pub-type">
          <option value="">選択してください</option>
          ${S.lessonTypes.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">定員</label>
        <input type="number" class="form-input" id="pub-cap" min="1" max="10" value="${defaultCap}">
      </div>
      <div class="form-group">
        <label class="form-label">申込締切</label>
        <select class="form-select" id="pub-deadline">
          ${DEADLINE_OPTS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
        <button class="btn btn-primary" onclick="publishAdjustment('${adjId}',this.closest('.modal-overlay'))">
          PUBLISH — 公開する
        </button>
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">キャンセル</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.publishAdjustment = async function(adjId, modal) {
  const date     = document.getElementById('pub-date').value;
  const typeId   = document.getElementById('pub-type').value;
  const capacity = parseInt(document.getElementById('pub-cap').value) || 5;
  const deadline = document.getElementById('pub-deadline').value;

  if (!date)   { toast('日付を入力してください', 'error'); return; }
  if (!typeId) { toast('レッスン種類を選んでください', 'error'); return; }

  const adj = S.adjustments.find(a => a.id === adjId);
  if (!adj) return;

  try {
    const lesson = await api.post('/lessons', {
      typeId, date, capacity, deadline,
      instructorId: adj.instructorId,
      storeId: adj.storeId,
      tempInstructorId: null,
      memo: adj.title,
      adjId: adjId,
    });
    S.lessons.push(lesson);

    const updatedAdj = await api.put(`/adjustments/${adjId}`, {
      status: 'published',
      lessonId: lesson.id,
    });
    S.adjustments = S.adjustments.map(a => a.id === adjId ? updatedAdj : a);

    modal.remove();
    toast('公開しました', 'success');
    replace('adjustmentDetail', { id: adjId });
  } catch(e) { toast(e.message, 'error'); }
};

window.closeAdjustment = async function(adjId) {
  if (!confirm('申し込みを締め切りますか？')) return;
  try {
    const updated = await api.put(`/adjustments/${adjId}`, { status: 'closed' });
    S.adjustments = S.adjustments.map(a => a.id === adjId ? updated : a);
    toast('締め切りました');
    replace('adjustmentDetail', { id: adjId });
  } catch(e) { toast(e.message, 'error'); }
};

// ── VIEW: CREATE ADJUSTMENT ───────────────────────────────
function viewCreateAdjustment() {
  S.selectingDates = [];
  const instructors = S.users.filter(u => isInstructor(u));
  const y = S.calYear, m = S.calMonth;

  let html = '<div class="page" style="padding-top:16px">';

  html += `<div class="form-group">
    <label class="form-label">タイトル</label>
    <input type="text" class="form-input" id="adj-title" placeholder="例: 3月合同レッスン調整">
  </div>`;

  html += `<div class="form-group">
    <label class="form-label">パターン</label>
    <div class="pattern-options" id="pattern-opts">
      <div class="pattern-card selected" data-pattern="A" onclick="selectPattern('A')">
        <div class="pattern-card-letter">A</div>
        <div class="pattern-card-desc">みんなで調整<br>各自が空き日を入力</div>
      </div>
      <div class="pattern-card" data-pattern="B" onclick="selectPattern('B')">
        <div class="pattern-card-letter">B</div>
        <div class="pattern-card-desc">スタイリストが候補を提示<br>アシスタントが投票</div>
      </div>
    </div>
    <input type="hidden" id="adj-pattern" value="A">
  </div>`;

  html += `<div class="form-group">
    <label class="form-label">担当スタイリスト</label>
    <select class="form-select" id="adj-instructor">
      ${instructors.map(i => `<option value="${i.id}" ${S.user && S.user.id===i.id?'selected':''}>${esc(i.name)}</option>`).join('')}
    </select>
  </div>`;

  // Member selection
  html += `<div class="form-group">
    <label class="form-label">参加メンバー</label>
    <ul class="check-list" id="member-list">
      ${sortByFurigana(S.users).map(u => `<li class="check-item" onclick="toggleMember(this,'${u.id}')">
        <span class="check-box ${S.user && u.id===S.user.id?'checked':''}" id="m-${u.id}"></span>
        <span>
          <span class="check-label">${esc(u.name)}</span>
          <span class="check-sub">${ROLE_LABELS[u.role]||u.role}</span>
        </span>
      </li>`).join('')}
    </ul>
  </div>`;

  // Pattern B: candidate dates (shown after creation)
  html += `<div id="adj-candidates-section" style="display:none" class="form-group">
    <label class="form-label">候補日を選択（パターンB）</label>
    <div id="adj-create-cal">${renderCalendar(y, m, { mode:'select-multi', selected:[] })}</div>
  </div>`;

  html += `<div style="padding-bottom:32px">
    <button class="btn btn-primary" onclick="submitCreateAdj()">
      CREATE — 調整を作成
    </button>
  </div></div>`;
  return html;
}

window.selectPattern = function(p) {
  document.getElementById('adj-pattern').value = p;
  document.querySelectorAll('.pattern-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.pattern === p);
  });
  const candSec = document.getElementById('adj-candidates-section');
  if (candSec) candSec.style.display = p === 'B' ? '' : 'none';
};

window.toggleMember = function(el, userId) {
  const box = el.querySelector('.check-box');
  box.classList.toggle('checked');
};

window.submitCreateAdj = async function() {
  const title = document.getElementById('adj-title').value.trim();
  const pattern = document.getElementById('adj-pattern').value;
  const instructorId = document.getElementById('adj-instructor').value;
  const members = [...document.querySelectorAll('#member-list .check-box.checked')]
    .map(el => el.id.replace('m-',''));

  if (!title)       { toast('タイトルを入力してください', 'error'); return; }
  if (!members.length) { toast('メンバーを選択してください', 'error'); return; }

  try {
    const body = {
      title, pattern, instructorId,
      members,
      storeId: S.user.storeId,
    };
    if (pattern === 'B' && S.selectingDates.length) {
      body.candidates = S.selectingDates;
    }
    const created = await api.post('/adjustments', body);
    S.adjustments.push(created);
    S.selectingDates = [];
    toast('作成しました', 'success');
    go('adjustmentDetail', { id: created.id });
  } catch(e) { toast(e.message, 'error'); }
};

// ── VIEW: ADMIN AUTH ──────────────────────────────────────
function viewAdminAuth() {
  const roleLabel = isSuperAdmin() ? '全体管理者' : '店舗管理者';
  const errorHtml = S.adminAuthError
    ? `<p style="color:#c0392b;font-size:12px;margin-top:8px;text-align:center">${esc(S.adminAuthError)}</p>`
    : '';
  return `
    <div class="page" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh">
      <div class="card" style="width:100%;max-width:360px">
        <p style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--accent);text-align:center;margin-bottom:20px">Admin Access</p>
        <p style="font-size:13px;font-weight:300;text-align:center;margin-bottom:24px">${esc(roleLabel)}のパスワードを入力してください</p>
        <input id="admin-pw-input" type="password" class="form-input" placeholder="パスワード"
          onkeydown="if(event.key==='Enter')submitAdminPassword()"
          style="text-align:center;letter-spacing:0.15em" />
        ${errorHtml}
        <button class="btn btn-primary w-full" style="margin-top:20px" onclick="submitAdminPassword()">
          認証する
        </button>
      </div>
    </div>`;
}

window.submitAdminPassword = async function() {
  const input = document.getElementById('admin-pw-input');
  if (!input) return;
  const password = input.value.trim();
  if (!password) { S.adminAuthError = 'パスワードを入力してください'; replace('admin'); return; }
  try {
    await api.post('/admin/auth', { password, adminRole: S.user.adminRole });
    S.adminAuthed = true;
    S.adminAuthError = '';
    replace('admin');
  } catch(e) {
    S.adminAuthError = e.message;
    replace('admin');
  }
};

// ── VIEW: ADMIN ────────────────────────────────────────────
function viewAdmin() {
  const baseTabs = ['レッスン', '集計', 'スタッフ', '種類'];
  const tabs = isSuperAdmin() ? [...baseTabs, '店舗'] : baseTabs;
  const t = S.adminTab;

  let content = '';
  if (t === 0) content = adminTabLessons();
  else if (t === 1) content = adminTabStats();
  else if (t === 2) content = adminTabStaff();
  else if (t === 3) content = adminTabTypes();
  else if (t === 4 && isSuperAdmin()) content = adminTabStores();

  return `
    <div class="admin-tabs">
      ${tabs.map((tab, i) => `<button class="admin-tab ${t===i?'active':''}" onclick="setAdminTab(${i})">${tab}</button>`).join('')}
    </div>
    <div class="page" style="padding-top:16px">${content}</div>`;
}

window.setAdminTab = function(i) {
  S.adminTab = i;
  replace('admin');
};

function adminTabLessons() {
  const showStoreName = S.selectedStore === 'all';
  const sorted = [...storeFilteredLessons()].sort((a,b) => b.date.localeCompare(a.date));
  if (!sorted.length) return `<div class="empty-state"><div class="empty-state-icon">📋</div><p class="empty-state-text">レッスンがありません</p></div>`;
  return sorted.map(l => {
    const type     = lt(l.typeId);
    const inst     = u(l.instructorId);
    const lStore   = S.stores.find(s => s.id === l.storeId);
    const parts    = l.participants.map(id => {
      const pu = u(id);
      const isOther = pu && pu.storeId !== l.storeId;
      return `<span class="participant-chip" title="${isOther ? '他店舗' : ''}">${esc(uName(id))}${isOther ? '<span style="color:var(--accent);font-size:9px"> 他</span>' : ''}</span>`;
    });
    const isJoint  = !!l.adjId;
    return `<div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">
            ${esc(type ? type.name : '—')}
            ${isJoint ? '<span class="tag tag-dark" style="font-size:8px;vertical-align:middle;margin-left:6px">合同</span>' : ''}
          </div>
          <div class="card-meta">
            ${fmtShort(l.date)}　${esc(inst ? inst.name : '—')}
            ${showStoreName && lStore ? `　<span style="color:var(--accent)">${esc(lStore.name)}</span>` : ''}
          </div>
        </div>
        <span class="tag">${l.participants.length}/${l.capacity}名</span>
      </div>
      ${parts.length ? `<div class="participants-row">${parts.join('')}</div>` : '<p class="text-xs text-accent">アシスタントなし</p>'}
    </div>`;
  }).join('');
}

function adminTabStats() {
  const lessons = storeFilteredLessons();
  const total   = lessons.length;
  const totalP  = lessons.reduce((s, l) => s + l.participants.length, 0);

  // Count cross-store participants
  let crossStoreCount = 0;
  const instMap = {};
  const partMap = {};
  const partCrossMap = {};  // tracks if participant is from another store
  lessons.forEach(l => {
    instMap[l.instructorId] = instMap[l.instructorId] || { lessons: 0, participants: 0 };
    instMap[l.instructorId].lessons++;
    instMap[l.instructorId].participants += l.participants.length;
    l.participants.forEach(id => {
      partMap[id] = (partMap[id]||0)+1;
      const pu = u(id);
      if (pu && pu.storeId !== l.storeId) {
        crossStoreCount++;
        partCrossMap[id] = true;
      }
    });
  });

  const filterLabel = S.selectedStore === 'all'
    ? '全店舗'
    : (S.stores.find(s => s.id === S.selectedStore)?.name || '');

  let html = `<p class="text-xs text-accent" style="margin-bottom:12px;letter-spacing:0.1em">${filterLabel}</p>`;
  html += `<div class="stat-grid">
    <div class="stat-card"><div class="stat-number">${total}</div><div class="stat-label">公開レッスン数</div></div>
    <div class="stat-card"><div class="stat-number">${totalP}</div><div class="stat-label">総参加人数</div></div>
  </div>`;

  if (crossStoreCount > 0) {
    html += `<p class="text-xs text-accent" style="margin-bottom:16px">うち他店舗からの参加: ${crossStoreCount}件</p>`;
  }

  html += `<p class="section-label" style="margin-bottom:12px">スタイリスト別レッスン</p>
  <table class="data-table">
    <tr><th>スタイリスト</th><th>回数</th><th>参加人数</th></tr>
    ${Object.entries(instMap).sort((a,b) => b[1].lessons-a[1].lessons).map(([id,v]) =>
      `<tr><td>${esc(uName(id))}</td><td>${v.lessons}</td><td>${v.participants}</td></tr>`
    ).join('')}
  </table>`;

  html += `<p class="section-label" style="margin:20px 0 12px">アシスタント別レッスン数</p>
  <table class="data-table">
    <tr><th>名前</th><th>参加回数</th></tr>
    ${Object.entries(partMap).sort((a,b) => b[1]-a[1]).map(([id,cnt]) => {
      const isOther = partCrossMap[id];
      return `<tr><td>${esc(uName(id))}${isOther ? ' <span class="tag" style="font-size:8px;vertical-align:middle">他店舗</span>' : ''}</td><td>${cnt}</td></tr>`;
    }).join('')}
  </table>`;

  return html;
}

function adminTabStaff() {
  const stores = S.stores;
  let html = `<div style="margin-bottom:16px">
    <button class="btn btn-primary" onclick="showStaffModal()">＋ スタッフを追加</button>
  </div>`;

  const grouped = {};
  S.users.forEach(u => {
    if (!grouped[u.role]) grouped[u.role] = [];
    grouped[u.role].push(u);
  });

  ['instructor','temp_instructor','participant'].forEach(role => {
    if (!grouped[role]) return;
    html += `<p class="section-label" style="margin-bottom:0">${ROLE_LABELS[role]}</p>`;
    sortByFurigana(grouped[role]).forEach(user => {
      const st = stores.find(s => s.id === user.storeId);
      html += `<div class="card" style="margin-top:0;border-top:none">
        <div class="flex-between">
          <div>
            <div style="font-size:13px;font-weight:300">${esc(user.name)}</div>
            <div class="text-xs text-accent" style="margin-top:2px">
              ${user.furigana ? esc(user.furigana) + '　' : ''}${st ? esc(st.name) : '—'}
              ${user.adminRole ? `　<span class="tag tag-dark">${ADMIN_LABELS[user.adminRole]||user.adminRole}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-ghost" onclick="showStaffModal('${user.id}')">編集</button>
            <button class="btn btn-sm btn-danger" onclick="deleteStaff('${user.id}')">削除</button>
          </div>
        </div>
      </div>`;
    });
  });
  return html;
}

window.showStaffModal = function(userId) {
  const user = userId ? S.users.find(u => u.id === userId) : null;
  const html = `<div class="modal-overlay" onclick="if(event.target===this)this.remove()">
    <div class="modal">
      <p class="modal-title">${user ? 'スタッフ編集' : 'スタッフ追加'}</p>
      <div class="form-group">
        <label class="form-label">名前</label>
        <input class="form-input" id="sf-name" value="${esc(user ? user.name : '')}">
      </div>
      <div class="form-group">
        <label class="form-label">ふりがな</label>
        <input class="form-input" id="sf-furigana" value="${esc(user ? user.furigana || '' : '')}" placeholder="例: やまだ はなこ">
      </div>
      <div class="form-group">
        <label class="form-label">役割</label>
        <select class="form-select" id="sf-role">
          ${Object.entries(ROLE_LABELS).map(([v,l]) =>
            `<option value="${v}" ${user && user.role===v?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">店舗</label>
        <select class="form-select" id="sf-store">
          ${S.stores.map(s => `<option value="${s.id}" ${user && user.storeId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">管理権限</label>
        <select class="form-select" id="sf-admin">
          <option value="" ${!user || !user.adminRole?'selected':''}>なし</option>
          <option value="store_admin" ${user && user.adminRole==='store_admin'?'selected':''}>店舗管理者</option>
          <option value="super_admin" ${user && user.adminRole==='super_admin'?'selected':''}>全体管理者</option>
        </select>
      </div>
      <button class="btn btn-primary" onclick="saveStaff('${userId||''}',this.closest('.modal-overlay'))">
        ${user ? 'UPDATE' : 'ADD'} — ${user ? '更新' : '追加'}する
      </button>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.saveStaff = async function(userId, modal) {
  const name     = document.getElementById('sf-name').value.trim();
  const furigana = document.getElementById('sf-furigana').value.trim();
  const role     = document.getElementById('sf-role').value;
  const storeId  = document.getElementById('sf-store').value;
  const adminRole = document.getElementById('sf-admin').value || null;

  if (!name) { toast('名前を入力してください', 'error'); return; }

  try {
    const body = { name, furigana: furigana || null, role, storeId, adminRole };
    if (userId) {
      const updated = await api.put(`/users/${userId}`, body);
      S.users = S.users.map(u => u.id === userId ? updated : u);
      toast('更新しました', 'success');
    } else {
      const created = await api.post('/users', body);
      S.users.push(created);
      toast('追加しました', 'success');
    }
    modal.remove();
    replace('admin');
  } catch(e) { toast(e.message, 'error'); }
};

window.deleteStaff = async function(userId) {
  if (!confirm('このスタッフを削除しますか？')) return;
  try {
    await api.del(`/users/${userId}`);
    S.users = S.users.filter(u => u.id !== userId);
    toast('削除しました');
    replace('admin');
  } catch(e) { toast(e.message, 'error'); }
};

function adminTabTypes() {
  let html = `<div style="margin-bottom:16px">
    <button class="btn btn-primary" onclick="showTypeModal()">＋ 種類を追加</button>
  </div>`;

  if (!S.lessonTypes.length) {
    html += `<div class="empty-state"><div class="empty-state-icon">📝</div><p class="empty-state-text">種類がありません</p></div>`;
    return html;
  }

  S.lessonTypes.forEach(t => {
    html += `<div class="card">
      <div class="flex-between">
        <div>
          <div style="font-size:13px;font-weight:300">${esc(t.name)}</div>
          <div class="text-xs text-accent" style="margin-top:4px">
            ${esc(t.format)}　${t.duration}分　<span class="tag">${esc(t.level)}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-ghost" onclick="showTypeModal('${t.id}')">編集</button>
          <button class="btn btn-sm btn-danger" onclick="deleteType('${t.id}')">削除</button>
        </div>
      </div>
    </div>`;
  });
  return html;
}

window.showTypeModal = function(typeId) {
  const type = typeId ? S.lessonTypes.find(t => t.id === typeId) : null;
  const html = `<div class="modal-overlay" onclick="if(event.target===this)this.remove()">
    <div class="modal">
      <p class="modal-title">${type ? 'レッスン種類 編集' : 'レッスン種類 追加'}</p>
      <div class="form-group">
        <label class="form-label">レッスン名</label>
        <input class="form-input" id="lt-name" value="${esc(type ? type.name : '')}">
      </div>
      <div class="form-group">
        <label class="form-label">形式</label>
        <select class="form-select" id="lt-format">
          ${FORMAT_OPTS.map(f => `<option ${type && type.format===f?'selected':''}>${f}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">所要時間（分）</label>
        <input type="number" class="form-input" id="lt-duration" value="${type ? type.duration : 60}" min="15" step="15">
      </div>
      <div class="form-group">
        <label class="form-label">レベル</label>
        <select class="form-select" id="lt-level">
          ${LEVEL_OPTS.map(l => `<option ${type && type.level===l?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" onclick="saveType('${typeId||''}',this.closest('.modal-overlay'))">
        ${type ? 'UPDATE' : 'ADD'} — ${type ? '更新' : '追加'}する
      </button>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.saveType = async function(typeId, modal) {
  const name     = document.getElementById('lt-name').value.trim();
  const format   = document.getElementById('lt-format').value;
  const duration = parseInt(document.getElementById('lt-duration').value);
  const level    = document.getElementById('lt-level').value;

  if (!name) { toast('レッスン名を入力してください', 'error'); return; }

  try {
    const body = { name, format, duration, level };
    if (typeId) {
      const updated = await api.put(`/lesson-types/${typeId}`, body);
      S.lessonTypes = S.lessonTypes.map(t => t.id === typeId ? updated : t);
      toast('更新しました', 'success');
    } else {
      const created = await api.post('/lesson-types', body);
      S.lessonTypes.push(created);
      toast('追加しました', 'success');
    }
    modal.remove();
    replace('admin');
  } catch(e) { toast(e.message, 'error'); }
};

window.deleteType = async function(typeId) {
  if (!confirm('このレッスン種類を削除しますか？')) return;
  try {
    await api.del(`/lesson-types/${typeId}`);
    S.lessonTypes = S.lessonTypes.filter(t => t.id !== typeId);
    toast('削除しました');
    replace('admin');
  } catch(e) { toast(e.message, 'error'); }
};

// ── ADMIN: STORES TAB ────────────────────────────────────
function adminTabStores() {
  let html = `<div style="margin-bottom:16px">
    <button class="btn btn-primary" onclick="showStoreModal()">＋ 店舗を追加</button>
  </div>`;

  if (!S.stores.length) {
    return html + `<div class="empty-state"><div class="empty-state-icon">🏪</div><p class="empty-state-text">店舗がありません</p></div>`;
  }

  S.stores.forEach(st => {
    const staffCount = S.users.filter(u => u.storeId === st.id).length;
    html += `<div class="card">
      <div class="flex-between">
        <div>
          <div style="font-size:13px;font-weight:300">${esc(st.name)}</div>
          <div class="text-xs text-accent" style="margin-top:3px">
            ${esc(st.area||'')}${st.address ? '　' + esc(st.address) : ''}
            　スタッフ ${staffCount}名
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-ghost" onclick="showStoreModal('${st.id}')">編集</button>
          <button class="btn btn-sm btn-danger" onclick="deleteStoreItem('${st.id}')">削除</button>
        </div>
      </div>
    </div>`;
  });
  return html;
}

window.showStoreModal = function(storeId) {
  const st = storeId ? S.stores.find(s => s.id === storeId) : null;
  const html = `<div class="modal-overlay" onclick="if(event.target===this)this.remove()">
    <div class="modal">
      <p class="modal-title">${st ? '店舗 編集' : '店舗 追加'}</p>
      <div class="form-group">
        <label class="form-label">店舗名</label>
        <input class="form-input" id="st-name" value="${esc(st ? st.name : '')}">
      </div>
      <div class="form-group">
        <label class="form-label">エリア</label>
        <input class="form-input" id="st-area" value="${esc(st ? st.area||'' : '')}" placeholder="例: 東京・渋谷">
      </div>
      <div class="form-group">
        <label class="form-label">住所（任意）</label>
        <input class="form-input" id="st-address" value="${esc(st ? st.address||'' : '')}" placeholder="例: 東京都渋谷区...">
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
        <button class="btn btn-primary" onclick="saveStoreItem('${storeId||''}',this.closest('.modal-overlay'))">
          ${st ? 'UPDATE' : 'ADD'} — ${st ? '更新' : '追加'}する
        </button>
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">キャンセル</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.saveStoreItem = async function(storeId, modal) {
  const name    = document.getElementById('st-name').value.trim();
  const area    = document.getElementById('st-area').value.trim();
  const address = document.getElementById('st-address').value.trim();

  if (!name) { toast('店舗名を入力してください', 'error'); return; }

  try {
    const body = { name, area, address };
    if (storeId) {
      const updated = await api.put(`/stores/${storeId}`, body);
      S.stores = S.stores.map(s => s.id === storeId ? updated : s);
      toast('更新しました', 'success');
    } else {
      const created = await api.post('/stores', body);
      S.stores.push(created);
      toast('追加しました', 'success');
    }
    modal.remove();
    replace('admin');
  } catch(e) { toast(e.message, 'error'); }
};

window.deleteStoreItem = async function(storeId) {
  const staffCount = S.users.filter(u => u.storeId === storeId).length;
  const msg = staffCount > 0
    ? `この店舗には${staffCount}名のスタッフが所属しています。削除しますか？`
    : 'この店舗を削除しますか？';
  if (!confirm(msg)) return;
  try {
    await api.del(`/stores/${storeId}`);
    S.stores = S.stores.filter(s => s.id !== storeId);
    toast('削除しました');
    replace('admin');
  } catch(e) { toast(e.message, 'error'); }
};

// ── INIT ──────────────────────────────────────────────────
(async () => {
  try {
    await loadAll();
    S.view = 'storeSelect';
    S.viewParams = {};
    paint();
  } catch(e) {
    document.getElementById('app').innerHTML =
      `<div style="padding:40px;text-align:center;color:#B04040">
        <p>サーバーに接続できません</p>
        <p style="font-size:12px;margin-top:8px">${esc(e.message)}</p>
      </div>`;
  }
})();
