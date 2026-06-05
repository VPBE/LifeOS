# LifeOS – Notification Center v2 Integration Guide

## What changed

`notifications.js` is a **drop-in replacement** for your old file.  
Just overwrite the old one — no changes needed to `index.html`, `style.css`, or any module HTML.

---

## 1. Replace the file

```
your-project/
├── notifications.js   ← replace with the new file
```

Push to GitHub → Cloudflare Pages / Firebase Hosting auto-deploys.

---

## 2. The bell icon is injected automatically

`notifications.js` finds your `.topbar` element and appends the bell button itself.  
**You do not need to touch any HTML.**

If you ever want to position it manually, add this to a topbar instead:

```html
<!-- Already auto-injected — only add manually if auto-inject fails -->
<button id="los-bell-btn" aria-label="Notifications">
  🔔<span id="los-bell-badge"></span>
</button>
```

---

## 3. Relationship dates (anniversary / birthday reminders)

The scheduler watches a key called `lifeos_relationship_dates`.  
Save an array like this from your `relationship.html` module:

```js
await window.lifeOSSave('lifeos_relationship_dates', [
  { label: "Anniversary 💍", date: "2024-08-15", note: "3 years!" },
  { label: "Her Birthday 🎂", date: "2000-03-22", note: "Get cake" },
]);
```

Reminders fire at **9 AM** on the day, 1 day before, and 7 days before.

---

## 4. Finance bill reminders

The scheduler watches `lifeos_bills`.  
Save an array like this from your `finance.html` module:

```js
await window.lifeOSSave('lifeos_bills', [
  { name: "Netflix", dueDate: "2026-06-15", amount: 180, paid: false },
  { name: "Rent",    dueDate: "2026-07-01", amount: 8000, paid: false },
]);
```

Reminders fire at **9 AM** when 7 days, 3 days, or 1 day away.  
Set `paid: true` to silence them.

---

## 5. Habit streak reminders

Already wired to `lifeos_habits` (your existing key).  
Fires at **8 PM** if any habit has `doneToday: false`.

---

## 6. Sending a notification from any module

```js
// Simple toast + history entry + OS notification
window.lifeOSNotify({
  title:   '💰 Savings Goal Reached!',
  message: 'You hit your ₱10,000 target.',
  type:    'finance',    // task | exam | habit | finance | relationship | custom | info
  sound:   'chime',      // chime | ping | alert | soft | false
});
```

---

## 7. Scheduled custom notification (from any module)

```js
// Fire once at a specific time
const fireAt = new Date('2026-06-07T09:00').getTime();
const delay  = fireAt - Date.now();
if (delay > 0) {
  setTimeout(() => window.lifeOSNotify({
    title:   '📅 Weekly Review',
    message: 'Time to review your goals.',
    type:    'custom',
  }), delay);
}
```

---

## 8. Notification types & their colors

| type           | icon | color   |
|----------------|------|---------|
| `task`         | ✅   | blue    |
| `exam`         | 🎓   | green   |
| `habit`        | 🏆   | purple  |
| `finance`      | 💰   | amber   |
| `relationship` | 💕   | pink    |
| `custom`       | 🔔   | blue    |
| `info`         | 💡   | purple  |
| `success`      | ✅   | green   |
| `warning`      | ⚠️   | yellow  |
| `error`        | ❌   | red     |

---

## 9. Snooze options (available in the drawer on every notification)

- **5 minutes** — re-fires after 5 min
- **1 hour** — re-fires after 1 hour  
- **Tomorrow** — re-fires after 24 hours

---

## 10. Storage keys used

| Key                          | Purpose                        |
|------------------------------|--------------------------------|
| `lifeos_notifications`       | Notification history (cloud)   |
| `lifeos_notif_settings`      | Sound/toggle prefs (local)     |
| `lifeos_todos`               | Task reminders (existing)      |
| `lifeos_exams`               | Exam reminders (existing)      |
| `lifeos_habits`              | Habit reminders (existing)     |
| `lifeos_bills`               | Finance bill reminders (new)   |
| `lifeos_relationship_dates`  | Anniversary/birthday (new)     |

---

## 11. Windows desktop notifications

The bell drawer has a **"Request Permission"** button under Settings (⚙).  
Once granted, all `lifeOSNotify()` calls also fire a native Windows/browser alert —  
even when the tab is in the background, via the Service Worker.

No changes needed to `sw.js` — it already handles `push` and `notificationclick`.
