const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK
admin.initializeApp({
  projectId: 'academy-live-builder'
});

const db = getFirestore();

async function runLoader() {
  const dataPath = path.join(__dirname, 'data.json');
  console.log('Reading data from:', dataPath);
  
  if (!fs.existsSync(dataPath)) {
    console.error('Data file not found!');
    process.exit(1);
  }
  
  const rawData = fs.readFileSync(dataPath, 'utf8');
  const data = JSON.parse(rawData);
  
  const assets = data.assets;
  const curriculum = data.curriculum;
  
  console.log(`Loaded ${assets.length} assets and ${curriculum.length} curriculum items from JSON.`);
  
  // 1. Upload Assets in batches
  console.log('Uploading assets to Firestore...');
  const assetCollection = db.collection('assets');
  let batch = db.batch();
  let opCount = 0;
  let batchCount = 0;
  
  for (const asset of assets) {
    const docRef = assetCollection.doc(asset.asset_id);
    
    // Structure asset document
    const assetData = {
      name: asset.name,
      type: asset.type,
      version: asset.version,
      is_latest: asset.is_latest,
      attributes: asset.attributes
    };
    
    batch.set(docRef, assetData);
    opCount++;
    
    if (opCount === 400) {
      await batch.commit();
      batchCount++;
      console.log(`  Committed asset batch ${batchCount} (${batchCount * 400} assets)`);
      batch = db.batch();
      opCount = 0;
    }
  }
  
  if (opCount > 0) {
    await batch.commit();
    batchCount++;
    console.log(`  Committed final asset batch ${batchCount} (${(batchCount - 1) * 400 + opCount} assets total)`);
  }
  
  // 2. Upload Curriculum Map in batches
  console.log('Uploading curriculum map to Firestore...');
  const curriculumCollection = db.collection('curriculum_map');
  batch = db.batch();
  opCount = 0;
  batchCount = 0;
  
  for (const item of curriculum) {
    const docRef = curriculumCollection.doc(); // Auto-generate ID for curriculum map entry
    
    // Resolve DocumentReference for the asset
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
      asset_ref: assetRef,
      version: item.version,
      is_latest: item.is_latest,
      sorting: item.sorting
    };
    
    batch.set(docRef, curriculumData);
    opCount++;
    
    if (opCount === 400) {
      await batch.commit();
      batchCount++;
      console.log(`  Committed curriculum batch ${batchCount} (${batchCount * 400} items)`);
      batch = db.batch();
      opCount = 0;
    }
  }
  
  if (opCount > 0) {
    await batch.commit();
    batchCount++;
    console.log(`  Committed final curriculum batch ${batchCount} (${(batchCount - 1) * 400 + opCount} items total)`);
  }
  
  console.log('ETL Ingestion completed successfully!');
  process.exit(0);
}

runLoader().catch(err => {
  console.error('Fatal error during loading:', err);
  process.exit(1);
});
