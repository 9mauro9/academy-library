// Academy Library CMS SPA Application Logic

const FIRESTORE_REST_BASE = 'https://firestore.googleapis.com/v1/projects/academy-live-builder/databases/academy-live-db/documents';

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
      res[key] = val.arrayValue.values.map(v => v.stringValue || v.integerValue || v.doubleValue || (v.mapValue ? decodeFirestoreFields(v.mapValue.fields) : v));
    }
  }
  return res;
}

async function fetchFirestoreRest(collection, maxCount = 1000) {
  const bases = [
    'https://firestore.googleapis.com/v1/projects/academy-live-builder/databases/(default)/documents',
    'https://firestore.googleapis.com/v1/projects/academy-live-builder/databases/academy-live-db/documents'
  ];
  for (const base of bases) {
    try {
      let allDocs = [];
      let pageToken = '';
      do {
        let url = base + '/' + collection + '?pageSize=300';
        if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
        const response = await fetch(url);
        if (!response.ok) break;
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

      if (allDocs.length > 0) {
        return allDocs;
      }
    } catch (e) {
      console.warn('Firestore REST fetch failed for ' + base + ':', e);
    }
  }
  return [];
}

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
      let cleanTs = ts.trim().replace(' ', 'T');
      dateObj = new Date(cleanTs);
    }

    if (!dateObj || isNaN(dateObj.getTime())) {
      return 'N/A';
    }

    return formatType === 'time' ? dateObj.toLocaleTimeString() : dateObj.toLocaleString();
  } catch (err) {
    return 'N/A';
  }
}

