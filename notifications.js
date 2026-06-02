// =========================================
// LIFEOS – NOTIFICATIONS SYSTEM
// notifications.js  (v1)
//
// Features:
//  • In-app toast popup (always works – no permission needed)
//  • Native OS notification (browser, PWA, desktop, mobile)
//  • Web Audio API chime sound (no file dependency)
//  • Permission request helper
//  • Reminder scheduler (checks every minute)
//  • Works on Cloudflare Pages, Firebase Hosting, file://
// =========================================

(function () {
  if (window._lifeOSNotificationsReady) return;
  window._lifeOSNotificationsReady = true;

  // =========================================
  // 1. SOUND ENGINE  (Web Audio – no MP3 needed)
  // =========================================

  const SOUNDS = {
    // A short pleasant 3-note chime
    chime: (ctx) => {
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = ctx.currentTime + i * 0.13;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
        osc.start(start);
        osc.stop(start + 0.5);
      });
    },
    // A soft single ping
    ping: (ctx) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.65);
    },
    // Urgent double beep
    alert: (ctx) => {
      [0, 0.2].forEach(delay => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.value = 440;
        gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.18);
      });
    }
  };

  let _audioCtx = null;

  window.lifeOSPlaySound = function (type = 'chime') {
    try {
      if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      // Resume context if suspended (required after user gesture on mobile)
      if (_audioCtx.state === 'suspended') _audioCtx.resume();
      const fn = SOUNDS[type] || SOUNDS.chime;
      fn(_audioCtx);
    } catch (e) {
      console.warn('[LifeOS Notifications] Sound error:', e);
    }
  };


  // =========================================
  // 2. IN-APP TOAST
  // =========================================

  // Inject toast container + styles once
  function _ensureToastContainer() {
    if (document.getElementById('los-toast-container')) return;

    const style = document.createElement('style');
    style.textContent = `
      #los-toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
        max-width: min(380px, calc(100vw - 40px));
      }
      .los-toast {
        background: #1c1c2e;
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 14px;
        padding: 14px 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.55);
        display: flex;
        align-items: flex-start;
        gap: 12px;
        pointer-events: all;
        animation: losToastIn 0.35s cubic-bezier(0.22,1,0.36,1) both;
        transition: opacity 0.3s ease, transform 0.3s ease;
        cursor: pointer;
        font-family: 'DM Sans', sans-serif;
        min-width: 260px;
      }
      .los-toast.los-hiding {
        opacity: 0;
        transform: translateX(20px);
      }
      @keyframes losToastIn {
        from { opacity: 0; transform: translateX(24px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      .los-toast-icon {
        font-size: 22px;
        flex-shrink: 0;
        line-height: 1;
        margin-top: 1px;
      }
      .los-toast-body { flex: 1; min-width: 0; }
      .los-toast-title {
        font-size: 14px;
        font-weight: 700;
        color: #eeeef7;
        margin-bottom: 3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .los-toast-msg {
        font-size: 13px;
        color: #9898b8;
        line-height: 1.4;
        word-break: break-word;
      }
      .los-toast-close {
        background: none;
        border: none;
        color: #9898b8;
        font-size: 16px;
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
        line-height: 1;
        margin-top: 1px;
        transition: color 0.2s;
        font-family: inherit;
      }
      .los-toast-close:hover { color: #eeeef7; }
      .los-toast-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        border-radius: 0 0 14px 14px;
        transition: width linear;
      }

      /* type accent colours */
      .los-toast[data-type="success"] { border-left: 3px solid #3ecf8e; }
      .los-toast[data-type="success"] .los-toast-progress { background: #3ecf8e; }
      .los-toast[data-type="error"]   { border-left: 3px solid #f87171; }
      .los-toast[data-type="error"]   .los-toast-progress { background: #f87171; }
      .los-toast[data-type="warning"] { border-left: 3px solid #fbbf24; }
      .los-toast[data-type="warning"] .los-toast-progress { background: #fbbf24; }
      .los-toast[data-type="info"]    { border-left: 3px solid #8b7cf8; }
      .los-toast[data-type="info"]    .los-toast-progress { background: #8b7cf8; }
      .los-toast[data-type="reminder"]{ border-left: 3px solid #4f9cf9; }
      .los-toast[data-type="reminder"]{ }
      .los-toast[data-type="reminder"] .los-toast-progress { background: #4f9cf9; }

      @media (max-width: 480px) {
        #los-toast-container {
          top: auto;
          bottom: 80px;
          right: 12px;
          left: 12px;
          max-width: 100%;
        }
      }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.id = 'los-toast-container';
    document.body.appendChild(container);
  }

  const TYPE_ICONS = {
    success:  '✅',
    error:    '❌',
    warning:  '⚠️',
    info:     '💡',
    reminder: '🔔',
    habit:    '🏆',
    exam:     '🎓',
    task:     '✅',
    finance:  '💰',
    creator:  '🎬',
  };

  /**
   * Show an in-app toast.
   *
   * @param {object} opts
   *   title    {string}  – bold heading
   *   message  {string}  – body text
   *   type     {string}  – success | error | warning | info | reminder (default: info)
   *   icon     {string}  – emoji override
   *   duration {number}  – ms before auto-dismiss (default: 4500, 0 = sticky)
   *   sound    {string|false} – chime | ping | alert | false (default: 'chime')
   *   onClick  {function} – called when toast body is clicked
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
    } = (typeof opts === 'string') ? { message: opts } : opts;

    if (sound) window.lifeOSPlaySound(sound);

    const container = document.getElementById('los-toast-container');
    const toast = document.createElement('div');
    toast.className = 'los-toast';
    toast.dataset.type = type;
    toast.style.position = 'relative';
    toast.style.overflow = 'hidden';

    toast.innerHTML = `
      <span class="los-toast-icon">${icon}</span>
      <div class="los-toast-body">
        <div class="los-toast-title">${title}</div>
        ${message ? `<div class="los-toast-msg">${message}</div>` : ''}
      </div>
      <button class="los-toast-close" aria-label="Dismiss">✕</button>
      ${duration > 0 ? '<div class="los-toast-progress" style="width:100%"></div>' : ''}
    `;

    if (onClick) {
      toast.querySelector('.los-toast-body').style.cursor = 'pointer';
      toast.querySelector('.los-toast-body').addEventListener('click', onClick);
    }

    function dismiss() {
      toast.classList.add('los-hiding');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }

    toast.querySelector('.los-toast-close').addEventListener('click', dismiss);

    if (duration > 0) {
      const bar = toast.querySelector('.los-toast-progress');
      // Trigger CSS transition after paint
      requestAnimationFrame(() => {
        bar.style.transition = `width ${duration}ms linear`;
        bar.style.width = '0%';
      });
      setTimeout(dismiss, duration);
    }

    container.appendChild(toast);

    // Cap at 5 toasts
    const all = container.querySelectorAll('.los-toast');
    if (all.length > 5) all[0].remove();

    return { dismiss };
  };


  // =========================================
  // 3. NATIVE OS NOTIFICATION
  // =========================================

  /**
   * Request notification permission.
   * Resolves to 'granted' | 'denied' | 'default'
   */
  window.lifeOSRequestNotifPermission = async function () {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied')  return 'denied';
    return await Notification.requestPermission();
  };

  /**
   * Send a native OS notification (background tab, phone, desktop).
   * Falls back to in-app toast if permission not granted.
   *
   * @param {object} opts  – same shape as lifeOSToast, plus:
   *   body {string}  – OS notification body (defaults to message)
   *   tag  {string}  – deduplication tag
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
    } = (typeof opts === 'string') ? { message: opts } : opts;

    // Always show in-app toast too
    window.lifeOSToast({ title, message, type, sound, onClick });

    // Attempt native notification
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      // If Service Worker is active, use it for reliable mobile/desktop delivery
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          reg.showNotification(title, {
            body,
            icon,
            badge: '/favicon.svg',
            tag,
            renotify: true,
            vibrate: [200, 100, 200],
          });
          return;
        }
      }
      // Fallback: direct Notification API
      const n = new Notification(title, { body, icon, tag });
      if (onClick) n.onclick = onClick;
    } catch (e) {
      console.warn('[LifeOS Notifications] Native notif error:', e);
    }
  };


  // =========================================
  // 4. PERMISSION PROMPT BANNER
  // Shows once per session asking the user
  // to enable notifications.
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
      duration: 0,      // sticky until dismissed
      sound:    false,
      onClick:  async () => {
        const perm = await window.lifeOSRequestNotifPermission();
        if (perm === 'granted') {
          window.lifeOSToast({ title: 'Notifications enabled!', type: 'success', sound: 'chime' });
        }
      }
    });
  };


  // =========================================
  // 5. REMINDER SCHEDULER
  // Reads todos, exams, and habits from
  // LifeOS storage and fires notifications.
  // =========================================

  let _schedulerRunning = false;

  window.lifeOSStartReminders = async function () {
    if (_schedulerRunning) return;
    _schedulerRunning = true;

    async function check() {
      // Wait for auth before accessing storage
      if (!window._currentUser) return;

      const now       = new Date();
      const todayStr  = now.toDateString();
      const hh        = now.getHours();
      const mm        = now.getMinutes();

      // ── Task reminders ──
      try {
        const todos = await window.lifeOSLoad('lifeos_todos', []);
        todos.forEach(t => {
          if (t.done) return;
          // Remind if task is due today and it's 9 AM
          if (t.date === todayStr && hh === 9 && mm === 0) {
            window.lifeOSNotify({
              title:   '📋 Task Due Today',
              message: t.text || t.title || 'You have a task due today',
              type:    'reminder',
              sound:   'chime',
            });
          }
        });
      } catch (_) {}

      // ── Exam reminders (1 day before, 3 days before) ──
      try {
        const exams = await window.lifeOSLoad('lifeos_exams', []);
        exams.forEach(e => {
          const examDate = new Date(e.date);
          const daysLeft = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));
          if ((daysLeft === 1 || daysLeft === 3) && hh === 8 && mm === 0) {
            window.lifeOSNotify({
              title:   '🎓 Exam Coming Up!',
              message: `${e.subject || e.name || 'Exam'} in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
              type:    'exam',
              sound:   'alert',
            });
          }
        });
      } catch (_) {}

      // ── Habit reminder at 8 PM if not done ──
      try {
        if (hh === 20 && mm === 0) {
          const habits = await window.lifeOSLoad('lifeos_habits', []);
          const pending = habits.filter(h => !h.doneToday);
          if (pending.length > 0) {
            window.lifeOSNotify({
              title:   '🏆 Daily Habits',
              message: `${pending.length} habit${pending.length > 1 ? 's' : ''} left to complete today!`,
              type:    'habit',
              sound:   'ping',
            });
          }
        }
      } catch (_) {}
    }

    // Run immediately, then every 60 seconds
    await check();
    setInterval(check, 60 * 1000);
  };


  // =========================================
  // 6. AUTO-INIT
  // Once auth is ready, prompt for permission
  // and start the reminder scheduler.
  // =========================================

  if (window.authReady) {
    window.authReady.then(() => {
      // Small delay so page can finish rendering
      setTimeout(() => {
        window.lifeOSPromptNotifPermission();
        window.lifeOSStartReminders();
      }, 1500);
    });
  } else {
    // If loaded on login/signup page (no authReady), do nothing
  }

})();
