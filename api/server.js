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

const express = require('express');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const multer = require('multer');
const { execSync } = require('child_process');
const { createCheckpoint, revertToCheckpoint } = require('../etl/history_manager.cjs');
const { loadGeminiParsedData } = require('../etl/gemini_loader.cjs');
const { syncGoogleSheets } = require('../etl/sync_sheets.cjs');
const { validateTaxonomyPath, inferTaxonomy, PRIMARY_BUCKET } = require('./taxonomy.cjs');

const app = express();
const PORT = process.env.PORT || 8082;

const { getApps, initializeApp } = require('firebase-admin/app');

// Initialize Firebase Admin
if (getApps().length === 0) {
  initializeApp({
    projectId: 'academy-live-builder'
  });
}

const db = getFirestore();
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch (e) {}

// In-Memory Cache for Assets and Curriculum Map
class MemoryCache {
  constructor() {
    this.assets = [];
    this.curriculumMap = [];
    this.isLoaded = false;
    this.loadPromise = null;
  }

  async loadFromFirestore() {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        console.log('--- Initializing in-memory cache from Firestore ---');
        const assetsSnap = await db.collection('assets').orderBy('name').get();
        const assets = [];
        assetsSnap.forEach(doc => {
          const data = doc.data();
          const taxonomy = inferTaxonomy(data.gcs_uri, data.type, data.name || data.current_title);
          assets.push({
            current_title: data.current_title || data.name || doc.id,
            title_aliases: data.title_aliases || [],
            major_version: data.major_version || 1,
            minor_version: data.minor_version || 0,
            content_hash: data.content_hash || (data.attributes && data.attributes.content_hash) || 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            gcs_uri: data.gcs_uri || taxonomy.gcs_uri,
            domain: data.domain || taxonomy.domain,
            asset_category: data.asset_category || taxonomy.asset_category,
            status: data.status || 'ACTIVE',
            ...data,
            asset_id: doc.id
          });
        });
        this.assets = assets;
        console.log(`Loaded ${this.assets.length} assets into memory cache.`);

        const mapSnap = await db.collection('curriculum_map').get();
        const items = [];
        mapSnap.forEach(doc => {
          items.push({
            id: doc.id,
            ...doc.data()
          });
        });
        this.curriculumMap = items;
        console.log(`Loaded ${this.curriculumMap.length} curriculum map nodes into memory cache.`);
        this.isLoaded = true;
        console.log('--- In-memory cache initialization complete ---');
      } catch (err) {
        console.error('Failed to initialize in-memory cache:', err);
        throw err;
      } finally {
        this.loadPromise = null;
      }
    })();
    return this.loadPromise;
  }

  async ensureLoaded() {
    if (this.loadPromise) {
      await this.loadPromise;
    } else if (!this.isLoaded) {
      this.loadPromise = this.loadFromFirestore().then(() => {
        this.loadPromise = null;
      }).catch(err => {
        this.loadPromise = null;
        throw err;
      });
      await this.loadPromise;
    }
  }
}

const cache = new MemoryCache();

// Configure Multer for Excel file uploads
const uploadDir = path.join(__dirname, '..');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    if (file.fieldname === 'cms_file') {
      cb(null, 'Academy CMS Master 1.xlsx');
    } else if (file.fieldname === 'track_file') {
      cb(null, 'Academy Track Master 1.xlsx');
    } else {
      cb(null, file.originalname);
    }
  }
});
const upload = multer({ storage });

// Serve static files from public/ folder
app.use(express.static(path.join(__dirname, '../public')));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Middleware to parse JSON
app.use(express.json());

// Helper function to slugify
function slugify(text) {
    if (!text) return "";
    return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[-\s]+/g, '-');
}

/**
 * GET /content
 * Query params:
 *   - track_id: string (required)
 *   - version: string/number (optional, defaults to 'latest')
 */
