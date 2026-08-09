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

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { inferTaxonomy } = require('../api/taxonomy.cjs');

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
    const taxonomy = inferTaxonomy(asset.gcs_uri, asset.type, asset.name || asset.current_title);

    // Structure asset document
    const assetData = {
      name: asset.name,
      current_title: asset.current_title || asset.name,
      title_aliases: asset.title_aliases || [],
      type: asset.type,
      domain: asset.domain || taxonomy.domain,
      asset_category: asset.asset_category || taxonomy.asset_category,
      gcs_uri: asset.gcs_uri || taxonomy.gcs_uri,
      content_hash: asset.content_hash || 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      major_version: asset.major_version || 1,
      minor_version: asset.minor_version || 0,
      version: asset.version || 1,
      status: asset.status || 'ACTIVE',
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
