// =========================================
// LIFEOS – MAIN APP JAVASCRIPT
// app.js
// =========================================


// ----- 1. Live Clock & Date -----
function updateClock() {
  const now     = new Date();
  const hours   = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;
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


// ----- 3. Quick Stats (Dashboard only) -----
// Wait for auth before loading any data
async function loadQuickStats() {
  await window.authReady;

  // Tasks Today
  const todos      = await lifeOSLoad('lifeos_todos', []);
  const today      = new Date().toDateString();
  const todayCount = todos.filter(t => !t.done && t.date === today).length;
  const statTasks  = document.getElementById('statTasks');
  if (statTasks) statTasks.textContent = todayCount || '0';

  // Notes Saved
  const notes     = await lifeOSLoad('lifeos_notes', []);
  const statNotes = document.getElementById('statNotes');
  if (statNotes) statNotes.textContent = notes.length || '0';

  // Habits Done Today
  const habits     = await lifeOSLoad('lifeos_habits', []);
  const doneHabits = habits.filter(h => h.doneToday).length;
  const statHabits = document.getElementById('statHabits');
  if (statHabits) statHabits.textContent = doneHabits || '0';

  // Days to Next Exam
  const exams    = await lifeOSLoad('lifeos_exams', []);
  const statExam = document.getElementById('statExam');
  if (statExam) {
    if (exams.length === 0) {
      statExam.textContent = '–';
    } else {
      const nowMs    = Date.now();
      const upcoming = exams
        .map(e => ({ ...e, ms: new Date(e.date).getTime() }))
        .filter(e => e.ms >= nowMs)
        .sort((a, b) => a.ms - b.ms);
      statExam.textContent = upcoming.length === 0
        ? '–'
        : Math.ceil((upcoming[0].ms - nowMs) / (1000 * 60 * 60 * 24));
    }
  }

  // Animate numbers
  ['statTasks','statNotes','statHabits','statExam'].forEach(id => {
    const el = document.getElementById(id);
    if (el) animateStat(el);
  });
}

if (document.getElementById('statTasks')) {
  loadQuickStats();
}


// ----- 4. Active Nav Link -----
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


// ----- 5. Stat number count-up animation -----
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