app.get('/content', async (req, res) => {
  try {
    const { track_id, version = 'latest' } = req.query;

    if (!track_id) {
      return res.status(400).json({ error: 'Missing required parameter: track_id' });
    }

    console.log(`Received query for track_id: ${track_id}, version: ${version}`);

    await cache.ensureLoaded();

    // Query curriculum_map in memory
    const filteredDocs = cache.curriculumMap.filter(doc => {
      if (doc.track_id !== track_id) return false;
      if (version === 'latest') {
        return doc.is_latest !== false;
      } else {
        const versionNum = parseInt(version, 10);
        return doc.version === versionNum || (doc.version === undefined && versionNum === 1);
      }
    });

    if (filteredDocs.length === 0) {
      return res.status(404).json({ error: `No curriculum found for track_id: ${track_id} and version: ${version}` });
    }



    // Map curriculum docs with their resolved assets
    const items = filteredDocs.map(doc => {
      let resolvedAsset = null;
      if (doc.asset_ref) {
        const refId = doc.asset_ref.id || (doc.asset_ref._path && doc.asset_ref._path.segments && doc.asset_ref._path.segments.slice(-1)[0]);
        if (refId) {
          resolvedAsset = cache.assets.find(a => a.asset_id === refId) || null;
          console.log(`[GET /content] Resolved Asset for ${refId}: difficulty = ${resolvedAsset ? resolvedAsset.attributes?.difficulty_level : 'NULL'}`);
        }
      }

      return {
        sub_track: doc.sub_track,
        lesson: doc.lesson,
        topic: doc.topic,
        topic_description: doc.topic_description,
        sub_topic_number: doc.sub_topic_number || (doc.sorting ? doc.sorting.sub_topic_number : null),
        asset_name: doc.asset_name,
        asset: resolvedAsset,
        sorting: doc.sorting || {}
      };
    });

    // Structure flat items into a nested curriculum hierarchy:
    // Sub-Track -> Lesson -> Topic -> Sub-Topics (asset_name)
    const subTracksMap = new Map();

    items.forEach(item => {
      const subTrackName = item.sub_track || 'General';
      const subTrackSort = item.sorting.sub_track_number || 999;

      if (!subTracksMap.has(subTrackName)) {
        subTracksMap.set(subTrackName, {
          name: subTrackName,
          sorting_number: subTrackSort,
          lessons: new Map()
        });
      }
      
      const subTrackObj = subTracksMap.get(subTrackName);
      const lessonName = item.lesson || 'General';
      const lessonSort = item.sorting.lesson_number || 999;

      if (!subTrackObj.lessons.has(lessonName)) {
        subTrackObj.lessons.set(lessonName, {
          name: lessonName,
          sorting_number: lessonSort,
          topics: new Map()
        });
      }

      const lessonObj = subTrackObj.lessons.get(lessonName);
      const topicName = item.topic || 'General';
      const topicSort = item.sorting.topic_number || 999;

      if (!lessonObj.topics.has(topicName)) {
        lessonObj.topics.set(topicName, {
          name: topicName,
          description: item.topic_description,
          sorting_number: topicSort,
          sub_topics: []
        });
      }

      const topicObj = lessonObj.topics.get(topicName);
      if (!topicObj.description && item.topic_description) {
        topicObj.description = item.topic_description;
      }

      topicObj.sub_topics.push({
        sub_topic_number: item.sub_topic_number || item.sorting.sub_topic_number || 1,
        asset_name: item.asset_name,
        asset: item.asset
      });
    });

    // Convert maps to sorted arrays
    const structuredResult = Array.from(subTracksMap.values())
      .sort((a, b) => a.sorting_number - b.sorting_number)
      .map(st => {
        const lessons = Array.from(st.lessons.values())
          .sort((a, b) => a.sorting_number - b.sorting_number)
          .map(l => {
            const topics = Array.from(l.topics.values())
              .sort((a, b) => a.sorting_number - b.sorting_number)
              .map(t => {
                const sortedSubTopics = t.sub_topics.sort((a, b) => (a.sub_topic_number || 999) - (b.sub_topic_number || 999));
                const assetsList = sortedSubTopics.map(st => {
                  const defaultAttrs = { duration: 0, difficulty_level: 1.0, skill_tags: [] };
                  if (st.asset) {
                    return {
                      ...st.asset,
                      sorting_number: st.sub_topic_number,
                      attributes: st.asset.attributes ? { ...defaultAttrs, ...st.asset.attributes } : defaultAttrs
                    };
                  }
                  return {
                    asset_id: slugify(st.asset_name),
                    name: st.asset_name,
                    type: 'video',
                    version: 1,
                    sorting_number: st.sub_topic_number,
                    attributes: defaultAttrs
                  };
                });

                return {
                  topic_name: t.name,
                  topic_description: t.description || null,
                  sub_topics: sortedSubTopics,
                  assets: assetsList
                };
              });
            return {
              lesson_name: l.name,
              topics: topics
            };
          });
        return {
          sub_track_name: st.name,
          lessons: lessons
        };
      });

    res.json({
      track_id,
      version: version === 'latest' ? 'latest' : parseInt(version, 10),
      curriculum: structuredResult
    });

  } catch (err) {
    console.error('Error fetching content:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// ==========================================
// CMS MANAGEMENT API ENDPOINTS (FOR FRONT-END)
// ==========================================

/**
 * GET /api/assets
 * Lists all assets, supports basic text filtering in memory
 */
app.get('/api/assets', async (req, res) => {
  try {
    await cache.ensureLoaded();
    res.json(cache.assets);
  } catch (err) {
    console.error('Error fetching assets:', err);
    res.status(500).json({ error: 'Failed to fetch assets', details: err.message });
  }
});

/**
 * GET /api/v1/assets/:assetId/version
 * Decoupled endpoint returning asset version & storage metadata without student state
 */
app.get(['/api/v1/assets/:assetId/version', '/api/assets/:assetId/version'], async (req, res) => {
  try {
    const { assetId } = req.params;
    await cache.ensureLoaded();
    const asset = cache.assets.find(a => a.asset_id === assetId);

    if (!asset) {
      return res.status(404).json({ error: `Asset document "${assetId}" not found.` });
    }

    const taxonomy = inferTaxonomy(asset.gcs_uri, asset.type, asset.name || asset.current_title);

    res.json({
      asset_id: asset.asset_id,
      current_title: asset.current_title || asset.name,
      title_aliases: asset.title_aliases || [],
      major_version: asset.major_version || 1,
      minor_version: asset.minor_version || 0,
      version: asset.version || 1,
      content_hash: asset.content_hash || (asset.attributes && asset.attributes.content_hash) || 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      gcs_uri: asset.gcs_uri || taxonomy.gcs_uri,
      domain: asset.domain || taxonomy.domain,
      asset_category: asset.asset_category || taxonomy.asset_category,
      duration_seconds: (asset.attributes && asset.attributes.duration) || asset.duration_seconds || 0,
      last_updated: (asset.attributes && asset.attributes.last_updated) || asset.last_updated || new Date().toISOString(),
      status: asset.status || 'ACTIVE'
    });
  } catch (err) {
    console.error('Error fetching asset version:', err);
    res.status(500).json({ error: 'Failed to fetch asset version', details: err.message });
  }
});

/**
 * POST /api/v1/assets/signed-url
 * Validates destination paths against taxonomy prior to generating secure upload URL
 */
app.post(['/api/v1/assets/signed-url', '/api/assets/signed-url'], async (req, res) => {
  try {
    const { destinationPath, contentType, assetId } = req.body;

    if (!destinationPath) {
      return res.status(400).json({ error: 'Missing required parameter: destinationPath' });
    }

    const validation = validateTaxonomyPath(destinationPath);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Taxonomy validation failed',
        details: validation.error
      });
    }

    const fullGcsUri = validation.fullGcsUri;
    const mockSignedUrl = `https://storage.googleapis.com/${PRIMARY_BUCKET.slice(5)}${validation.cleanPath}?GoogleAccessId=academy-sa%40academy-live-builder.iam.gserviceaccount.com&Expires=${Math.floor(Date.now() / 1000) + 3600}&Signature=mock_signature`;

    res.json({
      success: true,
      asset_id: assetId || null,
      destination_path: validation.cleanPath,
      gcs_uri: fullGcsUri,
      domain: validation.domain,
      asset_category: validation.asset_category,
      signed_url: mockSignedUrl,
      expires_in: 3600
    });
  } catch (err) {
    console.error('Error generating signed URL:', err);
    res.status(500).json({ error: 'Failed to generate signed URL', details: err.message });
  }
});

/**
 * POST /api/assets
 * Creates a new asset document
 */
app.post('/api/assets', async (req, res) => {
  try {
    const { name, type, version = 1, attributes = {}, domain, asset_category, gcs_uri, content_hash, title_aliases, current_title, major_version, minor_version, status } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'Missing name or type parameters' });
    }

    // Auto-create history checkpoint
    await createCheckpoint(db, 'Manual Portal', `Pre-creation checkpoint for asset: "${name}"`);

    // Slugify name for the document ID
    const assetId = name.toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[-\s]+/g, '-');

    const assetRef = db.collection('assets').doc(assetId);
    const docSnap = await assetRef.get();
    if (docSnap.exists) {
      return res.status(400).json({ error: `Asset ID "${assetId}" already exists.` });
    }

    const taxonomy = inferTaxonomy(gcs_uri, type.trim(), name.trim());

    const assetData = {
      name: name.trim(),
      current_title: current_title ? current_title.trim() : name.trim(),
      title_aliases: Array.isArray(title_aliases) ? title_aliases : [],
      type: type.trim(),
      domain: domain || taxonomy.domain,
      asset_category: asset_category || taxonomy.asset_category,
      gcs_uri: gcs_uri || taxonomy.gcs_uri,
      content_hash: content_hash || (attributes && attributes.content_hash) || 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      major_version: parseInt(major_version, 10) || 1,
      minor_version: parseInt(minor_version, 10) || 0,
      version: parseInt(version, 10) || 1,
      status: status || 'ACTIVE',
      is_latest: true,
      attributes: {
        duration: parseInt(attributes.duration, 10) || 0,
        prerequisite: attributes.prerequisite || null,
        difficulty_level: parseFloat(attributes.difficulty_level) || null,
        skill_tags: Array.isArray(attributes.skill_tags) ? attributes.skill_tags : [],
        last_updated: attributes.last_updated || new Date().toISOString().split('T')[0],
        cvp_version: attributes.cvp_version || null,
        eos_version: attributes.eos_version || null,
        avd_version: attributes.avd_version || null,
        needs_update: !!attributes.needs_update,
        comments: attributes.comments || null,
        topic: attributes.topic || null
      }
    };

    await assetRef.set(assetData);
    await cache.loadFromFirestore();
    res.status(201).json({ success: true, asset_id: assetId, data: assetData });
  } catch (err) {
    console.error('Error creating asset:', err);
    res.status(500).json({ error: 'Failed to create asset', details: err.message });
  }
});

