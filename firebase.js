// =========================================
// LIFEOS – FIREBASE CONFIG & SYNC  (v4 – Auth)
// firebase.js
// =========================================

(function() {
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
  // NAVIGATION HELPER
  // Works in both browser and Electron
  // =========================================
  window._lifeOSNavigate = function(page) {
    // In Electron, files are loaded via file:// protocol
    if (window.location.protocol === 'file:') {
      // Build path relative to current file location
      var base = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
      // If we're in modules/ subfolder, go up one level for root pages
      if (base.indexOf('/modules/') !== -1 && (page === 'login.html' || page === 'index.html' || page === 'signup.html')) {
        base = base.substring(0, base.lastIndexOf('/modules/') + 1);
      }
      window.location.href = base + page;
    } else {
      // Browser: use absolute path
      window.location.replace('/' + page);
    }
  };

  // =========================================
  // AUTH READY PROMISE
  // Any code that needs _currentUser should
  // await window.authReady before proceeding.
  // =========================================
  window.authReady = new Promise(function(resolve) {
    var unsub = window._auth.onAuthStateChanged(function(user) {
      unsub(); // only fire once for the initial check
      if (!user) {
        window._lifeOSNavigate('login.html');
        return;
      }
      window._currentUser = user;

      // Show name in sidebar
      var nameEl = document.getElementById('sidebarUserName');
      if (nameEl) nameEl.textContent = user.displayName || user.email;

      resolve(user);
    });
  });

  // =========================================
  // SIGN OUT
  // =========================================
  window.lifeOSSignOut = async function() {
    window._currentUser = null;
    await window._auth.signOut();
    window._lifeOSNavigate('login.html');
  };

  // =========================================
  // SCOPED KEY — data isolated per user UID
  // =========================================
  window._scopedKey = function(key) {
    var uid = window._currentUser ? window._currentUser.uid : 'anonymous';
    return uid + '_' + key;
  };

  // =========================================
  // CLOUD SAVE / LOAD
  // =========================================
  window.saveToCloud = async function(key, data) {
    if (!window._currentUser) return;
    var uid = window._currentUser.uid;
    try {
      await window._db
        .collection('users').doc(uid)
        .collection('data').doc(key)
        .set({ data: JSON.stringify(data), updatedAt: new Date().toISOString() });
      window.showSyncStatus('✓ Synced');
    } catch (err) {
      console.warn('[LifeOS] Cloud save failed:', err);
      window.showSyncStatus('⚠ Saved locally only', true);
    }
  };

  window.loadFromCloud = async function(key) {
    if (!window._currentUser) return null;
    var uid = window._currentUser.uid;
    try {
      var doc = await window._db
        .collection('users').doc(uid)
        .collection('data').doc(key)
        .get();
      if (doc.exists) {
        var parsed = JSON.parse(doc.data().data);
        localStorage.setItem(window._scopedKey(key), JSON.stringify(parsed));
        return parsed;
      }
    } catch (err) {
      console.warn('[LifeOS] Cloud load failed, using local cache:', err);
      window.showSyncStatus('⚠ Offline – using local data', true);
    }
    var local = localStorage.getItem(window._scopedKey(key));
    return local !== null ? JSON.parse(local) : null;
  };

  window.lifeOSSave = async function(key, data) {
    // Wait for auth before saving
    await window.authReady;
    localStorage.setItem(window._scopedKey(key), JSON.stringify(data));
    await window.saveToCloud(key, data);
  };

  window.lifeOSLoad = async function(key, defaultValue) {
    if (defaultValue === undefined) defaultValue = [];
    // Wait for auth before loading
    await window.authReady;
    var data = await window.loadFromCloud(key);
    return data !== null ? data : defaultValue;
  };

  // =========================================
  // SYNC STATUS TOAST
  // =========================================
  window.showSyncStatus = function(message, isError) {
    var el = document.getElementById('syncIndicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'syncIndicator';
      el.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;z-index:9999;transition:opacity 0.3s ease;font-family:\'DM Sans\',sans-serif;';
      document.body.appendChild(el);
    }
    el.textContent      = message;
    el.style.background = isError ? 'rgba(239,68,68,0.15)'         : 'rgba(62,207,142,0.15)';
    el.style.color      = isError ? '#f87171'                       : '#3ecf8e';
    el.style.border     = isError ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(62,207,142,0.3)';
    el.style.opacity    = '1';
    setTimeout(function() { el.style.opacity = '0'; }, 2500);
  };

})();
