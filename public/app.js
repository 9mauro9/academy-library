// Academy Library CMS SPA Application Logic
// OS 2.2 — Firebase Auth token threaded through all Firestore REST calls

const FIRESTORE_REST_BASE = 'https://firestore.googleapis.com/v1/projects/academy-live-builder/databases/(default)/documents';

// ---------------------------------------------------------------------------
// Auth helper — returns current user's ID token for authenticated REST calls
// ---------------------------------------------------------------------------
async function getAuthToken() {
  try {
    const user = firebase.auth().currentUser;
    return user ? await user.getIdToken() : null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Firestore REST helpers
// ---------------------------------------------------------------------------
function decodeFirestoreFields(fields) {
  if (!fields) return {};
  const res = {};
  for (const [key, val] of Object.entries(fields)) {
    if (val.stringValue !== undefined) res[key] = val.stringValue;
    else if (val.integerValue !== undefined) res[key] = parseInt(val.integerValue, 10);
    else if (val.doubleValue !== undefined) res[key] = parseFloat(val.doubleValue);
    else if (val.booleanValue !== undefined) res[key] = val.booleanValue;
    else if (val.referenceValue !== undefined) res[key] = val.referenceValue;
    else if (val.mapValue && val.mapValue.fields) res[key] = decodeFirestoreFields(val.mapValue.fields);
    else if (val.arrayValue && val.arrayValue.values) {
      res[key] = val.arrayValue.values.map(v =>
        v.stringValue !== undefined ? v.stringValue :
        v.integerValue !== undefined ? parseInt(v.integerValue, 10) :
        v.doubleValue !== undefined ? parseFloat(v.doubleValue) :
        v.mapValue ? decodeFirestoreFields(v.mapValue.fields) : v
      );
    }
  }
  return res;
}

async function fetchFirestoreRest(collection, maxCount = 1000) {
  try {
    const token = await getAuthToken();
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    let allDocs = [];
    let pageToken = '';
    do {
      let url = FIRESTORE_REST_BASE + '/' + collection + '?pageSize=300';
      if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
      const response = await fetch(url, { headers });
      if (!response.ok) {
        console.warn('[Firestore] GET /' + collection + ' → ' + response.status);
        break;
      }
      const data = await response.json();
      const docs = data.documents || [];
      const parsed = docs.map(d => {
        const docId = d.name.split('/').pop();
        const fields = decodeFirestoreFields(d.fields);
        return Object.assign({ id: docId, doc_id: docId }, fields);
      });
      allDocs.push(...parsed);
      pageToken = data.nextPageToken || '';
    } while (pageToken && allDocs.length < maxCount);
    return allDocs;
  } catch (e) {
    console.warn('[Firestore] fetchFirestoreRest failed for ' + collection + ':', e);
    return [];
  }
}

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(val).map(([k, v]) => [k, toFirestoreValue(v)])) } };
  }
  return { stringValue: String(val) };
}

function toFirestoreFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toFirestoreValue(v)]));
}

// Create (POST) or upsert (PATCH) a Firestore document
async function writeFirestoreDoc(collection, docId, data) {
  const token = await getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const body = JSON.stringify({ fields: toFirestoreFields(data) });
  if (docId) {
    const url = FIRESTORE_REST_BASE + '/' + collection + '/' + encodeURIComponent(docId);
    const res = await fetch(url, { method: 'PATCH', headers, body });
    if (!res.ok) throw new Error('Firestore write failed: HTTP ' + res.status);
    return res.json();
  } else {
    const url = FIRESTORE_REST_BASE + '/' + collection;
    const res = await fetch(url, { method: 'POST', headers, body });
    if (!res.ok) throw new Error('Firestore create failed: HTTP ' + res.status);
    return res.json();
  }
}

// Bulk upsert documents using Firestore client SDK batch or REST batchWrite
async function writeFirestoreBatchDocs(collection, items) {
  if (!items || items.length === 0) return;
  // If Firebase SDK client is available
  if (typeof firebase !== 'undefined' && firebase.firestore && firebase.apps && firebase.apps.length) {
    try {
      const db = firebase.firestore();
      const BATCH_LIMIT = 400;
      for (let i = 0; i < items.length; i += BATCH_LIMIT) {
        const chunk = items.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        for (const item of chunk) {
          const docRef = db.collection(collection).doc(item.docId);
          batch.set(docRef, item.data, { merge: true });
        }
        await batch.commit();
      }
      return;
    } catch (sdkErr) {
      console.warn('[Firestore SDK batch failed, falling back to REST batchWrite]:', sdkErr);
    }
  }

  // Fallback: REST :batchWrite endpoint
  const token = await getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const BATCH_LIMIT = 400;
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const chunk = items.slice(i, i + BATCH_LIMIT);
    const writes = chunk.map(item => ({
      update: {
        name: `projects/academy-live-builder/databases/(default)/documents/${collection}/${encodeURIComponent(item.docId)}`,
        fields: toFirestoreFields(item.data)
      }
    }));
    const url = 'https://firestore.googleapis.com/v1/projects/academy-live-builder/databases/(default)/documents:batchWrite';
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ writes }) });
    if (!res.ok) throw new Error(`Firestore batchWrite failed: HTTP ${res.status}`);
  }
}

async function deleteFirestoreBatchDocs(collection, docIds) {
  if (!docIds || docIds.length === 0) return;
  if (typeof firebase !== 'undefined' && firebase.firestore && firebase.apps && firebase.apps.length) {
    try {
      const db = firebase.firestore();
      const BATCH_LIMIT = 400;
      for (let i = 0; i < docIds.length; i += BATCH_LIMIT) {
        const chunk = docIds.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        for (const id of chunk) {
          batch.delete(db.collection(collection).doc(id));
        }
        await batch.commit();
      }
      return;
    } catch (sdkErr) {
      console.warn('[Firestore SDK batch delete failed, falling back to REST]:', sdkErr);
    }
  }

  const token = await getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const BATCH_LIMIT = 400;
  for (let i = 0; i < docIds.length; i += BATCH_LIMIT) {
    const chunk = docIds.slice(i, i + BATCH_LIMIT);
    const writes = chunk.map(id => ({
      delete: `projects/academy-live-builder/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`
    }));
    const url = 'https://firestore.googleapis.com/v1/projects/academy-live-builder/databases/(default)/documents:batchWrite';
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ writes }) });
    if (!res.ok) throw new Error(`Firestore batch delete failed: HTTP ${res.status}`);
  }
}

