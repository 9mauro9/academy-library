const admin = require('firebase-admin');

/**
 * Creates a pre-change database snapshot in the cms_history collection.
 * 
 * @param {admin.firestore.Firestore} db 
 * @param {string} author 
 * @param {string} description 
 * @returns {Promise<string>} The created commit ID.
 */
async function createCheckpoint(db, author, description) {
  console.log(`[History] Creating checkpoint: "${description}" by ${author}...`);
  
  // 1. Fetch all assets (ultra-compact representation for <250KB checkpoint size)
  const assetsSnap = await db.collection('assets').get();
  const assets = [];
  assetsSnap.forEach(doc => {
    const d = doc.data();
    assets.push({
      id: doc.id,
      name: d.name,
      type: d.type,
      version: d.version,
      is_latest: d.is_latest
    });
  });

  // 2. Fetch all curriculum maps (ultra-compact representation)
  const curriculumSnap = await db.collection('curriculum_map').get();
  const curriculum = [];
  curriculumSnap.forEach(doc => {
    const d = doc.data();
    const refId = d.asset_ref ? (d.asset_ref.id || (d.asset_ref._path && d.asset_ref._path.segments && d.asset_ref._path.segments.slice(-1)[0])) : null;
    curriculum.push({
      id: doc.id,
      track_id: d.track_id,
      sub_track: d.sub_track,
      lesson: d.lesson,
      topic: d.topic,
      sub_topic_number: d.sub_topic_number,
      asset_name: d.asset_name,
      asset_ref_id: refId
    });
  });

  const commitId = `commit_${Date.now()}`;
  const timestamp = new Date().toISOString();

  // 3. Write checkpoint record
  await db.collection('cms_history').doc(commitId).set({
    commit_id: commitId,
    timestamp,
    author,
    description,
    assets_count: assets.length,
    curriculum_count: curriculum.length,
    state: {
      assets,
      curriculum
    }
  });

  console.log(`[History] Checkpoint saved successfully. Commit ID: ${commitId} (Assets: ${assets.length}, Curriculums: ${curriculum.length})`);
  return commitId;
}

/**
 * Reverts the database state to the specified commit ID.
 * 
 * @param {admin.firestore.Firestore} db 
 * @param {string} commitId 
 */
async function revertToCheckpoint(db, commitId) {
  console.log(`[History] Initiating revert to commit ID: ${commitId}...`);

  // 1. Retrieve the checkpoint document
  const commitDoc = await db.collection('cms_history').doc(commitId).get();
  if (!commitDoc.exists) {
    throw new Error(`Commit checkpoint "${commitId}" does not exist.`);
  }

  const { state, description } = commitDoc.data();
  if (!state || !state.assets || !state.curriculum) {
    throw new Error(`Commit checkpoint "${commitId}" is corrupted or contains no database state.`);
  }

  // 2. Fetch all current assets and curriculum maps for deletion
  const currentAssetsSnap = await db.collection('assets').get();
  const currentCurriculumSnap = await db.collection('curriculum_map').get();

  // 3. Perform Deletions in batches
  console.log('[History] Purging current assets and curriculum maps...');
  let batch = db.batch();
  let opCount = 0;

  const commitBatch = async () => {
    if (opCount > 0) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  };

  for (const doc of currentAssetsSnap.docs) {
    batch.delete(doc.ref);
    opCount++;
    if (opCount >= 300) await commitBatch();
  }

  for (const doc of currentCurriculumSnap.docs) {
    batch.delete(doc.ref);
    opCount++;
    if (opCount >= 300) await commitBatch();
  }
  await commitBatch();

  // 4. Restore assets from checkpoint in batches
  console.log(`[History] Restoring ${state.assets.length} assets...`);
  for (const asset of state.assets) {
    const { id, ...data } = asset;
    const docRef = db.collection('assets').doc(id);
    batch.set(docRef, data);
    opCount++;
    if (opCount >= 300) await commitBatch();
  }
  await commitBatch();

  // 5. Restore curriculum map from checkpoint in batches
  console.log(`[History] Restoring ${state.curriculum.length} curriculum map nodes...`);
  for (const map of state.curriculum) {
    const { id, ...data } = map;
    
    // Resolve Firestore reference object if present
    if (data.asset_ref_id) {
      data.asset_ref = db.collection('assets').doc(data.asset_ref_id);
      delete data.asset_ref_id;
    } else if (data.asset_ref && typeof data.asset_ref === 'string') {
      // Re-compile path string into a DocumentReference if stored as raw path
      data.asset_ref = db.doc(data.asset_ref);
    } else if (data.asset_ref && data.asset_ref._path) {
      // Re-create from path metadata if stored in raw firebase JSON structure
      const path = data.asset_ref._path.segments.join('/');
      data.asset_ref = db.doc(path);
    }
    
    const docRef = db.collection('curriculum_map').doc(id);
    batch.set(docRef, data);
    opCount++;
    if (opCount >= 300) await commitBatch();
  }
  await commitBatch();

  console.log(`[History] Revert successfully completed!`);
}

module.exports = {
  createCheckpoint,
  revertToCheckpoint
};
