// =========================================
// LIFEOS – FIREBASE CONFIG & SYNC  (v3 – Auth)
// firebase.js
// =========================================

(function() {
  // Guard: only run once even if loaded twice
  if (window._lifeOSFirebaseReady) return;
  window._lifeOSFirebaseReady = true;

  const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyBfjEADa5u7nPvSmSlIIyqcT4EjWjwOQQo",
    authDomain:        "lifeos-f994f.firebaseapp.com",
    projectId:         "lifeos-f994f",
    storageBucket:     "lifeos-f994f.firebasestorage.app",
    messagingSenderId: "516806488495",
    appId:             "1:516806488495:web:19024bbd85b1f193c0bf5a"
  };

  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  window._db   = firebase.firestore();
  window._auth = firebase.auth();

  // =========================================
  // AUTO AUTH GUARD
  // Runs automatically on every page that loads
  // firebase.js (i.e. every protected page).
  // login.html and signup.html do NOT load firebase.js
  // so they are exempt.
  // =========================================
  window._auth.onAuthStateChanged(function(user) {
    if (!user) {
      // Not signed in — redirect to login
      window.location.replace('/login.html');
      return;
    }

    // Signed in — expose user globally
    window._currentUser = user;

    // Show display name/email in sidebar
    const nameEl = document.getElementById('sidebarUserName');
    if (nameEl) nameEl.textContent = user.displayName || user.email;
  });

  // =========================================
  // SIGN OUT
  // =========================================
  window.lifeOSSignOut = async function() {
    await window._auth.signOut();
    window.location.replace('/login.html');
  };

  // =========================================
  // SCOPED KEY — data stored per user UID
  // =========================================
  window._scopedKey = function(key) {
    const uid = window._currentUser ? window._currentUser.uid : 'anonymous';
    return uid + '_' + key;
  };

  // =========================================
  // CLOUD SAVE / LOAD
  // Data lives at: users/{uid}/data/{key}
  // =========================================
  window.saveToCloud = async function(key, data) {
    if (!window._currentUser) return;
    const uid = window._currentUser.uid;
    try {
      await window._db
        .collection('users').doc(uid)
        .collection('data').doc(key)
        .set({
          data:      JSON.stringify(data),
          updatedAt: new Date().toISOString()
        });
      window.showSyncStatus('✓ Synced');
    } catch (err) {
      console.warn('[LifeOS] Cloud save failed:', err);
      window.showSyncStatus('⚠ Saved locally only', true);
    }
  };

  window.loadFromCloud = async function(key) {
    if (!window._currentUser) return null;
    const uid = window._currentUser.uid;
    try {
      const doc = await window._db
        .collection('users').doc(uid)
        .collection('data').doc(key)
        .get();
      if (doc.exists) {
        const parsed = JSON.parse(doc.data().data);
        localStorage.setItem(window._scopedKey(key), JSON.stringify(parsed));
        return parsed;
      }
    } catch (err) {
      console.warn('[LifeOS] Cloud load failed, using local cache:', err);
      window.showSyncStatus('⚠ Offline – using local data', true);
    }
    // Fallback to scoped localStorage
    const local = localStorage.getItem(window._scopedKey(key));
    return local !== null ? JSON.parse(local) : null;
  };

  window.lifeOSSave = async function(key, data) {
    localStorage.setItem(window._scopedKey(key), JSON.stringify(data));
    await window.saveToCloud(key, data);
  };

  window.lifeOSLoad = async function(key, defaultValue = []) {
    const data = await window.loadFromCloud(key);
    return data !== null ? data : defaultValue;
  };

  // =========================================
  // SYNC STATUS TOAST
  // =========================================
  window.showSyncStatus = function(message, isError = false) {
    let el = document.getElementById('syncIndicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'syncIndicator';
      el.style.cssText = [
        'position:fixed', 'bottom:20px', 'right:20px',
        'padding:8px 16px', 'border-radius:8px',
        'font-size:12px', 'font-weight:600', 'z-index:9999',
        "transition:opacity 0.3s ease", "font-family:'DM Sans',sans-serif"
      ].join(';');
      document.body.appendChild(el);
    }
    el.textContent      = message;
    el.style.background = isError ? 'rgba(239,68,68,0.15)'         : 'rgba(62,207,142,0.15)';
    el.style.color      = isError ? '#f87171'                       : '#3ecf8e';
    el.style.border     = isError ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(62,207,142,0.3)';
    el.style.opacity    = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 2500);
  };

})();
