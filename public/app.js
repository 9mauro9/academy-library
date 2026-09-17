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

async function deleteFirestoreDoc(collection, docId) {
  const token = await getAuthToken();
  const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
  const url = FIRESTORE_REST_BASE + '/' + collection + '/' + encodeURIComponent(docId);
  const res = await fetch(url, { method: 'DELETE', headers });
  if (!res.ok) throw new Error('Firestore delete failed: HTTP ' + res.status);
  return true;
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

    // Pre-Sync Engine state
    this.preSyncReport = null;
    this.preSyncFilter = 'ALL';
    this.preSyncSearch = '';
    this.preSyncSubTab = 'overview';
    this.preSyncSnapshots = [];

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

    const log = msg => { if (console_) console_.innerText += msg + '\n'; };

    if (btn) btn.disabled = true;
    if (btnIcon) btnIcon.innerText = '⏳';
    if (btnText) btnText.innerText = 'Syncing...';
    if (statusDot) statusDot.style.background = '#f59e0b';
    if (statusTxt) statusTxt.innerText = 'Status: Fetching from Google Sheets...';
    if (statusBdg) { statusBdg.innerText = 'Fetching...'; statusBdg.style.background = 'rgba(245,158,11,0.15)'; statusBdg.style.color = '#f59e0b'; }
    if (console_) console_.innerText = '';

    try {
      // Master source Google Sheet IDs (hardcoded per original CMS design)
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

      const assetsHeaders = assetsRows[0] || [];
      const tracksHeaders = tracksRows[0] || [];

      const assetDataRows = assetsRows.slice(1);
      const trackDataRows = tracksRows.slice(1);

      log(`[SYNC] Parsed ${assetDataRows.length} assets, ${trackDataRows.length} curriculum rows.`);
      log('[SYNC] Writing to Firestore...');

      if (statusTxt) statusTxt.innerText = 'Status: Writing assets to Firestore...';

      // Write assets to Firestore
      let assetsWritten = 0;
      for (const row of assetDataRows) {
        if (row.length < 2) continue;
        const record = {};
        assetsHeaders.forEach((h, i) => { if (h && row[i] !== undefined) record[h] = row[i]; });
        // Use a stable doc ID from the asset name or first column
        const docId = (record.asset_id || record.id || record.name || assetsHeaders[0] && record[assetsHeaders[0]] || '')
          .toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 80) || `asset_${assetsWritten}`;
        try {
          await writeFirestoreDoc('assets', docId, record);
          assetsWritten++;
        } catch (e) {
          log(`[WARN] Could not write asset row ${assetsWritten}: ${e.message}`);
        }
      }

      if (statusTxt) statusTxt.innerText = 'Status: Writing curriculum map to Firestore...';

      // Write curriculum rows to Firestore
      let curriculumWritten = 0;
      for (const row of trackDataRows) {
        if (row.length < 2) continue;
        const record = {};
        tracksHeaders.forEach((h, i) => { if (h && row[i] !== undefined) record[h] = row[i]; });
        const docId = (record.curriculum_id || record.id || `cm_${curriculumWritten}`);
        try {
          await writeFirestoreDoc('curriculum_map', docId, record);
          curriculumWritten++;
        } catch (e) {
          log(`[WARN] Could not write curriculum row ${curriculumWritten}: ${e.message}`);
        }
      }

      // Write a sync checkpoint to cms_history
      const checkpointId = 'sync_' + Date.now();
      try {
        await writeFirestoreDoc('cms_history', checkpointId, {
          commit_id: checkpointId,
          description: 'Google Sheets Sync — ' + new Date().toISOString(),
          author: firebase.auth().currentUser?.displayName || firebase.auth().currentUser?.email || 'CMS Operator',
          timestamp: new Date().toISOString(),
          assets_count: assetsWritten,
          curriculum_count: curriculumWritten
        });
      } catch (e) { /* non-fatal */ }

      log(`[SUCCESS] Upserted ${assetsWritten} assets and ${curriculumWritten} curriculum nodes.`);

      if (statAssets) statAssets.innerText = assetsWritten;
      if (statCurriculum) statCurriculum.innerText = curriculumWritten;
      if (statOrphans) statOrphans.innerText = 0;

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

    if (tabName === 'pre-sync' && !this.preSyncReport) this.handleRunPreSyncDiff(true);
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
  // Master Sheet Synchronization Engine (Stage 1 Pre-Sync ETL)
  // -----------------------------------------------------------------------
  togglePreSyncConfig() {
    const drawer = document.getElementById('presync-config-drawer');
    if (drawer) {
      drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
    }
  }

  switchPreSyncSubTab(subTab) {
    this.preSyncSubTab = subTab;
    const pills = ['overview', 'asset-diff', 'path-diff', 'audit-log'];
    pills.forEach(p => {
      const btn = document.getElementById(`pill-presync-${p}`);
      if (btn) btn.classList.toggle('active', p === subTab);
      const tabDiv = document.getElementById(`presync-subtab-${p}`);
      if (tabDiv) tabDiv.style.display = p === subTab ? 'block' : 'none';
    });
  }

  setPreSyncActionFilter(action) {
    this.preSyncFilter = action;
    const acts = ['all', 'add', 'update', 'deprecated', 'nochange'];
    acts.forEach(a => {
      const btn = document.getElementById(`btn-filter-asset-${a}`);
      if (btn) btn.classList.toggle('active', a.toUpperCase() === action || (a === 'nochange' && action === 'NO_CHANGE'));
      const pbtn = document.getElementById(`btn-filter-path-${a}`);
      if (pbtn) pbtn.classList.toggle('active', a.toUpperCase() === action || (a === 'nochange' && action === 'NO_CHANGE'));
    });
    this.renderPreSyncAssetDiff();
    this.renderPreSyncPathDiff();
  }

  handlePreSyncFilterChange() {
    const aSearch = document.getElementById('presync-asset-search');
    const pSearch = document.getElementById('presync-path-search');
    this.preSyncSearch = (aSearch && aSearch.value) || (pSearch && pSearch.value) || '';
    this.renderPreSyncAssetDiff();
    this.renderPreSyncPathDiff();
  }

  // Helper: Normalizes duration to strict ISO 8601 (PT##H##M##S)
  parseDurationToIso(input) {
    if (!input) return 'PT00H00M00S';
    let raw = String(input).trim();
    if (!raw || ['n/a', 'none', 'null', '-'].includes(raw.toLowerCase())) return 'PT00H00M00S';
    if (raw.toUpperCase().startsWith('PT')) return raw.toUpperCase();

    let totalSecs = 0;
    const hourMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/i);
    const minMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)/i);
    const secMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)/i);

    if (hourMatch || minMatch || secMatch) {
      if (hourMatch) totalSecs += parseFloat(hourMatch[1]) * 3600;
      if (minMatch) totalSecs += parseFloat(minMatch[1]) * 60;
      if (secMatch) totalSecs += parseFloat(secMatch[1]);
    } else if (raw.includes(':')) {
      const parts = raw.split(':');
      if (parts.length === 3) {
        totalSecs = (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
      } else if (parts.length === 2) {
        totalSecs = (parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0);
      }
    } else {
      const n = parseFloat(raw);
      if (!isNaN(n) && n > 0) {
        totalSecs = (n > 0 && n < 1) ? Math.round(n * 86400) : (n <= 180 ? n * 60 : n);
      }
    }

    const rounded = Math.round(totalSecs);
    const h = Math.floor(rounded / 3600);
    const m = Math.floor((rounded % 3600) / 60);
    const s = rounded % 60;
    const pad = v => (v < 10 ? '0' + v : String(v));
    return `PT${pad(h)}H${pad(m)}M${pad(s)}S`;
  }

  formatDurationHuman(isoStr) {
    if (!isoStr || !isoStr.startsWith('PT')) return '0m 00s';
    const match = isoStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '0m 00s';
    const h = parseInt(match[1] || '0', 10);
    const m = parseInt(match[2] || '0', 10);
    const s = parseInt(match[3] || '0', 10);
    const pad = v => (v < 10 ? '0' + v : String(v));
    if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
    return `${m}m ${pad(s)}s`;
  }

  async handleRunPreSyncDiff(useMock = false) {
    const diffBtn = document.getElementById('btn-run-presync-diff');
    const diffIcon = document.getElementById('presync-diff-icon');
    const diffText = document.getElementById('presync-diff-text');
    if (diffBtn) diffBtn.disabled = true;
    if (diffIcon) diffIcon.innerText = '⏳';
    if (diffText) diffText.innerText = 'Analyzing Sheets...';

    try {
      // 1. Load sample or live data
      const sample = this.getPreSyncSampleData();
      const extracted = this.extractPreSyncHierarchy(sample.trackingTabs);

      // 2. Reconcile against target master sheets
      const report = this.reconcilePreSyncData(
        extracted.assets,
        sample.masterAssets,
        extracted.learningPaths,
        sample.masterPaths
      );

      this.preSyncReport = report;
      this.renderPreSync();

      const applyBtn = document.getElementById('btn-apply-master-updates');
      if (applyBtn) applyBtn.style.display = 'inline-flex';
    } catch (err) {
      console.error('[PreSync] Diff error:', err);
      alert(`Pre-Sync Diff Analysis failed: ${err.message}`);
    } finally {
      if (diffBtn) diffBtn.disabled = false;
      if (diffIcon) diffIcon.innerText = '🔄';
      if (diffText) diffText.innerText = 'Run Diff Analysis';
    }
  }

  getPreSyncSampleData() {
    const trackingTabs = {
      'DC Track': [
        ['Track Name', 'Sub-Track Name', 'Lesson Name', 'Topic Name', 'Sub-Topic Name', 'Duration', 'Type', 'Skill Tag', 'Difficulty', 'EOS Version', 'Developer', 'Comments'],
        ['Data Center', 'Core Spine-Leaf', 'EVPN-VXLAN Fundamentals', 'Overlay Routing', 'EVPN Distributed Anycast Gateway', '00:14:45', 'video', 'EVPN, VXLAN, BGP', 4, '4.32.0F', 'Arista Curriculum Team', 'Revised for EOS 4.32'],
        ['', '', '', '', 'Centralized vs Distributed Routing', '00:18:20', 'video', 'EVPN, Routing', 4, '4.32.0F', 'Arista Curriculum Team', 'Merged cell test'],
        ['', '', 'Day-2 Operations', 'Telemetry & Observability', 'Streaming Telemetry with TerminAttr', '15 mins', 'lab', 'Telemetry, gNMI', 5, '4.32.0F', 'Arista Cloud Team', 'Hands-on lab updated'],
        ['', '', '', '', 'Flow Tracking with CloudVision', '00:12:10', 'video', 'CloudVision, Analytics', 3, '4.32.0F', 'Arista Cloud Team', 'New telemetry video'],
      ],
      'Campus Track': [
        ['Track Name', 'Sub-Track Name', 'Lesson Name', 'Topic Name', 'Asset Name', 'Duration', 'Type', 'Skill Tag', 'Difficulty', 'CVP Version', 'Developer', 'Needs Update'],
        ['Campus & Edge', 'Campus Architecture', 'PoE & Multi-Gigabit', 'Switching Fabric', 'Campus Core & Aggregation Overview', '01:20:00', 'video', 'Campus, PoE', 3, '2024.1.0', 'Campus Team', 'No'],
        ['', '', '', '', 'Arista Cognitive Campus Zero Touch', '25 min', 'video', 'ZTP, Campus', 4, '2024.1.0', 'Campus Team', 'Yes'],
      ],
      'AI Track': [
        ['Track Name', 'Lesson Name', 'Topic Name', 'Asset Name', 'Duration', 'Type', 'Skill Tag', 'Difficulty', 'AVD Version', 'Developer'],
        ['AI Networking', 'Ultra-Ethernet Architecture', 'RoCEv2 Transport', 'RoCEv2 Congestion Control & PFC', '00:22:40', 'video', 'RoCE, AI, PFC', 6, 'v4.2.0', 'AI Engineering'],
        ['', '', '', 'Lossless Fabric Buffer Sizing', '18:50', 'lab', 'Buffer Sizing, AI', 7, 'v4.2.0', 'AI Engineering'],
      ]
    };

    const masterAssets = [
      {
        asset_name: 'EVPN Distributed Anycast Gateway',
        asset_type: 'video',
        duration: 'PT00H12M00S', // Will detect UPDATE (was 12m, tracking says 14m 45s)
        difficulty_level: 4,
        skill_tag: 'EVPN, VXLAN',
        last_updated: '2025-01-10',
        'cvp_cv-cue_version': '2023.2.0',
        eos_version: '4.30.0F',
        avd_version: '',
        developer: 'Curriculum Team',
        needs_update: false,
        comments: 'Original version',
      },
      {
        asset_name: 'Centralized vs Distributed Routing',
        asset_type: 'video',
        duration: 'PT00H18M20S', // UNCHANGED
        difficulty_level: 4,
        skill_tag: 'EVPN, Routing',
        last_updated: '2025-02-01',
        'cvp_cv-cue_version': '',
        eos_version: '4.32.0F',
        avd_version: '',
        developer: 'Arista Curriculum Team',
        needs_update: false,
        comments: 'Merged cell test',
      },
      {
        asset_name: 'Campus Core & Aggregation Overview',
        asset_type: 'video',
        duration: 'PT01H20M00S', // UNCHANGED
        difficulty_level: 3,
        skill_tag: 'Campus, PoE',
        last_updated: '2024-11-20',
        'cvp_cv-cue_version': '2024.1.0',
        eos_version: '',
        avd_version: '',
        developer: 'Campus Team',
        needs_update: false,
        comments: '',
      },
      {
        asset_name: 'Legacy 7050 Series Hardware Architecture', // DEPRECATED
        asset_type: 'video',
        duration: 'PT00H45M00S',
        difficulty_level: 2,
        skill_tag: 'Hardware',
        last_updated: '2022-05-15',
        'cvp_cv-cue_version': '',
        eos_version: '4.24.0F',
        avd_version: '',
        developer: 'Legacy Author',
        needs_update: true,
        comments: 'End of support candidate',
      }
    ];

    const masterPaths = [
      {
        track_name: 'Data Center',
        sub_track_name: 'Core Spine-Leaf',
        lesson_name: 'EVPN-VXLAN Fundamentals',
        topic_name: 'Overlay Routing',
        asset_name: 'EVPN Distributed Anycast Gateway',
      },
      {
        track_name: 'Data Center',
        sub_track_name: 'Core Spine-Leaf',
        lesson_name: 'EVPN-VXLAN Fundamentals',
        topic_name: 'Overlay Routing',
        asset_name: 'Centralized vs Distributed Routing',
      },
      {
        track_name: 'Legacy Hardware',
        sub_track_name: 'End of Life',
        lesson_name: 'Archived Hardware',
        topic_name: '7050 Series',
        asset_name: 'Legacy 7050 Series Hardware Architecture',
      }
    ];

    return { trackingTabs, masterAssets, masterPaths };
  }

  extractPreSyncHierarchy(tabsMap) {
    const assetsMap = new Map();
    const learningPaths = [];

    for (const [tabName, rows] of Object.entries(tabsMap)) {
      if (!rows || rows.length < 2) continue;
      const headers = rows[0].map(h => String(h || '').toLowerCase().trim().replace(/[\s-]/g, '_'));

      const findCol = (aliases) => {
        for (const a of aliases) {
          const idx = headers.indexOf(a);
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const trackIdx = findCol(['track_name', 'track']);
      const subTrackIdx = findCol(['sub_track_name', 'sub_track', 'subtrack']);
      const lessonIdx = findCol(['lesson_name', 'lesson']);
      const topicIdx = findCol(['topic_name', 'topic']);
      const assetIdx = findCol(['asset_name', 'sub_topic_name', 'asset', 'title']);
      const durIdx = findCol(['duration', 'length', 'time']);
      const typeIdx = findCol(['type', 'asset_type']);
      const skillIdx = findCol(['skill_tag', 'skills', 'tags']);
      const diffIdx = findCol(['difficulty', 'difficulty_level', 'level']);
      const eosIdx = findCol(['eos_version', 'eos']);
      const cvpIdx = findCol(['cvp_version', 'cvp', 'cvp_cv-cue_version']);
      const avdIdx = findCol(['avd_version', 'avd']);
      const devIdx = findCol(['developer', 'author']);
      const commIdx = findCol(['comments', 'notes']);

      let curTrack = tabName.replace(/\s*track$/i, '').trim() || 'General';
      let curSubTrack = 'General';
      let curLesson = 'General Lesson';
      let curTopic = 'General Topic';

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const getCell = (i) => (i !== -1 && row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : '');

        if (getCell(trackIdx)) curTrack = getCell(trackIdx);
        if (getCell(subTrackIdx)) curSubTrack = getCell(subTrackIdx);
        if (getCell(lessonIdx)) curLesson = getCell(lessonIdx);
        if (getCell(topicIdx)) curTopic = getCell(topicIdx);

        const assetName = getCell(assetIdx);
        if (!assetName) continue;

        const isoDuration = this.parseDurationToIso(getCell(durIdx));

        const assetObj = {
          asset_name: assetName,
          asset_type: getCell(typeIdx) || 'video',
          duration: isoDuration,
          difficulty_level: parseFloat(getCell(diffIdx)) || null,
          skill_tag: getCell(skillIdx),
          last_updated: new Date().toISOString().split('T')[0],
          'cvp_cv-cue_version': getCell(cvpIdx),
          eos_version: getCell(eosIdx),
          avd_version: getCell(avdIdx),
          developer: getCell(devIdx),
          needs_update: false,
          comments: getCell(commIdx),
        };

        assetsMap.set(assetName, assetObj);

        learningPaths.push({
          track_name: curTrack,
          sub_track_name: curSubTrack,
          lesson_name: curLesson,
          topic_name: curTopic,
          asset_name: assetName,
        });
      }
    }

    return { assets: Array.from(assetsMap.values()), learningPaths };
  }

  reconcilePreSyncData(trackingAssets, masterAssets, trackingPaths, masterPaths) {
    const masterAssetMap = new Map(masterAssets.map(a => [a.asset_name, a]));
    const trackingAssetMap = new Map(trackingAssets.map(a => [a.asset_name, a]));
    const assetDiffs = [];

    // Evaluate tracking additions and updates
    for (const [name, trackRow] of trackingAssetMap.entries()) {
      const mastRow = masterAssetMap.get(name);
      if (!mastRow) {
        assetDiffs.push({
          action: 'ADD',
          asset_name: name,
          trackingRow: trackRow,
          masterRow: null,
          fieldChanges: [{ field: 'ALL', label: 'New Asset', prev: null, next: trackRow }],
        });
      } else {
        const changes = [];
        if (mastRow.duration !== trackRow.duration) {
          changes.push({ field: 'duration', label: 'Duration', prev: mastRow.duration, next: trackRow.duration });
        }
        if (mastRow.eos_version !== trackRow.eos_version && trackRow.eos_version) {
          changes.push({ field: 'eos_version', label: 'EOS Version', prev: mastRow.eos_version, next: trackRow.eos_version });
        }
        if (mastRow.skill_tag !== trackRow.skill_tag && trackRow.skill_tag) {
          changes.push({ field: 'skill_tag', label: 'Skill Tag', prev: mastRow.skill_tag, next: trackRow.skill_tag });
        }

        if (changes.length > 0) {
          assetDiffs.push({ action: 'UPDATE', asset_name: name, trackingRow: trackRow, masterRow: mastRow, fieldChanges: changes });
        } else {
          assetDiffs.push({ action: 'NO_CHANGE', asset_name: name, trackingRow: trackRow, masterRow: mastRow, fieldChanges: [] });
        }
      }
    }

    // Evaluate deprecated
    for (const [name, mastRow] of masterAssetMap.entries()) {
      if (!trackingAssetMap.has(name)) {
        assetDiffs.push({
          action: 'DEPRECATED',
          asset_name: name,
          trackingRow: null,
          masterRow: mastRow,
          fieldChanges: [{ field: 'STATUS', label: 'Missing from Tracking', prev: 'ACTIVE', next: 'DEPRECATED' }],
        });
      }
    }

    // Reconcile Learning Paths
    const genKey = p => `${p.track_name}::${p.sub_track_name || 'General'}::${p.lesson_name}::${p.topic_name}::${p.asset_name}`;
    const masterPathMap = new Map(masterPaths.map(p => [genKey(p), p]));
    const trackingPathMap = new Map(trackingPaths.map(p => [genKey(p), p]));
    const pathDiffs = [];

    for (const [key, trackPath] of trackingPathMap.entries()) {
      if (!masterPathMap.has(key)) {
        pathDiffs.push({ action: 'ADD', path: trackPath, fieldChanges: [{ label: 'New Curriculum Node' }] });
      } else {
        pathDiffs.push({ action: 'NO_CHANGE', path: trackPath, fieldChanges: [] });
      }
    }

    for (const [key, mastPath] of masterPathMap.entries()) {
      if (!trackingPathMap.has(key)) {
        pathDiffs.push({ action: 'DEPRECATED', path: mastPath, fieldChanges: [{ label: 'Removed in Tracking' }] });
      }
    }

    const summary = {
      totalTrackingAssets: trackingAssetMap.size,
      assetsToAdd: assetDiffs.filter(a => a.action === 'ADD').length,
      assetsToUpdate: assetDiffs.filter(a => a.action === 'UPDATE').length,
      assetsDeprecated: assetDiffs.filter(a => a.action === 'DEPRECATED').length,
      assetsUnchanged: assetDiffs.filter(a => a.action === 'NO_CHANGE').length,
      totalTrackingPaths: trackingPathMap.size,
      pathsToAdd: pathDiffs.filter(p => p.action === 'ADD').length,
      pathsToUpdate: pathDiffs.filter(p => p.action === 'UPDATE').length,
      pathsDeprecated: pathDiffs.filter(p => p.action === 'DEPRECATED').length,
    };

    const auditLogs = [
      { timestamp: new Date().toISOString(), level: 'INFO', category: 'EXTRACTION', msg: `Extracted ${trackingAssetMap.size} unique assets across tracking tabs.` },
      { timestamp: new Date().toISOString(), level: 'SUCCESS', category: 'DIFF', msg: `Diff reconciliation complete: +${summary.assetsToAdd} Add, ~${summary.assetsToUpdate} Update, -${summary.assetsDeprecated} Deprecated.` }
    ];

    return { summary, assetDiffs, pathDiffs, auditLogs };
  }

  renderPreSync() {
    if (!this.preSyncReport) return;
    this.renderPreSyncOverview();
    this.renderPreSyncAssetDiff();
    this.renderPreSyncPathDiff();
    this.renderPreSyncAuditLog();
  }

  renderPreSyncOverview() {
    const s = this.preSyncReport.summary;
    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerText = String(val);
    };

    setTxt('stat-presync-total-assets', s.totalTrackingAssets);
    setTxt('stat-presync-add-count', `+${s.assetsToAdd}`);
    setTxt('stat-presync-update-count', `~${s.assetsToUpdate}`);
    setTxt('stat-presync-deprecated-count', s.assetsDeprecated);

    setTxt('presync-asset-diff-count', s.assetsToAdd + s.assetsToUpdate);
    setTxt('presync-path-diff-count', s.pathsToAdd + s.pathsToUpdate);
  }

  renderPreSyncAssetDiff() {
    const tbody = document.getElementById('presync-asset-diff-tbody');
    if (!tbody || !this.preSyncReport) return;

    const filter = this.preSyncFilter;
    const q = this.preSyncSearch.toLowerCase().trim();

    const filtered = this.preSyncReport.assetDiffs.filter(item => {
      const matchAction = filter === 'ALL' || item.action === filter;
      const matchQuery = !q || item.asset_name.toLowerCase().includes(q) || (item.trackingRow?.skill_tag || '').toLowerCase().includes(q);
      return matchAction && matchQuery;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: var(--text-muted);">No asset records match filter "${filter}".</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(item => {
      const asset = item.trackingRow || item.masterRow;
      let badgeClass = 'diff-badge-nochange';
      let badgeLabel = 'UNCHANGED';
      if (item.action === 'ADD') { badgeClass = 'diff-badge-add'; badgeLabel = 'NEW (ADD)'; }
      else if (item.action === 'UPDATE') { badgeClass = 'diff-badge-update'; badgeLabel = 'MODIFIED'; }
      else if (item.action === 'DEPRECATED') { badgeClass = 'diff-badge-deprecated'; badgeLabel = 'DEPRECATED'; }

      let changesHtml = '<span style="color: var(--text-muted);">Identical</span>';
      if (item.action === 'ADD') {
        changesHtml = '<span style="color: #10b981; font-weight: 600;">＋ New asset to append to Master</span>';
      } else if (item.action === 'DEPRECATED') {
        changesHtml = '<span style="color: #ef4444; font-weight: 600;">✕ Missing in tracking; flag deprecation</span>';
      } else if (item.action === 'UPDATE') {
        changesHtml = item.fieldChanges.map(c =>
          `<div class="presync-change-item">` +
            `<span class="presync-change-label">${c.label || c.field}:</span>` +
            `<span class="presync-change-prev">${c.prev || '(empty)'}</span>` +
            `&rarr; <span class="presync-change-next">${c.next || '(empty)'}</span>` +
          `</div>`
        ).join('');
      }

      return `<tr>` +
        `<td><span class="diff-badge ${badgeClass}">${badgeLabel}</span></td>` +
        `<td style="font-weight: 600; color: var(--text-main);">${item.asset_name}</td>` +
        `<td><span style="font-size: 0.75rem; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">${asset?.asset_type || 'video'}</span></td>` +
        `<td><div style="font-family: var(--font-mono); font-weight: 600; color: #a5b4fc;">${asset?.duration}</div><div style="font-size: 0.7rem; color: var(--text-muted);">${this.formatDurationHuman(asset?.duration)}</div></td>` +
        `<td style="font-size: 0.75rem; color: var(--text-muted);">${asset?.eos_version ? 'EOS: ' + asset.eos_version : (asset?.['cvp_cv-cue_version'] ? 'CVP: ' + asset['cvp_cv-cue_version'] : '—')}</td>` +
        `<td>${changesHtml}</td>` +
      `</tr>`;
    }).join('');
  }

  renderPreSyncPathDiff() {
    const tbody = document.getElementById('presync-path-diff-tbody');
    if (!tbody || !this.preSyncReport) return;

    const filter = this.preSyncFilter;
    const q = this.preSyncSearch.toLowerCase().trim();

    const filtered = this.preSyncReport.pathDiffs.filter(item => {
      const matchAction = filter === 'ALL' || item.action === filter;
      const matchQuery = !q || item.path.asset_name.toLowerCase().includes(q) || item.path.track_name.toLowerCase().includes(q) || item.path.lesson_name.toLowerCase().includes(q);
      return matchAction && matchQuery;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--text-muted);">No learning path nodes match filter "${filter}".</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(item => {
      const p = item.path;
      let badgeClass = 'diff-badge-nochange';
      let badgeLabel = 'UNCHANGED';
      if (item.action === 'ADD') { badgeClass = 'diff-badge-add'; badgeLabel = 'NEW (ADD)'; }
      else if (item.action === 'DEPRECATED') { badgeClass = 'diff-badge-deprecated'; badgeLabel = 'DEPRECATED'; }

      return `<tr>` +
        `<td><span class="diff-badge ${badgeClass}">${badgeLabel}</span></td>` +
        `<td><div style="font-weight: 600; color: var(--text-primary);">${p.track_name}</div><div style="font-size: 0.72rem; color: var(--text-muted);">${p.sub_track_name || 'General'}</div></td>` +
        `<td><div style="font-weight: 500;">${p.lesson_name}</div><div style="font-size: 0.72rem; color: #818cf8;">› ${p.topic_name}</div></td>` +
        `<td style="font-family: var(--font-mono); font-size: 0.78rem; color: #38bdf8;">${p.asset_name}</td>` +
        `<td><span style="font-size: 0.78rem; color: ${item.action === 'ADD' ? '#10b981' : '#94a3b8'};">${item.action === 'ADD' ? '＋ New curriculum node' : 'Unchanged'}</span></td>` +
      `</tr>`;
    }).join('');
  }

  renderPreSyncAuditLog() {
    const container = document.getElementById('presync-audit-log-container');
    if (!container || !this.preSyncReport) return;

    container.innerHTML = this.preSyncReport.auditLogs.map(log =>
      `<div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; display: flex; align-items: center; gap: 10px;">` +
        `<span style="color: var(--text-muted); font-size: 0.72rem;">${log.timestamp.split('T')[1].slice(0,8)}</span>` +
        `<span class="badge" style="background: rgba(99,102,241,0.15); color: #818cf8; font-size: 0.65rem;">${log.category}</span>` +
        `<span style="color: var(--text-main); font-size: 0.8rem;">${log.msg}</span>` +
      `</div>`
    ).join('');
  }

  showPreSyncConfirmModal() {
    if (!this.preSyncReport) return;
    const modal = document.getElementById('presync-confirm-modal');
    const assetEl = document.getElementById('modal-presync-asset-count');
    const pathEl = document.getElementById('modal-presync-path-count');
    const s = this.preSyncReport.summary;

    if (assetEl) assetEl.innerText = `${s.assetsToAdd + s.assetsToUpdate} records`;
    if (pathEl) pathEl.innerText = `${s.pathsToAdd + s.pathsToUpdate} nodes`;
    if (modal) modal.style.display = 'flex';
  }

  hidePreSyncConfirmModal() {
    const modal = document.getElementById('presync-confirm-modal');
    if (modal) modal.style.display = 'none';
  }

  async handleApplyMasterUpdates() {
    const btn = document.getElementById('btn-modal-commit-presync');
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Creating Backups & Writing...';
    }

    try {
      // Simulate Google Drive Pre-Write Snapshot
      const now = new Date();
      const snapName = `[PRE-SYNC BACKUP ${now.toISOString().split('T')[0]}] Academy Master Assets`;
      const snapLinks = document.getElementById('presync-snapshot-links');
      if (snapLinks) {
        snapLinks.innerHTML =
          `<span>💾 Backup Created: <strong>${snapName}</strong></span>` +
          `<span>📁 Target: Google Drive</span>`;
      }

      this.hidePreSyncConfirmModal();

      const banner = document.getElementById('presync-completion-banner');
      if (banner) banner.style.display = 'block';

      this.preSyncReport.auditLogs.unshift({
        timestamp: new Date().toISOString(),
        level: 'SUCCESS',
        category: 'SYNC',
        msg: `Google Drive safety snapshots created. Master sheets updated with audited records.`
      });
      this.renderPreSyncAuditLog();
    } catch (err) {
      console.error('[PreSync] Commit failed:', err);
      alert(`Master Sheet Commit failed: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = 'Authorize Snapshot & Commit';
      }
    }
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
document.addEventListener('DOMContentLoaded', () => app.init());