/**
 * PUT /api/assets/:id
 * Updates an asset document in Firestore
 */
app.put('/api/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, version, attributes = {}, domain, asset_category, gcs_uri, content_hash, title_aliases, current_title, major_version, minor_version, status } = req.body;

    // Auto-create history checkpoint
    await createCheckpoint(db, 'Manual Portal', `Pre-update checkpoint for asset: "${id}"`);

    const assetRef = db.collection('assets').doc(id);
    const docSnap = await assetRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: `Asset document "${id}" not found.` });
    }

    const currentData = docSnap.data();
    const taxonomy = inferTaxonomy(gcs_uri || currentData.gcs_uri, type || currentData.type, name || currentData.name || currentData.current_title);

    let updatedAliases = currentData.title_aliases || [];
    if (Array.isArray(title_aliases)) {
      updatedAliases = title_aliases;
    } else if (current_title && currentData.current_title && current_title !== currentData.current_title) {
      if (!updatedAliases.includes(currentData.current_title)) {
        updatedAliases.push(currentData.current_title);
      }
    }

    const updatedData = {
      ...currentData,
      name: name !== undefined ? name.trim() : currentData.name,
      current_title: current_title !== undefined ? current_title.trim() : (currentData.current_title || currentData.name),
      title_aliases: updatedAliases,
      type: type !== undefined ? type.trim() : currentData.type,
      domain: domain !== undefined ? domain : (currentData.domain || taxonomy.domain),
      asset_category: asset_category !== undefined ? asset_category : (currentData.asset_category || taxonomy.asset_category),
      gcs_uri: gcs_uri !== undefined ? gcs_uri : (currentData.gcs_uri || taxonomy.gcs_uri),
      content_hash: content_hash !== undefined ? content_hash : (currentData.content_hash || 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'),
      major_version: major_version !== undefined ? parseInt(major_version, 10) : (currentData.major_version || 1),
      minor_version: minor_version !== undefined ? parseInt(minor_version, 10) : (currentData.minor_version || 0),
      version: version !== undefined ? parseInt(version, 10) : currentData.version,
      status: status !== undefined ? status : (currentData.status || 'ACTIVE'),
      is_latest: currentData.is_latest,
      attributes: {
        ...currentData.attributes,
        duration: attributes.duration !== undefined ? parseInt(attributes.duration, 10) : currentData.attributes?.duration,
        prerequisite: attributes.prerequisite !== undefined ? attributes.prerequisite : currentData.attributes?.prerequisite,
        difficulty_level: attributes.difficulty_level !== undefined ? parseFloat(attributes.difficulty_level) : currentData.attributes?.difficulty_level,
        skill_tags: attributes.skill_tags !== undefined ? attributes.skill_tags : currentData.attributes?.skill_tags,
        last_updated: attributes.last_updated !== undefined ? attributes.last_updated : currentData.attributes?.last_updated,
        cvp_version: attributes.cvp_version !== undefined ? attributes.cvp_version : currentData.attributes?.cvp_version,
        eos_version: attributes.eos_version !== undefined ? attributes.eos_version : currentData.attributes?.eos_version,
        avd_version: attributes.avd_version !== undefined ? attributes.avd_version : currentData.attributes?.avd_version,
        needs_update: attributes.needs_update !== undefined ? !!attributes.needs_update : currentData.attributes?.needs_update,
        comments: attributes.comments !== undefined ? attributes.comments : currentData.attributes?.comments,
        topic: attributes.topic !== undefined ? attributes.topic : currentData.attributes?.topic
      }
    };

    await assetRef.set(updatedData);
    await cache.loadFromFirestore();
    res.json({ success: true, asset_id: id, data: updatedData });
  } catch (err) {
    console.error('Error updating asset:', err);
    res.status(500).json({ error: 'Failed to update asset', details: err.message });
  }
});

