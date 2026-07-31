// Academy Library CMS SPA Application Logic

const FIRESTORE_REST_BASE = 'https://firestore.googleapis.com/v1/projects/academy-live-builder/databases/(default)/documents';

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

async function fetchFirestoreRest(collection, pageSize = 500) {
  const url = FIRESTORE_REST_BASE + '/' + collection + '?pageSize=' + pageSize;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Firestore REST returned status ' + response.status);
  }
  const data = await response.json();
  const docs = data.documents || [];
  return docs.map(d => {
    const docId = d.name.split('/').pop();
    const fields = decodeFirestoreFields(d.fields);
    return Object.assign({ id: docId, doc_id: docId }, fields);
  });
}

class AcademyLibraryApp {
  constructor() {
    this.apiBaseUrl = (window.location.protocol === 'file:' || !window.location.port || window.location.port !== '8082')
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
      } catch (e) {}

      if (!assetsCount || !tracksCount) {
        const assets = await fetchFirestoreRest('assets', 500);
        assetsCount = assets.length;

        const curr = await fetchFirestoreRest('curriculum_map', 500);
        const tracksSet = new Set(curr.map(d => d.track_name || d.track_id).filter(Boolean));
        tracksCount = tracksSet.size;
      }

      const statAssets = document.getElementById('stat-assets-count');
      if (statAssets) statAssets.innerText = assetsCount || '-';
      const statTracks = document.getElementById('stat-tracks-count');
      if (statTracks) statTracks.innerText = tracksCount || '-';

      this.loadDashboardLogsPreview();
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    }
  }

  async loadDashboardLogsPreview() {
    try {
      let logs = null;
      try {
        const res = await fetch(this.apiBaseUrl + '/api/cache-invalidations');
        if (res.ok) {
          logs = await res.json();
        }
      } catch (e) {}

      if (!logs) {
        const docs = await fetchFirestoreRest('cache_invalidations', 10);
        logs = docs.map(d => ({
          doc_id: d.doc_id || d.id,
          type: d.type || 'update',
          timestamp: d.timestamp || new Date().toISOString(),
          details: d.details || {}
        }));
      }

      const previewList = document.getElementById('invalidation-preview-list');
      if (!previewList) return;

      if (!Array.isArray(logs) || logs.length === 0) {
        previewList.innerHTML = '<li class="loading-placeholder">No recent invalidation events.</li>';
        return;
      }

      previewList.innerHTML = logs.slice(0, 4).map(log => {
        const timeString = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'N/A';
        const docName = (log.details && log.details.name) || log.doc_id;
        const badgeClass = log.type === 'asset_update' ? 'asset' : 'curriculum';
        return '<li class="invalidation-item ' + badgeClass + '">' +
          '<div class="inv-meta">' +
            '<span class="inv-name">' + docName + '</span>' +
            '<span class="inv-time">' + timeString + ' • Doc: ' + log.doc_id + '</span>' +
          '</div>' +
          '<span class="inv-badge">' + (log.type || '').replace('_', ' ') + '</span>' +
        '</li>';
      }).join('');
    } catch (err) {
      console.error(err);
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
        const docs = await fetchFirestoreRest('assets', 500);
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
        const docs = await fetchFirestoreRest('curriculum_map', 500);
        const map = new Map();
        docs.forEach(d => {
          const tid = d.track_id || d.track || 'default';
          const tname = d.track_name || d.track || tid;
          if (!map.has(tid)) {
            map.set(tid, { track_id: tid, track_name: tname });
          }
        });
        tracks = Array.from(map.values());
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
        const docs = await fetchFirestoreRest('curriculum_map', 500);
        const trackDocs = docs.filter(d => d.track_id === trackId || d.track_name === trackName);
        
        const subTrackMap = new Map();
        trackDocs.forEach(d => {
          const stName = d.sub_track || 'General Sub-Track';
          if (!subTrackMap.has(stName)) {
            subTrackMap.set(stName, { sub_track_name: stName, lessons: [] });
          }
          const st = subTrackMap.get(stName);

          const lName = d.lesson || 'General Lesson';
          let les = st.lessons.find(l => l.lesson_name === lName);
          if (!les) {
            les = { lesson_name: lName, topics: [] };
            st.lessons.push(les);
          }

          les.topics.push({
            topic_id: d.id,
            topic_name: d.topic || 'Untitled Topic',
            asset_name: d.topic || 'Asset',
            sorting: d.sorting
          });
        });

        curriculum = Array.from(subTrackMap.values());
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
      
      const stLabel = document.createElement('div');
      stLabel.className = 'tree-label';
      stLabel.innerText = 'Sub-Track: ' + subTrack.sub_track_name;
      stNode.appendChild(stLabel);
      
      const stChildren = document.createElement('div');
      stChildren.className = 'tree-children';
      
      if (Array.isArray(subTrack.lessons)) {
        subTrack.lessons.forEach(lesson => {
          const lesNode = document.createElement('div');
          lesNode.className = 'tree-node';
          
          const lesLabel = document.createElement('div');
          lesLabel.className = 'tree-label';
          lesLabel.innerText = 'Lesson: ' + lesson.lesson_name;
          lesNode.appendChild(lesLabel);
          
          const lesChildren = document.createElement('div');
          lesChildren.className = 'tree-children';
          
          if (Array.isArray(lesson.topics)) {
            lesson.topics.forEach(top => {
              const topLeaf = document.createElement('div');
              topLeaf.className = 'tree-leaf';
              topLeaf.innerHTML = '<span class="leaf-icon">📄</span> ' + (top.topic_name || top.asset_name);
              lesChildren.appendChild(topLeaf);
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
        const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A';
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
        const timeStr = new Date(c.timestamp).toLocaleString();
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