function slugify(text) {
  if (!text) return "";
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[-\s]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseDurationSeconds(val) {
  if (!val) return 0;
  const str = String(val).trim();
  if (!str) return 0;
  const parts = str.split(':');
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    return h * 3600 + m * 60 + s;
  } else if (parts.length === 2) {
    const m = parseInt(parts[0], 10) || 0;
    const s = parseInt(parts[1], 10) || 0;
    return m * 60 + s;
  }
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.round(num);
}

function inferTaxonomyFields(assetType, name) {
  const type = (assetType || 'video').toLowerCase();
  const domain = 'curriculum';
  let category = 'videos';
  if (type === 'lab' || type === 'document' || type === 'guide') category = 'documents';
  else if (type === 'diagram') category = 'diagrams';
  const slug = slugify(name || 'asset');
  const ext = category === 'videos' ? '.mp4' : (category === 'diagrams' ? '.svg' : '.pdf');
  return {
    domain,
    asset_category: category,
    gcs_uri: `gs://academy-content-bucket/${domain}/${category}/${slug}${ext}`
  };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function formatDateSafe(ts, formatType = 'time') {
  if (!ts) return 'N/A';
  try {
    let dateObj;
    if (typeof ts === 'object' && ts !== null) {
      if (ts._seconds !== undefined) dateObj = new Date(ts._seconds * 1000);
      else if (ts.seconds !== undefined) dateObj = new Date(ts.seconds * 1000);
      else if (ts.timestampValue) dateObj = new Date(ts.timestampValue);
      else dateObj = new Date(String(ts));
    } else if (typeof ts === 'number') {
      dateObj = new Date(ts);
    } else if (typeof ts === 'string') {
      dateObj = new Date(ts.trim().replace(' ', 'T'));
    }
    if (!dateObj || isNaN(dateObj.getTime())) return 'N/A';
    return formatType === 'time' ? dateObj.toLocaleTimeString() : dateObj.toLocaleString();
  } catch (err) {
    return 'N/A';
  }
}

// Minimal CSV parser that handles quoted commas
function parseCsvRows(text) {
  const lines = text.split(/\r?\n/);
  return lines.map(line => {
    const row = [];
    let inQuotes = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    return row;
  }).filter(r => r.some(cell => cell.length > 0));
}

// ---------------------------------------------------------------------------
// Main App Class
// ---------------------------------------------------------------------------
class AcademyLibraryApp {
  constructor() {
    this.currentTab = 'dashboard';
    this.assets = [];
    this.selectedTrackId = null;

    // Ingestion files state
    this.cmsFile = null;
    this.trackFile = null;
    this.customFile = null;
    this.ingestType = 'standard';

    // Cache invalidation polling
    this.logsPollTimer = null;
    this.lastLogTimestamp = null;
  }

  init() {
    console.log('[Academy Library] Initializing CMS — OS 2.2 mode');
    this.setupEventListeners();
    this.setupModalDismiss();

    // Load initial tab data
    this.switchToTab('dashboard');
    this.loadDashboardData();
    this.loadDashboardLogsPreview();
    this.loadTracks();

    // Start logs polling (Firestore-native, no API server needed)
    this.startLogsPolling();
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        this.switchToTab(tabName);
      });
    });

    // Ingestion dropzones
    this.setupDropzone('cms-dropzone', 'cms-input', 'cms-file-name', 'cms_file');
    this.setupDropzone('track-dropzone', 'track-input', 'track-file-name', 'track_file');
    this.setupDropzone('custom-dropzone', 'custom-input', 'custom-file-name', 'custom_file');

    // Ingestion type buttons
    document.querySelectorAll('.ingest-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ingest-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.ingestType = btn.getAttribute('data-type');
      });
    });

    // Sync button
    const syncBtn = document.getElementById('btn-sync-sheets');
    if (syncBtn) syncBtn.addEventListener('click', () => this.handleSheetsSync());

    // Search / filter
    const searchInput = document.getElementById('asset-search');
    if (searchInput) searchInput.addEventListener('input', () => this.renderAssetsTable());
    const filterSelect = document.getElementById('asset-filter-type');
    if (filterSelect) filterSelect.addEventListener('change', () => this.renderAssetsTable());

    // Asset form submit
    const assetForm = document.getElementById('asset-form');
    if (assetForm) assetForm.addEventListener('submit', e => { e.preventDefault(); this.handleAssetFormSubmit(); });

    // Tracks search
    const tracksSearch = document.getElementById('tracks-search');
    if (tracksSearch) tracksSearch.addEventListener('input', () => this.filterTracks());

    // Refresh buttons
    const refreshLogs = document.getElementById('btn-refresh-logs');
    if (refreshLogs) refreshLogs.addEventListener('click', () => this.loadLogs());

    const refreshHistory = document.getElementById('btn-refresh-history');
    if (refreshHistory) refreshHistory.addEventListener('click', () => this.loadHistory());
  }

  setupModalDismiss() {
    const modal = document.getElementById('assetModal');
    if (modal) {
      modal.addEventListener('click', e => {
        if (e.target === modal) modal.close();
      });
    }
  }

  setupDropzone(dropzoneId, inputId, nameId, fileKey) {
    const dropzone = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    const nameLbl = document.getElementById(nameId);
    if (!dropzone || !input) return;

    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this[fileKey] = e.dataTransfer.files[0];
        if (nameLbl) nameLbl.innerText = e.dataTransfer.files[0].name;
      }
    });
    dropzone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files.length > 0) {
        this[fileKey] = input.files[0];
        if (nameLbl) nameLbl.innerText = input.files[0].name;
      }
    });
  }

  // -----------------------------------------------------------------------
  // Google Sheets Sync — client-side direct fetch + Firestore write-back
  // -----------------------------------------------------------------------
  async handleSheetsSync() {
    const btn       = document.getElementById('btn-sync-sheets');
    const btnIcon   = document.getElementById('sync-btn-icon');
    const btnText   = document.getElementById('sync-btn-text');
    const statusDot = document.getElementById('sync-status-dot');
    const statusTxt = document.getElementById('sync-status-text');
    const statusBdg = document.getElementById('sync-status-badge');
    const console_  = document.getElementById('console-output');
    const statAssets    = document.getElementById('sync-stat-assets');
    const statCurriculum = document.getElementById('sync-stat-curriculum');
    const statOrphans   = document.getElementById('sync-stat-orphans');

    const log = msg => {
      console.log(msg);
      if (console_) {
        console_.innerText += msg + '\n';
        console_.scrollTop = console_.scrollHeight;
      }
    };

    if (btn) btn.disabled = true;
    if (btnIcon) btnIcon.innerText = '⏳';
    if (btnText) btnText.innerText = 'Syncing...';
    if (statusDot) statusDot.style.background = '#f59e0b';
    if (statusTxt) statusTxt.innerText = 'Status: Fetching from Google Sheets...';
    if (statusBdg) { statusBdg.innerText = 'Fetching...'; statusBdg.style.background = 'rgba(245,158,11,0.15)'; statusBdg.style.color = '#f59e0b'; }
    if (console_) console_.innerText = '';

    try {
      // Master source Google Sheet IDs
      const ASSETS_SHEET_ID   = '1f8mZwHXNlQbfnyZky2lxtjFAshXHMtsiK0gtgOLfSww';
      const TRACKS_SHEET_ID   = '1yRBjdg8Kjy5RVgmPvafkFmkSSFKA3EvmRmV1NWNw988';
      const assetsCsvUrl = `https://docs.google.com/spreadsheets/d/${ASSETS_SHEET_ID}/export?format=csv`;
      const tracksCsvUrl = `https://docs.google.com/spreadsheets/d/${TRACKS_SHEET_ID}/export?format=csv`;

      log('[SYNC] Downloading Master Assets sheet...');
      log('[SYNC] Downloading Master Learning Paths sheet...');

      const [assetsRes, tracksRes] = await Promise.all([fetch(assetsCsvUrl), fetch(tracksCsvUrl)]);
      if (!assetsRes.ok || !tracksRes.ok) throw new Error('Failed to download Google Sheets CSV exports.');

      const assetsText = await assetsRes.text();
      const tracksText = await tracksRes.text();

      const assetsRows = parseCsvRows(assetsText);
      const tracksRows = parseCsvRows(tracksText);

      const assetsHeaders = (assetsRows[0] || []).map(h => h.trim().toLowerCase().replace(/[\s-]/g, '_'));
      const tracksHeaders = (tracksRows[0] || []).map(h => h.trim().toLowerCase().replace(/[\s-]/g, '_'));

      const assetDataRows = assetsRows.slice(1);
      const trackDataRows = tracksRows.slice(1);

      log(`[SYNC] Parsed ${assetDataRows.length} assets and ${trackDataRows.length} curriculum rows.`);

      // 1. Prepare Assets
      const findAssetIdx = (keys) => {
        for (const k of keys) {
          const idx = assetsHeaders.indexOf(k);
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const aNameIdx = findAssetIdx(['asset_name', 'name', 'title']);
      const aTypeIdx = findAssetIdx(['asset_type', 'type']);
      const aDurIdx = findAssetIdx(['duration']);
      const aDiffIdx = findAssetIdx(['difficulty_level', 'difficulty']);
      const aTagIdx = findAssetIdx(['skill_tag', 'skill_tags', 'tags']);
      const aLastUpdIdx = findAssetIdx(['last_updated', 'date']);
      const aCvpIdx = findAssetIdx(['cvp_cv_cue_version', 'cvp_cv-cue_version', 'cvp_version', 'cvp']);
      const aEosIdx = findAssetIdx(['eos_version', 'eos']);
      const aAvdIdx = findAssetIdx(['avd_version', 'avd']);
      const aDevIdx = findAssetIdx(['developer', 'author']);
      const aNeedsUpdIdx = findAssetIdx(['needs_update']);
      const aCommentsIdx = findAssetIdx(['comments', 'notes']);

      const assetsList = [];
      const assetsByName = new Map();

      for (let i = 0; i < assetDataRows.length; i++) {
        const r = assetDataRows[i];
        if (!r || r.length < 2) continue;
        const name = (aNameIdx !== -1 && r[aNameIdx] ? String(r[aNameIdx]).trim() : '') || (r[0] ? String(r[0]).trim() : '');
        if (!name) continue;

        const assetId = slugify(name) || `asset_${i}`;
        const assetType = (aTypeIdx !== -1 && r[aTypeIdx]) ? String(r[aTypeIdx]).trim().toLowerCase() : 'video';
        const durSec = aDurIdx !== -1 ? parseDurationSeconds(r[aDurIdx]) : 0;
        const diffVal = aDiffIdx !== -1 && r[aDiffIdx] ? parseFloat(r[aDiffIdx]) : null;
        const tags = aTagIdx !== -1 && r[aTagIdx] ? String(r[aTagIdx]).split(',').map(s => s.trim()).filter(Boolean) : [];
        const lastUpdated = (aLastUpdIdx !== -1 && r[aLastUpdIdx]) ? String(r[aLastUpdIdx]).trim() : new Date().toISOString().split('T')[0];
        const cvpVer = (aCvpIdx !== -1 && r[aCvpIdx]) ? String(r[aCvpIdx]).trim() : '';
        const eosVer = (aEosIdx !== -1 && r[aEosIdx]) ? String(r[aEosIdx]).trim() : '';
        const avdVer = (aAvdIdx !== -1 && r[aAvdIdx]) ? String(r[aAvdIdx]).trim() : '';
        const dev = (aDevIdx !== -1 && r[aDevIdx]) ? String(r[aDevIdx]).trim() : '';
        const needsUpd = aNeedsUpdIdx !== -1 && ['yes', 'true', '1'].includes(String(r[aNeedsUpdIdx]).toLowerCase().trim());
        const comments = (aCommentsIdx !== -1 && r[aCommentsIdx]) ? String(r[aCommentsIdx]).trim() : '';

        const taxonomy = inferTaxonomyFields(assetType, name);

        const assetDoc = {
          asset_id: assetId,
          name: name,
          current_title: name,
          title_aliases: [],
          type: assetType,
          domain: taxonomy.domain,
          asset_category: taxonomy.asset_category,
          gcs_uri: taxonomy.gcs_uri,
          content_hash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          major_version: 1,
          minor_version: 0,
          version: 1,
          status: 'ACTIVE',
          is_latest: true,
          developer: dev,
          attributes: {
            duration: durSec,
            prerequisite: null,
            difficulty_level: isNaN(diffVal) ? null : diffVal,
            skill_tags: tags,
            last_updated: lastUpdated,
            cvp_version: cvpVer,
            eos_version: eosVer,
            avd_version: avdVer,
            needs_update: needsUpd,
            comments: comments,
            topic: null
          }
        };

        assetsList.push({ docId: assetId, data: assetDoc });
        assetsByName.set(name.toLowerCase(), assetId);
      }

      // 2. Prepare Curriculum Map Nodes
      const findTrackIdx = (keys) => {
        for (const k of keys) {
          const idx = tracksHeaders.indexOf(k);
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const tNumIdx = findTrackIdx(['track_number']);
      const tNameIdx = findTrackIdx(['track_name', 'track']);
      const stNumIdx = findTrackIdx(['sub_track_number']);
      const stNameIdx = findTrackIdx(['sub_track_name', 'sub_track']);
      const lNumIdx = findTrackIdx(['lesson_number']);
      const lNameIdx = findTrackIdx(['lesson_name', 'lesson']);
      const topNumIdx = findTrackIdx(['topic_number']);
      const topNameIdx = findTrackIdx(['topic_name', 'topic']);
      const topDescIdx = findTrackIdx(['topic_description', 'description']);
      const subTopNumIdx = findTrackIdx(['sub_topic_number']);
      const assetNameIdx = findTrackIdx(['asset_name', 'sub_topic_name', 'sub_topic', 'title']);

      const parseNum = (val) => {
        if (val === null || val === undefined || val === '') return null;
        const n = parseFloat(val);
        return isNaN(n) ? null : n;
      };

      const curriculumList = [];
      let orphanedCount = 0;

      for (let i = 0; i < trackDataRows.length; i++) {
        const r = trackDataRows[i];
        if (!r || r.length < 2) continue;

        const trackName = (tNameIdx !== -1 && r[tNameIdx] ? String(r[tNameIdx]).trim() : '') || 'General Track';
        const subTrackName = (stNameIdx !== -1 && r[stNameIdx] ? String(r[stNameIdx]).trim() : '') || 'General';
        const lessonName = (lNameIdx !== -1 && r[lNameIdx] ? String(r[lNameIdx]).trim() : '') || 'General Lesson';
        const topicName = (topNameIdx !== -1 && r[topNameIdx] ? String(r[topNameIdx]).trim() : '') || 'General Topic';
        const topicDesc = (topDescIdx !== -1 && r[topDescIdx]) ? String(r[topDescIdx]).trim() : '';
        const subTopicNum = subTopNumIdx !== -1 ? parseNum(r[subTopNumIdx]) : (i + 1);

        let assetName = assetNameIdx !== -1 && r[assetNameIdx] ? String(r[assetNameIdx]).trim() : '';
        if (!assetName) continue;

        const assetRefId = assetsByName.get(assetName.toLowerCase()) || null;
        if (!assetRefId) {
          orphanedCount++;
        }

        const trackId = slugify(trackName);
        const docId = `node_${trackId}_${slugify(lessonName)}_${slugify(topicName)}_${subTopicNum || 1}_${slugify(assetName)}`;

        const sorting = {
          track_number: tNumIdx !== -1 ? parseNum(r[tNumIdx]) : null,
          sub_track_number: stNumIdx !== -1 ? parseNum(r[stNumIdx]) : null,
          lesson_number: lNumIdx !== -1 ? parseNum(r[lNumIdx]) : null,
          topic_number: topNumIdx !== -1 ? parseNum(r[topNumIdx]) : null,
          sub_topic_number: subTopicNum
        };

        const curriculumDoc = {
          doc_id: docId,
          id: docId,
          track_id: trackId,
          track_name: trackName,
          sub_track: subTrackName,
          sub_track_name: subTrackName,
          lesson: lessonName,
          lesson_name: lessonName,
          topic: topicName,
          topic_name: topicName,
          topic_description: topicDesc,
          sub_topic_number: subTopicNum,
          asset_name: assetName,
          asset_ref_id: assetRefId,
          version: 1,
          is_latest: true,
          sorting: sorting
        };

        curriculumList.push({ docId, data: curriculumDoc });
      }

      // 3. Batched Asset Upsert
      if (statusTxt) statusTxt.innerText = 'Status: Writing assets to Firestore in batches...';
      const BATCH_SIZE = 400;
      const assetBatches = Math.ceil(assetsList.length / BATCH_SIZE);
      for (let b = 0; b < assetBatches; b++) {
        const chunk = assetsList.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        log(`[SYNC] Writing assets: batch ${b + 1} of ${assetBatches} (${chunk.length} items)...`);
        await writeFirestoreBatchDocs('assets', chunk);
      }
      log(`[SUCCESS] Committed ${assetsList.length} assets to Firestore.`);

      // 4. Batched Curriculum Upsert
      if (statusTxt) statusTxt.innerText = 'Status: Writing curriculum map to Firestore in batches...';
      const curriculumBatches = Math.ceil(curriculumList.length / BATCH_SIZE);
      for (let b = 0; b < curriculumBatches; b++) {
        const chunk = curriculumList.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        log(`[SYNC] Writing curriculum: batch ${b + 1} of ${curriculumBatches} (${chunk.length} nodes)...`);
        await writeFirestoreBatchDocs('curriculum_map', chunk);
      }
      log(`[SUCCESS] Committed ${curriculumList.length} curriculum map nodes to Firestore.`);

      // 5. Clean up old malformed cm_... and outdated documents from curriculum_map
      log('[SYNC] Cleaning up legacy malformed documents from curriculum_map...');
      try {
        const existingDocs = await fetchFirestoreRest('curriculum_map', 2500);
        const cmIdsToDelete = existingDocs
          .filter(d => d.id && (d.id.startsWith('cm_') || d.id === 'node_automation_cloudvision-fundamentals_change-control_1_lab-change-control'))
          .map(d => d.id);
        if (cmIdsToDelete.length > 0) {
          log(`[SYNC] Purging ${cmIdsToDelete.length} legacy / outdated documents...`);
          await deleteFirestoreBatchDocs('curriculum_map', cmIdsToDelete);
          log(`[SUCCESS] Purged ${cmIdsToDelete.length} legacy documents.`);
        }
      } catch (cleanErr) {
        console.warn('Non-fatal cleanup warning:', cleanErr);
      }

      // 6. Record Checkpoint
      const checkpointId = 'sync_' + Date.now();
      try {
        await writeFirestoreDoc('cms_history', checkpointId, {
          commit_id: checkpointId,
          description: 'Automated Google Sheets Sync — ' + new Date().toISOString(),
          author: (typeof firebase !== 'undefined' && firebase.auth()?.currentUser?.email) || 'CMS Operator',
          timestamp: new Date().toISOString(),
          assets_count: assetsList.length,
          curriculum_count: curriculumList.length,
          orphaned_count: orphanedCount
        });
      } catch (e) { /* non-fatal */ }

      // 7. Update UI Stats
      if (statAssets) statAssets.innerText = assetsList.length;
      if (statCurriculum) statCurriculum.innerText = curriculumList.length;
      if (statOrphans) statOrphans.innerText = orphanedCount;

      if (statusDot) statusDot.style.background = '#10b981';
      if (statusTxt) statusTxt.innerText = 'Status: Sync Complete — data live in Firestore!';
      if (statusBdg) { statusBdg.innerText = 'Sync Complete'; statusBdg.style.background = 'rgba(16,185,129,0.15)'; statusBdg.style.color = '#10b981'; }

      this.loadDashboardData();

    } catch (err) {
      console.error('[SYNC] Error:', err);
      log('[ERROR] ' + err.message);
      if (statusDot) statusDot.style.background = '#ef4444';
      if (statusTxt) statusTxt.innerText = 'Status: Sync Failed — ' + err.message;
      if (statusBdg) { statusBdg.innerText = 'Error'; statusBdg.style.background = 'rgba(239,68,68,0.15)'; statusBdg.style.color = '#ef4444'; }
    } finally {
      if (btn) btn.disabled = false;
      if (btnIcon) btnIcon.innerText = '⚡';
      if (btnText) btnText.innerText = 'Sync Database';
    }
  }

  // -----------------------------------------------------------------------
  // Tab Navigation
  // -----------------------------------------------------------------------
  switchToTab(tabName) {
    this.currentTab = tabName;
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('.content-tab').forEach(sec => sec.classList.remove('active'));
    const activeSec = document.getElementById(tabName);
    if (activeSec) activeSec.classList.add('active');

    if (tabName === 'assets') this.loadAssets();
    if (tabName === 'tracks') this.loadTracks();
    if (tabName === 'logs') this.loadLogs();
    if (tabName === 'history') this.loadHistory();
  }

  // -----------------------------------------------------------------------
  // Dashboard
  // -----------------------------------------------------------------------
  async loadDashboardData() {
    try {
      const [assets, curr] = await Promise.all([
        fetchFirestoreRest('assets', 2000),
        fetchFirestoreRest('curriculum_map', 2000)
      ]);

      const assetsCount = assets.length;
      const tracksSet = new Set(curr.map(d => d.track_name || d.track_id).filter(Boolean));
      const tracksCount = tracksSet.size;

      const statAssets = document.getElementById('stat-assets-count');
      if (statAssets) statAssets.innerText = assetsCount || '—';
      const statTracks = document.getElementById('stat-tracks-count');
      if (statTracks) statTracks.innerText = tracksCount || '—';
    } catch (err) {
      console.error('[Dashboard] Failed to load metrics:', err);
    } finally {
      this.loadDashboardLogsPreview();
    }
  }

  async loadDashboardLogsPreview() {
    const previewList = document.getElementById('invalidation-preview-list');
    if (!previewList) return;

    try {
      const docs = await fetchFirestoreRest('cache_invalidations', 10);
      const logs = docs.map(d => ({
        doc_id: d.doc_id || d.id,
        type: d.type || 'update',
        timestamp: d.timestamp || new Date().toISOString(),
        details: d.details || {}
      }));

      if (logs.length === 0) {
        previewList.innerHTML = '<li class="loading-placeholder">No recent invalidation events logged.</li>';
        return;
      }

      previewList.innerHTML = logs.slice(0, 5).map(log => {
        const timeString = formatDateSafe(log.timestamp, 'time');
        const docName = (log.details && (log.details.name || log.details.source)) || log.doc_id;
        const badgeClass = (log.type === 'asset_update' || log.type === 'sheets_sync') ? 'asset' : 'curriculum';
        return `<li class="invalidation-item ${badgeClass}">` +
          `<div class="inv-meta"><span class="inv-name">${docName}</span>` +
          `<span class="inv-time">${timeString} • Doc: ${log.doc_id}</span></div>` +
          `<span class="inv-badge">${(log.type || 'update').replace('_', ' ')}</span></li>`;
      }).join('');
    } catch (err) {
      console.error('[Dashboard] Failed to load logs preview:', err);
      previewList.innerHTML = '<li class="loading-placeholder">No recent invalidation events logged.</li>';
    }
  }

  // -----------------------------------------------------------------------
  // Asset Manager
  // -----------------------------------------------------------------------
  async loadAssets() {
    const tableBody = document.getElementById('assets-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" class="loading-placeholder">Loading assets from Firestore...</td></tr>';

    try {
      const docs = await fetchFirestoreRest('assets', 2000);
      this.assets = docs.map(d => ({
        asset_id: d.id,
        name: d.name || d.id,
        type: d.type || 'video',
        version: d.version,
        attributes: d.attributes || {}
      }));
      this.renderAssetsTable();
    } catch (err) {
      console.error('[Assets] loadAssets error:', err);
      tableBody.innerHTML = `<tr><td colspan="5" class="loading-placeholder" style="color:#ef4444;">Failed to load assets: ${err.message}</td></tr>`;
    }
  }

  renderAssetsTable() {
    const tableBody = document.getElementById('assets-table-body');
    if (!tableBody) return;

    const searchQuery = (document.getElementById('asset-search')?.value || '').toLowerCase().trim();
    const filterType  = document.getElementById('asset-filter-type')?.value || '';

    const filtered = this.assets.filter(asset => {
      const matchesSearch = (asset.name || '').toLowerCase().includes(searchQuery) ||
        (asset.attributes?.topic || '').toLowerCase().includes(searchQuery);
      const matchesType = !filterType || asset.type === filterType;
      return matchesSearch && matchesType;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" class="loading-placeholder">No matching assets found.</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(asset => {
      const attr = asset.attributes || {};
      const duration = attr.duration ? Math.floor(attr.duration / 60) + 'm ' + (attr.duration % 60) + 's' : 'N/A';
      const difficulty = attr.difficulty_level != null ? parseFloat(attr.difficulty_level).toFixed(1) : 'N/A';
      return `<tr>` +
        `<td><div style="font-weight:600;">${asset.name}</div><div style="font-size:0.75rem;color:var(--text-muted);">ID: ${asset.asset_id}</div></td>` +
        `<td><span class="asset-badge ${asset.type}">${asset.type}</span></td>` +
        `<td>${duration}</td>` +
        `<td>⭐ ${difficulty}</td>` +
        `<td>` +
          `<button class="table-action-btn" title="Edit" onclick="app.showEditAssetModal('${asset.asset_id}')">✏️</button>` +
          `<button class="table-action-btn" title="Delete" style="margin-left:8px;" onclick="app.deleteAsset('${asset.asset_id}')">🗑️</button>` +
        `</td></tr>`;
    }).join('');
  }

  showAddAssetModal() {
    document.getElementById('edit-asset-id').value = '';
    document.getElementById('modalTitle').innerText = 'Add Content Asset';
    document.getElementById('submit-asset-btn').innerText = 'Save Asset';
    document.getElementById('asset-form').reset();
    document.getElementById('assetModal').showModal();
  }

  showEditAssetModal(assetId) {
    const asset = this.assets.find(a => a.asset_id === assetId);
    if (!asset) return;
    document.getElementById('edit-asset-id').value = asset.asset_id;
    document.getElementById('modalTitle').innerText = 'Edit Asset: ' + asset.asset_id;
    document.getElementById('submit-asset-btn').innerText = 'Update Asset';
    document.getElementById('asset-name').value = asset.name || '';
    document.getElementById('asset-type').value = asset.type || 'video';
    document.getElementById('asset-version').value = asset.version || 1;
    const attr = asset.attributes || {};
    document.getElementById('asset-duration').value = attr.duration || 0;
    document.getElementById('asset-difficulty').value = attr.difficulty_level || 1.0;
    document.getElementById('asset-tags').value = attr.skill_tags ? attr.skill_tags.join(', ') : '';
    document.getElementById('asset-topic').value = attr.topic || '';
    document.getElementById('asset-cvp-ver').value = attr.cvp_version || '';
    document.getElementById('asset-eos-ver').value = attr.eos_version || '';
    document.getElementById('asset-prereq').value = attr.prerequisite || '';
    document.getElementById('asset-needs-update').checked = !!attr.needs_update;
    document.getElementById('asset-comments').value = attr.comments || '';
    document.getElementById('assetModal').showModal();
  }

  async handleAssetFormSubmit() {
    const editId = document.getElementById('edit-asset-id').value;
    const payload = {
      name: document.getElementById('asset-name').value,
      type: document.getElementById('asset-type').value,
      version: parseInt(document.getElementById('asset-version').value, 10),
      attributes: {
        duration: parseInt(document.getElementById('asset-duration').value, 10),
        difficulty_level: parseFloat(document.getElementById('asset-difficulty').value),
        skill_tags: document.getElementById('asset-tags').value.split(',').map(s => s.trim()).filter(Boolean),
        topic: document.getElementById('asset-topic').value,
        cvp_version: document.getElementById('asset-cvp-ver').value,
        eos_version: document.getElementById('asset-eos-ver').value,
        prerequisite: document.getElementById('asset-prereq').value,
        needs_update: document.getElementById('asset-needs-update').checked,
        comments: document.getElementById('asset-comments').value
      },
      updated_at: new Date().toISOString()
    };

    try {
      // Use editId as doc ID for update; generate slug for new assets
      const docId = editId || payload.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 80);
      await writeFirestoreDoc('assets', docId, payload);
      document.getElementById('assetModal').close();
      alert(editId ? 'Asset updated successfully!' : 'Asset created successfully!');
      this.loadAssets();
      this.loadDashboardData();
    } catch (err) {
      alert('Firestore Error: ' + err.message);
    }
  }

  async deleteAsset(assetId) {
    if (!confirm(`Are you absolutely sure you want to delete the asset "${assetId}"?\nThis will permanently remove it from Firestore.`)) return;
    try {
      await deleteFirestoreDoc('assets', assetId);
      alert('Asset deleted successfully.');
      this.loadAssets();
      this.loadDashboardData();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

  // -----------------------------------------------------------------------
  // Tracks Browser
  // -----------------------------------------------------------------------
  async loadTracks() {
    const tracksList = document.getElementById('sidebar-tracks-list');
    if (!tracksList) return;
    tracksList.innerHTML = '<div class="loading-placeholder">Loading tracks from Firestore...</div>';

    const getTrackNumber = (tid, tname, num) => {
      const idKey   = (tid   || '').toLowerCase().trim().replace(/_/g, '-');
      const nameKey = (tname || '').toLowerCase().trim();
      const TRACK_MAP = {
        'network-foundations': 1, 'network foundations': 1,
        'data-center': 2,         'data center': 2,
        'campus': 3,
        'automation': 4,
        'wan-routing': 5,         'wan routing': 5
      };
      if (TRACK_MAP[idKey])  return TRACK_MAP[idKey];
      if (TRACK_MAP[nameKey]) return TRACK_MAP[nameKey];
      if (idKey.includes('foundation')  || nameKey.includes('foundation'))  return 1;
      if (idKey.includes('data-center') || nameKey.includes('data center')) return 2;
      if (idKey.includes('campus')      || nameKey.includes('campus'))      return 3;
      if (idKey.includes('automation')  || nameKey.includes('automation'))  return 4;
      if (idKey.includes('wan')         || nameKey.includes('wan'))         return 5;
      if (num !== undefined && num !== null && num !== 999) return num;
      return 999;
    };

    try {
      const docs = await fetchFirestoreRest('curriculum_map', 2000);
      const map = new Map();
      docs.forEach(d => {
        const tid   = d.track_id   || d.track || 'default';
        const tname = d.track_name || d.track || tid;
        const rawNum = d.sorting?.track_number ?? d.track_number ?? 999;
        const tnum = getTrackNumber(tid, tname, rawNum);
        if (!map.has(tid)) {
          map.set(tid, { track_id: tid, track_name: tname, track_number: tnum });
        } else {
          const existing = map.get(tid);
          if ((existing.track_number === 999) && tnum !== 999) existing.track_number = tnum;
        }
      });

      this.allTracks = Array.from(map.values()).sort((a, b) => {
        const nA = getTrackNumber(a.track_id, a.track_name, a.track_number);
        const nB = getTrackNumber(b.track_id, b.track_name, b.track_number);
        if (nA !== nB) return nA - nB;
        return (a.track_name || '').localeCompare(b.track_name || '');
      });

      this.renderTracksList(this.allTracks);

      if (this.allTracks.length > 0 && !this.selectedTrackId) {
        this.selectTrack(this.allTracks[0].track_id, this.allTracks[0].track_name);
      }
    } catch (err) {
      console.error('[Tracks] loadTracks error:', err);
      tracksList.innerHTML = `<div class="loading-placeholder" style="color:#ef4444;">Failed: ${err.message}</div>`;
    }
  }

  filterTracks() {
    if (!this.allTracks) return;
    const q = (document.getElementById('tracks-search')?.value || '').toLowerCase();
    const filtered = q ? this.allTracks.filter(t => (t.track_name || '').toLowerCase().includes(q)) : this.allTracks;
    this.renderTracksList(filtered);
  }

  renderTracksList(tracks) {
    const tracksList = document.getElementById('sidebar-tracks-list');
    if (!tracksList) return;
    if (!tracks || tracks.length === 0) {
      tracksList.innerHTML = '<div class="loading-placeholder">No tracks found.</div>';
      return;
    }
    tracksList.innerHTML = tracks.map(t => {
      const safeName = (t.track_name || '').replace(/'/g, "\\'");
      const isActive = t.track_id === this.selectedTrackId;
      return `<button class="track-select-btn${isActive ? ' active' : ''}" data-track-id="${t.track_id}" onclick="app.selectTrack('${t.track_id}', '${safeName}')">` +
        `🌿 ${t.track_name}</button>`;
    }).join('');
  }

  async selectTrack(trackId, trackName) {
    this.selectedTrackId = trackId;
    document.querySelectorAll('.track-select-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-track-id') === trackId);
    });

    const treeTitle = document.getElementById('tree-title');
    if (treeTitle) treeTitle.innerText = trackName;
    const treeContent = document.getElementById('tree-content');
    if (!treeContent) return;

    treeContent.innerHTML = '<div class="loading-placeholder">Loading curriculum map...</div>';

    try {
      const docs = await fetchFirestoreRest('curriculum_map', 2000);
      const trackDocs = docs.filter(d => d.track_id === trackId || d.track_name === trackName);

      const subTrackMap = new Map();
      trackDocs.forEach(d => {
        const stName = d.sub_track || 'General Sub-Track';
        const stNum  = d.sub_track_number || d.sorting?.sub_track_number || null;
        if (!subTrackMap.has(stName)) subTrackMap.set(stName, { sub_track_name: stName, sub_track_number: stNum, lessons: new Map() });
        const st = subTrackMap.get(stName);
        if (!st.sub_track_number && stNum) st.sub_track_number = stNum;

        const lName = d.lesson || 'General Lesson';
        const lNum  = d.lesson_number || d.sorting?.lesson_number || null;
        if (!st.lessons.has(lName)) st.lessons.set(lName, { lesson_name: lName, lesson_number: lNum, topics: new Map() });
        const les = st.lessons.get(lName);
        if (!les.lesson_number && lNum) les.lesson_number = lNum;

        const topName = d.topic || 'General Topic';
        const topNum  = d.topic_number || d.sorting?.topic_number || null;
        if (!les.topics.has(topName)) {
          les.topics.set(topName, {
            topic_name: topName,
            topic_number: topNum,
            topic_description: d.topic_description || null,
            sub_topics: []
          });
        }
        const top = les.topics.get(topName);
        if (!top.topic_number && topNum) top.topic_number = topNum;
        if (d.sub_topic) top.sub_topics.push(d.sub_topic);
      });

      const sortByNum = (a, b, key) => {
        const nA = parseFloat(a[key]) || 999;
        const nB = parseFloat(b[key]) || 999;
        return nA - nB;
      };

      const subTracks = Array.from(subTrackMap.values()).sort((a, b) => sortByNum(a, b, 'sub_track_number'));

      if (trackDocs.length === 0) {
        treeContent.innerHTML = '<div class="loading-placeholder">No curriculum content found for this track.</div>';
        return;
      }

      treeContent.innerHTML = subTracks.map(st => {
        const lessons = Array.from(st.lessons.values()).sort((a, b) => sortByNum(a, b, 'lesson_number'));
        const lessonsHtml = lessons.map(les => {
          const topics = Array.from(les.topics.values()).sort((a, b) => sortByNum(a, b, 'topic_number'));
          const topicsHtml = topics.map(top => {
            const subTopicsHtml = top.sub_topics.length
              ? top.sub_topics.map(st => `<li class="sub-topic-item">◦ ${st}</li>`).join('')
              : '';
            return `<div class="topic-item">` +
              `<div class="topic-header"><span class="topic-name">📌 ${top.topic_name}</span>` +
              (top.topic_description ? `<span class="topic-desc">${top.topic_description}</span>` : '') +
              `</div>` +
              (subTopicsHtml ? `<ul class="sub-topics-list">${subTopicsHtml}</ul>` : '') +
              `</div>`;
          }).join('');
          return `<div class="lesson-item">` +
            `<div class="lesson-header">📖 ${les.lesson_name}</div>` +
            `<div class="topics-container">${topicsHtml}</div></div>`;
        }).join('');

        return `<div class="sub-track-section">` +
          `<div class="sub-track-header">🗂️ ${st.sub_track_name}</div>` +
          `<div class="lessons-container">${lessonsHtml}</div></div>`;
      }).join('');

    } catch (err) {
      console.error('[Tracks] selectTrack error:', err);
      treeContent.innerHTML = `<div class="loading-placeholder" style="color:#ef4444;">Failed to load: ${err.message}</div>`;
    }
  }

  // -----------------------------------------------------------------------
  // Invalidation Logs
  // -----------------------------------------------------------------------
  async loadLogs() {
    const tableBody = document.getElementById('logs-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4" class="loading-placeholder">Loading invalidation logs from Firestore...</td></tr>';

    try {
      const docs = await fetchFirestoreRest('cache_invalidations', 100);
      const logs = docs.map(d => ({
        doc_id: d.doc_id || d.id,
        type: d.type || 'update',
        change_type: d.change_type || 'MODIFIED',
        timestamp: d.timestamp || new Date().toISOString(),
        details: d.details || {}
      }));

      if (logs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="loading-placeholder">No cache invalidations recorded yet.</td></tr>';
        return;
      }

      tableBody.innerHTML = logs.map(log => {
        const timeStr   = formatDateSafe(log.timestamp, 'full');
        const docName   = (log.details && log.details.name) || log.doc_id;
        const detailsStr = log.details ? JSON.stringify(log.details) : '-';
        return `<tr>` +
          `<td style="font-family:var(--font-mono);font-size:0.8rem;">${timeStr}</td>` +
          `<td><span class="asset-badge ${log.type === 'asset_update' ? 'video' : 'lab'}">${log.change_type || log.type}</span></td>` +
          `<td style="font-family:var(--font-mono);font-size:0.8rem;">${log.doc_id}</td>` +
          `<td style="font-size:0.85rem;"><strong>${docName}</strong> <span style="color:var(--text-muted);font-size:0.75rem;">${detailsStr}</span></td>` +
          `</tr>`;
      }).join('');
    } catch (err) {
      console.error('[Logs] loadLogs error:', err);
      tableBody.innerHTML = `<tr><td colspan="4" class="loading-placeholder" style="color:#ef4444;">Failed: ${err.message}</td></tr>`;
    }
  }

  // -----------------------------------------------------------------------
  // History & Undo
  // -----------------------------------------------------------------------
  async loadHistory() {
    const container = document.getElementById('history-timeline-container');
    if (!container) return;
    container.innerHTML = '<div class="loading-placeholder">Loading database checkpoints from Firestore...</div>';

    try {
      const docs = await fetchFirestoreRest('cms_history', 50);
      const commits = docs.map(d => ({
        commit_id: d.commit_id || d.id,
        description: d.description || 'Database Checkpoint',
        author: d.author || 'CMS System',
        timestamp: d.timestamp || new Date().toISOString(),
        assets_count: d.assets_count || 0,
        curriculum_count: d.curriculum_count || 0
      }));

      if (commits.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">No database checkpoints saved yet. Run a Google Sheets sync to create one.</div>';
        return;
      }

      container.innerHTML = commits.map(c => {
        const timeStr = formatDateSafe(c.timestamp, 'full');
        return `<div class="commit-card">` +
          `<div class="commit-info">` +
            `<span class="commit-desc">${c.description}</span>` +
            `<div class="commit-meta">` +
              `<span>👤 ${c.author}</span>` +
              `<span>📅 ${timeStr}</span>` +
              `<span>🔑 Commit: ${c.commit_id}</span>` +
            `</div>` +
            `<div class="commit-counts">` +
              `<span class="count-badge">🎬 Assets: ${c.assets_count}</span>` +
              `<span class="count-badge">🌿 Curriculum: ${c.curriculum_count}</span>` +
            `</div>` +
          `</div>` +
          `<button class="revert-btn" onclick="app.revertToCheckpoint('${c.commit_id}')">↩️ Revert State</button>` +
          `</div>`;
      }).join('');
    } catch (err) {
      console.error('[History] loadHistory error:', err);
      container.innerHTML = `<div class="loading-placeholder" style="color:#ef4444;">Failed: ${err.message}</div>`;
    }
  }

  async revertToCheckpoint(commitId) {
    alert(`Revert to checkpoint "${commitId}" — this feature requires the backend ETL service. Contact your admin.`);
  }

  // -----------------------------------------------------------------------
  // Live Cache Invalidation Polling — direct Firestore, no API server
  // -----------------------------------------------------------------------
  startLogsPolling() {
    this.logsPollTimer = setInterval(async () => {
      try {
        const docs = await fetchFirestoreRest('cache_invalidations', 5);
        const logs = docs.map(d => ({ timestamp: d.timestamp || new Date().toISOString() }));

        if (logs.length > 0) {
          const newestTimestamp = logs[0].timestamp;
          if (this.lastLogTimestamp && newestTimestamp !== this.lastLogTimestamp) {
            console.log('[POLL] New cache invalidation — refreshing dashboard...');
            this.loadDashboardData();
            if (this.currentTab === 'logs') this.loadLogs();
          }
          this.lastLogTimestamp = newestTimestamp;
        }
      } catch (err) { /* non-fatal polling failure */ }
    }, 4000);
  }
}

const app = new AcademyLibraryApp();
window.app = app;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
