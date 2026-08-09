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

const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createCheckpoint } = require('./history_manager.cjs');
const { inferTaxonomy, PRIMARY_BUCKET } = require('../api/taxonomy.cjs');

// Initialize Firebase Admin if not initialized
if (getApps().length === 0) {
  initializeApp({
    projectId: 'academy-live-builder'
  });
}

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

// Helper functions
function slugify(text) {
  if (!text) return "";
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[-\s]+/g, '-').replace(/^-+|-+$/g, '');
}

function parseDuration(val) {
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

function cleanString(val) {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str || str === 'N/A' || str === 'None' || str === 'null') return null;
  return str;
}

function parseTags(val) {
  if (!val) return [];
  const str = String(val).trim();
  if (!str || str === 'N/A') return [];
  return str.split(',').map(t => t.trim()).filter(Boolean);
}

function parseCSVLines(text) {
  const lines = [];
  let currentLine = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentLine.push(currentVal.trim());
      if (currentLine.some(c => c !== '')) lines.push(currentLine);
      currentLine = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  if (currentVal || currentLine.length > 0) {
    currentLine.push(currentVal.trim());
    if (currentLine.some(c => c !== '')) lines.push(currentLine);
  }
  return lines;
}

// Fetch rows via Sheets API v4 or CSV export fallback
async function fetchSheetData(spreadsheetId, sheetRange = 'A1:Z10000') {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY || process.env.GOOGLE_API_KEY;

  if (apiKey) {
    try {
      const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetRange)}?key=${apiKey}`;
      console.log(`Fetching Google Sheet via API v4: ${spreadsheetId}`);
      const resp = await fetch(apiUrl);
      if (resp.ok) {
        const data = await resp.json();
        if (data.values && data.values.length > 0) {
          console.log(`Fetched ${data.values.length} rows via Sheets API v4.`);
          return data.values;
        }
      } else {
        console.warn(`Sheets API v4 returned status ${resp.status}, trying CSV export fallback...`);
      }
    } catch (err) {
      console.warn(`Sheets API v4 request error: ${err.message}. Trying CSV export fallback...`);
    }
  }

  // Fallback to CSV Export URL
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  console.log(`Fetching Google Sheet via CSV export: ${spreadsheetId}`);
  const resp = await fetch(csvUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch sheet ${spreadsheetId} via CSV export: HTTP status ${resp.status}`);
  }
  const text = await resp.text();
  const rows = parseCSVLines(text);
  console.log(`Fetched ${rows.length} rows via CSV export.`);
  return rows;
}

