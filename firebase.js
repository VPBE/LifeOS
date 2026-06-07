// =========================================
// LIFEOS – FIREBASE CONFIG & SYNC  (v5 – Auth + Storage)
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
  window._db      = firebase.firestore();
  window._auth    = firebase.auth();
  window._storage = firebase.storage();

  // =========================================
  // NAVIGATION HELPER
  // =========================================
  window._lifeOSNavigate = function(page) {
    if (window.location.protocol === 'file:') {
      var base = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
      if (base.indexOf('/modules/') !== -1 && (page === 'login.html' || page === 'index.html' || page === 'signup.html')) {
        base = base.substring(0, base.lastIndexOf('/modules/') + 1);
      }
      window.location.href = base + page;
    } else {
      window.location.replace('/' + page);
    }
  };

  // =========================================
  // AUTH READY PROMISE
  // =========================================
  window.authReady = new Promise(function(resolve) {
    var unsub = window._auth.onAuthStateChanged(function(user) {
      unsub();
      if (!user) {
        window._lifeOSNavigate('login.html');
        return;
      }
      window._currentUser = user;
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
  // SCOPED KEY
  // =========================================
  window._scopedKey = function(key) {
    var uid = window._currentUser ? window._currentUser.uid : 'anonymous';
    return uid + '_' + key;
  };

  // =========================================
  // FIRESTORE SAVE / LOAD
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
    await window.authReady;
    localStorage.setItem(window._scopedKey(key), JSON.stringify(data));
    await window.saveToCloud(key, data);
  };

  window.lifeOSLoad = async function(key, defaultValue) {
    if (defaultValue === undefined) defaultValue = [];
    await window.authReady;
    var data = await window.loadFromCloud(key);
    return data !== null ? data : defaultValue;
  };

  // =========================================
  // FIREBASE STORAGE HELPERS
  // Upload a File object → returns { url, storagePath }
  // =========================================
  window.lifeOSUploadFile = async function(file, folder, onProgress) {
    await window.authReady;

    if (!window._currentUser) throw new Error('Not logged in');

    var uid      = window._currentUser.uid;
    var ts       = Date.now();
    var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    var path     = 'users/' + uid + '/' + folder + '/' + ts + '_' + safeName;
    var ref      = window._storage.ref(path);

    // Use uploadBytesResumable-style via compat SDK
    var metadata = { contentType: file.type };
    var task     = ref.put(file, metadata);

    return new Promise(function(resolve, reject) {
      // Hard timeout — if nothing happens in 60 s, bail
      var timer = setTimeout(function() {
        task.cancel();
        reject(new Error('Upload timed out after 60 seconds. Check your internet connection and Firebase Storage rules.'));
      }, 60000);

      task.on(
        'state_changed',
        function(snap) {
          // Reset timeout on progress
          clearTimeout(timer);
          timer = setTimeout(function() {
            task.cancel();
            reject(new Error('Upload stalled. Check your internet connection.'));
          }, 30000);

          var pct = snap.totalBytes > 0
            ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
            : 0;
          if (typeof onProgress === 'function') onProgress(pct);
        },
        function(err) {
          clearTimeout(timer);
          var msg = err.message || err.code || String(err);
          // Surface the most common issues clearly
          if (err.code === 'storage/unauthorized') {
            msg = 'Permission denied. Please set your Firebase Storage rules to allow authenticated uploads (see docs).';
          } else if (err.code === 'storage/canceled') {
            msg = 'Upload was cancelled.';
          } else if (err.code === 'storage/unknown') {
            msg = 'Network error. Check your internet connection.';
          }
          console.error('[LifeOS] Storage upload error:', err.code, err.message);
          reject(new Error(msg));
        },
        async function() {
          clearTimeout(timer);
          try {
            var url = await task.snapshot.ref.getDownloadURL();
            resolve({ url: url, storagePath: path });
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  };

  // Delete a file from Storage by its path
  window.lifeOSDeleteFile = async function(storagePath) {
    if (!storagePath) return;
    try {
      await window._storage.ref(storagePath).delete();
    } catch (err) {
      console.warn('[LifeOS] Storage delete failed (file may already be gone):', err);
    }
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