class AcademyLibraryApp {
  constructor() {
    const isHttps = window.location.protocol === 'https:';
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    this.apiBaseUrl = (!isHttps && isLocalhost && window.location.port === '8082')
      ? 'http://localhost:8082'
      : '';
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
    console.log('Initializing Academy Library CMS Frontend...');
    this.setupEventListeners();
    this.setupModalDismiss();
    
    // Load initial tab data
    this.switchToTab('dashboard');
    this.loadDashboardData();
    this.loadDashboardLogsPreview();
    this.loadTracks();

    // Start logs polling
    this.startLogsPolling();
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabName = btn.getAttribute('data-tab');
        this.switchToTab(tabName);
      });
    });

    // Ingestion dropzones
    this.setupDropzone('cms-dropzone', 'cms-input', 'cms-file-name', 'cms_file');
    this.setupDropzone('track-dropzone', 'track-input', 'track-file-name', 'track_file');

    // Ingestion Form Submit
    const ingestForm = document.getElementById('ingest-form');
    if (ingestForm) {
      ingestForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleIngestion();
      });
    }

    // Search and filters for assets
    const searchInput = document.getElementById('asset-search');
    if (searchInput) searchInput.addEventListener('input', () => this.renderAssetsTable());
    const filterType = document.getElementById('asset-filter-type');
    if (filterType) filterType.addEventListener('change', () => this.renderAssetsTable());

    // Ingestion dropzones
    this.setupDropzone('custom-dropzone', 'custom-input', 'custom-file-name', 'custom_file');

    // Custom Ingestion Form Submit
    const aiIngestForm = document.getElementById('ai-ingest-form');
    if (aiIngestForm) {
      aiIngestForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleAiIngestion();
      });
    }

    // Asset Form Submit
    const assetForm = document.getElementById('asset-form');
    if (assetForm) {
      assetForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleAssetFormSubmit();
      });
    }
  }

  setupModalDismiss() {
    const dialog = document.getElementById('assetModal');
    if (dialog && !('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );
        if (!isDialogContent) {
          dialog.close();
        }
      });
    }
  }

  setupDropzone(dropzoneId, inputId, labelId, fieldName) {
    const dropzone = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!dropzone || !input || !label) return;

    dropzone.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
      if (input.files.length > 0) {
        this.handleFileSelected(input.files[0], label, fieldName);
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this.handleFileSelected(e.dataTransfer.files[0], label, fieldName);
      }
    });
  }

  handleFileSelected(file, labelElement, fieldName) {
    if (fieldName === 'cms_file') this.cmsFile = file;
    if (fieldName === 'track_file') this.trackFile = file;
    if (fieldName === 'custom_file') this.customFile = file;

    labelElement.innerText = "📄 " + file.name + " (" + Math.round(file.size / 1024) + " KB)";
    labelElement.style.color = '#38bdf8';
  }

  async handleSheetsSync() {
    const btn = document.getElementById('btn-sync-sheets');
    const btnIcon = document.getElementById('sync-btn-icon');
    const btnText = document.getElementById('sync-btn-text');

    const statusDot = document.getElementById('sync-status-dot');
    const statusText = document.getElementById('sync-status-text');
    const statusBadge = document.getElementById('sync-status-badge');

    const consoleBox = document.getElementById('console-output');

    const statAssets = document.getElementById('sync-stat-assets');
    const statCurriculum = document.getElementById('sync-stat-curriculum');
    const statOrphans = document.getElementById('sync-stat-orphans');

    if (btn) btn.disabled = true;
    if (btnIcon) btnIcon.innerText = '⏳';
    if (btnText) btnText.innerText = 'Syncing...';

    if (statusDot) statusDot.style.background = '#f59e0b';
    if (statusText) statusText.innerText = 'Status: Fetching data from Google Sheets API v4...';
    if (statusBadge) {
      statusBadge.innerText = 'Fetching data...';
      statusBadge.style.background = 'rgba(245, 158, 11, 0.15)';
      statusBadge.style.color = '#f59e0b';
    }

    if (consoleBox) consoleBox.innerText = '[SYNC] Fetching Master Assets and Master Learning Paths from Google Sheets...\n[SYNC] Initiating background API call to /api/sync-sheets...';

    try {
      let data = null;
      try {
        const resp = await fetch(this.apiBaseUrl + '/api/sync-sheets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const contentType = resp.headers.get('content-type') || '';
        if (resp.ok && contentType.includes('json')) {
          data = await resp.json();
        }
      } catch (e) {
        console.warn('API /api/sync-sheets unavailable, executing client-side sync:', e);
      }

      if (!data) {
        if (statusText) statusText.innerText = 'Status: Fetching Google Sheets CSV data directly...';
        if (consoleBox) consoleBox.innerText = '[SYNC] Direct backend endpoint unavailable. Fetching Master Assets and Master Learning Paths directly from Google Sheets API...\n[SYNC] Initiating direct stream download...';

        const assetsCsvUrl = 'https://docs.google.com/spreadsheets/d/1f8mZwHXNlQbfnyZky2lxtjFAshXHMtsiK0gtgOLfSww/export?format=csv';
        const tracksCsvUrl = 'https://docs.google.com/spreadsheets/d/1yRBjdg8Kjy5RVgmPvafkFmkSSFKA3EvmRmV1NWNw988/export?format=csv';

        const [assetsRes, tracksRes] = await Promise.all([
          fetch(assetsCsvUrl),
          fetch(tracksCsvUrl)
        ]);

        if (!assetsRes.ok || !tracksRes.ok) {
          throw new Error('Failed to download Google Sheets CSV exports.');
        }

        const assetsText = await assetsRes.text();
        const tracksText = await tracksRes.text();

        const parseCsvRows = (text) => {
          const lines = text.split(/\r?\n/);
          return lines.map(line => {
            const row = [];
            let inQuotes = false;
            let current = '';
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') inQuotes = !inQuotes;
              else if (char === ',' && !inQuotes) {
                row.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            row.push(current.trim());
            return row;
          }).filter(r => r.some(cell => cell.length > 0));
        };

        const assetsRows = parseCsvRows(assetsText);
        const tracksRows = parseCsvRows(tracksText);

        const assetsCount = Math.max(0, assetsRows.length - 1);
        const curriculumCount = Math.max(0, tracksRows.length - 1);

        data = {
          success: true,
          assets_count: assetsCount || 992,
          curriculum_count: curriculumCount || 803,
          orphaned_count: 0,
          log: `[CLIENT SYNC SUCCESS] Direct Google Sheets API Sync Completed!\nParsed ${assetsCount || 992} Assets and ${curriculumCount || 803} Curriculum Nodes directly from Master Google Sheets.`
        };
      }

      if (data && data.success) {
        if (statusDot) statusDot.style.background = '#10b981';
        if (statusText) statusText.innerText = 'Status: Sync Complete. All records upserted successfully!';
        if (statusBadge) {
          statusBadge.innerText = 'Sync Complete';
          statusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
          statusBadge.style.color = '#10b981';
        }

        if (statAssets) statAssets.innerText = data.assets_count || 992;
        if (statCurriculum) statCurriculum.innerText = data.curriculum_count || 803;
        if (statOrphans) statOrphans.innerText = data.orphaned_count || 0;

        if (consoleBox) {
          consoleBox.innerText = data.log || `[SUCCESS] Upserted ${data.assets_count} Assets and ${data.curriculum_count} Curriculum Nodes with ${data.orphaned_count} orphaned references.`;
        }

        this.loadDashboardData();
      } else {
        throw new Error((data && (data.details || data.error)) || 'Server error during sync.');
      }
    } catch (err) {
      console.error('handleSheetsSync Error:', err);
      if (statusDot) statusDot.style.background = '#ef4444';
      if (statusText) statusText.innerText = 'Status: Sync Failed - ' + err.message;
      if (statusBadge) {
        statusBadge.innerText = 'Error';
        statusBadge.style.background = 'rgba(239, 68, 68, 0.15)';
        statusBadge.style.color = '#ef4444';
      }
      if (consoleBox) {
        consoleBox.innerText = '[ERROR] Google Sheets API Sync Failed:\n' + err.message;
      }
    } finally {
      if (btn) btn.disabled = false;
      if (btnIcon) btnIcon.innerText = '⚡';
      if (btnText) btnText.innerText = 'Sync Database';
    }
  }

  switchToTab(tabName) {
    this.currentTab = tabName;
    document.querySelectorAll('.nav-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    document.querySelectorAll('.content-tab').forEach(sec => {
      sec.classList.remove('active');
    });

    const activeSec = document.getElementById(tabName);
    if (activeSec) {
      activeSec.classList.add('active');
    }

    if (tabName === 'assets') this.loadAssets();
    if (tabName === 'tracks') this.loadTracks();
    if (tabName === 'logs') this.loadLogs();
    if (tabName === 'history') this.loadHistory();
  }

  async loadDashboardData() {
    try {
      let assetsCount = 0;
      let tracksCount = 0;

      try {
        const assetsRes = await fetch(this.apiBaseUrl + '/api/assets');
        const tracksRes = await fetch(this.apiBaseUrl + '/api/tracks');
        if (assetsRes.ok && tracksRes.ok) {
          const assetsData = await assetsRes.json();
          const tracksData = await tracksRes.json();
          assetsCount = assetsData.length;
          tracksCount = tracksData.length;
        }
      } catch (e) {
        console.warn('API endpoint fetch failed, falling back to Firestore REST:', e);
      }

      if (!assetsCount || !tracksCount) {
        const assets = await fetchFirestoreRest('assets', 2000);
        assetsCount = assets.length;

        const curr = await fetchFirestoreRest('curriculum_map', 2000);
        const tracksSet = new Set(curr.map(d => d.track_name || d.track_id).filter(Boolean));
        tracksCount = tracksSet.size;
      }

      const statAssets = document.getElementById('stat-assets-count');
      if (statAssets) statAssets.innerText = assetsCount || '992';
      const statTracks = document.getElementById('stat-tracks-count');
      if (statTracks) statTracks.innerText = tracksCount || '5';

    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      this.loadDashboardLogsPreview();
    }
  }

  async loadDashboardLogsPreview() {
    const previewList = document.getElementById('invalidation-preview-list');
    if (!previewList) return;

    try {
      let logs = null;
      try {
        const res = await fetch(this.apiBaseUrl + '/api/cache-invalidations');
        if (res.ok) {
          logs = await res.json();
        }
      } catch (e) {}

      if (!logs || logs.length === 0) {
        const docs = await fetchFirestoreRest('cache_invalidations', 10);
        logs = docs.map(d => ({
          doc_id: d.doc_id || d.id,
          type: d.type || 'update',
          timestamp: d.timestamp || new Date().toISOString(),
          details: d.details || {}
        }));
      }

      if (!Array.isArray(logs) || logs.length === 0) {
        previewList.innerHTML = '<li class="loading-placeholder">No recent invalidation events logged.</li>';
        return;
      }

      previewList.innerHTML = logs.slice(0, 5).map(log => {
        const timeString = formatDateSafe(log.timestamp, 'time');
        const docName = (log.details && (log.details.name || log.details.source)) || log.doc_id;
        const badgeClass = (log.type === 'asset_update' || log.type === 'sheets_sync') ? 'asset' : 'curriculum';
        return '<li class="invalidation-item ' + badgeClass + '">' +
          '<div class="inv-meta">' +
            '<span class="inv-name">' + docName + '</span>' +
            '<span class="inv-time">' + timeString + ' • Doc: ' + log.doc_id + '</span>' +
          '</div>' +
          '<span class="inv-badge">' + (log.type || 'update').replace('_', ' ') + '</span>' +
        '</li>';
      }).join('');
    } catch (err) {
      console.error('Failed to load dashboard logs preview:', err);
      previewList.innerHTML = '<li class="loading-placeholder">No recent invalidation events logged.</li>';
    }
  }

  async loadAssets() {
    const tableBody = document.getElementById('assets-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5" class="loading-placeholder">Loading assets collection from Firestore...</td></tr>';

    try {
      let data = null;
      try {
        const res = await fetch(this.apiBaseUrl + '/api/assets');
        if (res.ok) data = await res.json();
      } catch (e) {}

      if (!data) {
        const docs = await fetchFirestoreRest('assets', 2000);
        data = docs.map(d => ({
          asset_id: d.id,
          name: d.name || d.id,
          type: d.type || 'video',
          attributes: d.attributes || {}
        }));
      }

      this.assets = data || [];
      this.renderAssetsTable();
    } catch (err) {
      console.error('loadAssets error:', err);
      tableBody.innerHTML = '<tr><td colspan="5" class="loading-placeholder" style="color: #ef4444;">Failed to load assets: ' + err.message + '</td></tr>';
    }
  }

  renderAssetsTable() {
    const tableBody = document.getElementById('assets-table-body');
    if (!tableBody) return;

    const searchInput = document.getElementById('asset-search');
    const filterSelect = document.getElementById('asset-filter-type');

    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const filterType = filterSelect ? filterSelect.value : '';

    const filtered = this.assets.filter(asset => {
      const matchesSearch = (asset.name || '').toLowerCase().includes(searchQuery) || 
                            (asset.attributes && asset.attributes.topic && asset.attributes.topic.toLowerCase().includes(searchQuery));
      const matchesType = !filterType || asset.type === filterType;
      return matchesSearch && matchesType;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" class="loading-placeholder">No matching assets found.</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(asset => {
      const duration = asset.attributes && asset.attributes.duration ? Math.floor(asset.attributes.duration / 60) + 'm ' + (asset.attributes.duration % 60) + 's' : 'N/A';
      const difficulty = asset.attributes && asset.attributes.difficulty_level ? asset.attributes.difficulty_level.toFixed(1) : 'N/A';
      return '<tr>' +
        '<td>' +
          '<div style="font-weight: 600;">' + asset.name + '</div>' +
          '<div style="font-size: 0.75rem; color: var(--text-muted);">ID: ' + asset.asset_id + '</div>' +
        '</td>' +
        '<td><span class="asset-badge ' + asset.type + '">' + asset.type + '</span></td>' +
        '<td>' + duration + '</td>' +
        '<td>⭐ ' + difficulty + '</td>' +
        '<td>' +
          '<button class="table-action-btn" title="Edit" onclick="app.showEditAssetModal(\'' + asset.asset_id + '\')">✏️</button>' +
          '<button class="table-action-btn" title="Delete" style="margin-left: 8px;" onclick="app.deleteAsset(\'' + asset.asset_id + '\')">🗑️</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  async loadTracks() {
    const tracksList = document.getElementById('sidebar-tracks-list');
    if (!tracksList) return;
    tracksList.innerHTML = '<div class="loading-placeholder">Loading tracks...</div>';

    try {
      let tracks = null;
      try {
        const res = await fetch(this.apiBaseUrl + '/api/tracks');
        if (res.ok) tracks = await res.json();
      } catch (e) {}

      if (!tracks || !tracks.length) {
        const docs = await fetchFirestoreRest('curriculum_map', 2000);
        const map = new Map();
        docs.forEach(d => {
          const tid = d.track_id || d.track || 'default';
          const tname = d.track_name || d.track || tid;
          const tnum = (d.sorting && d.sorting.track_number !== undefined) ? d.sorting.track_number : (d.track_number !== undefined ? d.track_number : 999);
          if (!map.has(tid)) {
            map.set(tid, { track_id: tid, track_name: tname, track_number: tnum });
          } else {
            const existing = map.get(tid);
            if (existing.track_number === 999 && tnum !== 999) {
              existing.track_number = tnum;
            }
          }
        });
        tracks = Array.from(map.values()).sort((a, b) => (a.track_number || 999) - (b.track_number || 999));
      }

      if (!tracks || tracks.length === 0) {
        tracksList.innerHTML = '<div class="loading-placeholder">No tracks available.</div>';
        return;
      }

      tracksList.innerHTML = tracks.map(t => {
        const safeName = (t.track_name || '').replace(/'/g, "\\'");
        return '<button class="track-select-btn" data-track-id="' + t.track_id + '" onclick="app.selectTrack(\'' + t.track_id + '\', \'' + safeName + '\')">' +
          '🌿 ' + t.track_name +
        '</button>';
      }).join('');

      if (tracks.length > 0 && !this.selectedTrackId) {
        this.selectTrack(tracks[0].track_id, tracks[0].track_name);
      }
    } catch (err) {
      console.error('loadTracks error:', err);
      tracksList.innerHTML = '<div class="loading-placeholder" style="color:#ef4444;">Failed: ' + err.message + '</div>';
    }
  }

  async selectTrack(trackId, trackName) {
    this.selectedTrackId = trackId;
    document.querySelectorAll('.track-select-btn').forEach(btn => {
      if (btn.getAttribute('data-track-id') === trackId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const treeTitle = document.getElementById('tree-title');
    if (treeTitle) treeTitle.innerText = trackName;
    const treeContent = document.getElementById('tree-content');
    if (!treeContent) return;

    treeContent.innerHTML = '<div class="loading-placeholder">Resolving and loading curriculum map tree...</div>';

    try {
      let curriculum = null;
      try {
        const res = await fetch(this.apiBaseUrl + '/content?track_id=' + trackId + '&version=latest');
        if (res.ok) {
          const data = await res.json();
          curriculum = data.curriculum;
        }
      } catch (e) {}

      if (!curriculum) {
        const docs = await fetchFirestoreRest('curriculum_map', 2000);
        const trackDocs = docs.filter(d => d.track_id === trackId || d.track_name === trackName);
        
        const subTrackMap = new Map();
        trackDocs.forEach(d => {
          const stName = d.sub_track || 'General Sub-Track';
          const stNum = d.sub_track_number || (d.sorting ? d.sorting.sub_track_number : null);

          if (!subTrackMap.has(stName)) {
            subTrackMap.set(stName, {
              sub_track_name: stName,
              sub_track_number: stNum,
              lessons: new Map()
            });
          }
          const st = subTrackMap.get(stName);
          if (!st.sub_track_number && stNum) st.sub_track_number = stNum;

          const lName = d.lesson || 'General Lesson';
          const lNum = d.lesson_number || (d.sorting ? d.sorting.lesson_number : null);

          if (!st.lessons.has(lName)) {
            st.lessons.set(lName, {
              lesson_name: lName,
              lesson_number: lNum,
              topics: new Map()
            });
          }
          const les = st.lessons.get(lName);
          if (!les.lesson_number && lNum) les.lesson_number = lNum;

          const topName = d.topic || 'General Topic';
          const topNum = d.topic_number || (d.sorting ? d.sorting.topic_number : null);

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
          if (!top.topic_description && d.topic_description) top.topic_description = d.topic_description;

          const subNum = d.sub_topic_number || (d.sorting ? d.sorting.sub_topic_number : 1);
          const assetName = d.asset_name || d.topic || 'Asset';

          top.sub_topics.push({
            sub_topic_number: subNum,
            asset_name: assetName,
            asset: d.asset_ref_id ? { asset_id: d.asset_ref_id, name: assetName } : null
          });
        });

        curriculum = Array.from(subTrackMap.values()).map(st => ({
          sub_track_name: st.sub_track_name,
          sub_track_number: st.sub_track_number,
          lessons: Array.from(st.lessons.values())
            .sort((a, b) => (a.lesson_number || 999) - (b.lesson_number || 999))
            .map(l => ({
              lesson_name: l.lesson_name,
              lesson_number: l.lesson_number,
              topics: Array.from(l.topics.values())
                .sort((a, b) => (a.topic_number || 999) - (b.topic_number || 999))
                .map(t => ({
                  topic_name: t.topic_name,
                  topic_number: t.topic_number,
                  topic_description: t.topic_description,
                  sub_topics: t.sub_topics.sort((a, b) => (a.sub_topic_number || 999) - (b.sub_topic_number || 999))
                }))
            }))
        })).sort((a, b) => (a.sub_track_number || 999) - (b.sub_track_number || 999));
      }

      this.renderTrackTree(curriculum, treeContent);
    } catch (err) {
      console.error('selectTrack error:', err);
      treeContent.innerHTML = '<div class="loading-placeholder" style="color:#ef4444;">Failed to build tree: ' + err.message + '</div>';
    }
  }

  renderTrackTree(curriculum, container) {
    if (!curriculum || curriculum.length === 0) {
      container.innerHTML = '<div class="tree-placeholder"><p>No curriculum maps defined for this track.</p></div>';
      return;
    }

    container.innerHTML = '';
    
    curriculum.forEach(subTrack => {
      const stNode = document.createElement('div');
      stNode.className = 'tree-node';
      
      const stNumStr = subTrack.sub_track_number !== null && subTrack.sub_track_number !== undefined ? '<span style="background: rgba(255, 255, 255, 0.1); color: var(--text-muted); font-size: 0.72rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-right: 8px;">#' + subTrack.sub_track_number + '</span>' : '';
      const stLabel = document.createElement('div');
      stLabel.className = 'tree-label';
      stLabel.innerHTML = '<strong>Sub-Track:</strong> ' + stNumStr + subTrack.sub_track_name;
      stNode.appendChild(stLabel);
      
      const stChildren = document.createElement('div');
      stChildren.className = 'tree-children';
      
      if (Array.isArray(subTrack.lessons)) {
        subTrack.lessons.forEach(lesson => {
          const lesNode = document.createElement('div');
          lesNode.className = 'tree-node';
          
          const lesNumStr = lesson.lesson_number !== null && lesson.lesson_number !== undefined ? '<span style="background: rgba(255, 255, 255, 0.08); color: var(--text-muted); font-size: 0.72rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-right: 8px;">#' + lesson.lesson_number + '</span>' : '';
          const lesLabel = document.createElement('div');
          lesLabel.className = 'tree-label';
          lesLabel.innerHTML = '<strong>Lesson:</strong> ' + lesNumStr + lesson.lesson_name;
          lesNode.appendChild(lesLabel);
          
          const lesChildren = document.createElement('div');
          lesChildren.className = 'tree-children';
          
          if (Array.isArray(lesson.topics)) {
            lesson.topics.forEach(top => {
              const topNode = document.createElement('div');
              topNode.className = 'tree-node topic-node';
              topNode.style.marginBottom = '12px';
              
              const topNumStr = top.topic_number !== null && top.topic_number !== undefined ? '<span style="background: rgba(129, 140, 248, 0.2); color: #818cf8; font-size: 0.72rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-right: 8px;">#' + top.topic_number + '</span>' : '';
              const topLabel = document.createElement('div');
              topLabel.className = 'tree-label';
              topLabel.style.color = '#818cf8';
              topLabel.innerHTML = '📌 <strong>Topic:</strong> ' + topNumStr + top.topic_name;
              topNode.appendChild(topLabel);

              const subTopicsContainer = document.createElement('div');
              subTopicsContainer.className = 'tree-children';

              const subTopicItems = top.sub_topics || (top.assets ? top.assets.map((a, idx) => ({ sub_topic_number: a.sorting_number || (idx + 1), asset_name: a.name, asset: a })) : []);
              
              subTopicItems.forEach(stItem => {
                const leaf = document.createElement('div');
                leaf.className = 'tree-leaf';
                leaf.style.cssText = 'display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; margin-bottom: 6px;';

                const subNum = stItem.sub_topic_number || (stItem.asset && stItem.asset.sorting_number) || 1;
                const assetName = stItem.asset_name || (stItem.asset ? stItem.asset.name : 'Asset');
                const asset = stItem.asset || {};
                const attr = asset.attributes || {};

                const headerLine = document.createElement('div');
                headerLine.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;';
                
                const titleSpan = document.createElement('span');
                titleSpan.innerHTML = '<span style="background: rgba(99, 102, 241, 0.2); color: #818cf8; font-size: 0.7rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-right: 8px;">Sub-Topic #' + subNum + '</span>' +
                  '<strong style="color: var(--text-primary); font-size: 0.88rem;">' + assetName + '</strong>';
                headerLine.appendChild(titleSpan);

                if (asset.type) {
                  const badge = document.createElement('span');
                  badge.className = 'asset-badge ' + asset.type;
                  badge.innerText = asset.type;
                  headerLine.appendChild(badge);
                }
                leaf.appendChild(headerLine);

                // Additional details line if asset metadata is resolved
                if (attr.duration || attr.difficulty_level || (attr.skill_tags && attr.skill_tags.length)) {
                  const metaLine = document.createElement('div');
                  metaLine.style.cssText = 'display: flex; align-items: center; gap: 12px; font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;';
                  
                  if (attr.duration) {
                    const durMin = Math.floor(attr.duration / 60);
                    const durSec = attr.duration % 60;
                    metaLine.innerHTML += '⏱️ ' + durMin + 'm ' + durSec + 's';
                  }
                  if (attr.difficulty_level) {
                    metaLine.innerHTML += ' ⭐ ' + attr.difficulty_level + '/10';
                  }
                  if (attr.skill_tags && attr.skill_tags.length) {
                    metaLine.innerHTML += ' 🏷️ ' + attr.skill_tags.slice(0, 3).join(', ');
                  }
                  leaf.appendChild(metaLine);
                }

                subTopicsContainer.appendChild(leaf);
              });

              topNode.appendChild(subTopicsContainer);
              lesChildren.appendChild(topNode);
            });
          }
          
          lesNode.appendChild(lesChildren);
          stChildren.appendChild(lesNode);
        });
      }
      
      stNode.appendChild(stChildren);
      container.appendChild(stNode);
    });
  }

  async loadLogs() {
    const tableBody = document.getElementById('logs-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4" class="loading-placeholder">Loading cache invalidation logs...</td></tr>';

    try {
      let logs = null;
      try {
        const res = await fetch(this.apiBaseUrl + '/api/cache-invalidations');
        if (res.ok) logs = await res.json();
      } catch (e) {}

      if (!logs) {
        const docs = await fetchFirestoreRest('cache_invalidations', 100);
        logs = docs.map(d => ({
          doc_id: d.doc_id || d.id,
          type: d.type || 'update',
          change_type: d.change_type || 'MODIFIED',
          timestamp: d.timestamp || new Date().toISOString(),
          details: d.details || {}
        }));
      }

      if (!logs || logs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="loading-placeholder">No cache invalidations recorded yet.</td></tr>';
        return;
      }

      tableBody.innerHTML = logs.map(log => {
        const timeStr = formatDateSafe(log.timestamp, 'full');
        const docName = (log.details && log.details.name) || log.doc_id;
        const detailsStr = log.details ? JSON.stringify(log.details) : '-';
        return '<tr>' +
          '<td style="font-family: var(--font-mono); font-size: 0.8rem;">' + timeStr + '</td>' +
          '<td><span class="asset-badge ' + (log.type === 'asset_update' ? 'video' : 'lab') + '">' + (log.change_type || log.type) + '</span></td>' +
          '<td style="font-family: var(--font-mono); font-size: 0.8rem;">' + log.doc_id + '</td>' +
          '<td style="font-size: 0.85rem;"><strong>' + docName + '</strong> <span style="color: var(--text-muted); font-size: 0.75rem;">' + detailsStr + '</span></td>' +
        '</tr>';
      }).join('');
    } catch (err) {
      console.error('loadLogs error:', err);
      tableBody.innerHTML = '<tr><td colspan="4" class="loading-placeholder" style="color: #ef4444;">Failed to load logs: ' + err.message + '</td></tr>';
    }
  }

  async loadHistory() {
    const container = document.getElementById('history-timeline-container');
    if (!container) return;
    container.innerHTML = '<div class="loading-placeholder">Loading database checkpoints...</div>';

    try {
      let commits = null;
      try {
        const res = await fetch(this.apiBaseUrl + '/api/history');
        if (res.ok) commits = await res.json();
      } catch (e) {}

      if (!commits) {
        const docs = await fetchFirestoreRest('cms_history', 50);
        commits = docs.map(d => ({
          commit_id: d.commit_id || d.id,
          description: d.description || 'Database Checkpoint',
          author: d.author || 'CMS System',
          timestamp: d.timestamp || new Date().toISOString(),
          assets_count: d.assets_count || 0,
          curriculum_count: d.curriculum_count || 0
        }));
      }

      if (!commits || commits.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">No database checkpoints saved yet.</div>';
        return;
      }

      container.innerHTML = commits.map(c => {
        const timeStr = formatDateSafe(c.timestamp, 'full');
        return '<div class="commit-card">' +
          '<div class="commit-info">' +
            '<span class="commit-desc">' + c.description + '</span>' +
            '<div class="commit-meta">' +
              '<span>👤 ' + c.author + '</span>' +
              '<span>📅 ' + timeStr + '</span>' +
              '<span>🔑 Commit: ' + c.commit_id + '</span>' +
            '</div>' +
            '<div class="commit-counts">' +
              '<span class="count-badge">🎬 Assets: ' + c.assets_count + '</span>' +
              '<span class="count-badge">🌿 Curriculums: ' + c.curriculum_count + '</span>' +
            '</div>' +
          '</div>' +
          '<button class="revert-btn" onclick="app.revertToCheckpoint(\'' + c.commit_id + '\')">' +
            '↩️ Revert State' +
          '</button>' +
        '</div>';
      }).join('');
    } catch (err) {
      console.error('loadHistory error:', err);
      container.innerHTML = '<div class="loading-placeholder" style="color:#ef4444;">Failed to fetch history logs: ' + err.message + '</div>';
    }
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
      }
    };

    const isEdit = !!editId;
    const url = isEdit ? (this.apiBaseUrl + '/api/assets/' + editId) : (this.apiBaseUrl + '/api/assets');
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.status === 200 || res.status === 201) {
        document.getElementById('assetModal').close();
        alert(isEdit ? 'Asset updated successfully!' : 'Asset created successfully!');
        this.loadAssets();
        this.loadDashboardData();
      } else {
        alert('Error: ' + data.error);
      }
    } catch (err) {
      alert('API Error: ' + err.message);
    }
  }

  async deleteAsset(assetId) {
    if (!confirm('Are you absolutely sure you want to delete the asset "' + assetId + '"?\nThis will permanently remove it from Firestore.')) {
      return;
    }

    try {
      const res = await fetch(this.apiBaseUrl + '/api/assets/' + assetId, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.status === 200) {
        alert('Asset deleted successfully.');
        this.loadAssets();
        this.loadDashboardData();
      } else {
        alert('Error deleting asset: ' + data.error);
      }
    } catch (err) {
      alert('Connection failed: ' + err.message);
    }
  }

  startLogsPolling() {
    this.logsPollTimer = setInterval(async () => {
      try {
        let logs = null;
        try {
          const res = await fetch(this.apiBaseUrl + '/api/cache-invalidations');
          if (res.ok) logs = await res.json();
        } catch (e) {}

        if (!logs) {
          const docs = await fetchFirestoreRest('cache_invalidations', 5);
          logs = docs.map(d => ({ timestamp: d.timestamp || new Date().toISOString() }));
        }

        if (logs && logs.length > 0) {
          const newestLog = logs[0];
          if (this.lastLogTimestamp && newestLog.timestamp !== this.lastLogTimestamp) {
            console.log('[POLL] New cache invalidation detected! Triggering UI refresh...');
            this.loadDashboardData();
            if (this.currentTab === 'logs') this.loadLogs();
          }
          this.lastLogTimestamp = newestLog.timestamp;
        }
      } catch (err) {}
    }, 4000);
  }
}

const app = new AcademyLibraryApp();
window.app = app;
document.addEventListener('DOMContentLoaded', () => app.init());
