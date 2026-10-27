/**
 * 6 Leshya VR - Offline Engine & Asset Manager
 * 
 * Provides:
 * 1. Persistent IndexedDB Blob storage for all 6 videos and 6 comic images
 * 2. In-memory Blob URL generation (bypasses iOS Safari range-request restrictions)
 * 3. Interactive offline pre-loader modal with live download progress
 * 4. Automatic Screen Wake Lock to prevent mobile screens from sleeping in VR
 * 5. PWA "Add to Home Screen" helper
 */

(function () {
  'use strict';

  const DB_NAME = 'LeshyaVR_DB';
  const DB_VERSION = 1;
  const STORE_NAME = 'media_blobs';

  const MEDIA_ASSETS = [
    { id: 'v1', type: 'video', index: 1, url: './videos/1.mp4', label: '1. Shukla Leshya Video' },
    { id: 'v2', type: 'video', index: 2, url: './videos/2.mp4', label: '2. Padma Leshya Video' },
    { id: 'v3', type: 'video', index: 3, url: './videos/3.mp4', label: '3. Tejo Leshya Video' },
    { id: 'v4', type: 'video', index: 4, url: './videos/4.mp4', label: '4. Kapot Leshya Video' },
    { id: 'v5', type: 'video', index: 5, url: './videos/5.mp4', label: '5. Neel Leshya Video' },
    { id: 'v6', type: 'video', index: 6, url: './videos/6.mp4', label: '6. Krishna Leshya Video' },
    { id: 'img1', type: 'image', index: 1, url: './images/1.png', label: '1. Shukla Comic Image' },
    { id: 'img2', type: 'image', index: 2, url: './images/2.png', label: '2. Padma Comic Image' },
    { id: 'img3', type: 'image', index: 3, url: './images/3.png', label: '3. Tejo Comic Image' },
    { id: 'img4', type: 'image', index: 4, url: './images/4.png', label: '4. Kapot Comic Image' },
    { id: 'img5', type: 'image', index: 5, url: './images/5.png', label: '5. Neel Comic Image' },
    { id: 'img6', type: 'image', index: 6, url: './images/6.png', label: '6. Krishna Comic Image' },
    { id: 'audio-intro1', type: 'audio', index: 1, url: './audioIntro1.mp4', label: 'Anger Analogy Voice Narration' },
    { id: 'audio-soothing', type: 'audio', index: 2, url: './soothingMusic.mp4', label: 'Soothing Background Music' }
  ];

  let dbInstance = null;
  const blobUrlCache = {};
  let wakeLockSentinel = null;

  // --- 1. IndexedDB Helper Functions ---

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (dbInstance) return resolve(dbInstance);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'url' });
        }
      };
      req.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };
      req.onerror = (e) => {
        console.warn('[OfflineEngine] IndexedDB open error:', e);
        reject(e);
      };
    });
  }

  async function getStoredBlob(url) {
    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(url);
        req.onsuccess = () => resolve(req.result ? req.result.blob : null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async function storeBlob(url, blob) {
    try {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ url: url, blob: blob, timestamp: Date.now() });
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e);
      });
    } catch (e) {
      console.warn('[OfflineEngine] storeBlob failed:', e);
      return false;
    }
  }

  async function clearDatabase() {
    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => {
          Object.values(blobUrlCache).forEach((url) => URL.revokeObjectURL(url));
          for (let k in blobUrlCache) delete blobUrlCache[k];
          resolve(true);
        };
        req.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
  }

  // --- 2. Check Cached Status & Apply to Elements ---

  async function checkOfflineStatus() {
    let cachedCount = 0;
    for (const item of MEDIA_ASSETS) {
      const blob = await getStoredBlob(item.url);
      if (blob && blob.size > 1000) {
        cachedCount++;
        if (!blobUrlCache[item.url]) {
          blobUrlCache[item.url] = URL.createObjectURL(blob);
        }
      }
    }
    const isFullyCached = cachedCount === MEDIA_ASSETS.length;
    return {
      isReady: isFullyCached,
      cachedCount: cachedCount,
      totalCount: MEDIA_ASSETS.length
    };
  }

  async function applyOfflineBlobsToDOM() {
    // 1. Apply video blobs if on index.html
    for (let i = 1; i <= 6; i++) {
      const vidEl = document.querySelector(`#v${i}`);
      const assetUrl = `./videos/${i}.mp4`;
      if (vidEl) {
        if (!blobUrlCache[assetUrl]) {
          const blob = await getStoredBlob(assetUrl);
          if (blob) blobUrlCache[assetUrl] = URL.createObjectURL(blob);
        }
        if (blobUrlCache[assetUrl] && vidEl.src !== blobUrlCache[assetUrl]) {
          vidEl.src = blobUrlCache[assetUrl];
          try { vidEl.load(); } catch (e) {}
          console.log(`[OfflineEngine] Bound offline blob to #v${i}`);
        }
      }
    }

    // 2. Apply image blobs if on images.html
    for (let i = 1; i <= 6; i++) {
      const imgEl = document.querySelector(`#img${i}`);
      const assetUrl = `./images/${i}.png`;
      if (imgEl) {
        if (!blobUrlCache[assetUrl]) {
          const blob = await getStoredBlob(assetUrl);
          if (blob) blobUrlCache[assetUrl] = URL.createObjectURL(blob);
        }
        if (blobUrlCache[assetUrl] && imgEl.src !== blobUrlCache[assetUrl]) {
          imgEl.src = blobUrlCache[assetUrl];
          console.log(`[OfflineEngine] Bound offline blob to #img${i}`);
        }
      }
    }
  }

  // --- 3. Screen Wake Lock (Prevents Mobile Phones from Sleeping in VR) ---

  async function requestScreenWakeLock() {
    if ('wakeLock' in navigator && !wakeLockSentinel) {
      try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
          wakeLockSentinel = null;
        });
        console.log('[OfflineEngine] Screen Wake Lock acquired.');
      } catch (err) {
        // Can fail if battery is ultra-low or tab is inactive
      }
    }
  }

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      await requestScreenWakeLock();
    }
  });

  ['click', 'touchstart', 'touchend', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, requestScreenWakeLock, { passive: true });
  });

  // --- 4. Service Worker Registration ---

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('[OfflineEngine] SW registered with scope:', reg.scope);
      }).catch((e) => {
        console.warn('[OfflineEngine] SW registration error:', e);
      });
    });
  }

  // --- 5. UI: Offline Status Badge & Modal ---

  function injectOfflineUI() {
    if (document.getElementById('leshya-offline-container')) return;

    const style = document.createElement('style');
    style.id = 'leshya-offline-style';
    style.textContent = `
      .offline-badge {
        position: fixed;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(15, 23, 42, 0.88);
        border: 1px solid rgba(255, 255, 255, 0.18);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        padding: 6px 14px;
        border-radius: 999px;
        color: #f1f5f9;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
        transition: all 0.25s ease;
      }
      .offline-badge:hover {
        background: rgba(30, 41, 59, 0.95);
        border-color: rgba(255, 255, 255, 0.35);
        transform: translateX(-50%) scale(1.03);
      }
      .offline-badge .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ef4444;
      }
      .offline-badge.ready .dot {
        background: #10b981;
        box-shadow: 0 0 8px #10b981;
      }
      .offline-badge.partial .dot {
        background: #f59e0b;
        box-shadow: 0 0 8px #f59e0b;
      }
      body.stereo-vr-active .offline-badge,
      .a-in-vr .offline-badge {
        display: none !important;
      }

      /* Offline Modal */
      .offline-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(3, 7, 18, 0.82);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s ease;
      }
      .offline-modal-overlay.open {
        opacity: 1;
        pointer-events: auto;
      }
      .offline-modal {
        background: #0f172a;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 20px;
        width: 100%;
        max-width: 460px;
        padding: 24px;
        box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6);
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .offline-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .offline-modal-header h3 {
        font-size: 17px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .offline-close-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 20px;
        cursor: pointer;
        padding: 4px;
      }
      .offline-modal p {
        font-size: 13px;
        color: #94a3b8;
        line-height: 1.5;
        margin-bottom: 16px;
      }
      .offline-progress-wrap {
        display: none;
        margin-bottom: 18px;
      }
      .offline-progress-wrap.active {
        display: block;
      }
      .offline-progress-bar-bg {
        width: 100%;
        height: 10px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 999px;
        overflow: hidden;
        margin-bottom: 6px;
      }
      .offline-progress-bar-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #38bdf8, #818cf8);
        border-radius: 999px;
        transition: width 0.2s ease;
      }
      .offline-progress-text {
        font-size: 11px;
        color: #cbd5e1;
        display: flex;
        justify-content: space-between;
      }
      .offline-actions {
        display: flex;
        gap: 10px;
      }
      .offline-btn-primary {
        flex: 1;
        background: linear-gradient(135deg, #2563eb, #3b82f6);
        border: none;
        color: #ffffff;
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 600;
        border-radius: 10px;
        cursor: pointer;
        transition: transform 0.15s, opacity 0.15s;
      }
      .offline-btn-primary:active {
        transform: scale(0.98);
      }
      .offline-btn-secondary {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #cbd5e1;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 500;
        border-radius: 10px;
        cursor: pointer;
      }
      .offline-tips {
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 11px;
        color: #64748b;
        line-height: 1.4;
      }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.id = 'leshya-offline-container';
    container.innerHTML = `
      <div id="leshya-offline-badge" class="offline-badge">
        <span class="dot"></span>
        <span id="leshya-offline-badge-text">Checking Offline Pack...</span>
      </div>

      <div id="leshya-offline-modal-overlay" class="offline-modal-overlay">
        <div class="offline-modal">
          <div class="offline-modal-header">
            <h3>📱 Auditorium Offline Mode</h3>
            <button id="leshya-offline-close" class="offline-close-btn">&times;</button>
          </div>
          <p id="leshya-offline-desc">
            Download the 6 videos and 6 comic scenes (~58 MB) directly to this phone while on Wi-Fi. 
            Once saved, this phone works <strong>100% offline in the auditorium with zero Wi-Fi or server needed</strong>.
          </p>
          <div id="leshya-offline-progress-wrap" class="offline-progress-wrap">
            <div class="offline-progress-bar-bg">
              <div id="leshya-offline-progress-fill" class="offline-progress-bar-fill"></div>
            </div>
            <div class="offline-progress-text">
              <span id="leshya-offline-status-detail">Preparing...</span>
              <span id="leshya-offline-percent">0%</span>
            </div>
          </div>
          <div class="offline-actions">
            <button id="leshya-offline-download-btn" class="offline-btn-primary">⚡ Download Offline Pack (58 MB)</button>
            <button id="leshya-offline-clear-btn" class="offline-btn-secondary" style="display:none;">Clear Cache</button>
          </div>
          <div class="offline-tips">
            💡 <strong>Pro Tip:</strong> On iPhone, tap <em>Share ➔ Add to Home Screen</em>. On Android, tap <em>Install App / Add to Home Screen</em>. This launches the VR experience in fullscreen with no address bar!
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const badge = document.getElementById('leshya-offline-badge');
    const badgeText = document.getElementById('leshya-offline-badge-text');
    const overlay = document.getElementById('leshya-offline-modal-overlay');
    const closeBtn = document.getElementById('leshya-offline-close');
    const downloadBtn = document.getElementById('leshya-offline-download-btn');
    const clearBtn = document.getElementById('leshya-offline-clear-btn');
    const progressWrap = document.getElementById('leshya-offline-progress-wrap');
    const progressFill = document.getElementById('leshya-offline-progress-fill');
    const statusDetail = document.getElementById('leshya-offline-status-detail');
    const percentText = document.getElementById('leshya-offline-percent');
    const descText = document.getElementById('leshya-offline-desc');

    function updateBadgeUI(status) {
      if (status.isReady) {
        badge.className = 'offline-badge ready';
        badgeText.textContent = '🟢 100% Offline Ready';
        descText.innerHTML = `✅ <strong>All 6 Videos and 6 Comic scenes are saved on this phone.</strong><br>You can now put the phone in <strong>Airplane Mode</strong> and use it in the auditorium with zero Wi-Fi or server!`;
        downloadBtn.textContent = '🔄 Re-download / Update Assets';
        clearBtn.style.display = 'block';
      } else if (status.cachedCount > 0) {
        badge.className = 'offline-badge partial';
        badgeText.textContent = `📥 ${status.cachedCount}/${status.totalCount} Cached`;
        descText.innerHTML = `⚠️ Only <strong>${status.cachedCount} of ${status.totalCount} assets</strong> are downloaded. Download the full pack to ensure smooth offline VR in the auditorium.`;
        downloadBtn.textContent = `⚡ Complete Offline Pack (${status.totalCount - status.cachedCount} remaining)`;
        clearBtn.style.display = 'block';
      } else {
        badge.className = 'offline-badge';
        badgeText.textContent = '📥 Preload for Offline VR';
        downloadBtn.textContent = '⚡ Download Offline Pack (58 MB)';
        clearBtn.style.display = 'none';
      }
    }

    badge.addEventListener('click', () => {
      overlay.classList.add('open');
    });

    closeBtn.addEventListener('click', () => {
      overlay.classList.remove('open');
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });

    clearBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to remove the cached offline VR files from this phone?')) {
        await clearDatabase();
        const status = await checkOfflineStatus();
        updateBadgeUI(status);
        alert('Offline cache cleared.');
      }
    });

    downloadBtn.addEventListener('click', async () => {
      downloadBtn.disabled = true;
      downloadBtn.style.opacity = '0.6';
      progressWrap.classList.add('active');

      let completed = 0;
      const total = MEDIA_ASSETS.length;

      for (let i = 0; i < total; i++) {
        const item = MEDIA_ASSETS[i];
        statusDetail.textContent = `Downloading ${i + 1}/${total}: ${item.label}...`;

        try {
          const resp = await fetch(item.url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const blob = await resp.blob();
          await storeBlob(item.url, blob);
          if (blobUrlCache[item.url]) {
            try { URL.revokeObjectURL(blobUrlCache[item.url]); } catch (e) {}
          }
          blobUrlCache[item.url] = URL.createObjectURL(blob);
        } catch (err) {
          console.warn(`[OfflineEngine] Failed downloading ${item.url}:`, err);
        }

        completed++;
        const pct = Math.round((completed / total) * 100);
        progressFill.style.width = `${pct}%`;
        percentText.textContent = `${pct}%`;
      }

      await applyOfflineBlobsToDOM();
      const finalStatus = await checkOfflineStatus();
      updateBadgeUI(finalStatus);

      downloadBtn.disabled = false;
      downloadBtn.style.opacity = '1';
      statusDetail.textContent = 'Download Complete!';

      setTimeout(() => {
        progressWrap.classList.remove('active');
        overlay.classList.remove('open');
      }, 1500);
    });

    // Initial check
    checkOfflineStatus().then((status) => {
      updateBadgeUI(status);
      if (status.isReady) {
        applyOfflineBlobsToDOM();
      }
    });
  }

  // --- 6. Public API ---

  window.LeshyaOfflineEngine = {
    checkStatus: checkOfflineStatus,
    applyBlobs: applyOfflineBlobsToDOM,
    getBlobUrl: (keyOrUrl) => {
      if (!keyOrUrl) return null;
      if (blobUrlCache[keyOrUrl]) return blobUrlCache[keyOrUrl];
      const normalized = keyOrUrl.startsWith('./') ? keyOrUrl : './' + keyOrUrl.replace(/^\//, '');
      if (blobUrlCache[normalized]) return blobUrlCache[normalized];
      const stripped = keyOrUrl.replace(/^\.\//, '').replace(/^\//, '');
      for (const k in blobUrlCache) {
        if (k.endsWith(stripped)) return blobUrlCache[k];
      }
      return null;
    },
    requestWakeLock: requestScreenWakeLock
  };

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectOfflineUI();
      applyOfflineBlobsToDOM();
    });
  } else {
    injectOfflineUI();
    applyOfflineBlobsToDOM();
  }
})();
