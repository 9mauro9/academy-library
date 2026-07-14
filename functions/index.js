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
