// =========================================
// LIFEOS – FIREBASE CONFIG & SYNC
// firebase.js
// =========================================

// Guard: only run once even if loaded twice
if (typeof window._lifeOSFirebaseReady === 'undefined') {
  window._lifeOSFirebaseReady = true;

  const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyBfjEADa5u7nPvSmSlIIyqcT4EjWjwOQQo",
    authDomain:        "lifeos-f994f.firebaseapp.com",
    projectId:         "lifeos-f994f",
    storageBucket:     "lifeos-f994f.firebasestorage.app",
    messagingSenderId: "516806488495",
    appId:             "1:516806488495:web:19024bbd85b1f193c0bf5a"
  };

  // Only initialize if not already initialized
  if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
  }
  window._db = firebase.firestore();
}

// Always reference db from window so all pages share one instance
const db = window._db;

// =========================================
// DEVICE ID
// =========================================
function getDeviceId() {
  let id = localStorage.getItem('lifeos_device_id');
  if (!id) {
    id = 'device_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('lifeos_device_id', id);
  }
  return id;
}

// =========================================
// CORE SYNC FUNCTIONS
// =========================================
async function saveToCloud(key, data) {
  try {
    await db.collection('lifeos_data').doc(key).set({
      data:      JSON.stringify(data),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      deviceId:  getDeviceId()
    });
    console.log('[LifeOS] Saved to cloud:', key);
  } catch (err) {
    console.warn('[LifeOS] Cloud save failed, using localStorage only:', err);
  }
}

async function loadFromCloud(key) {
  try {
    const doc = await db.collection('lifeos_data').doc(key).get();
    if (doc.exists) {
      const parsed = JSON.parse(doc.data().data);
      localStorage.setItem(key, JSON.stringify(parsed));
      console.log('[LifeOS] Loaded from cloud:', key);
      return parsed;
    }
  } catch (err) {
    console.warn('[LifeOS] Cloud load failed, using localStorage:', err);
  }
  return JSON.parse(localStorage.getItem(key) || 'null');
}

async function lifeOSSave(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
  await saveToCloud(key, data);
}

async function lifeOSLoad(key, defaultValue = []) {
  const cloudData = await loadFromCloud(key);
  return cloudData !== null ? cloudData : defaultValue;
}

function showSyncStatus(message, isError = false) {
  let indicator = document.getElementById('syncIndicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'syncIndicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      z-index: 9999;
      transition: opacity 0.3s ease;
      font-family: 'DM Sans', sans-serif;
    `;
    document.body.appendChild(indicator);
  }
  indicator.textContent = message;
  indicator.style.background = isError ? 'rgba(239,68,68,0.15)' : 'rgba(62,207,142,0.15)';
  indicator.style.color      = isError ? '#f87171' : '#3ecf8e';
  indicator.style.border     = isError ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(62,207,142,0.3)';
  indicator.style.opacity    = '1';
  setTimeout(() => { indicator.style.opacity = '0'; }, 2500);
}
