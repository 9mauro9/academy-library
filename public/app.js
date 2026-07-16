// Academy Library CMS SPA Application Logic

class AcademyLibraryApp {
  constructor() {
    // Connect to the Express server running on port 8082 if opened via file:// or a different port (like Firebase Hosting/Vite)
    this.apiBaseUrl = (window.location.protocol === 'file:' || !window.location.port || window.location.port !== '8082')
      ? 'http://localhost:8082'
      : '';
    this.currentTab = 'dashboard';
    this.assets = [];
    
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
    document.getElementById('ingest-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleIngestion();
    });

    // Search and filters for assets
    document.getElementById('asset-search').addEventListener('input', () => this.renderAssetsTable());
    document.getElementById('asset-filter-type').addEventListener('change', () => this.renderAssetsTable());

    // Ingestion dropzones
    this.setupDropzone('custom-dropzone', 'custom-input', 'custom-file-name', 'custom_file');

    // Custom Ingestion Form Submit
    document.getElementById('ai-ingest-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAiIngestion();
    });

    // Asset Form Submit
    document.getElementById('asset-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAssetFormSubmit();
    });
  }

  // Handle dialog light-dismiss boundary checking fallback for non-supporting browsers
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
        input.files = e.dataTransfer.files;
        this.handleFileSelected(e.dataTransfer.files[0], label, fieldName);
      }
    });
  }

  handleFileSelected(file, labelElement, fieldName) {
    labelElement.innerHTML = `<strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)`;
    if (fieldName === 'cms_file') {
      this.cmsFile = file;
    } else if (fieldName === 'track_file') {
      this.trackFile = file;
    } else if (fieldName === 'custom_file') {
      this.customFile = file;
    }
  }

  switchToTab(tabId) {
    this.currentTab = tabId;
    
    // Toggle tab btn active class
    document.querySelectorAll('.nav-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Toggle content panels
    document.querySelectorAll('.content-tab').forEach(panel => {
      if (panel.id === tabId) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    // Load data based on selected tab
    if (tabId === 'dashboard') {
      this.loadDashboardData();
    } else if (tabId === 'assets') {
      this.loadAssets();
    } else if (tabId === 'tracks') {
      this.loadTracks();
    } else if (tabId === 'logs') {
      this.loadLogs();
    } else if (tabId === 'history') {
      this.loadHistory();
    }
  }

  // API calls & Data Loaders
  async loadDashboardData() {
    try {
      const res = await fetch(this.apiBaseUrl + '/api/assets');
      const assets = await res.json();
      document.getElementById('stat-assets-count').innerText = Array.isArray(assets) ? assets.length : '-';
      
      const tracksRes = await fetch(this.apiBaseUrl + '/api/tracks');
      const tracks = await tracksRes.json();
      document.getElementById('stat-tracks-count').innerText = Array.isArray(tracks) ? tracks.length : '-';

      // Populate dashboard logs preview
      this.loadDashboardLogsPreview();
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    }
  }

  async loadDashboardLogsPreview() {
    try {
      const res = await fetch(this.apiBaseUrl + '/api/cache-invalidations');
      const logs = await res.json();
      const previewList = document.getElementById('invalidation-preview-list');
      
      if (!Array.isArray(logs) || logs.length === 0) {
        previewList.innerHTML = '<li class="loading-placeholder">No recent invalidation events.</li>';
        return;
      }

      previewList.innerHTML = logs.slice(0, 4).map(log => {
        const timeString = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'N/A';
        const docName = log.details.name || log.doc_id;
        const badgeClass = log.type === 'asset_update' ? 'asset' : 'curriculum';
        return `
          <li class="invalidation-item ${badgeClass}">
            <div class="inv-meta">
              <span class="inv-name">${docName}</span>
              <span class="inv-time">${timeString} • Doc: ${log.doc_id}</span>
            </div>
            <span class="inv-badge">${log.type.replace('_', ' ')}</span>
          </li>
        `;
      }).join('');
    } catch (err) {
      console.error(err);
    }
  }

  async loadAssets() {
    const tableBody = document.getElementById('assets-table-body');
    tableBody.innerHTML = `<tr><td colspan="5" class="loading-placeholder">Loading assets collection from Firestore...</td></tr>`;

    try {
      const res = await fetch(this.apiBaseUrl + '/api/assets');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.details || `Server returned status ${res.status}`);
      }
      if (!Array.isArray(data)) {
        throw new Error('Server response is not a valid assets list array.');
      }
      this.assets = data;
      this.renderAssetsTable();
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="5" class="loading-placeholder" style="color: #ef4444;">Failed to load assets: ${err.message}</td></tr>`;
    }
  }

  renderAssetsTable() {
    const tableBody = document.getElementById('assets-table-body');
    const searchQuery = document.getElementById('asset-search').value.toLowerCase().trim();
    const filterType = document.getElementById('asset-filter-type').value;

    const filtered = this.assets.filter(asset => {
      const matchesSearch = asset.name.toLowerCase().includes(searchQuery) || 
                            (asset.attributes && asset.attributes.topic && asset.attributes.topic.toLowerCase().includes(searchQuery));
      const matchesType = !filterType || asset.type === filterType;
      return matchesSearch && matchesType;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" class="loading-placeholder">No matching assets found.</td></tr>`;
      return;
    }

    tableBody.innerHTML = filtered.map(asset => {
      const duration = asset.attributes && asset.attributes.duration ? `${Math.floor(asset.attributes.duration / 60)}m ${asset.attributes.duration % 60}s` : 'N/A';
      const difficulty = asset.attributes && asset.attributes.difficulty_level ? asset.attributes.difficulty_level.toFixed(1) : 'N/A';
      return `
        <tr>
          <td>
            <div style="font-weight: 600;">${asset.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">ID: ${asset.asset_id}</div>
          </td>
          <td><span class="asset-badge ${asset.type}">${asset.type}</span></td>
          <td>${duration}</td>
          <td>⭐ ${difficulty}</td>
          <td>
            <button class="table-action-btn" title="Edit" onclick="app.showEditAssetModal('${asset.asset_id}')">✏️</button>
            <button class="table-action-btn" title="Delete" style="margin-left: 8px;" onclick="app.deleteAsset('${asset.asset_id}')">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async loadTracks() {
    const tracksList = document.getElementById('sidebar-tracks-list');
    tracksList.innerHTML = `<div class="loading-placeholder">Loading tracks...</div>`;

    try {
      const res = await fetch(this.apiBaseUrl + '/api/tracks');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.details || `Server returned status ${res.status}`);
      }
      if (!Array.isArray(data)) {
        throw new Error('Server response is not a valid tracks list array.');
      }
      const tracks = data;

      if (tracks.length === 0) {
        tracksList.innerHTML = `<div class="loading-placeholder">No tracks available. Run Ingestion.</div>`;
        return;
      }

      tracksList.innerHTML = tracks.map(t => `
        <button class="track-select-btn" data-track-id="${t.track_id}" onclick="app.selectTrack('${t.track_id}', '${t.track_name}')">
          🌿 ${t.track_name}
        </button>
      `).join('');
    } catch (err) {
      tracksList.innerHTML = `<div class="loading-placeholder" style="color:#ef4444;">Failed: ${err.message}</div>`;
    }
  }

  async selectTrack(trackId, trackName) {
    // Set active sidebar track button
    document.querySelectorAll('.track-select-btn').forEach(btn => {
      if (btn.getAttribute('data-track-id') === trackId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    document.getElementById('tree-title').innerText = trackName;
    const treeContent = document.getElementById('tree-content');
    treeContent.innerHTML = `<div class="loading-placeholder">Resolving and loading curriculum map tree...</div>`;

    try {
      const res = await fetch(`${this.apiBaseUrl}/content?track_id=${trackId}&version=latest`);
      const data = await res.json();
      
      this.renderTrackTree(data.curriculum, treeContent);
    } catch (err) {
      treeContent.innerHTML = `<div class="loading-placeholder" style="color:#ef4444;">Failed to build tree: ${err.message}</div>`;
    }
  }

  renderTrackTree(curriculum, container) {
    if (!curriculum || curriculum.length === 0) {
      container.innerHTML = `<div class="tree-placeholder"><p>No curriculum maps defined for this track.</p></div>`;
      return;
    }

    container.innerHTML = '';
    
    curriculum.forEach(subTrack => {
      const stNode = document.createElement('div');
      stNode.className = 'tree-node';
      
      const stLabel = document.createElement('div');
      stLabel.className = 'tree-label';
      stLabel.innerText = `Sub-Track: ${subTrack.sub_track_name}`;
      stNode.appendChild(stLabel);
      
      const stChildren = document.createElement('div');
      stChildren.className = 'tree-children';
      
      subTrack.lessons.forEach(lesson => {
        const lesNode = document.createElement('div');
        lesNode.className = 'tree-node';
        
        const lesLabel = document.createElement('div');
        lesLabel.className = 'tree-label';
        lesLabel.innerText = `Lesson: ${lesson.lesson_name}`;
        lesNode.appendChild(lesLabel);
        
        const lesChildren = document.createElement('div');
        lesChildren.className = 'tree-children';
        
        lesson.topics.forEach(topic => {
          const topNode = document.createElement('div');
          topNode.className = 'tree-node';
          
          const topLabel = document.createElement('div');
          topLabel.className = 'tree-label';
          topLabel.innerText = `Topic: ${topic.topic_name}`;
          topNode.appendChild(topLabel);
          
          const topChildren = document.createElement('div');
          topChildren.className = 'tree-children';
          
          topic.assets.forEach(asset => {
            const assetEl = document.createElement('div');
            assetEl.className = 'tree-asset-node';
            
            const duration = asset.attributes && asset.attributes.duration ? `${Math.floor(asset.attributes.duration / 60)}m` : 'N/A';
            
            assetEl.innerHTML = `
              <span class="tree-asset-name">🎬 ${asset.name}</span>
              <span class="tree-asset-meta">
                <span class="asset-badge ${asset.type}" style="padding:1px 4px; font-size:0.65rem;">${asset.type}</span>
                <span style="margin-left: 8px;">${duration}</span>
              </span>
            `;
            topChildren.appendChild(assetEl);
          });
          
          topNode.appendChild(topChildren);
          lesChildren.appendChild(topNode);
          
          // Collapsible logic for topics
          topLabel.addEventListener('click', (e) => {
            e.stopPropagation();
            topLabel.classList.toggle('collapsed');
            topChildren.classList.toggle('hidden');
          });
        });
        
        lesNode.appendChild(lesChildren);
        stChildren.appendChild(lesNode);
        
        // Collapsible logic for lessons
        lesLabel.addEventListener('click', (e) => {
          e.stopPropagation();
          lesLabel.classList.toggle('collapsed');
          lesChildren.classList.toggle('hidden');
        });
      });
      
      stNode.appendChild(stChildren);
      container.appendChild(stNode);

      // Collapsible logic for sub-tracks
      stLabel.addEventListener('click', (e) => {
        e.stopPropagation();
        stLabel.classList.toggle('collapsed');
        stChildren.classList.toggle('hidden');
      });
    });
  }

  async loadLogs() {
    const tableBody = document.getElementById('logs-table-body');
    tableBody.innerHTML = `<tr><td colspan="4" class="loading-placeholder">Loading events...</td></tr>`;

    try {
      const res = await fetch(this.apiBaseUrl + '/api/cache-invalidations');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.details || `Server returned status ${res.status}`);
      }
      if (!Array.isArray(data)) {
        throw new Error('Server response is not a valid log events array.');
      }
      const logs = data;

      if (logs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="loading-placeholder">No cache invalidation events triggered yet.</td></tr>`;
        return;
      }

      tableBody.innerHTML = logs.map(log => {
        const time = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A';
        const docName = log.details.name || log.doc_id;
        return `
          <tr>
            <td>${time}</td>
            <td><span class="badge" style="background-color: var(--text-accent-secondary); color:#000;">${log.type}</span></td>
            <td><code>${log.doc_id}</code></td>
            <td>
              <strong>${docName}</strong><br>
              <span style="font-size:0.75rem; color:var(--text-muted);">Changes detected: ${JSON.stringify(log.details)}</span>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="4" class="loading-placeholder" style="color:#ef4444;">Failed to fetch logs: ${err.message}</td></tr>`;
    }
  }

  // ETL Ingestion process
  async handleIngestion() {
    if (!this.cmsFile || !this.trackFile) {
      alert('Please select both required spreadsheet files first!');
      return;
    }

    const consoleBox = document.getElementById('console-output');
    const submitBtn = document.getElementById('ingest-submit-btn');

    consoleBox.innerHTML = `Uploading spreadsheets and running Ingestion ETL pipeline...\nThis may take up to 10 seconds. Please wait...\n`;
    submitBtn.disabled = true;
    submitBtn.innerText = 'Uploading & Ingesting...';

    const formData = new FormData();
    formData.append('cms_file', this.cmsFile);
    formData.append('track_file', this.trackFile);

    try {
      const res = await fetch(this.apiBaseUrl + '/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      
      if (res.status === 200 && data.success) {
        consoleBox.innerHTML += `\nSuccess!\n--------------------\n${data.log}`;
        alert('Ingestion completed successfully!');
        this.loadDashboardData();
        this.loadTracks();
      } else {
        consoleBox.innerHTML += `\nIngestion failed:\n--------------------\n${data.details || data.error}\n${data.stderr || ''}`;
        alert('Ingestion failed! See execution console for error logs.');
      }
    } catch (err) {
      consoleBox.innerHTML += `\nNetwork error:\n--------------------\n${err.message}`;
      alert('Network error connecting to CMS upload api.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Run Database Ingestion Pipeline';
    }
  }

  // CRUD Asset Modals
  showAddAssetModal() {
    document.getElementById('modalTitle').innerText = 'Create Content Asset';
    document.getElementById('edit-asset-id').value = '';
    document.getElementById('asset-form').reset();
    document.getElementById('asset-name').disabled = false;
    document.getElementById('assetModal').showModal();
  }

  showEditAssetModal(assetId) {
    const asset = this.assets.find(a => a.asset_id === assetId);
    if (!asset) return;

    document.getElementById('modalTitle').innerText = 'Edit Content Asset';
    document.getElementById('edit-asset-id').value = assetId;
    document.getElementById('asset-name').value = asset.name;
    document.getElementById('asset-name').disabled = true; // document ID is immutable in firestore
    
    document.getElementById('asset-type').value = asset.type;
    document.getElementById('asset-version').value = asset.version || 1;
    
    const attr = asset.attributes || {};
    document.getElementById('asset-duration').value = attr.duration || 0;
    document.getElementById('asset-difficulty').value = attr.difficulty_level || '';
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
    const name = document.getElementById('asset-name').value;
    const type = document.getElementById('asset-type').value;
    const version = document.getElementById('asset-version').value;
    
    const skillTagsStr = document.getElementById('asset-tags').value;
    const skill_tags = skillTagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);

    const payload = {
      name,
      type,
      version,
      attributes: {
        duration: document.getElementById('asset-duration').value,
        difficulty_level: document.getElementById('asset-difficulty').value,
        skill_tags,
        topic: document.getElementById('asset-topic').value,
        cvp_version: document.getElementById('asset-cvp-ver').value,
        eos_version: document.getElementById('asset-eos-ver').value,
        prerequisite: document.getElementById('asset-prereq').value,
        needs_update: document.getElementById('asset-needs-update').checked,
        comments: document.getElementById('asset-comments').value
      }
    };

    const isEdit = !!editId;
    const url = isEdit ? `${this.apiBaseUrl}/api/assets/${editId}` : `${this.apiBaseUrl}/api/assets`;
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
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert(`API Error: ${err.message}`);
    }
  }

  async deleteAsset(assetId) {
    if (!confirm(`Are you absolutely sure you want to delete the asset "${assetId}"?\nThis will permanently remove it from Firestore, and nullify references to it in the curriculum maps to preserve integrity.`)) {
      return;
    }

    try {
      const res = await fetch(`${this.apiBaseUrl}/api/assets/${assetId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.status === 200) {
        alert('Asset deleted successfully. Referential integrity maintained!');
        this.loadAssets();
        this.loadDashboardData();
      } else {
        alert(`Error deleting asset: ${data.error}`);
      }
    } catch (err) {
      alert(`Connection failed: ${err.message}`);
    }
  }

  setIngestType(type) {
    this.ingestType = type;
    const standardForm = document.getElementById('ingest-form');
    const aiForm = document.getElementById('ai-ingest-form');
    const standardBtn = document.getElementById('btn-ingest-standard');
    const aiBtn = document.getElementById('btn-ingest-ai');
    
    if (type === 'standard') {
      standardForm.style.display = 'flex';
      aiForm.style.display = 'none';
      standardBtn.classList.add('active');
      aiBtn.classList.remove('active');
    } else {
      standardForm.style.display = 'none';
      aiForm.style.display = 'flex';
      standardBtn.classList.remove('active');
      aiBtn.classList.add('active');
    }
  }

  // Gemini unstructured sheet parser request handler
  async handleAiIngestion() {
    if (!this.customFile) {
      alert('Please select a custom spreadsheet file first!');
      return;
    }

    const consoleBox = document.getElementById('console-output');
    const submitBtn = document.getElementById('ai-submit-btn');

    consoleBox.innerHTML = `Uploading custom spreadsheet...\nExtracting asset schema and curriculum structure via Gemini AI...\nThis process takes 10-15 seconds as it parses layout logic and maps references.\n`;
    submitBtn.disabled = true;
    submitBtn.innerText = 'Extracting via Gemini AI...';

    const formData = new FormData();
    formData.append('custom_file', this.customFile);

    try {
      const res = await fetch(this.apiBaseUrl + '/api/upload-unstructured', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      
      if (res.status === 200 && data.success) {
        consoleBox.innerHTML += `\nSuccess!\n--------------------\n`;
        consoleBox.innerHTML += `Parsed assets count: ${data.assets_count}\n`;
        consoleBox.innerHTML += `Parsed curriculum records: ${data.curriculum_count}\n`;
        consoleBox.innerHTML += `${data.log}`;
        alert('Gemini custom sheet ingestion completed successfully!');
        
        this.loadDashboardData();
        this.loadTracks();
      } else {
        consoleBox.innerHTML += `\nIngestion failed:\n--------------------\n${data.error}\n${data.details || ''}\n${data.stderr || ''}`;
        alert(`Gemini AI Ingestion failed:\n${data.error}`);
      }
    } catch (err) {
      consoleBox.innerHTML += `\nNetwork error:\n--------------------\n${err.message}`;
      alert('Network error connecting to Gemini upload endpoint.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Extract & Ingest via Gemini AI';
    }
  }

  async loadHistory() {
    const container = document.getElementById('history-timeline-container');
    container.innerHTML = `<div class="loading-placeholder">Loading database checkpoints...</div>`;

    try {
      const res = await fetch(this.apiBaseUrl + '/api/history');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.details || `Server returned status ${res.status}`);
      }
      if (!Array.isArray(data)) {
        throw new Error('Server response is not a valid commits history array.');
      }
      const commits = data;

      if (commits.length === 0) {
        container.innerHTML = `<div class="loading-placeholder">No database checkpoints saved yet.</div>`;
        return;
      }

      container.innerHTML = commits.map(c => {
        const timeStr = new Date(c.timestamp).toLocaleString();
        return `
          <div class="commit-card">
            <div class="commit-info">
              <span class="commit-desc">${c.description}</span>
              <div class="commit-meta">
                <span>👤 ${c.author}</span>
                <span>📅 ${timeStr}</span>
                <span>🔑 Commit: ${c.commit_id}</span>
              </div>
              <div class="commit-counts">
                <span class="count-badge">🎬 Assets: ${c.assets_count}</span>
                <span class="count-badge">🌿 Curriculums: ${c.curriculum_count}</span>
              </div>
            </div>
            <button class="revert-btn" onclick="app.revertToCheckpoint('${c.commit_id}')">
              ↩️ Revert State
            </button>
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = `<div class="loading-placeholder" style="color:#ef4444;">Failed to fetch history logs: ${err.message}</div>`;
    }
  }

  async revertToCheckpoint(commitId) {
    if (!confirm(`Are you absolutely sure you want to revert the database state to commit "${commitId}"?\nThis will completely overwrite your current active assets and tracks with the snapshots captured at that moment.`)) {
      return;
    }

    try {
      const res = await fetch(`${this.apiBaseUrl}/api/revert/${commitId}`, {
        method: 'POST'
      });
      const data = await res.json();

      if (res.status === 200) {
        alert('Database reverted successfully!');
        this.loadDashboardData();
        this.loadTracks();
        if (this.currentTab === 'history') {
          this.loadHistory();
        }
      } else {
        alert(`Rollback failed: ${data.error}`);
      }
    } catch (err) {
      alert(`API Error: ${err.message}`);
    }
  }

  // Telemetry loop for invalidation events
  startLogsPolling() {
    this.logsPollTimer = setInterval(async () => {
      try {
        const res = await fetch(this.apiBaseUrl + '/api/cache-invalidations');
        const logs = await res.json();
        if (logs.length > 0) {
          const newestLog = logs[0];
          if (this.lastLogTimestamp && newestLog.timestamp !== this.lastLogTimestamp) {
            console.log('[POLL] New cache invalidation detected! Triggering UI refresh...');
            // Refresh dashboard
            this.loadDashboardData();
            if (this.currentTab === 'logs') {
              this.loadLogs();
            }
          }
          this.lastLogTimestamp = newestLog.timestamp;
        }
      } catch (err) {
        // Suppress polling connection logs
      }
    }, 3000);
  }
}

// Instantiate and expose globally
const app = new AcademyLibraryApp();
window.app = app;
document.addEventListener('DOMContentLoaded', () => app.init());
