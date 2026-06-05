// =========================================
// LIFEOS – NOTIFICATION CENTER  (v2)
// notifications.js
//
// Features:
//  • Notification bell in topbar (injected automatically)
//  • Read/unread badge counter
//  • Notification history panel (slide-out drawer)
//  • 6 categories: task, exam, finance, relationship, habit, custom
//  • Snooze: 5 min, 1 hour, tomorrow
//  • Custom notification sounds (chime, ping, alert) via Web Audio
//  • Native OS / Windows desktop notifications (via SW)
//  • Permission request helper
//  • Reminder scheduler checks every 60 s
//  • All notification history stored per-user in Firebase/localStorage
// =========================================

(function () {
  if (window._lifeOSNotificationsReady) return;
  window._lifeOSNotificationsReady = true;

  // =========================================
  // 1. SOUND ENGINE
  // =========================================
  const SOUNDS = {
    chime: (ctx) => {
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = freq;
        const s = ctx.currentTime + i * 0.13;
        gain.gain.setValueAtTime(0, s);
        gain.gain.linearRampToValueAtTime(0.25, s + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, s + 0.45);
        osc.start(s); osc.stop(s + 0.5);
      });
    },
    ping: (ctx) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.65);
    },
    alert: (ctx) => {
      [0, 0.22].forEach(delay => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square'; osc.frequency.value = 440;
        gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
        osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.18);
      });
    },
    soft: (ctx) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.85);
    }
  };

  let _audioCtx = null;
  window.lifeOSPlaySound = function (type = 'chime') {
    if (!window._notifSettings || window._notifSettings.sound === false) return;
    try {
      if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (_audioCtx.state === 'suspended') _audioCtx.resume();
      (SOUNDS[type] || SOUNDS.chime)(_audioCtx);
    } catch (e) { console.warn('[LifeOS] Sound error:', e); }
  };


  // =========================================
  // 2. NOTIFICATION STORAGE (per-user)
  // =========================================
  const HISTORY_KEY = 'lifeos_notifications';
  const SETTINGS_KEY = 'lifeos_notif_settings';
  let _history = [];
  let _snoozed = {}; // { notifId: snoozedUntilMs }

  window._notifSettings = {
    sound: true,
    soundType: 'chime',
    taskReminders: true,
    habitReminders: true,
    examReminders: true,
    financeReminders: true,
    relationshipReminders: true,
  };

  async function saveHistory() {
    try {
      if (window.lifeOSSave) {
        await window.lifeOSSave(HISTORY_KEY, _history);
      } else {
        const uid = window._currentUser ? window._currentUser.uid : 'anon';
        localStorage.setItem(uid + '_' + HISTORY_KEY, JSON.stringify(_history));
      }
    } catch (e) {}
  }

  async function loadHistory() {
    try {
      if (window.lifeOSLoad) {
        _history = await window.lifeOSLoad(HISTORY_KEY, []);
      } else {
        const uid = window._currentUser ? window._currentUser.uid : 'anon';
        const raw = localStorage.getItem(uid + '_' + HISTORY_KEY);
        _history = raw ? JSON.parse(raw) : [];
      }
    } catch (e) { _history = []; }
    // Trim to last 200
    if (_history.length > 200) _history = _history.slice(-200);
    renderNotifList();
    updateBadge();
  }

  async function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(window._notifSettings));
    } catch (e) {}
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) window._notifSettings = { ...window._notifSettings, ...JSON.parse(raw) };
    } catch (e) {}
  }

  // =========================================
  // 3. ADD NOTIFICATION TO HISTORY
  // =========================================
  const CATEGORY_META = {
    task:         { icon: '✅', color: '#38bdf8', label: 'Task' },
    exam:         { icon: '🎓', color: '#3ecf8e', label: 'School' },
    habit:        { icon: '🏆', color: '#8b7cf8', label: 'Habit' },
    finance:      { icon: '💰', color: '#f5a623', label: 'Finance' },
    relationship: { icon: '💕', color: '#e066a0', label: 'Relationship' },
    custom:       { icon: '🔔', color: '#8b7cf8', label: 'Custom' },
    info:         { icon: '💡', color: '#8b7cf8', label: 'Info' },
    success:      { icon: '✅', color: '#3ecf8e', label: 'Success' },
    error:        { icon: '❌', color: '#f87171', label: 'Error' },
    warning:      { icon: '⚠️', color: '#fbbf24', label: 'Warning' },
    reminder:     { icon: '🔔', color: '#4f9cf9', label: 'Reminder' },
  };

  function addToHistory(opts) {
    const meta = CATEGORY_META[opts.type] || CATEGORY_META.info;
    const entry = {
      id:        Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      title:     opts.title || 'LifeOS',
      message:   opts.message || '',
      type:      opts.type || 'info',
      icon:      opts.icon || meta.icon,
      color:     meta.color,
      read:      false,
      timestamp: Date.now(),
      snoozable: opts.snoozable !== false,
    };
    _history.unshift(entry);
    saveHistory();
    renderNotifList();
    updateBadge();
    return entry;
  }


  // =========================================
  // 4. BELL ICON + DRAWER INJECTION
  // =========================================
  const DRAWER_CSS = `
    /* ── Notification Bell ── */
    #los-bell-btn {
      position: relative;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 10px;
      width: 38px; height: 38px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      font-size: 18px;
      transition: background 0.2s, transform 0.15s;
      flex-shrink: 0;
      margin-left: auto;
    }
    #los-bell-btn:hover { background: rgba(139,124,248,0.18); transform: scale(1.07); }
    #los-bell-badge {
      position: absolute;
      top: -5px; right: -5px;
      background: #f87171;
      color: #fff;
      font-size: 10px; font-weight: 700;
      min-width: 18px; height: 18px;
      border-radius: 99px;
      display: none;
      align-items: center; justify-content: center;
      padding: 0 4px;
      border: 2px solid #0b0b10;
      font-family: 'DM Sans', sans-serif;
      line-height: 1;
    }
    #los-bell-badge.visible { display: flex; }

    /* ── Drawer overlay ── */
    #los-notif-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 9997;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }
    #los-notif-overlay.open { opacity: 1; pointer-events: all; }

    /* ── Drawer panel ── */
    #los-notif-drawer {
      position: fixed;
      top: 0; right: 0;
      width: min(420px, 100vw);
      height: 100dvh;
      background: #13131e;
      border-left: 1px solid rgba(255,255,255,0.07);
      z-index: 9998;
      display: flex; flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.32s cubic-bezier(0.22,1,0.36,1);
      box-shadow: -12px 0 48px rgba(0,0,0,0.5);
    }
    #los-notif-drawer.open { transform: translateX(0); }

    /* Drawer header */
    .los-nd-header {
      display: flex; align-items: center; gap: 10px;
      padding: 20px 20px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      flex-shrink: 0;
    }
    .los-nd-header h2 {
      font-family: 'Syne', sans-serif;
      font-size: 18px; font-weight: 700;
      color: #eeeef7; flex: 1;
    }
    .los-nd-header-actions { display: flex; gap: 8px; }
    .los-nd-icon-btn {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 8px;
      color: #9898b8; font-size: 13px; font-weight: 600;
      padding: 6px 10px; cursor: pointer;
      transition: background 0.2s, color 0.2s;
      font-family: 'DM Sans', sans-serif;
      white-space: nowrap;
    }
    .los-nd-icon-btn:hover { background: rgba(255,255,255,0.1); color: #eeeef7; }
    .los-nd-close {
      background: none; border: none;
      color: #7878a0; font-size: 20px;
      cursor: pointer; padding: 4px;
      border-radius: 6px;
      transition: color 0.2s, background 0.2s;
      line-height: 1;
    }
    .los-nd-close:hover { color: #eeeef7; background: rgba(255,255,255,0.08); }

    /* Tabs */
    .los-nd-tabs {
      display: flex; gap: 4px;
      padding: 12px 20px 0;
      flex-shrink: 0;
    }
    .los-nd-tab {
      background: none; border: none;
      color: #7878a0; font-size: 13px; font-weight: 600;
      padding: 7px 14px; cursor: pointer;
      border-radius: 8px;
      transition: background 0.2s, color 0.2s;
      font-family: 'DM Sans', sans-serif;
    }
    .los-nd-tab.active {
      background: rgba(139,124,248,0.15);
      color: #8b7cf8;
    }
    .los-nd-tab:hover:not(.active) { background: rgba(255,255,255,0.06); color: #eeeef7; }

    /* List */
    .los-nd-list {
      flex: 1; overflow-y: auto;
      padding: 12px 16px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .los-nd-list::-webkit-scrollbar { width: 4px; }
    .los-nd-list::-webkit-scrollbar-thumb { background: rgba(139,124,248,0.3); border-radius: 99px; }

    .los-nd-empty {
      text-align: center;
      color: #7878a0;
      font-size: 14px;
      padding: 48px 20px;
      line-height: 1.6;
    }
    .los-nd-empty span { font-size: 36px; display: block; margin-bottom: 12px; }

    /* Notif item */
    .los-nd-item {
      background: #1c1c2e;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 12px;
      padding: 12px 14px;
      display: flex; gap: 12px;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
      position: relative;
      overflow: hidden;
    }
    .los-nd-item:hover { background: #21213a; }
    .los-nd-item.unread { border-color: rgba(139,124,248,0.25); }
    .los-nd-item.unread::before {
      content: '';
      position: absolute; top: 0; left: 0;
      width: 3px; height: 100%;
      background: var(--item-color, #8b7cf8);
    }
    .los-nd-item-icon {
      font-size: 22px; flex-shrink: 0;
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.05);
      border-radius: 8px;
    }
    .los-nd-item-body { flex: 1; min-width: 0; }
    .los-nd-item-title {
      font-size: 14px; font-weight: 700;
      color: #eeeef7;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      margin-bottom: 3px;
    }
    .los-nd-item.unread .los-nd-item-title { color: #fff; }
    .los-nd-item-msg {
      font-size: 12px; color: #9898b8;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .los-nd-item-time {
      font-size: 11px; color: #7878a0;
      margin-top: 6px; white-space: nowrap;
    }
    .los-nd-item-actions {
      display: flex; flex-direction: column;
      gap: 4px; flex-shrink: 0;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .los-nd-item:hover .los-nd-item-actions { opacity: 1; }
    .los-nd-action-btn {
      background: rgba(255,255,255,0.07);
      border: none; border-radius: 6px;
      color: #9898b8; font-size: 11px;
      padding: 4px 8px; cursor: pointer;
      transition: background 0.2s, color 0.2s;
      font-family: 'DM Sans', sans-serif;
      white-space: nowrap;
    }
    .los-nd-action-btn:hover { background: rgba(255,255,255,0.13); color: #eeeef7; }
    .los-nd-action-btn.snooze { color: #fbbf24; }
    .los-nd-action-btn.snooze:hover { background: rgba(251,191,36,0.15); }
    .los-nd-action-btn.dismiss { color: #f87171; }
    .los-nd-action-btn.dismiss:hover { background: rgba(248,113,113,0.15); }

    /* Snooze menu */
    .los-snooze-menu {
      position: absolute; right: 8px; top: 8px;
      background: #1c1c2e;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      z-index: 100;
      overflow: hidden;
      min-width: 140px;
    }
    .los-snooze-opt {
      display: block; width: 100%;
      background: none; border: none;
      color: #eeeef7; font-size: 13px;
      padding: 10px 14px; text-align: left;
      cursor: pointer;
      transition: background 0.15s;
      font-family: 'DM Sans', sans-serif;
    }
    .los-snooze-opt:hover { background: rgba(255,255,255,0.08); }

    /* Footer / Custom notification form */
    .los-nd-footer {
      border-top: 1px solid rgba(255,255,255,0.07);
      padding: 14px 16px;
      flex-shrink: 0;
    }
    .los-nd-custom-toggle {
      display: flex; align-items: center;
      gap: 8px; cursor: pointer;
      background: rgba(139,124,248,0.1);
      border: 1px solid rgba(139,124,248,0.2);
      border-radius: 10px; padding: 10px 14px;
      color: #8b7cf8; font-size: 13px; font-weight: 600;
      width: 100%; justify-content: center;
      transition: background 0.2s;
      font-family: 'DM Sans', sans-serif;
    }
    .los-nd-custom-toggle:hover { background: rgba(139,124,248,0.18); }
    .los-nd-custom-form {
      display: none;
      flex-direction: column; gap: 8px;
      padding-top: 12px;
    }
    .los-nd-custom-form.open { display: flex; }
    .los-nd-custom-form input,
    .los-nd-custom-form select {
      background: #0b0b10;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: #eeeef7; font-size: 13px;
      padding: 9px 12px; outline: none;
      font-family: 'DM Sans', sans-serif;
      transition: border-color 0.2s;
    }
    .los-nd-custom-form input:focus,
    .los-nd-custom-form select:focus { border-color: #8b7cf8; }
    .los-nd-custom-form input::placeholder { color: #7878a0; }
    .los-nd-custom-form select option { background: #1c1c2e; }
    .los-nd-custom-row { display: flex; gap: 8px; }
    .los-nd-custom-row input { flex: 1; }
    .los-nd-send-btn {
      background: linear-gradient(135deg, #8b7cf8, #4f9cf9);
      border: none; border-radius: 8px;
      color: #fff; font-size: 13px; font-weight: 700;
      padding: 10px; cursor: pointer;
      font-family: 'Syne', sans-serif;
      transition: opacity 0.2s, transform 0.15s;
    }
    .los-nd-send-btn:hover { opacity: 0.88; transform: translateY(-1px); }

    /* Settings panel */
    .los-nd-settings {
      display: none;
      flex-direction: column; gap: 14px;
      padding: 16px 20px;
      overflow-y: auto; flex: 1;
    }
    .los-nd-settings.open { display: flex; }
    .los-nd-settings h3 {
      font-family: 'Syne', sans-serif;
      font-size: 14px; color: #9898b8;
      text-transform: uppercase; letter-spacing: 0.8px;
      margin-bottom: 4px;
    }
    .los-nd-toggle-row {
      display: flex; align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: #1c1c2e;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 10px;
    }
    .los-nd-toggle-label {
      font-size: 14px; color: #eeeef7;
    }
    .los-nd-toggle-label small { display: block; font-size: 11px; color: #7878a0; margin-top: 2px; }
    /* Toggle switch */
    .los-toggle {
      position: relative; width: 40px; height: 22px;
      flex-shrink: 0;
    }
    .los-toggle input { opacity: 0; width: 0; height: 0; }
    .los-toggle-slider {
      position: absolute; inset: 0;
      background: rgba(255,255,255,0.12);
      border-radius: 99px;
      cursor: pointer;
      transition: background 0.25s;
    }
    .los-toggle-slider::before {
      content: '';
      position: absolute;
      width: 16px; height: 16px;
      left: 3px; top: 3px;
      background: #fff; border-radius: 50%;
      transition: transform 0.25s;
    }
    .los-toggle input:checked + .los-toggle-slider { background: #8b7cf8; }
    .los-toggle input:checked + .los-toggle-slider::before { transform: translateX(18px); }

    /* Sound select */
    .los-nd-sound-row {
      display: flex; align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: #1c1c2e;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 10px; gap: 10px;
    }
    .los-nd-sound-row select {
      background: #0b0b10;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px; color: #eeeef7;
      font-size: 13px; padding: 6px 10px;
      outline: none; font-family: 'DM Sans', sans-serif;
    }

    @media (max-width: 480px) {
      #los-notif-drawer { width: 100vw; }
    }
  `;

  // =========================================
  // 5. BUILD THE DRAWER DOM
  // =========================================
  function injectUI() {
    if (document.getElementById('los-notif-drawer')) return;

    // Inject CSS
    const styleEl = document.createElement('style');
    styleEl.textContent = DRAWER_CSS;
    document.head.appendChild(styleEl);

    // Bell button — inject into topbar
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      const bell = document.createElement('button');
      bell.id = 'los-bell-btn';
      bell.setAttribute('aria-label', 'Notifications');
      bell.innerHTML = `🔔<span id="los-bell-badge"></span>`;
      topbar.appendChild(bell);
      bell.addEventListener('click', toggleDrawer);
    }

    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'los-notif-overlay';
    overlay.addEventListener('click', closeDrawer);
    document.body.appendChild(overlay);

    // Drawer
    const drawer = document.createElement('div');
    drawer.id = 'los-notif-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'Notification Center');
    drawer.innerHTML = `
      <div class="los-nd-header">
        <h2>🔔 Notifications</h2>
        <div class="los-nd-header-actions">
          <button class="los-nd-icon-btn" id="los-markall-btn">Mark all read</button>
          <button class="los-nd-icon-btn" id="los-clearall-btn">Clear all</button>
          <button class="los-nd-icon-btn" id="los-settings-btn">⚙</button>
        </div>
        <button class="los-nd-close" id="los-nd-close-btn" aria-label="Close">✕</button>
      </div>

      <div class="los-nd-tabs">
        <button class="los-nd-tab active" data-tab="all">All</button>
        <button class="los-nd-tab" data-tab="unread">Unread</button>
        <button class="los-nd-tab" data-tab="task">Tasks</button>
        <button class="los-nd-tab" data-tab="exam">School</button>
        <button class="los-nd-tab" data-tab="finance">Finance</button>
        <button class="los-nd-tab" data-tab="relationship">❤</button>
      </div>

      <div class="los-nd-list" id="los-nd-list"></div>

      <div class="los-nd-settings" id="los-nd-settings">
        <h3>Sound</h3>
        <div class="los-nd-sound-row">
          <span class="los-nd-toggle-label">Notification sound</span>
          <label class="los-toggle">
            <input type="checkbox" id="los-snd-toggle" checked />
            <span class="los-toggle-slider"></span>
          </label>
        </div>
        <div class="los-nd-sound-row">
          <span class="los-nd-toggle-label">Sound type</span>
          <select id="los-snd-type">
            <option value="chime">Chime 🎵</option>
            <option value="ping">Ping 🔔</option>
            <option value="alert">Alert ⚠️</option>
            <option value="soft">Soft 🌙</option>
          </select>
        </div>

        <h3>Reminder Types</h3>
        <div class="los-nd-toggle-row">
          <div class="los-nd-toggle-label">Task reminders<small>Daily 9 AM for due tasks</small></div>
          <label class="los-toggle"><input type="checkbox" id="los-tog-task" checked /><span class="los-toggle-slider"></span></label>
        </div>
        <div class="los-nd-toggle-row">
          <div class="los-nd-toggle-label">Habit reminders<small>8 PM if habits incomplete</small></div>
          <label class="los-toggle"><input type="checkbox" id="los-tog-habit" checked /><span class="los-toggle-slider"></span></label>
        </div>
        <div class="los-nd-toggle-row">
          <div class="los-nd-toggle-label">Exam reminders<small>1 day & 3 days before</small></div>
          <label class="los-toggle"><input type="checkbox" id="los-tog-exam" checked /><span class="los-toggle-slider"></span></label>
        </div>
        <div class="los-nd-toggle-row">
          <div class="los-nd-toggle-label">Finance reminders<small>Bill & goal alerts</small></div>
          <label class="los-toggle"><input type="checkbox" id="los-tog-finance" checked /><span class="los-toggle-slider"></span></label>
        </div>
        <div class="los-nd-toggle-row">
          <div class="los-nd-toggle-label">Relationship reminders<small>Anniversaries & birthdays</small></div>
          <label class="los-toggle"><input type="checkbox" id="los-tog-rel" checked /><span class="los-toggle-slider"></span></label>
        </div>

        <h3>Desktop Notifications</h3>
        <div class="los-nd-toggle-row">
          <div class="los-nd-toggle-label">Native notifications<small>Windows / browser alerts</small></div>
          <button class="los-nd-icon-btn" id="los-req-perm-btn" style="font-size:12px;">Request Permission</button>
        </div>
      </div>

      <div class="los-nd-footer">
        <button class="los-nd-custom-toggle" id="los-custom-toggle">＋ Create custom notification</button>
        <div class="los-nd-custom-form" id="los-custom-form">
          <input type="text" id="los-custom-title" placeholder="Title (e.g. Take meds 💊)" maxlength="60" />
          <input type="text" id="los-custom-msg" placeholder="Message (optional)" maxlength="120" />
          <div class="los-nd-custom-row">
            <input type="datetime-local" id="los-custom-time" />
            <select id="los-custom-sound">
              <option value="chime">Chime</option>
              <option value="ping">Ping</option>
              <option value="alert">Alert</option>
              <option value="soft">Soft</option>
            </select>
          </div>
          <button class="los-nd-send-btn" id="los-custom-send">Send Now</button>
        </div>
      </div>
    `;
    document.body.appendChild(drawer);

    // Wire up events
    document.getElementById('los-nd-close-btn').addEventListener('click', closeDrawer);
    document.getElementById('los-markall-btn').addEventListener('click', markAllRead);
    document.getElementById('los-clearall-btn').addEventListener('click', clearAll);
    document.getElementById('los-settings-btn').addEventListener('click', toggleSettings);
    document.getElementById('los-req-perm-btn').addEventListener('click', requestPermission);
    document.getElementById('los-custom-toggle').addEventListener('click', toggleCustomForm);
    document.getElementById('los-custom-send').addEventListener('click', sendCustomNow);

    // Tab switching
    drawer.querySelectorAll('.los-nd-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        drawer.querySelectorAll('.los-nd-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        _activeTab = tab.dataset.tab;
        renderNotifList();
      });
    });

    // Settings toggles
    const sndToggle = document.getElementById('los-snd-toggle');
    sndToggle.checked = window._notifSettings.sound !== false;
    sndToggle.addEventListener('change', () => {
      window._notifSettings.sound = sndToggle.checked;
      saveSettings();
    });

    const sndType = document.getElementById('los-snd-type');
    sndType.value = window._notifSettings.soundType || 'chime';
    sndType.addEventListener('change', () => {
      window._notifSettings.soundType = sndType.value;
      window.lifeOSPlaySound(sndType.value);
      saveSettings();
    });

    [['los-tog-task','taskReminders'],['los-tog-habit','habitReminders'],
     ['los-tog-exam','examReminders'],['los-tog-finance','financeReminders'],
     ['los-tog-rel','relationshipReminders']].forEach(([id, key]) => {
      const el = document.getElementById(id);
      el.checked = window._notifSettings[key] !== false;
      el.addEventListener('change', () => {
        window._notifSettings[key] = el.checked;
        saveSettings();
      });
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('los-notif-drawer').classList.contains('open')) {
        closeDrawer();
      }
    });
  }

  // =========================================
  // 6. DRAWER OPEN / CLOSE
  // =========================================
  let _activeTab = 'all';

  function openDrawer() {
    document.getElementById('los-notif-drawer').classList.add('open');
    document.getElementById('los-notif-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    renderNotifList();
  }
  function closeDrawer() {
    document.getElementById('los-notif-drawer').classList.remove('open');
    document.getElementById('los-notif-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }
  function toggleDrawer() {
    document.getElementById('los-notif-drawer').classList.contains('open')
      ? closeDrawer() : openDrawer();
  }
  function toggleSettings() {
    const s = document.getElementById('los-nd-settings');
    const l = document.getElementById('los-nd-list');
    const f = document.getElementById('los-nd-footer');
    const open = s.classList.contains('open');
    s.classList.toggle('open', !open);
    l.style.display = open ? '' : 'none';
    f.style.display = open ? '' : 'none';
  }
  function toggleCustomForm() {
    document.getElementById('los-custom-form').classList.toggle('open');
  }


  // =========================================
  // 7. RENDER NOTIFICATION LIST
  // =========================================
  function relTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function renderNotifList() {
    const list = document.getElementById('los-nd-list');
    if (!list) return;

    let items = _history.filter(n => {
      // Filter out snoozed items
      if (_snoozed[n.id] && _snoozed[n.id] > Date.now()) return false;
      if (_activeTab === 'all') return true;
      if (_activeTab === 'unread') return !n.read;
      return n.type === _activeTab;
    });

    if (items.length === 0) {
      list.innerHTML = `
        <div class="los-nd-empty">
          <span>🎉</span>
          ${_activeTab === 'unread' ? 'All caught up! No unread notifications.' : 'No notifications yet.'}
        </div>`;
      return;
    }

    list.innerHTML = items.map(n => {
      const meta = CATEGORY_META[n.type] || CATEGORY_META.info;
      return `
        <div class="los-nd-item ${n.read ? '' : 'unread'}"
             data-id="${n.id}"
             style="--item-color:${n.color || meta.color}">
          <div class="los-nd-item-icon">${n.icon || meta.icon}</div>
          <div class="los-nd-item-body">
            <div class="los-nd-item-title">${escHtml(n.title)}</div>
            ${n.message ? `<div class="los-nd-item-msg">${escHtml(n.message)}</div>` : ''}
            <div class="los-nd-item-time">${relTime(n.timestamp)} · ${meta.label}</div>
          </div>
          <div class="los-nd-item-actions">
            ${n.snoozable ? `<button class="los-nd-action-btn snooze" data-id="${n.id}">💤 Snooze</button>` : ''}
            <button class="los-nd-action-btn dismiss" data-id="${n.id}">✕</button>
          </div>
        </div>`;
    }).join('');

    // Click item → mark read
    list.querySelectorAll('.los-nd-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.los-nd-action-btn')) return;
        const id = el.dataset.id;
        const n = _history.find(x => x.id === id);
        if (n && !n.read) {
          n.read = true;
          saveHistory();
          renderNotifList();
          updateBadge();
        }
      });
    });

    // Dismiss buttons
    list.querySelectorAll('.los-nd-action-btn.dismiss').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        _history = _history.filter(x => x.id !== id);
        saveHistory();
        renderNotifList();
        updateBadge();
      });
    });

    // Snooze buttons
    list.querySelectorAll('.los-nd-action-btn.snooze').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showSnoozeMenu(btn.dataset.id, btn);
      });
    });
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }


  // =========================================
  // 8. SNOOZE MENU
  // =========================================
  function showSnoozeMenu(id, anchorEl) {
    document.querySelectorAll('.los-snooze-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'los-snooze-menu';
    menu.innerHTML = `
      <button class="los-snooze-opt" data-delay="300000">😴 5 minutes</button>
      <button class="los-snooze-opt" data-delay="3600000">⏰ 1 hour</button>
      <button class="los-snooze-opt" data-delay="86400000">🌅 Tomorrow</button>
    `;

    const item = anchorEl.closest('.los-nd-item');
    item.style.position = 'relative';
    item.appendChild(menu);

    menu.querySelectorAll('.los-snooze-opt').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const delay = parseInt(opt.dataset.delay);
        _snoozed[id] = Date.now() + delay;
        menu.remove();
        renderNotifList();
        window.lifeOSToast({
          title: 'Snoozed',
          message: opt.textContent.trim(),
          type: 'info', sound: 'soft', duration: 2500
        });
        // Re-fire after delay
        const n = _history.find(x => x.id === id);
        if (n) {
          setTimeout(() => {
            delete _snoozed[id];
            window.lifeOSNotify({ title: n.title, message: n.message, type: n.type });
          }, delay);
        }
      });
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', () => menu.remove(), { once: true });
    }, 50);
  }


  // =========================================
  // 9. MARK ALL / CLEAR ALL
  // =========================================
  function markAllRead() {
    _history.forEach(n => n.read = true);
    saveHistory();
    renderNotifList();
    updateBadge();
  }
  function clearAll() {
    if (!confirm('Clear all notifications?')) return;
    _history = [];
    saveHistory();
    renderNotifList();
    updateBadge();
  }


  // =========================================
  // 10. BADGE UPDATE
  // =========================================
  function updateBadge() {
    const badge = document.getElementById('los-bell-badge');
    if (!badge) return;
    const unread = _history.filter(n => !n.read).length;
    badge.textContent = unread > 99 ? '99+' : unread;
    badge.classList.toggle('visible', unread > 0);
  }


  // =========================================
  // 11. CUSTOM NOTIFICATION FORM
  // =========================================
  function sendCustomNow() {
    const title = document.getElementById('los-custom-title').value.trim();
    const msg = document.getElementById('los-custom-msg').value.trim();
    const sound = document.getElementById('los-custom-sound').value;
    const timeVal = document.getElementById('los-custom-time').value;

    if (!title) {
      document.getElementById('los-custom-title').focus();
      return;
    }

    if (timeVal) {
      const fireAt = new Date(timeVal).getTime();
      const delay = fireAt - Date.now();
      if (delay > 0) {
        window.lifeOSToast({ title: '⏰ Scheduled!', message: `"${title}" will fire at ${new Date(timeVal).toLocaleTimeString()}`, type: 'success', sound: 'ping' });
        setTimeout(() => window.lifeOSNotify({ title, message: msg, type: 'custom', sound }), delay);
        document.getElementById('los-custom-form').classList.remove('open');
        document.getElementById('los-custom-title').value = '';
        document.getElementById('los-custom-msg').value = '';
        document.getElementById('los-custom-time').value = '';
        return;
      }
    }

    window.lifeOSNotify({ title, message: msg, type: 'custom', sound });
    document.getElementById('los-custom-form').classList.remove('open');
    document.getElementById('los-custom-title').value = '';
    document.getElementById('los-custom-msg').value = '';
    document.getElementById('los-custom-time').value = '';
  }


  // =========================================
  // 12. PERMISSION REQUEST
  // =========================================
  async function requestPermission() {
    if (!('Notification' in window)) {
      window.lifeOSToast({ title: 'Not supported', message: 'Your browser doesn\'t support notifications.', type: 'error' });
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      window.lifeOSToast({ title: '✅ Notifications enabled!', message: 'You\'ll receive desktop alerts.', type: 'success', sound: 'chime' });
    } else {
      window.lifeOSToast({ title: 'Permission denied', message: 'Enable notifications in your browser settings.', type: 'warning' });
    }
  }

  window.lifeOSRequestNotifPermission = requestPermission;


  // =========================================
  // 13. IN-APP TOAST (unchanged from v1)
  // =========================================
  function _ensureToastContainer() {
    if (document.getElementById('los-toast-container')) return;
    const style = document.createElement('style');
    style.textContent = `
      #los-toast-container { position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:min(380px,calc(100vw - 40px)); }
      .los-toast { background:#1c1c2e;border:1px solid rgba(255,255,255,0.10);border-radius:14px;padding:14px 16px;box-shadow:0 8px 32px rgba(0,0,0,0.55);display:flex;align-items:flex-start;gap:12px;pointer-events:all;animation:losToastIn 0.35s cubic-bezier(0.22,1,0.36,1) both;transition:opacity 0.3s ease,transform 0.3s ease;cursor:pointer;font-family:'DM Sans',sans-serif;min-width:260px;position:relative;overflow:hidden; }
      .los-toast.los-hiding { opacity:0;transform:translateX(20px); }
      @keyframes losToastIn { from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)} }
      .los-toast-icon { font-size:22px;flex-shrink:0;line-height:1;margin-top:1px; }
      .los-toast-body { flex:1;min-width:0; }
      .los-toast-title { font-size:14px;font-weight:700;color:#eeeef7;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
      .los-toast-msg { font-size:13px;color:#9898b8;line-height:1.4;word-break:break-word; }
      .los-toast-close { background:none;border:none;color:#9898b8;font-size:16px;cursor:pointer;padding:0;flex-shrink:0;line-height:1;margin-top:1px;transition:color 0.2s;font-family:inherit; }
      .los-toast-close:hover { color:#eeeef7; }
      .los-toast-progress { position:absolute;bottom:0;left:0;height:3px;border-radius:0 0 14px 14px;transition:width linear; }
      .los-toast[data-type="success"] { border-left:3px solid #3ecf8e; } .los-toast[data-type="success"] .los-toast-progress { background:#3ecf8e; }
      .los-toast[data-type="error"] { border-left:3px solid #f87171; } .los-toast[data-type="error"] .los-toast-progress { background:#f87171; }
      .los-toast[data-type="warning"] { border-left:3px solid #fbbf24; } .los-toast[data-type="warning"] .los-toast-progress { background:#fbbf24; }
      .los-toast[data-type="info"] { border-left:3px solid #8b7cf8; } .los-toast[data-type="info"] .los-toast-progress { background:#8b7cf8; }
      .los-toast[data-type="reminder"],.los-toast[data-type="custom"] { border-left:3px solid #4f9cf9; } .los-toast[data-type="reminder"] .los-toast-progress,.los-toast[data-type="custom"] .los-toast-progress { background:#4f9cf9; }
      .los-toast[data-type="exam"] { border-left:3px solid #3ecf8e; } .los-toast[data-type="exam"] .los-toast-progress { background:#3ecf8e; }
      .los-toast[data-type="finance"] { border-left:3px solid #f5a623; } .los-toast[data-type="finance"] .los-toast-progress { background:#f5a623; }
      .los-toast[data-type="relationship"] { border-left:3px solid #e066a0; } .los-toast[data-type="relationship"] .los-toast-progress { background:#e066a0; }
      .los-toast[data-type="habit"] { border-left:3px solid #8b7cf8; } .los-toast[data-type="habit"] .los-toast-progress { background:#8b7cf8; }
      @media (max-width:480px) { #los-toast-container { top:auto;bottom:80px;right:12px;left:12px;max-width:100%; } }
    `;
    document.head.appendChild(style);
    const container = document.createElement('div');
    container.id = 'los-toast-container';
    document.body.appendChild(container);
  }

  const TYPE_ICONS = { success:'✅',error:'❌',warning:'⚠️',info:'💡',reminder:'🔔',habit:'🏆',exam:'🎓',task:'✅',finance:'💰',creator:'🎬',relationship:'💕',custom:'🔔' };

  window.lifeOSToast = function (opts = {}) {
    _ensureToastContainer();
    const { title='LifeOS', message='', type='info', icon=TYPE_ICONS[type]||'🔔',
            duration=4500, sound='chime', onClick=null } = typeof opts === 'string' ? { message: opts } : opts;
    if (sound) window.lifeOSPlaySound(sound);
    const container = document.getElementById('los-toast-container');
    const toast = document.createElement('div');
    toast.className = 'los-toast'; toast.dataset.type = type;
    toast.innerHTML = `<span class="los-toast-icon">${icon}</span><div class="los-toast-body"><div class="los-toast-title">${title}</div>${message?`<div class="los-toast-msg">${message}</div>`:''}</div><button class="los-toast-close" aria-label="Dismiss">✕</button>${duration>0?'<div class="los-toast-progress" style="width:100%"></div>':''}`;
    if (onClick) { toast.querySelector('.los-toast-body').style.cursor='pointer'; toast.querySelector('.los-toast-body').addEventListener('click', onClick); }
    function dismiss() { toast.classList.add('los-hiding'); toast.addEventListener('transitionend', () => toast.remove(), { once: true }); }
    toast.querySelector('.los-toast-close').addEventListener('click', dismiss);
    if (duration > 0) {
      const bar = toast.querySelector('.los-toast-progress');
      requestAnimationFrame(() => { bar.style.transition=`width ${duration}ms linear`; bar.style.width='0%'; });
      setTimeout(dismiss, duration);
    }
    container.appendChild(toast);
    const all = container.querySelectorAll('.los-toast');
    if (all.length > 5) all[0].remove();
    return { dismiss };
  };


  // =========================================
  // 14. NATIVE OS NOTIFICATION
  // =========================================
  window.lifeOSNotify = async function (opts = {}) {
    const { title='LifeOS', message='', type='info', icon='/favicon.svg',
            tag='lifeos-'+type, sound='chime', onClick=null } = typeof opts === 'string' ? { message: opts } : opts;

    // Save to history + show toast
    addToHistory({ title, message, type, sound, icon: TYPE_ICONS[type] || opts.icon });
    window.lifeOSToast({ title, message, type, sound, onClick });

    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) { reg.showNotification(title, { body: message, icon, badge:'/favicon.svg', tag, renotify:true, vibrate:[200,100,200] }); return; }
      }
      const n = new Notification(title, { body: message, icon, tag });
      if (onClick) n.onclick = onClick;
    } catch (e) { console.warn('[LifeOS] Native notif error:', e); }
  };


  // =========================================
  // 15. PERMISSION PROMPT BANNER (once/session)
  // =========================================
  window.lifeOSPromptNotifPermission = async function () {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    if (sessionStorage.getItem('los_notif_asked')) return;
    sessionStorage.setItem('los_notif_asked', '1');
    window.lifeOSToast({ title:'Enable Notifications?', message:'Get reminders for tasks, exams & habits.', type:'info', icon:'🔔', duration:0, sound:false,
      onClick: async () => { const p = await Notification.requestPermission(); if (p==='granted') window.lifeOSToast({ title:'Notifications enabled!', type:'success', sound:'chime' }); }
    });
  };


  // =========================================
  // 16. REMINDER SCHEDULER (runs every 60s)
  // =========================================
  let _schedulerRunning = false;

  window.lifeOSStartReminders = async function () {
    if (_schedulerRunning) return;
    _schedulerRunning = true;

    async function check() {
      if (!window._currentUser) return;
      const now = new Date();
      const hh = now.getHours(), mm = now.getMinutes();

      // Tasks at 9 AM
      if (window._notifSettings.taskReminders) {
        try {
          const todos = await window.lifeOSLoad('lifeos_todos', []);
          const todayStr = now.toDateString();
          todos.forEach(t => {
            if (t.done) return;
            if (t.date === todayStr && hh === 9 && mm === 0) {
              window.lifeOSNotify({ title:'📋 Task Due Today', message: t.text||t.title||'You have a task due today', type:'task' });
            }
          });
        } catch(_) {}
      }

      // Exams at 8 AM
      if (window._notifSettings.examReminders) {
        try {
          const exams = await window.lifeOSLoad('lifeos_exams', []);
          exams.forEach(e => {
            const daysLeft = Math.ceil((new Date(e.date) - now) / 86400000);
            if ((daysLeft === 1 || daysLeft === 3) && hh === 8 && mm === 0) {
              window.lifeOSNotify({ title:'🎓 Exam Coming Up!', message:`${e.subject||e.name||'Exam'} in ${daysLeft} day${daysLeft>1?'s':''}`, type:'exam', sound:'alert' });
            }
          });
        } catch(_) {}
      }

      // Habits at 8 PM
      if (window._notifSettings.habitReminders && hh === 20 && mm === 0) {
        try {
          const habits = await window.lifeOSLoad('lifeos_habits', []);
          const pending = habits.filter(h => !h.doneToday);
          if (pending.length > 0) {
            window.lifeOSNotify({ title:'🏆 Daily Habits', message:`${pending.length} habit${pending.length>1?'s':''} left today!`, type:'habit', sound:'ping' });
          }
        } catch(_) {}
      }

      // Finance bills (check daily at 9 AM)
      if (window._notifSettings.financeReminders && hh === 9 && mm === 0) {
        try {
          const bills = await window.lifeOSLoad('lifeos_bills', []);
          bills.forEach(b => {
            if (b.paid) return;
            const dueDate = new Date(b.dueDate);
            const daysLeft = Math.ceil((dueDate - now) / 86400000);
            if (daysLeft === 1 || daysLeft === 3 || daysLeft === 7) {
              window.lifeOSNotify({ title:'💰 Bill Due Soon', message:`${b.name||'Bill'} due in ${daysLeft} day${daysLeft>1?'s':''}`, type:'finance', sound:'chime' });
            }
          });
        } catch(_) {}
      }

      // Relationship anniversaries / birthdays (check daily at 9 AM)
      if (window._notifSettings.relationshipReminders && hh === 9 && mm === 0) {
        try {
          const dates = await window.lifeOSLoad('lifeos_relationship_dates', []);
          dates.forEach(d => {
            const event = new Date(d.date);
            // Check if today or tomorrow
            const eventThisYear = new Date(now.getFullYear(), event.getMonth(), event.getDate());
            const daysLeft = Math.ceil((eventThisYear - now) / 86400000);
            if (daysLeft === 0) {
              window.lifeOSNotify({ title:`💕 ${d.label || 'Special Day'} Today!`, message: d.note || '', type:'relationship', sound:'chime' });
            } else if (daysLeft === 1 || daysLeft === 7) {
              window.lifeOSNotify({ title:`💕 ${d.label || 'Special Day'} Coming Up`, message:`In ${daysLeft} day${daysLeft>1?'s':''}`, type:'relationship', sound:'soft' });
            }
          });
        } catch(_) {}
      }
    }

    await check();
    setInterval(check, 60 * 1000);
  };


  // =========================================
  // 17. AUTO-INIT
  // =========================================
  function init() {
    loadSettings();
    // Inject bell + drawer into DOM once body is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectUI);
    } else {
      injectUI();
    }

    if (window.authReady) {
      window.authReady.then(async () => {
        await loadHistory();
        setTimeout(() => {
          window.lifeOSPromptNotifPermission();
          window.lifeOSStartReminders();
        }, 1500);
      });
    }
  }

  init();

})();