async function syncGoogleSheets() {
  const logs = [];
  const log = (msg) => {
    console.log(msg);
    logs.push(msg);
  };

  log('Starting Automated Google Sheets Sync Pipeline...');

  const assetsSpreadsheetId = process.env.ASSETS_SPREADSHEET_ID || '1f8mZwHXNlQbfnyZky2lxtjFAshXHMtsiK0gtgOLfSww';
  const learningPathsSpreadsheetId = process.env.LEARNING_PATHS_SPREADSHEET_ID || '1yRBjdg8Kjy5RVgmPvafkFmkSSFKA3EvmRmV1NWNw988';

  log(`Target Assets Sheet ID: ${assetsSpreadsheetId}`);
  log(`Target Learning Paths Sheet ID: ${learningPathsSpreadsheetId}`);

  // 1. Fetch & Parse Assets
  log('Fetching Master Assets sheet...');
  const assetRows = await fetchSheetData(assetsSpreadsheetId);
  if (assetRows.length < 2) {
    throw new Error('Master Assets sheet is empty or contains no data rows.');
  }

  const assetHeaders = assetRows[0].map(h => String(h).toLowerCase().trim().replace(/[\s-]/g, '_'));
  log(`Assets headers detected: [${assetHeaders.join(', ')}]`);

  const findIdx = (possibleNames) => {
    for (const name of possibleNames) {
      const idx = assetHeaders.indexOf(name);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const nameIdx = findIdx(['asset_name', 'name', 'title']);
  const typeIdx = findIdx(['asset_type', 'type']);
  const durIdx = findIdx(['duration']);
  const diffIdx = findIdx(['difficulty_level', 'difficulty']);
  const tagIdx = findIdx(['skill_tag', 'skill_tags', 'tags']);
  const lastUpdIdx = findIdx(['last_updated', 'date']);
  const cvpIdx = findIdx(['cvp_cv_cue_version', 'cvp_version', 'cvp']);
  const eosIdx = findIdx(['eos_version', 'eos']);
  const avdIdx = findIdx(['avd_version', 'avd']);
  const needsUpdIdx = findIdx(['needs_update']);
  const commentsIdx = findIdx(['comments', 'notes']);

  const parsedAssets = [];
  const assetsByName = new Map();

  for (let i = 1; i < assetRows.length; i++) {
    const r = assetRows[i];
    const assetName = nameIdx !== -1 && r[nameIdx] ? String(r[nameIdx]).trim() : '';
    if (!assetName) continue;

    const assetId = slugify(assetName);
    const assetType = (typeIdx !== -1 && r[typeIdx]) ? cleanString(r[typeIdx]) || 'video' : 'video';
    const durationSec = durIdx !== -1 ? parseDuration(r[durIdx]) : 0;
    const diffVal = diffIdx !== -1 && r[diffIdx] ? parseFloat(r[diffIdx]) : null;
    const tags = tagIdx !== -1 ? parseTags(r[tagIdx]) : [];
    const lastUpdated = lastUpdIdx !== -1 ? cleanString(r[lastUpdIdx]) : null;
    const cvpVersion = cvpIdx !== -1 ? cleanString(r[cvpIdx]) : null;
    const eosVersion = eosIdx !== -1 ? cleanString(r[eosIdx]) : null;
    const avdVersion = avdIdx !== -1 ? cleanString(r[avdIdx]) : null;

    let needsUpdate = false;
    if (needsUpdIdx !== -1 && r[needsUpdIdx]) {
      const nuStr = String(r[needsUpdIdx]).toLowerCase().trim();
      if (['yes', 'true', '1'].includes(nuStr)) needsUpdate = true;
    }
    const comments = commentsIdx !== -1 ? cleanString(r[commentsIdx]) : null;

    const taxonomy = inferTaxonomy(null, assetType, assetName);

    const assetDoc = {
      asset_id: assetId,
      name: assetName,
      current_title: assetName,
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
      attributes: {
        duration: durationSec,
        prerequisite: null,
        difficulty_level: isNaN(diffVal) ? null : diffVal,
        skill_tags: tags,
        last_updated: lastUpdated || new Date().toISOString().split('T')[0],
        cvp_version: cvpVersion,
        eos_version: eosVersion,
        avd_version: avdVersion,
        needs_update: needsUpdate,
        comments: comments,
        topic: null
      }
    };

    parsedAssets.push(assetDoc);
    assetsByName.set(assetName.toLowerCase(), assetId);
  }

  log(`Successfully parsed ${parsedAssets.length} assets from Google Sheet.`);

  // 2. Fetch & Parse Learning Paths (Curriculum Map)
  log('Fetching Master Learning Paths sheet...');
  const trackRows = await fetchSheetData(learningPathsSpreadsheetId);
  if (trackRows.length < 2) {
    throw new Error('Master Learning Paths sheet is empty or contains no data rows.');
  }

  const trackHeaders = trackRows[0].map(h => String(h).toLowerCase().trim().replace(/[\s-]/g, '_'));
  log(`Track headers detected: [${trackHeaders.join(', ')}]`);

  const tNumIdx = trackHeaders.indexOf('track_number');
  const tNameIdx = trackHeaders.indexOf('track_name');
  const stNumIdx = trackHeaders.indexOf('sub_track_number');
  const stNameIdx = trackHeaders.indexOf('sub_track_name');
  const lNumIdx = trackHeaders.indexOf('lesson_number');
  const lNameIdx = trackHeaders.indexOf('lesson_name');
  const topNumIdx = trackHeaders.indexOf('topic_number');
  const topNameIdx = trackHeaders.indexOf('topic_name');
  const topDescIdx = trackHeaders.indexOf('topic_description');
  const subTopNumIdx = trackHeaders.indexOf('sub_topic_number');
  const subTopNameIdx = trackHeaders.indexOf('sub_topic_name');
  const assetNameIdx = trackHeaders.indexOf('asset_name');

  const parseNum = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  };

  const parsedCurriculum = [];
  let orphanedCount = 0;

  for (let i = 1; i < trackRows.length; i++) {
    const r = trackRows[i];
    const trackName = tNameIdx !== -1 && r[tNameIdx] ? String(r[tNameIdx]).trim() : '';
    if (!trackName) continue;

    const subTrackName = stNameIdx !== -1 ? cleanString(r[stNameIdx]) : 'General';
    const lessonName = lNameIdx !== -1 ? cleanString(r[lNameIdx]) : 'General Lesson';
    const topicName = topNameIdx !== -1 ? cleanString(r[topNameIdx]) : 'General Topic';
    const topicDesc = topDescIdx !== -1 ? cleanString(r[topDescIdx]) : null;
    const subTopicNum = subTopNumIdx !== -1 ? parseNum(r[subTopNumIdx]) : i;

    // Use asset_name column if present, fallback to sub_topic_name
    let assetName = assetNameIdx !== -1 ? cleanString(r[assetNameIdx]) : '';
    if (!assetName && subTopNameIdx !== -1) {
      assetName = cleanString(r[subTopNameIdx]);
    }

    if (!assetName) continue;

    const assetKey = assetName.toLowerCase();
    let assetRefId = null;
    if (assetsByName.has(assetKey)) {
      assetRefId = assetsByName.get(assetKey);
    } else {
      log(`[ORPHANED REFERENCE] Row ${i+1}: Track '${trackName}', Lesson '${lessonName}' references asset '${assetName}' not found in Assets sheet.`);
      orphanedCount++;
    }

    const trackId = slugify(trackName);
    const docId = `node_${trackId}_${slugify(lessonName)}_${slugify(topicName)}_${subTopicNum || 1}_${slugify(assetName)}`;

    const curriculumItem = {
      doc_id: docId,
      track_id: trackId,
      track_name: trackName,
      sub_track: subTrackName,
      lesson: lessonName,
      topic: topicName,
      topic_description: topicDesc,
      sub_topic_number: subTopicNum,
      asset_name: assetName,
      asset_ref_id: assetRefId,
      version: 1,
      is_latest: true,
      sorting: {
        track_number: tNumIdx !== -1 ? parseNum(r[tNumIdx]) : null,
        sub_track_number: stNumIdx !== -1 ? parseNum(r[stNumIdx]) : null,
        lesson_number: lNumIdx !== -1 ? parseNum(r[lNumIdx]) : null,
        topic_number: topNumIdx !== -1 ? parseNum(r[topNumIdx]) : null,
        sub_topic_number: subTopicNum
      }
    };

    parsedCurriculum.push(curriculumItem);
  }

  log(`Successfully parsed ${parsedCurriculum.length} curriculum items. Orphaned asset references: ${orphanedCount}`);

  // 3. History Checkpoint
  if (db) {
    log('Creating database history checkpoint prior to bulk upsert...');
    await createCheckpoint(db, 'Automated Google Sheets Sync', `Pre-Sync checkpoint from Google Sheets API (${parsedAssets.length} assets, ${parsedCurriculum.length} nodes)`);
  }

  // 4. Bulk Upsert Assets to Firestore
  log('Executing bulk upsert of assets to Cloud Firestore...');
  const assetCollection = db.collection('assets');
  let batch = db.batch();
  let opCount = 0;

  for (const asset of parsedAssets) {
    const docRef = assetCollection.doc(asset.asset_id);
    batch.set(docRef, asset, { merge: true });
    opCount++;
    if (opCount >= 400) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }
  if (opCount > 0) {
    await batch.commit();
  }
  log(`Committed ${parsedAssets.length} assets to Firestore.`);

  // 5. Bulk Upsert Curriculum Map to Firestore
  log('Executing bulk upsert of curriculum map nodes to Cloud Firestore...');
  const curriculumCollection = db.collection('curriculum_map');
  batch = db.batch();
  opCount = 0;

  for (const item of parsedCurriculum) {
    const docRef = curriculumCollection.doc(item.doc_id);
    let assetRef = null;
    if (item.asset_ref_id) {
      assetRef = assetCollection.doc(item.asset_ref_id);
    }

    const curriculumData = {
      track_id: item.track_id,
      track_name: item.track_name,
      sub_track: item.sub_track,
      lesson: item.lesson,
      topic: item.topic,
      topic_description: item.topic_description,
      sub_topic_number: item.sub_topic_number,
      asset_name: item.asset_name,
      asset_ref: assetRef,
      version: item.version,
      is_latest: item.is_latest,
      sorting: item.sorting
    };

    batch.set(docRef, curriculumData, { merge: true });
    opCount++;
    if (opCount >= 400) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }
  if (opCount > 0) {
    await batch.commit();
  }
  log(`Committed ${parsedCurriculum.length} curriculum map nodes to Firestore.`);

  // 6. Log Cache Invalidation Event
  log('Logging cache invalidation stream event...');
  await db.collection('cache_invalidations').add({
    type: 'sheets_sync',
    doc_id: 'automated_google_sheets_sync',
    change_type: 'UPSERT',
    timestamp: FieldValue.serverTimestamp(),
    details: {
      source: 'Google Sheets API',
      assets_upserted: parsedAssets.length,
      curriculum_upserted: parsedCurriculum.length,
      orphaned_references: orphanedCount
    }
  });

  log('✅ Automated Google Sheets Sync Pipeline completed successfully!');

  return {
    success: true,
    assets_count: parsedAssets.length,
    curriculum_count: parsedCurriculum.length,
    orphaned_count: orphanedCount,
    log: logs.join('\n')
  };
}

// Support CLI execution
if (require.main === module) {
  syncGoogleSheets()
    .then(res => {
      console.log('CLI Sync Output:', JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error during Google Sheets sync:', err);
      process.exit(1);
    });
}

module.exports = { syncGoogleSheets };
