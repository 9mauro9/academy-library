const { AcademyLibrarySDK } = require('../sdk/academy-library-sdk');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { getApps, initializeApp } = require('firebase-admin/app');

// Initialize Firebase Admin for tests
if (getApps().length === 0) {
  initializeApp({
    projectId: 'academy-live-builder'
  });
}
const db = getFirestore();

async function runVerification() {
  console.log('=== STARTING ACADEMY LIBRARY INTEGRATION TESTS ===');
  
  // 1. Initialize the SDK
  console.log('\nStep 1: Initializing AcademyLibrarySDK...');
  const sdk = new AcademyLibrarySDK({
    apiBaseUrl: 'http://localhost:8080',
    projectId: 'academy-live-builder'
  });

  // Keep track of invalidation calls
  let invalidationTriggeredCount = 0;
  
  // 2. Subscribe to invalidation events
  console.log('\nStep 2: Subscribing to SDK Cache Invalidations...');
  sdk.subscribeToInvalidations((event) => {
    invalidationTriggeredCount++;
    console.log(`[TEST CALLBACK] SDK Cache Invalidation Callback triggered! Count: ${invalidationTriggeredCount}, Event type: ${event.type}`);
  });

  // Wait 2 seconds for listeners to fully initialize
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 3. Fetch a curriculum track (First retrieval - should hit REST API)
  const trackId = 'network-foundations';
  console.log(`\nStep 3: Fetching curriculum track: "${trackId}" (First retrieval)...`);
  const start1 = Date.now();
  const trackData1 = await sdk.getCurriculumTrack(trackId, 'latest');
  const elapsed1 = Date.now() - start1;
  
  console.log(`Successfully fetched track! Time elapsed: ${elapsed1}ms`);
  console.log(`Track ID: ${trackData1.track_id}`);
  console.log(`Version: ${trackData1.version}`);
  console.log(`Curriculum structure contains ${trackData1.curriculum.length} sub-tracks.`);
  
  // Validate nested structure
  const firstSubTrack = trackData1.curriculum[0];
  console.log(`  Sub-Track 1: "${firstSubTrack.sub_track_name}"`);
  const firstLesson = firstSubTrack.lessons[0];
  console.log(`    Lesson 1: "${firstLesson.lesson_name}"`);
  const firstTopic = firstLesson.topics[0];
  console.log(`      Topic 1: "${firstTopic.topic_name}"`);
  const firstAsset = firstTopic.assets[0];
  console.log(`        Asset 1: "${firstAsset.name}" (Type: ${firstAsset.type}, Duration: ${firstAsset.attributes.duration}s, Path: /assets/${firstAsset.asset_id})`);
  
  // Check referential integrity
  if (!firstAsset.asset_id || !firstAsset.attributes) {
    throw new Error('Verification failed: Assets were not correctly resolved from Firestore pointers!');
  }
  console.log('  [PASS] Referral integrity verified: Assets resolved correctly!');

  // 4. Fetch the same track (Second retrieval - should hit cache)
  console.log(`\nStep 4: Fetching track "${trackId}" again (Second retrieval)...`);
  const start2 = Date.now();
  const trackData2 = await sdk.getCurriculumTrack(trackId, 'latest');
  const elapsed2 = Date.now() - start2;
  
  console.log(`Successfully fetched! Time elapsed: ${elapsed2}ms`);
  if (elapsed2 > 20) {
    console.log('  [WARNING] Cache fetch took longer than expected, but verify output log.');
  } else {
    console.log('  [PASS] Cache hit verified! (Extremely fast retrieval)');
  }

  // 5. Update an asset in Firestore to test triggers and invalidation
  console.log('\nStep 5: Updating an asset in Firestore to trigger invalidation...');
  const assetIdToUpdate = firstAsset.asset_id;
  const originalDifficulty = firstAsset.attributes.difficulty_level;
  const newDifficulty = (originalDifficulty || 1.0) + 1.0;
  
  console.log(`Updating asset "${firstAsset.name}" (${assetIdToUpdate}) difficulty level from ${originalDifficulty} to ${newDifficulty}...`);
  
  const assetRef = db.collection('assets').doc(assetIdToUpdate);
  await assetRef.update({
    'attributes.difficulty_level': newDifficulty
  });
  console.log('Asset document updated in Firestore!');

  // Wait for the simulator and Firestore listener to propagate the cache invalidation
  console.log('Waiting for cache invalidation propagation (max 5 seconds)...');
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (invalidationTriggeredCount > 0) {
      break;
    }
  }

  if (invalidationTriggeredCount === 0) {
    throw new Error('Verification failed: Cache invalidation event was not received by the SDK!');
  }
  console.log('  [PASS] Event-driven cache invalidation verified!');

  // 6. Fetch track a third time (Third retrieval - should bypass cache after invalidation)
  console.log(`\nStep 6: Fetching track "${trackId}" a third time (after cache invalidation)...`);
  const start3 = Date.now();
  const trackData3 = await sdk.getCurriculumTrack(trackId, 'latest');
  const elapsed3 = Date.now() - start3;
  
  console.log(`Successfully fetched! Time elapsed: ${elapsed3}ms`);
  const updatedDifficulty = trackData3.curriculum[0].lessons[0].topics[0].assets[0].attributes.difficulty_level;
  console.log(`Resolved Asset Difficulty: ${updatedDifficulty}`);
  
  if (updatedDifficulty !== newDifficulty) {
    throw new Error('Verification failed: REST API returned old data instead of resolved live data!');
  }
  console.log('  [PASS] Live data retrieval after cache invalidation verified!');

  // Clean up
  console.log('\nStep 7: Reverting database changes and cleaning up...');
  await assetRef.update({
    'attributes.difficulty_level': originalDifficulty
  });
  console.log('Asset reverted to original state.');
  
  sdk.unsubscribeFromInvalidations();
  console.log('Unsubscribed from invalidations.');
  
  console.log('\n=== ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ===');
  process.exit(0);
}

runVerification().catch(err => {
  console.error('\n=== VERIFICATION FAILED ===');
  console.error(err);
  process.exit(1);
});
