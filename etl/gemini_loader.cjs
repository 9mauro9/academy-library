const admin = require('firebase-admin');

/**
 * Loads the structured data extracted by Gemini into Firestore assets and curriculum collections.
 * Maintains referential integrity by linking assets and maps via DocumentReference.
 * 
 * @param {admin.firestore.Firestore} db 
 * @param {object} parsedData Object containing { assets: [...], curriculum: [...] }
 */
async function loadGeminiParsedData(db, parsedData) {
  const assets = parsedData.assets || [];
  const curriculum = parsedData.curriculum || [];

  console.log(`[Gemini Loader] Ingesting ${assets.length} assets and ${curriculum.length} curriculum mappings...`);

  const assetCollection = db.collection('assets');
  const curriculumCollection = db.collection('curriculum_map');

  // 1. Upload Assets in batches
  let batch = db.batch();
  let opCount = 0;

  const commitBatch = async () => {
    if (opCount > 0) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  };

  for (const asset of assets) {
    const docRef = assetCollection.doc(asset.asset_id);
    const assetData = {
      name: asset.name,
      type: asset.type || 'video',
      version: asset.version || 1,
      is_latest: true,
      attributes: {
        duration: asset.attributes?.duration ? parseInt(asset.attributes.duration, 10) : 0,
        difficulty_level: asset.attributes?.difficulty_level ? parseFloat(asset.attributes.difficulty_level) : 1.0,
        skill_tags: asset.attributes?.skill_tags || [],
        topic: asset.attributes?.topic || '',
        cvp_version: asset.attributes?.cvp_version || '',
        eos_version: asset.attributes?.eos_version || '',
        prerequisite: asset.attributes?.prerequisite || '',
        needs_update: !!asset.attributes?.needs_update,
        comments: asset.attributes?.comments || ''
      }
    };

    batch.set(docRef, assetData);
    opCount++;
    if (opCount >= 300) await commitBatch();
  }
  await commitBatch();
  console.log(`[Gemini Loader] Ingested ${assets.length} assets.`);

  // 2. Identify and clear existing curriculum maps for the tracks being imported
  const tracksToPurge = [...new Set(curriculum.map(item => item.track_name))].filter(Boolean);
  
  for (const trackName of tracksToPurge) {
    console.log(`[Gemini Loader] Purging existing curriculum map for track: "${trackName}"...`);
    const existSnap = await curriculumCollection.where('track_name', '==', trackName).get();
    for (const doc of existSnap.docs) {
      batch.delete(doc.ref);
      opCount++;
      if (opCount >= 300) await commitBatch();
    }
  }
  await commitBatch();

  // Helper to slugify track name into track_id
  const slugify = (text) => text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');

  // 3. Upload new curriculum mappings
  console.log('[Gemini Loader] Writing new curriculum mappings...');
  let index = 1;
  for (const item of curriculum) {
    const docRef = curriculumCollection.doc();
    const trackId = slugify(item.track_name || 'custom-track');
    
    // Find the correct asset_id by matching name
    const matchedAsset = assets.find(a => a.name.toLowerCase().trim() === item.sub_topic_name?.toLowerCase().trim());
    const assetId = matchedAsset ? matchedAsset.asset_id : slugify(item.sub_topic_name || 'asset');

    const curriculumData = {
      track_id: trackId,
      track_name: item.track_name || 'Custom Track',
      sub_track: {
        name: item.sub_track_name || 'Core Module',
        number: 1
      },
      lesson: {
        name: item.lesson_name || 'Overview',
        number: 1
      },
      topic: {
        name: item.topic_name || 'Topic',
        number: 1,
        sub_topic_name: item.sub_topic_name || ''
      },
      asset_ref: assetCollection.doc(assetId),
      version: 1,
      is_latest: true,
      sorting: index * 10
    };

    batch.set(docRef, curriculumData);
    opCount++;
    index++;
    if (opCount >= 300) await commitBatch();
  }
  await commitBatch();
  console.log(`[Gemini Loader] Successfully ingested ${curriculum.length} curriculum maps.`);
}

module.exports = {
  loadGeminiParsedData
};
