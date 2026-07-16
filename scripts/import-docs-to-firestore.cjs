const admin = require('firebase-admin');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const crypto = require('crypto');

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
  initializeApp({
    projectId: 'academy-builder'
  });
}

const db = getFirestore();

// Bucket names
const SOURCE_BUCKET_NAME = 'academy_content_2';
const DEST_BUCKET_NAME = 'academy-assets-main';

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/\.pdf$/, '')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[-\s]+/g, '-');
}

async function runMigration() {
  console.log('=== STARTING DOCUMENT ASSETS MIGRATION ===');
  console.log(`Source Bucket: gs://${SOURCE_BUCKET_NAME}`);
  console.log(`Destination Bucket: gs://${DEST_BUCKET_NAME}`);

  try {
    const storage = getStorage();
    const sourceBucket = storage.bucket(SOURCE_BUCKET_NAME);
    const destBucket = storage.bucket(DEST_BUCKET_NAME);

    // List all files in source bucket
    console.log('Retrieving files list from source bucket...');
    const [files] = await sourceBucket.getFiles();
    console.log(`Found ${files.length} files to copy and link.`);

    let successCount = 0;
    let skipCount = 0;

    for (const file of files) {
      if (!file.name.endsWith('.pdf')) {
        console.log(`Skipping non-pdf file: ${file.name}`);
        skipCount++;
        continue;
      }

      console.log(`\nProcessing: ${file.name}`);
      const destPath = `assets/documents/${file.name}`;
      const destFile = destBucket.file(destPath);

      // Copy file to target bucket
      console.log(`  Copying to gs://${DEST_BUCKET_NAME}/${destPath}...`);
      await file.copy(destFile);

      // Generate a permanent download token
      const downloadToken = crypto.randomUUID();
      console.log(`  Setting download token metadata...`);
      await destFile.setMetadata({
        metadata: {
          firebaseStorageDownloadTokens: downloadToken
        }
      });

      // Construct Firebase Storage download URL
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${DEST_BUCKET_NAME}/o/${encodeURIComponent(destPath)}?alt=media&token=${downloadToken}`;
      console.log(`  Generated URL: ${downloadUrl}`);

      // Create/Update Firestore asset
      const assetId = slugify(file.name);
      console.log(`  Linking in Firestore (assets/${assetId})...`);
      
      const assetRef = db.collection('assets').doc(assetId);
      const docSnap = await assetRef.get();

      let version = 1;
      let existingAttributes = {};
      if (docSnap.exists) {
        const existingData = docSnap.data();
        version = existingData.version || 1;
        existingAttributes = existingData.attributes || {};
      }

      const assetName = file.name.replace(/\.pdf$/, '');
      const assetData = {
        name: assetName,
        type: 'document',
        version: version,
        is_latest: true,
        attributes: {
          ...existingAttributes,
          url: downloadUrl,
          gcs_uri: `gs://${DEST_BUCKET_NAME}/${destPath}`,
          last_updated: new Date().toISOString().split('T')[0],
          comments: existingAttributes.comments || 'Imported from GCS bucket academy_content_2',
          topic: existingAttributes.topic || 'General'
        }
      };

      await assetRef.set(assetData, { merge: true });
      console.log(`  Successfully processed: ${assetId}`);
      successCount++;
    }

    console.log('\n=== MIGRATION COMPLETED ===');
    console.log(`Successfully migrated: ${successCount} files.`);
    console.log(`Skipped: ${skipCount} files.`);
    process.exit(0);

  } catch (err) {
    console.error('Fatal error during migration:', err);
    process.exit(1);
  }
}

runMigration();
