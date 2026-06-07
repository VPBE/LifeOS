// =========================================
// LIFEOS – MAIN APP JAVASCRIPT
// app.js
// =========================================


// ----- 1. Live Clock & Date -----
function updateClock() {
  const now     = new Date();
  const h       = now.getHours();
  const hours   = String(h % 12 || 12).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm    = h < 12 ? 'AM' : 'PM';
  const timeStr = `${hours}:${minutes} ${ampm}`;
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const timeEl = document.getElementById('currentTime');
  const dateEl = document.getElementById('currentDate');
  if (timeEl) timeEl.textContent = timeStr;
  if (dateEl) dateEl.textContent = dateStr;
}
updateClock();
setInterval(updateClock, 1000);


// ----- 2. Mobile Sidebar Toggle -----
const hamburgerBtn = document.getElementById('hamburgerBtn');
const sidebar      = document.getElementById('sidebar');
const overlay      = document.getElementById('overlay');

function openSidebar() {
  sidebar.classList.add('open');
  overlay.style.display = 'block';
  requestAnimationFrame(() => overlay.classList.add('active'));
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
  overlay.addEventListener('transitionend', () => {
    overlay.style.display = 'none';
  }, { once: true });
  document.body.style.overflow = '';
}

if (hamburgerBtn) {
  hamburgerBtn.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
}
if (overlay) overlay.addEventListener('click', closeSidebar);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) closeSidebar();
});
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => { if (window.innerWidth <= 640) closeSidebar(); });
});


// ----- 3. Widget data loaders -----
const WIDGET_LOADERS = {
  async tasks() {
    const todos = await lifeOSLoad('lifeos_todos', []);
    const today = new Date().toDateString();
    return { value: todos.filter(t => !t.done && t.date === today).length };
  },
  async notes() {
    const notes = await lifeOSLoad('lifeos_notes', []);
    return { value: notes.length };
  },
  async habits() {
    const habits = await lifeOSLoad('lifeos_habits', []);
    return { value: habits.filter(h => h.doneToday).length };
  },
  async exam() {
    const exams = await lifeOSLoad('lifeos_exams', []);
    if (!exams.length) return { value: '–', raw: null };
    const nowMs    = Date.now();
    const upcoming = exams
      .map(e => ({ ...e, ms: new Date(e.date).getTime() }))
      .filter(e => e.ms >= nowMs)
      .sort((a, b) => a.ms - b.ms);
    const val = upcoming.length === 0
      ? '–'
      : Math.ceil((upcoming[0].ms - nowMs) / (1000 * 60 * 60 * 24));
    return { value: val };
  },
  async finance() {
    const income   = await lifeOSLoad('lifeos_finance_income',   []);
    const expenses = await lifeOSLoad('lifeos_finance_expenses', []);
    const totalInc = income.reduce((s, t)   => s + Number(t.amount), 0);
    const totalExp = expenses.reduce((s, t) => s + Number(t.amount), 0);
    const net      = totalInc - totalExp;
    const sign     = net >= 0 ? '+' : '-';
    return { value: sign + '₱' + Math.abs(net).toLocaleString(), raw: net, noAnimate: true };
  },
  async streak() {
    const sessions = await lifeOSLoad('lifeos_pomodoro_sessions', []);
    // count consecutive days with at least 1 session
    const daySet = new Set(sessions.map(s => new Date(s.date || s.startedAt || 0).toDateString()));
    let streak = 0, d = new Date();
    while (daySet.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
    return { value: streak };
  },
  async pomodoro() {
    const sessions = await lifeOSLoad('lifeos_pomodoro_sessions', []);
    const today    = new Date().toDateString();
    const count    = sessions.filter(s => new Date(s.date || s.startedAt || 0).toDateString() === today).length;
    return { value: count };
  },
  async mood() {
    const logs = await lifeOSLoad('lifeos_mood', []);
    const today = new Date().toDateString();
    const todayLog = logs.find(m => new Date(m.date).toDateString() === today);
    const MOOD_EMOJIS = { 1:'😞', 2:'😕', 3:'😐', 4:'🙂', 5:'😄' };
    return { value: todayLog ? (MOOD_EMOJIS[todayLog.score] || todayLog.score) : '–', noAnimate: true };
  },
};

// Mapping: widget key → stat element id
const WIDGET_EL = {
  tasks:    'statTasks',
  notes:    'statNotes',
  habits:   'statHabits',
  exam:     'statExam',
  finance:  'statFinance',
  streak:   'statStreak',
  pomodoro: 'statPomodoro',
  mood:     'statMood',
};

// ----- 4. Apply widget visibility from prefs -----
async function applyWidgetVisibility() {
  const prefs = await lifeOSLoad('lifeos_prefs', null);
  const statsRow = document.getElementById('statsRow');
  if (!statsRow) return;

  // Default order/enabled if no prefs saved
  const defaultWidgets = [
    { key:'tasks',    enabled:true  },
    { key:'notes',    enabled:true  },
    { key:'habits',   enabled:true  },
    { key:'exam',     enabled:true  },
    { key:'finance',  enabled:false },
    { key:'streak',   enabled:false },
    { key:'pomodoro', enabled:false },
    { key:'mood',     enabled:false },
  ];

  const widgets = (prefs && prefs.widgets) ? prefs.widgets : defaultWidgets;

  // Reorder cards to match saved order, show/hide based on enabled
  widgets.forEach(({ key, enabled }) => {
    const card = statsRow.querySelector(`[data-widget="${key}"]`);
    if (!card) return;
    card.style.display = enabled ? '' : 'none';
    if (enabled) statsRow.appendChild(card); // move to end = preserve order
  });
}

// ----- 5. Load data for visible widgets only -----
async function loadQuickStats() {
  await window.authReady;
  await applyWidgetVisibility();

  const statsRow = document.getElementById('statsRow');
  if (!statsRow) return;

  const visibleCards = statsRow.querySelectorAll('.stat-card[data-widget]:not([style*="display:none"]):not([style*="display: none"])');

  for (const card of visibleCards) {
    const key = card.dataset.widget;
    const loader = WIDGET_LOADERS[key];
    const elId   = WIDGET_EL[key];
    const el     = document.getElementById(elId);
    if (!loader || !el) continue;
    try {
      const { value, noAnimate } = await loader();
      el.textContent = value;
      if (!noAnimate) animateStat(el);
    } catch (_) {
      el.textContent = '–';
    }
  }
}

if (document.getElementById('statsRow')) {
  loadQuickStats();
}


// ----- 6. Active Nav Link -----
function setActiveNav() {
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    const href = item.getAttribute('href');
    if (href && currentPath.endsWith(href.replace('./', '').replace('../', ''))) {
      item.classList.add('active');
    }
  });
}
setActiveNav();


// ----- 7. Stat number count-up animation -----
function animateStat(el) {
  const target = parseInt(el.textContent, 10);
  if (isNaN(target) || target === 0) return;
  let current = 0;
  const step  = Math.max(1, Math.floor(target / 20));
  const timer = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(timer); }
    el.textContent = current;
  }, 40);
}