app.delete('/api/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Auto-create history checkpoint
    await createCheckpoint(db, 'Manual Portal', `Pre-deletion checkpoint for asset: "${id}"`);

    const assetRef = db.collection('assets').doc(id);

    // Find and nullify any references in curriculum_map
    const curriculumSnap = await db.collection('curriculum_map').where('asset_ref', '==', assetRef).get();
    if (!curriculumSnap.empty) {
      const batch = db.batch();
      curriculumSnap.forEach(doc => {
        batch.update(doc.ref, { asset_ref: null });
      });
      await batch.commit();
    }

    await assetRef.delete();
    await cache.loadFromFirestore();
    res.json({ success: true, message: `Asset "${id}" deleted successfully.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/assets/:id/delete', async (req, res) => {
  // We expose delete as a PUT/delete to ensure safe invocation
  try {
    const { id } = req.params;
    
    // Auto-create history checkpoint
    await createCheckpoint(db, 'Manual Portal', `Pre-deletion checkpoint for asset: "${id}"`);

    const assetRef = db.collection('assets').doc(id);

    console.log(`Deleting asset: ${id}...`);

    // Find and nullify any references in curriculum_map
    const curriculumSnap = await db.collection('curriculum_map').where('asset_ref', '==', assetRef).get();
    if (!curriculumSnap.empty) {
      console.log(`Nullifying ${curriculumSnap.size} references in curriculum_map for asset ${id}...`);
      const batch = db.batch();
      curriculumSnap.forEach(doc => {
        batch.update(doc.ref, { asset_ref: null });
      });
      await batch.commit();
    }

    await assetRef.delete();
    await cache.loadFromFirestore();
    res.json({ success: true, message: `Asset "${id}" deleted successfully. References nullified.` });
  } catch (err) {
    console.error('Error deleting asset:', err);
    res.status(500).json({ error: 'Failed to delete asset', details: err.message });
  }
});

// Helper route to support standard DELETE method
app.delete('/api/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Auto-create history checkpoint
    await createCheckpoint(db, 'Manual Portal', `Pre-deletion checkpoint for asset: "${id}"`);

    const assetRef = db.collection('assets').doc(id);

    // Find and nullify any references in curriculum_map
    const curriculumSnap = await db.collection('curriculum_map').where('asset_ref', '==', assetRef).get();
    if (!curriculumSnap.empty) {
      const batch = db.batch();
      curriculumSnap.forEach(doc => {
        batch.update(doc.ref, { asset_ref: null });
      });
      await batch.commit();
    }

    await assetRef.delete();
    await cache.loadFromFirestore();
    res.json({ success: true, message: `Asset "${id}" deleted successfully.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tracks
 * Lists unique curriculum track IDs and track names
 */
const TRACK_NAMES = {
  'network-foundations': { name: 'Network Foundations', number: 1 },
  'data-center': { name: 'Data Center', number: 2 },
  'campus': { name: 'Campus', number: 3 },
  'automation': { name: 'Automation', number: 4 },
  'wan-routing': { name: 'WAN Routing', number: 5 }
};

app.get('/api/tracks', async (req, res) => {
  try {
    await cache.ensureLoaded();
    const tracksMap = new Map();
    cache.curriculumMap.forEach(item => {
      const tid = item.track_id;
      if (tid) {
        const meta = TRACK_NAMES[tid] || { name: item.track_name || tid, number: item.track_number || (item.sorting && item.sorting.track_number) || 999 };
        if (!tracksMap.has(tid)) {
          tracksMap.set(tid, {
            track_id: tid,
            track_name: meta.name,
            track_number: meta.number
          });
        }
      }
    });

    const result = Array.from(tracksMap.values()).sort((a, b) => a.track_number - b.track_number);
    res.json(result);
  } catch (err) {
    console.error('Error fetching tracks:', err);
    res.status(500).json({ error: 'Failed to fetch tracks', details: err.message });
  }
});

/**
 * GET /api/cache-invalidations
 * Lists the 20 most recent cache invalidation signals
 */
app.get('/api/cache-invalidations', async (req, res) => {
  try {
    const snap = await db.collection('cache_invalidations')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();

    const results = [];
    snap.forEach(doc => {
      const data = doc.data();
      let formattedTimestamp = null;
      if (data.timestamp) {
        if (typeof data.timestamp.toDate === 'function') {
          formattedTimestamp = data.timestamp.toDate().toISOString();
        } else if (typeof data.timestamp === 'string') {
          formattedTimestamp = data.timestamp;
        } else {
          formattedTimestamp = new Date(data.timestamp).toISOString();
        }
      }
      results.push({
        id: doc.id,
        type: data.type,
        doc_id: data.doc_id,
        change_type: data.change_type || null,
        timestamp: formattedTimestamp,
        details: data.details || {}
      });
    });

    res.json(results);
  } catch (err) {
    console.error('Error fetching invalidation logs:', err);
    res.status(500).json({ error: 'Failed to fetch logs', details: err.message });
  }
});

/**
 * POST /api/sync-sheets
 * Automated Google Sheets API Sync Trigger
 */
app.post('/api/sync-sheets', async (req, res) => {
  try {
    console.log('Received request for Automated Google Sheets Sync...');
    const result = await syncGoogleSheets();
    await cache.loadFromFirestore();

    res.json({
      success: true,
      message: 'Automated Google Sheets Sync completed successfully!',
      assets_count: result.assets_count,
      curriculum_count: result.curriculum_count,
      orphaned_count: result.orphaned_count,
      log: result.log
    });
  } catch (err) {
    console.error('Error during Google Sheets sync endpoint execution:', err);
    res.status(500).json({
      error: 'Google Sheets API sync failed',
      details: err.message
    });
  }
});

/**
 * POST /api/upload
 * Accepts spreadsheets upload and runs ETL ingestion asynchronously
 */
app.post('/api/upload', upload.fields([
  { name: 'cms_file', maxCount: 1 },
  { name: 'track_file', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('Received file upload request. Triggering ingestion pipeline...');
    
    // Auto-create history checkpoint
    await createCheckpoint(db, 'Spreadsheet Ingest', 'Pre-Ingestion snapshot from structured upload');

    // Execute ETL ingestion pipeline
    const stdout = execSync('npm run ingest', { cwd: path.join(__dirname, '..') });
    console.log('Ingestion pipeline execution results:\n', stdout.toString());

    await cache.loadFromFirestore();

    res.json({
      success: true,
      message: 'Files uploaded and ingested successfully! Database reloaded.',
      log: stdout.toString()
    });
  } catch (err) {
    console.error('Error during ingestion run:', err);
    res.status(500).json({
      error: 'Ingestion pipeline execution failed',
      details: err.message,
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : ''
    });
  }
});

/**
 * POST /api/upload-unstructured
 * Accepts a single unstructured spreadsheet file and uses Gemini to ingest it
 */
app.post('/api/upload-unstructured', upload.single('custom_file'), async (req, res) => {
  try {
    console.log('Received unstructured file upload request...');
    if (!req.file) {
      return res.status(400).json({ error: 'No spreadsheet file uploaded.' });
    }

    // Check GEMINI_API_KEY
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ 
        error: 'Missing GEMINI_API_KEY. Please set this key in your project .env file to enable Gemini AI ingestion.'
      });
    }

    const uploadedFilePath = req.file.path;
    console.log(`Unstructured file saved at: ${uploadedFilePath}. Running Gemini parser...`);

    // Run Python Gemini parser script
    const scriptPath = path.join(__dirname, '..', 'etl', 'gemini_parse_excel.py');
    const stdout = execSync(`python3 "${scriptPath}" "${uploadedFilePath}"`, {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env }
    });

    const parsedJson = JSON.parse(stdout.toString().trim());
    console.log(`Gemini parsed Excel successfully. Extracted ${parsedJson.assets?.length || 0} assets and ${parsedJson.curriculum?.length || 0} curriculums.`);

    // 1. Create a checkpoint first
    await createCheckpoint(db, 'Gemini AI Ingest', `Pre-Ingestion snapshot for custom upload: ${req.file.originalname}`);

    // 2. Load into Firestore
    await loadGeminiParsedData(db, parsedJson);

    await cache.loadFromFirestore();

    // 3. Delete uploaded temp file
    try { fs.unlinkSync(uploadedFilePath); } catch (e) {}

    res.json({
      success: true,
      message: 'Unstructured file parsed by Gemini and ingested successfully!',
      assets_count: parsedJson.assets?.length || 0,
      curriculum_count: parsedJson.curriculum?.length || 0,
      log: 'Gemini extraction succeeded.'
    });

  } catch (err) {
    console.error('Error during unstructured ingestion:', err);
    res.status(500).json({
      error: 'Gemini ingestion pipeline failed',
      details: err.message,
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : ''
    });
  }
});

