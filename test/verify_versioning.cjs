const admin = require('firebase-admin');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createCheckpoint, revertToCheckpoint } = require('../etl/history_manager.cjs');

if (getApps().length === 0) {
  initializeApp({
    projectId: 'academy-live-builder'
  });
}

const db = getFirestore();

async function runVersioningTests() {
  console.log('=== STARTING DATABASE SNAPSHOT VERSIONING TESTS ===');
  
  try {
    // 1. Fetch current counts
    const assetsSnap = await db.collection('assets').get();
    const curriculumSnap = await db.collection('curriculum_map').get();
    
    const initialAssetsCount = assetsSnap.size;
    const initialCurriculumCount = curriculumSnap.size;
    
    console.log(`Initial Database State: Assets=${initialAssetsCount}, Curriculum=${initialCurriculumCount}`);

    // 2. Create Checkpoint
    console.log('\nCreating database checkpoint snapshot...');
    const commitId = await createCheckpoint(db, 'Test Automation Suite', 'Automated verification test checkpoint');
    
    // Verify checkpoint exists in history
    const commitDoc = await db.collection('cms_history').doc(commitId).get();
    if (!commitDoc.exists) {
      throw new Error('Checkpoint document was not written to Firestore!');
    }
    console.log(`[PASS] Checkpoint ${commitId} successfully verified in cms_history.`);

    // 3. Modify database (injecting temporary test documents)
    console.log('\nModifying active collections (injecting dummy test entries)...');
    const dummyAssetId = 'rollback-test-dummy-asset';
    await db.collection('assets').doc(dummyAssetId).set({
      name: 'Rollback Test Dummy Asset',
      type: 'video',
      version: 1,
      is_latest: true,
      attributes: {
        duration: 99,
        comments: 'Temporary test asset for rollback verification'
      }
    });

    const dummyMapId = 'rollback-test-dummy-map';
    await db.collection('curriculum_map').doc(dummyMapId).set({
      track_id: 'rollback-test-track',
      track_name: 'Rollback Test Track',
      sub_topic_name: 'Rollback Test Dummy Asset',
      version: 1,
      is_latest: true
    });

    // Check counts increased
    const midAssetsSnap = await db.collection('assets').get();
    const midCurriculumSnap = await db.collection('curriculum_map').get();
    
    console.log(`Modified Database State: Assets=${midAssetsSnap.size}, Curriculum=${midCurriculumSnap.size}`);
    if (midAssetsSnap.size !== initialAssetsCount + 1 || midCurriculumSnap.size !== initialCurriculumCount + 1) {
      throw new Error('Database modification was not recorded correctly. Cannot verify rollback.');
    }
    console.log('[PASS] Test modifications successfully injected.');

    // 4. Perform Rollback
    console.log(`\nRolling back database state to commit ${commitId}...`);
    await revertToCheckpoint(db, commitId);

    // 5. Verify counts returned to original state
    const postAssetsSnap = await db.collection('assets').get();
    const postCurriculumSnap = await db.collection('curriculum_map').get();
    
    console.log(`Post-Rollback Database State: Assets=${postAssetsSnap.size}, Curriculum=${postCurriculumSnap.size}`);
    
    // Check dummy entries are gone
    const checkDummyAsset = await db.collection('assets').doc(dummyAssetId).get();
    const checkDummyMap = await db.collection('curriculum_map').doc(dummyMapId).get();

    if (checkDummyAsset.exists || checkDummyMap.exists) {
      throw new Error('Rollback failed: test dummy documents still exist in active collections!');
    }

    if (postAssetsSnap.size !== initialAssetsCount || postCurriculumSnap.size !== initialCurriculumCount) {
      throw new Error('Rollback failed: database counts do not match initial state!');
    }

    console.log('[PASS] Database successfully restored to the exact pre-modification state.');

    // 6. Cleanup history checkpoints
    console.log('\nCleaning up verification checkpoints...');
    await db.collection('cms_history').doc(commitId).delete();
    // Also delete any rollback-generated commit checkpoints
    const rollbackCommitsSnap = await db.collection('cms_history').where('author', '==', 'System Rollback').get();
    for (const doc of rollbackCommitsSnap.docs) {
      await doc.ref.delete();
    }
    console.log('[PASS] Cleanup complete.');

    console.log('\n=== ALL DATABASE VERSIONING TESTS PASSED SUCCESSFULLY! ===');
    process.exit(0);

  } catch (err) {
    console.error('\n=== DATABASE VERSIONING TESTS FAILED ===');
    console.error(err);
    process.exit(1);
  }
}

runVersioningTests();
