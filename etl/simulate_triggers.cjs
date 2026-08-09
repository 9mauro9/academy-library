// Custom .env loader to avoid dependencies
const fs = require('fs');
const path = require('path');
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        process.env[key] = val.trim();
      }
    });
  }
}
loadEnv();

const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getApps, initializeApp } = require('firebase-admin/app');

// Initialize Admin SDK
if (getApps().length === 0) {
  initializeApp({
    projectId: 'academy-live-builder'
  });
}

const db = getFirestore();

console.log('Starting Local Firestore Triggers Simulator...');
console.log('Listening to collection modifications to automatically trigger cache invalidation events...');

// 1. Listen to assets collection changes with auto-reconnect
function listenAssets() {
  let isAssetsInitialSnapshot = true;
  const unsubscribe = db.collection('assets').onSnapshot(snapshot => {
    if (isAssetsInitialSnapshot) {
      isAssetsInitialSnapshot = false;
      console.log(`[Simulator] Initialized assets snapshot (${snapshot.size} docs loaded)`);
      return;
    }

    snapshot.docChanges().forEach(async change => {
      if (change.type === 'modified') {
        const assetId = change.doc.id;
        const data = change.doc.data();
        console.log(`[Simulator EVENT] Asset updated: ${assetId} ("${data.name}")`);

        try {
          const invDoc = {
            type: 'asset_update',
            doc_id: assetId,
            timestamp: new Date().toISOString(),
            details: {
              name: data.name,
              version: data.version,
              attributes: data.attributes
            }
          };
          await db.collection('cache_invalidations').add(invDoc);
          console.log(`[Simulator EVENT] Logged cache invalidation for asset: ${assetId}`);
        } catch (err) {
          console.error('[Simulator ERROR] Failed to write cache invalidation:', err);
        }
      }
    });
  }, err => {
    console.error('[Simulator ERROR] Assets listener error:', err.message);
    try { unsubscribe(); } catch (e) {}
    console.log('[Simulator] Re-establishing assets listener in 5 seconds...');
    setTimeout(listenAssets, 5000);
  });
}

// 2. Listen to curriculum_map collection changes with auto-reconnect
function listenCurriculum() {
  let isCurriculumInitialSnapshot = true;
  const unsubscribe = db.collection('curriculum_map').onSnapshot(snapshot => {
    if (isCurriculumInitialSnapshot) {
      isCurriculumInitialSnapshot = false;
      console.log(`[Simulator] Initialized curriculum_map snapshot (${snapshot.size} docs loaded)`);
      return;
    }

    snapshot.docChanges().forEach(async change => {
      if (change.type === 'modified' || change.type === 'added' || change.type === 'removed') {
        const mapId = change.doc.id;
        const data = change.doc.data();
        console.log(`[Simulator EVENT] Curriculum map entry ${change.type}: ${mapId}`);

        try {
          const invDoc = {
            type: 'curriculum_write',
            doc_id: mapId,
            change_type: change.type,
            timestamp: new Date().toISOString(),
            details: {
              track_id: data.track_id
            }
          };
          await db.collection('cache_invalidations').add(invDoc);
          console.log(`[Simulator EVENT] Logged cache invalidation for curriculum entry: ${mapId}`);
        } catch (err) {
          console.error('[Simulator ERROR] Failed to write cache invalidation:', err);
        }
      }
    });
  }, err => {
    console.error('[Simulator ERROR] Curriculum listener error:', err.message);
    try { unsubscribe(); } catch (e) {}
    console.log('[Simulator] Re-establishing curriculum listener in 5 seconds...');
    setTimeout(listenCurriculum, 5000);
  });
}

listenAssets();
listenCurriculum();