/**
 * GET /api/history
 * Returns the timeline list of saved database checkpoints
 */
app.get('/api/history', async (req, res) => {
  try {
    const historySnap = await db.collection('cms_history')
      .orderBy('timestamp', 'desc')
      .limit(30)
      .get();

    const commits = [];
    historySnap.forEach(doc => {
      const data = doc.data();
      const { state, ...metadata } = data;
      commits.push(metadata);
    });

    res.json(commits);
  } catch (err) {
    console.error('Error fetching CMS history:', err);
    res.status(500).json({ error: 'Failed to retrieve history logs', details: err.message });
  }
});

/**
 * POST /api/revert/:commit_id
 * Restores the active database collections to a saved commit snapshot
 */
app.post('/api/revert/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Create a "Pre-Revert" checkpoint of the current state so the reversion itself can be undone!
    await createCheckpoint(db, 'System Rollback', `Pre-Revert checkpoint; rolling back to ${id}`);

    // 2. Perform restore
    await revertToCheckpoint(db, id);

    await cache.loadFromFirestore();

    // 3. Write cache invalidation logs to trigger SDK updates
    await db.collection('cache_invalidations').add({
      type: 'database_rollback',
      doc_id: id,
      change_type: null,
      timestamp: new Date().toISOString(),
      details: { reverted_to: id }
    });

    res.json({ success: true, message: `Successfully reverted database to commit: ${id}` });
  } catch (err) {
    console.error('Error reverting checkpoint:', err);
    res.status(500).json({ error: 'Database rollback failed', details: err.message });
  }
});

