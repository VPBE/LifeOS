// =========================================
// LIFEOS – MAIN APP JAVASCRIPT
// app.js
// =========================================

// ----- 1. Live Clock & Date -----
// Updates the time and date displays every second

function updateClock() {
  const now = new Date();

  // Format time as HH:MM (24-hour)
  const hours   = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  // Format date as "Monday, June 1, 2026"
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric'
  });

  // Write to the DOM (only update if elements exist on current page)
  const timeEl = document.getElementById('currentTime');
  const dateEl = document.getElementById('currentDate');

  if (timeEl) timeEl.textContent = timeStr;
  if (dateEl) dateEl.textContent = dateStr;
}

// Run immediately and then every second
updateClock();
setInterval(updateClock, 1000);


// ----- 2. Mobile Sidebar Toggle -----
// Hamburger opens/closes the sidebar on small screens

const hamburgerBtn = document.getElementById('hamburgerBtn');
const sidebar      = document.getElementById('sidebar');
const overlay      = document.getElementById('overlay');

function openSidebar() {
  sidebar.classList.add('open');
  overlay.classList.add('active');
}

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
}

if (hamburgerBtn) {
  hamburgerBtn.addEventListener('click', () => {
    // Toggle based on current state
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });
}

// Clicking the overlay closes the sidebar
if (overlay) {
  overlay.addEventListener('click', closeSidebar);
}


// ----- 3. Quick Stats (Dashboard only) -----
// Reads from localStorage and updates the 4 stat cards

function loadQuickStats() {

  // --- Tasks Today ---
  // Reads from the to-do list saved by the Productivity module
  const todos = JSON.parse(localStorage.getItem('lifeos_todos') || '[]');
  const today = new Date().toDateString();
  // Count tasks added today that are not yet done
  const todayTasks = todos.filter(t => !t.done && t.date === today).length;
  const statTasks  = document.getElementById('statTasks');
  if (statTasks) statTasks.textContent = todayTasks || '0';

  // --- Notes Saved ---
  const notes     = JSON.parse(localStorage.getItem('lifeos_notes') || '[]');
  const statNotes = document.getElementById('statNotes');
  if (statNotes) statNotes.textContent = notes.length || '0';

  // --- Habits Done Today ---
  const habits     = JSON.parse(localStorage.getItem('lifeos_habits') || '[]');
  const doneHabits = habits.filter(h => h.doneToday).length;
  const statHabits = document.getElementById('statHabits');
  if (statHabits) statHabits.textContent = doneHabits || '0';

  // --- Days to Next Exam ---
  const exams    = JSON.parse(localStorage.getItem('lifeos_exams') || '[]');
  const statExam = document.getElementById('statExam');
  if (statExam) {
    if (exams.length === 0) {
      statExam.textContent = '–';
    } else {
      // Find the soonest upcoming exam
      const nowMs    = Date.now();
      const upcoming = exams
        .map(e => ({ ...e, ms: new Date(e.date).getTime() }))
        .filter(e => e.ms >= nowMs)
        .sort((a, b) => a.ms - b.ms);

      if (upcoming.length === 0) {
        statExam.textContent = '–';
      } else {
        const daysLeft = Math.ceil((upcoming[0].ms - nowMs) / (1000 * 60 * 60 * 24));
        statExam.textContent = daysLeft;
      }
    }
  }
}

// Only run stats loader on the dashboard page
if (document.getElementById('statTasks')) {
  loadQuickStats();
}


// ----- 4. Active Nav Link Highlighting -----
// Marks the correct nav item as active based on the current URL

function setActiveNav() {
  const currentPath = window.location.pathname;
  const navItems    = document.querySelectorAll('.nav-item');

  navItems.forEach(item => {
    // Remove existing active class
    item.classList.remove('active');

    // Add active if the link matches the current page
    if (item.getAttribute('href') && currentPath.endsWith(item.getAttribute('href').replace('./', ''))) {
      item.classList.add('active');
    }
  });
}

setActiveNav();