const { onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

// Initialize admin SDK (uses environment defaults when running on GCP)
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Triggered when an asset is updated.
 * Writes a cache invalidation record.
 */
exports.onAssetUpdate = onDocumentUpdated("assets/{assetId}", async (event) => {
  const assetId = event.params.assetId;
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();

  console.log(`Asset ${assetId} updated.`);

  // Write invalidation event
  await db.collection("cache_invalidations").add({
    type: "asset_update",
    doc_id: assetId,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    details: {
      name: afterData.name,
      changes: getChanges(beforeData, afterData)
    }
  });

  console.log(`Cache invalidation event written for asset ${assetId}`);
});

/**
 * Triggered when curriculum structure is modified (added, updated, deleted).
 */
exports.onCurriculumWrite = onDocumentWritten("curriculum_map/{mapId}", async (event) => {
  const mapId = event.params.mapId;
  const changeType = !event.data.before.exists ? "create" : !event.data.after.exists ? "delete" : "update";

  console.log(`Curriculum map entry ${mapId} experienced: ${changeType}`);

  // Write invalidation event
  await db.collection("cache_invalidations").add({
    type: "curriculum_write",
    doc_id: mapId,
    change_type: changeType,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    details: {
      track_id: event.data.after.exists ? event.data.after.data().track_id : event.data.before.data().track_id
    }
  });

  console.log(`Cache invalidation event written for curriculum map entry ${mapId}`);
});

// Helper function to find modified fields (simple top-level check)
function getChanges(before, after) {
  const changes = [];
  if (!before || !after) return changes;
  
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes.push(key);
    }
  }
  return changes;
}

const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { validateTaxonomyPath, PRIMARY_BUCKET_NAME } = require("../api/taxonomy.cjs");

/**
 * Triggered on Cloud Storage object creation in primary bucket. Validates taxonomy paths.
 */
exports.onMediaUpload = onObjectFinalized({ bucket: PRIMARY_BUCKET_NAME }, async (event) => {
  const filePath = event.data.name;
  if (!filePath) return;

  console.log(`Processing storage upload event for object: ${filePath}`);

  const validation = validateTaxonomyPath(filePath);
  if (!validation.valid) {
    console.warn(`[TAXONOMY VIOLATION] File '${filePath}' rejected: ${validation.error}`);
    return;
  }

  const filename = filePath.split('/').pop() || filePath;
  const slug = filename.toLowerCase().replace(/\.[^/.]+$/, '').replace(/[^\w\s-]/g, '').replace(/[-\s]+/g, '-');
  const assetId = `asset_${slug}`;

  const assetRef = db.collection('assets').doc(assetId);
  const docSnap = await assetRef.get();

  const gcsUri = validation.fullGcsUri;
  const contentHash = event.data.md5Hash ? `md5:${event.data.md5Hash}` : `sha256:${event.data.generation || Date.now()}`;

  if (docSnap.exists) {
    await assetRef.update({
      gcs_uri: gcsUri,
      domain: validation.domain,
      asset_category: validation.asset_category,
      content_hash: contentHash,
      last_updated: new Date().toISOString()
    });
    console.log(`Updated asset record '${assetId}' with taxonomy fields.`);
  } else {
    await assetRef.set({
      name: filename.replace(/\.[^/.]+$/, ''),
      current_title: filename.replace(/\.[^/.]+$/, ''),
      title_aliases: [],
      type: validation.asset_category === 'videos' || validation.asset_category === 'media' ? 'video' : 'document',
      domain: validation.domain,
      asset_category: validation.asset_category,
      gcs_uri: gcsUri,
      content_hash: contentHash,
      major_version: 1,
      minor_version: 0,
      version: 1,
      status: 'ACTIVE',
      is_latest: true,
      attributes: {
        duration: 0,
        last_updated: new Date().toISOString().split('T')[0]
      }
    });
    console.log(`Created new asset record '${assetId}' with taxonomy fields.`);
  }
});