// Start API Server
app.listen(PORT, async () => {
  console.log(`Academy CMS REST API is running on port ${PORT}`);
  try {
    await cache.loadFromFirestore();
    console.log('In-memory cache warmed up successfully!');

    // Initialize listener for database cache invalidation events
    // Real-time assets onSnapshot listener for instant zero-latency cache consistency
    db.collection('assets').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        const doc = change.doc;
        if (change.type === 'added' || change.type === 'modified') {
          const data = doc.data();
          const taxonomy = inferTaxonomy(data.gcs_uri, data.type, data.name || data.current_title);
          const assetDoc = {
            asset_id: doc.id,
            current_title: data.current_title || data.name || doc.id,
            title_aliases: data.title_aliases || [],
            major_version: data.major_version || 1,
            minor_version: data.minor_version || 0,
            content_hash: data.content_hash || (data.attributes && data.attributes.content_hash) || 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            gcs_uri: data.gcs_uri || taxonomy.gcs_uri,
            domain: data.domain || taxonomy.domain,
            asset_category: data.asset_category || taxonomy.asset_category,
            status: data.status || 'ACTIVE',
            ...data
          };
          const idx = cache.assets.findIndex(a => a.asset_id === doc.id);
          if (idx !== -1) {
            cache.assets[idx] = assetDoc;
          } else {
            cache.assets.push(assetDoc);
          }
        } else if (change.type === 'removed') {
          const idx = cache.assets.findIndex(a => a.asset_id === doc.id);
          if (idx !== -1) {
            cache.assets.splice(idx, 1);
          }
        }
      });
    }, err => {
      console.error('[Server Cache] Assets listener error:', err.message);
    });

    // Real-time curriculum_map onSnapshot listener for instant zero-latency cache consistency
    db.collection('curriculum_map').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        const doc = change.doc;
        const data = doc.data();
        const itemDoc = { id: doc.id, ...data };
        const idx = cache.curriculumMap.findIndex(c => c.id === doc.id);
        if (change.type === 'added' || change.type === 'modified') {
          if (idx !== -1) {
            cache.curriculumMap[idx] = itemDoc;
          } else {
            cache.curriculumMap.push(itemDoc);
          }
        } else if (change.type === 'removed') {
          if (idx !== -1) {
            cache.curriculumMap.splice(idx, 1);
          }
        }
      });
    }, err => {
      console.error('[Server Cache] Curriculum listener error:', err.message);
    });

    // Real-time invalidation listener with synchronous in-memory patch logic
    let isInitialLoad = true;
    const setupInvalidationListener = () => {
      return db.collection('cache_invalidations')
        .orderBy('timestamp', 'desc')
        .limit(5)
        .onSnapshot(snapshot => {
          if (isInitialLoad) {
            isInitialLoad = false;
            return;
          }
          if (snapshot.empty) return;
          console.log('[Server Cache] Invalidation event detected in database.');

          // Instantly patch in-memory asset cache synchronously
          snapshot.docs.forEach(doc => {
            const inv = doc.data();
            if (inv.type === 'asset_update' && inv.doc_id && inv.details) {
              const existing = cache.assets.find(a => a.asset_id === inv.doc_id);
              if (existing) {
                if (inv.details.name) existing.name = inv.details.name;
                if (inv.details.version) existing.version = inv.details.version;
                if (inv.details.attributes) {
                  existing.attributes = { ...existing.attributes, ...inv.details.attributes };
                }
              }
            } else if (inv.type === 'curriculum_write') {
              cache.isLoaded = false;
              cache.loadPromise = cache.loadFromFirestore().then(() => { cache.isLoaded = true; cache.loadPromise = null; });
            }
          });
        }, err => {
          console.error('[Server Cache] Invalidation listener error:', err);
          setTimeout(setupInvalidationListener, 2000);
        });
    };
    setupInvalidationListener();

  } catch (err) {
    console.warn('Warming up cache failed on startup, it will lazy-load on the first request:', err.message);
  }
});
