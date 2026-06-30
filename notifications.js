// =========================================
// LIFEOS – NOTIFICATIONS SYSTEM
// notifications.js  (v2 – Notification Center)
//
// New in v2:
//  • Notification log (persisted to cloud)
//  • Unread badge count (topbar bell)
//  • Module-aware deep links
//  • Grouped duplicate suppression
//  • Snooze + action buttons on toasts
//  • Habit doneToday checks against actual date
//  • Custom reminder times per item
// =========================================

(function () {
  if (window._lifeOSNotificationsReady) return;
  window._lifeOSNotificationsReady = true;

  // =========================================
  // 1. SOUND ENGINE
  // =========================================
  const SOUNDS = {
    chime: (ctx) => {
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = freq;
        const start = ctx.currentTime + i * 0.13;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
        osc.start(start); osc.stop(start + 0.5);
      });
    },
    ping: (ctx) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.65);
    },
    alert: (ctx) => {
      [0, 0.2].forEach(delay => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square'; osc.frequency.value = 440;
        gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
        osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.18);
      });
    }
  };

  let _audioCtx = null;
  window.lifeOSPlaySound = function (type = 'chime') {
    try {
      if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (_audioCtx.state === 'suspended') _audioCtx.resume();
      (SOUNDS[type] || SOUNDS.chime)(_audioCtx);
    } catch (e) { console.warn('[LifeOS Notifications] Sound error:', e); }
  };


  // =========================================
  // 2. MODULE URL MAP
  // =========================================
  const MODULE_URLS = {
    task:         'modules/productivity.html',
    habit:        'modules/productivity.html',
    exam:         'modules/school.html',
    assignment:   'modules/school.html',
    finance:      'modules/finance.html',
    creator:      'modules/creator.html',
    relationship: 'modules/relationship.html',
    whop:         'modules/whop.html',
    ai:           'modules/ai.html',
    reminder:     'modules/productivity.html',
    info:         'index.html',
    success:      'index.html',
    warning:      'index.html',
    error:        'index.html',
  };

  function _resolveUrl(type) {
    return MODULE_URLS[type] || 'index.html';
  }


  // =========================================
  // 3. NOTIFICATION LOG
  // Persisted in localStorage (fast) + cloud
  // =========================================
  const LOG_KEY   = 'lifeos_notif_log';
  const MAX_LOG   = 100;

  function _getLog() {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function _saveLog(log) {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch {}
    // Async cloud sync — don't await to keep notifications fast
    if (window.lifeOSSave) {
      window.lifeOSSave(LOG_KEY, log).catch(() => {});
    }
  }

  function _logNotification(entry) {
    const log = _getLog();
    log.unshift({
      id:      Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      title:   entry.title   || 'LifeOS',
      message: entry.message || '',
      type:    entry.type    || 'info',
      url:     entry.url     || _resolveUrl(entry.type),
      ts:      new Date().toISOString(),
      read:    false,
    });
    if (log.length > MAX_LOG) log.length = MAX_LOG;
    _saveLog(log);
    _updateBellBadge();
  }

  // Mark all as read
  window.lifeOSMarkAllRead = function () {
    const log = _getLog().map(n => ({ ...n, read: true }));
    _saveLog(log);
    _updateBellBadge();
  };

  // Clear all
  window.lifeOSClearLog = function () {
    _saveLog([]);
    _updateBellBadge();
  };

  // Get log (for notification.html)
  window.lifeOSGetLog = function () { return _getLog(); };


  // =========================================
  // 4. BELL BADGE (topbar)
  // =========================================
  function _updateBellBadge() {
    const el = document.getElementById('losBellBadge');
    if (!el) return;
    const unread = _getLog().filter(n => !n.read).length;
    el.textContent = unread > 99 ? '99+' : unread;
    el.style.display = unread > 0 ? 'flex' : 'none';
  }

  // Inject bell button into topbar — call after DOM ready
  window.lifeOSInjectBell = function () {
    const topbar = document.querySelector('.topbar');
    if (!topbar || document.getElementById('losBellBtn')) return;

    // Determine path prefix (modules/ vs root)
    const isModule = window.location.pathname.includes('/modules/');
    const notifUrl  = isModule ? 'notification.html' : 'modules/notification.html';

    const btn = document.createElement('a');
    btn.id        = 'losBellBtn';
    btn.href      = notifUrl;
    btn.title     = 'Notification Center';
    btn.innerHTML = `
      🔔
      <span id="losBellBadge" style="
        display:none;
        position:absolute;
        top:-4px; right:-4px;
        background:#f87171;
        color:#fff;
        font-size:9px;
        font-weight:700;
        border-radius:99px;
        min-width:16px; height:16px;
        align-items:center; justify-content:center;
        padding:0 3px;
        font-family:var(--font-body);
        line-height:1;
        border:2px solid var(--bg-primary);
      "></span>
    `;
    btn.style.cssText = `
      position:relative;
      display:flex; align-items:center; justify-content:center;
      font-size:18px;
      width:36px; height:36px;
      border-radius:10px;
      background:rgba(255,255,255,0.05);
      border:1px solid rgba(255,255,255,0.08);
      cursor:pointer;
      text-decoration:none;
      transition:background 0.2s;
      flex-shrink:0;
      margin-left:auto;
    `;
    btn.onmouseover = () => btn.style.background = 'rgba(255,255,255,0.1)';
    btn.onmouseout  = () => btn.style.background = 'rgba(255,255,255,0.05)';

    // Insert before topbar-date (or at end)
    const dateEl = topbar.querySelector('.topbar-date');
    if (dateEl) topbar.insertBefore(btn, dateEl);
    else topbar.appendChild(btn);

    _updateBellBadge();
  };


  // =========================================
  // 5. IN-APP TOAST
  // =========================================
  function _ensureToastContainer() {
    if (document.getElementById('los-toast-container')) return;
    const style = document.createElement('style');
    style.textContent = `
      #los-toast-container {
        position: fixed; top: 20px; right: 20px;
        z-index: 99999; display: flex; flex-direction: column;
        gap: 10px; pointer-events: none;
        max-width: min(380px, calc(100vw - 40px));
      }
      .los-toast {
        background: #1c1c2e;
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 14px;
        padding: 14px 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.55);
        display: flex; align-items: flex-start; gap: 12px;
        pointer-events: all;
        animation: losToastIn 0.35s cubic-bezier(0.22,1,0.36,1) both;
        transition: opacity 0.3s ease, transform 0.3s ease;
        cursor: pointer;
        font-family: 'DM Sans', sans-serif;
        min-width: 260px;
      }
      .los-toast.los-hiding { opacity: 0; transform: translateX(20px); }
      @keyframes losToastIn {
        from { opacity: 0; transform: translateX(24px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      .los-toast-icon { font-size: 22px; flex-shrink: 0; line-height: 1; margin-top: 1px; }
      .los-toast-body { flex: 1; min-width: 0; }
      .los-toast-title {
        font-size: 14px; font-weight: 700; color: #eeeef7;
        margin-bottom: 3px; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
      }
      .los-toast-msg { font-size: 13px; color: #9898b8; line-height: 1.4; word-break: break-word; }
      .los-toast-actions { display: flex; gap: 6px; margin-top: 9px; flex-wrap: wrap; }
      .los-toast-action {
        font-size: 11px; font-weight: 600; padding: 4px 10px;
        border-radius: 6px; border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06); color: #cccce8;
        cursor: pointer; font-family: inherit;
        transition: background 0.15s;
      }
      .los-toast-action:hover { background: rgba(255,255,255,0.12); }
      .los-toast-action.primary { background: rgba(139,124,248,0.2); color: #a593ff; border-color: rgba(139,124,248,0.3); }
      .los-toast-action.primary:hover { background: rgba(139,124,248,0.3); }
      .los-toast-close {
        background: none; border: none; color: #9898b8;
        font-size: 16px; cursor: pointer; padding: 0;
        flex-shrink: 0; line-height: 1; margin-top: 1px;
        transition: color 0.2s; font-family: inherit;
      }
      .los-toast-close:hover { color: #eeeef7; }
      .los-toast-progress {
        position: absolute; bottom: 0; left: 0; height: 3px;
        border-radius: 0 0 14px 14px; transition: width linear;
      }
      .los-toast[data-type="success"]  { border-left: 3px solid #3ecf8e; }
      .los-toast[data-type="success"]  .los-toast-progress { background: #3ecf8e; }
      .los-toast[data-type="error"]    { border-left: 3px solid #f87171; }
      .los-toast[data-type="error"]    .los-toast-progress { background: #f87171; }
      .los-toast[data-type="warning"]  { border-left: 3px solid #fbbf24; }
      .los-toast[data-type="warning"]  .los-toast-progress { background: #fbbf24; }
      .los-toast[data-type="info"]     { border-left: 3px solid #8b7cf8; }
      .los-toast[data-type="info"]     .los-toast-progress { background: #8b7cf8; }
      .los-toast[data-type="reminder"] { border-left: 3px solid #4f9cf9; }
      .los-toast[data-type="reminder"] .los-toast-progress { background: #4f9cf9; }
      .los-toast[data-type="habit"]    { border-left: 3px solid #f5a623; }
      .los-toast[data-type="habit"]    .los-toast-progress { background: #f5a623; }
      .los-toast[data-type="exam"]     { border-left: 3px solid #3ecf8e; }
      .los-toast[data-type="exam"]     .los-toast-progress { background: #3ecf8e; }
      .los-toast[data-type="finance"]  { border-left: 3px solid #f5a623; }
      .los-toast[data-type="finance"]  .los-toast-progress { background: #f5a623; }
      @media (max-width: 480px) {
        #los-toast-container {
          top: auto; bottom: 80px; right: 12px; left: 12px; max-width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
    const container = document.createElement('div');
    container.id = 'los-toast-container';
    document.body.appendChild(container);
  }

  const TYPE_ICONS = {
    success: '✅', error: '❌', warning: '⚠️', info: '💡',
    reminder: '🔔', habit: '🏆', exam: '🎓', task: '✅',
    finance: '💰', creator: '🎬', assignment: '📋',
    relationship: '💕', whop: '🟠',
  };

  /**
   * Show an in-app toast.
   * @param {object} opts
   *   title    {string}
   *   message  {string}
   *   type     {string}  success|error|warning|info|reminder|habit|exam|task|finance|creator
   *   icon     {string}  emoji override
   *   duration {number}  ms (default 4500, 0=sticky)
   *   sound    {string|false}
   *   onClick  {function}
   *   actions  {Array<{label, onClick, primary}>}  action buttons
   *   url      {string}  deep link (used in log)
   */
  window.lifeOSToast = function (opts = {}) {
    _ensureToastContainer();
    const {
      title    = 'LifeOS',
      message  = '',
      type     = 'info',
      icon     = TYPE_ICONS[type] || '🔔',
      duration = 4500,
      sound    = 'chime',
      onClick  = null,
      actions  = [],
      url,
    } = (typeof opts === 'string') ? { message: opts } : opts;

    if (sound) window.lifeOSPlaySound(sound);

    const container = document.getElementById('los-toast-container');
    const toast = document.createElement('div');
    toast.className = 'los-toast';
    toast.dataset.type = type;
    toast.style.position = 'relative';
    toast.style.overflow = 'hidden';

    const actionHTML = actions.length
      ? `<div class="los-toast-actions">${actions.map((a, i) =>
          `<button class="los-toast-action${a.primary ? ' primary' : ''}" data-action="${i}">${a.label}</button>`
        ).join('')}</div>`
      : '';

    toast.innerHTML = `
      <span class="los-toast-icon">${icon}</span>
      <div class="los-toast-body">
        <div class="los-toast-title">${title}</div>
        ${message ? `<div class="los-toast-msg">${message}</div>` : ''}
        ${actionHTML}
      </div>
      <button class="los-toast-close" aria-label="Dismiss">✕</button>
      ${duration > 0 ? '<div class="los-toast-progress" style="width:100%"></div>' : ''}
    `;

    if (onClick) {
      toast.querySelector('.los-toast-body').style.cursor = 'pointer';
      toast.querySelector('.los-toast-body').addEventListener('click', (e) => {
        if (!e.target.closest('.los-toast-action')) onClick(e);
      });
    }

    actions.forEach((a, i) => {
      const btn = toast.querySelector(`[data-action="${i}"]`);
      if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); a.onClick && a.onClick(); });
    });

    function dismiss() {
      toast.classList.add('los-hiding');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }

    toast.querySelector('.los-toast-close').addEventListener('click', dismiss);

    if (duration > 0) {
      const bar = toast.querySelector('.los-toast-progress');
      requestAnimationFrame(() => {
        bar.style.transition = `width ${duration}ms linear`;
        bar.style.width = '0%';
      });
      setTimeout(dismiss, duration);
    }

    container.appendChild(toast);
    const all = container.querySelectorAll('.los-toast');
    if (all.length > 5) {
      all[0].classList.add('los-hiding');
      setTimeout(() => all[0].remove(), 300);
    }

    return { dismiss };
  };


  // =========================================
  // 6. NATIVE OS NOTIFICATION
  // =========================================
  window.lifeOSRequestNotifPermission = async function () {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied')  return 'denied';
    return await Notification.requestPermission();
  };

  /**
   * Send notification + log it.
   * @param {object} opts  – same as lifeOSToast, plus:
   *   body    {string}  OS body text
   *   tag     {string}  deduplication tag
   *   url     {string}  deep link override
   *   actions {Array}   toast action buttons
   */
  window.lifeOSNotify = async function (opts = {}) {
    const {
      title   = 'LifeOS',
      message = '',
      body    = message,
      type    = 'info',
      icon    = '/favicon.svg',
      tag     = 'lifeos-' + type,
      sound   = 'chime',
      onClick = null,
      actions = [],
      url,
    } = (typeof opts === 'string') ? { message: opts } : opts;

    const resolvedUrl = url || _resolveUrl(type);

    // Log it
    _logNotification({ title, message, type, url: resolvedUrl });

    // In-app toast with "View →" action
    const toastActions = [...actions];
    if (!toastActions.find(a => a.label && a.label.includes('View'))) {
      toastActions.push({
        label: 'View →',
        primary: true,
        onClick: () => { window._lifeOSNavigate ? window._lifeOSNavigate(resolvedUrl) : (window.location.href = resolvedUrl); }
      });
    }

    window.lifeOSToast({ title, message, type, sound, onClick, actions: toastActions });

    // Native notification
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          reg.showNotification(title, {
            body, icon, badge: '/favicon.svg', tag, renotify: true,
            vibrate: [200, 100, 200],
            data: { url: resolvedUrl }
          });
          return;
        }
      }
      const n = new Notification(title, { body, icon, tag });
      if (onClick) n.onclick = onClick;
    } catch (e) { console.warn('[LifeOS Notifications] Native notif error:', e); }
  };


  // =========================================
  // 7. PERMISSION PROMPT BANNER
  // =========================================
  window.lifeOSPromptNotifPermission = async function () {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    if (sessionStorage.getItem('los_notif_asked')) return;
    sessionStorage.setItem('los_notif_asked', '1');
    window.lifeOSToast({
      title:    'Enable Notifications?',
      message:  'Get reminders for tasks, exams, and habits.',
      type:     'info',
      icon:     '🔔',
      duration: 0,
      sound:    false,
      actions: [{
        label: 'Enable',
        primary: true,
        onClick: async () => {
          const perm = await window.lifeOSRequestNotifPermission();
          if (perm === 'granted') {
            window.lifeOSToast({ title: 'Notifications enabled!', type: 'success', sound: 'chime' });
          }
        }
      }]
    });
  };


  // =========================================
  // 8. SNOOZE HELPER
  // =========================================
  function _snooze(opts, minutes) {
    setTimeout(() => {
      window.lifeOSNotify({ ...opts, title: '⏰ Snoozed: ' + opts.title });
    }, minutes * 60 * 1000);
    window.lifeOSToast({ title: `Snoozed ${minutes}m`, type: 'info', duration: 2000, sound: false });
  }


  // =========================================
  // 9. REMINDER SCHEDULER
  // =========================================
  let _schedulerRunning = false;
  // Track fired reminders this session to avoid dupes
  const _firedToday = new Set();

  window.lifeOSStartReminders = async function () {
    if (_schedulerRunning) return;
    _schedulerRunning = true;

    async function check() {
      if (!window._currentUser) return;

      const now      = new Date();
      const todayStr = now.toDateString();
      const hh       = now.getHours();
      const mm       = now.getMinutes();

      // ── Task reminders ──
      try {
        const todos = await window.lifeOSLoad('lifeos_todos', []);
        todos.forEach(t => {
          if (t.done) return;
          const fireKey = `task-${t.id || t.text}-${todayStr}`;
          if (_firedToday.has(fireKey)) return;

          // Custom reminder time or default 9 AM
          const remindHH = t.remindHour !== undefined ? t.remindHour : 9;
          const remindMM = t.remindMin  !== undefined ? t.remindMin  : 0;

          if (t.date === todayStr && hh === remindHH && mm === remindMM) {
            _firedToday.add(fireKey);
            const notifOpts = {
              title:   '📋 Task Due Today',
              message: t.text || t.title || 'You have a task due today',
              type:    'task',
              sound:   'chime',
              url:     'modules/productivity.html',
            };
            notifOpts.actions = [
              { label: '⏰ Snooze 15m', onClick: () => _snooze(notifOpts, 15) },
              { label: 'View →', primary: true, onClick: () => window.location.href = 'modules/productivity.html' }
            ];
            window.lifeOSNotify(notifOpts);
          }
        });
      } catch (_) {}

      // ── Exam reminders ──
      try {
        const exams = await window.lifeOSLoad('lifeos_exams', []);
        exams.forEach(e => {
          const examDate = new Date(e.date);
          const daysLeft = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));
          const fireKey  = `exam-${e.id || e.subject}-${daysLeft}d-${todayStr}`;
          if (_firedToday.has(fireKey)) return;
          if ((daysLeft === 1 || daysLeft === 3 || daysLeft === 7) && hh === 8 && mm === 0) {
            _firedToday.add(fireKey);
            window.lifeOSNotify({
              title:   '🎓 Exam Coming Up!',
              message: `${e.subject || e.name || 'Exam'} in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
              type:    'exam',
              sound:   'alert',
              url:     'modules/school.html',
            });
          }
        });
      } catch (_) {}

      // ── Habit reminder at 8 PM if not done today ──
      try {
        if (hh === 20 && mm === 0) {
          const fireKey = `habits-${todayStr}`;
          if (!_firedToday.has(fireKey)) {
            const habits  = await window.lifeOSLoad('lifeos_habits', []);
            // Check lastDoneDate against today rather than boolean
            const pending = habits.filter(h => h.lastDoneDate !== todayStr && !h.doneToday);
            if (pending.length > 0) {
              _firedToday.add(fireKey);
              window.lifeOSNotify({
                title:   '🏆 Daily Habits',
                message: `${pending.length} habit${pending.length > 1 ? 's' : ''} left to complete today!`,
                type:    'habit',
                sound:   'ping',
                url:     'modules/productivity.html',
              });
            }
          }
        }
      } catch (_) {}

      // ── Finance bill reminders (DISABLED) ──
      // No module currently writes to 'lifeos_bills' — Finance has no
      // bill/subscription tracking feature yet. This block was dead code
      // (checked a key that never gets populated). Re-enable once a real
      // bills feature is built in finance.html.
      //
      // try {
      //   const bills = await window.lifeOSLoad('lifeos_bills', []);
      //   ...
      // } catch (_) {}

      // ── Creator upload reminders (DISABLED) ──
      // Mismatch: this checked 'lifeos_uploads' but creator.html actually
      // saves to 'lifeos_creator_uploads'. Also, Creator's upload objects
      // are logged AFTER posting (have `views`, no `scheduledDate`/`uploaded`
      // fields) — there's no "upcoming scheduled upload" concept yet.
      // Re-enable once Creator has a real content-calendar/scheduling feature.
      //
      // try {
      //   const uploads = await window.lifeOSLoad('lifeos_creator_uploads', []);
      //   ...
      // } catch (_) {}
    }

    await check();
    setInterval(check, 60 * 1000);
  };


  // =========================================
  // 10. AUTO-INIT
  // =========================================
  function _init() {
    // Inject bell into topbar
    window.lifeOSInjectBell();

    if (window.authReady) {
      window.authReady.then(() => {
        setTimeout(() => {
          window.lifeOSPromptNotifPermission();
          window.lifeOSStartReminders();
          _updateBellBadge();
        }, 1500);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

})();
