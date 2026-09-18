/**
 * Multi-Agent AI Sync Engine & R.A.E.S. Version 3 Verification Suite
 *
 * Verifies:
 *   1. Root-cause discrepancy resolution:
 *      'Automation Fundamentals' -> 'Lesson 5: Cloudvision Fundamentals' -> 'Topic 1: CloudVision Overview'
 *      -> 'CloudVision and Device Communication' (Sub Topic 3)
 *   2. 4-Agent protocol: Agent-Tracking, Agent-MasterAssets, Agent-MasterPaths, Agent-Arbiter.
 *   3. Sequential sub-topic re-indexing algorithm.
 *   4. SheetsBatchWriter bounded schema formatting & snapshot safety.
 */

import {
  runAgentTrackingExtraction,
  extractTabWithSemanticLayoutEngine,
} from '../src/services/aiTrackingExtractor.ts';
import {
  reconcileWithMultiAgents,
  normalizeSequentialSubTopics,
} from '../src/services/hierarchyReconciler.ts';
import {
  SheetsBatchWriter,
  MASTER_ASSETS_COLUMNS,
  MASTER_LEARNING_PATHS_COLUMNS,
} from '../src/services/sheetsBatchWriter.ts';
import {
  SyncAction,
  type MasterAssetRow,
  type MasterLearningPathRow,
} from '../src/types/syncEngine.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `| Detail: ${detail}` : ''}`);
    failed++;
    failures.push(`${testName} ${detail ? `(${detail})` : ''}`);
  }
}

console.log('================================================================');
console.log('🤖 MULTI-AGENT AI SYNC ENGINE — R.A.E.S. V3 VERIFICATION SUITE');
console.log('================================================================\n');

async function runTests() {
  // ---------------------------------------------------------------------------
  // 1. THE CONCRETE DISCREPANCY: CloudVision and Device Communication
  // ---------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: CloudVision and Device Communication Resolution ---');

  const rawAutomationTab: (string | number | null | undefined)[][] = [
    ['Track Name', 'Sub-Track Name', 'Lesson Name', 'Topic Name', 'Topic Description', 'Sub-Topic Name', 'Duration', 'Type', 'Skill Tag', 'Difficulty', 'CVP Version', 'Developer', 'Comments'],
    ['Automation Fundamentals', 'CloudVision', 'Lesson 5: Cloudvision Fundamentals', 'Topic 1: CloudVision Overview', 'Architectural overview of CloudVision', 'CloudVision Architecture', '00:15:30', 'video', 'CloudVision, Telemetry', 3, '2024.1.0', 'Curriculum Dev', 'Core overview'],
    ['', '', '', '', 'Deployment models and provisioning', 'CloudVision Deployment', '00:22:15', 'video', 'CloudVision, ZTP', 4, '2024.1.0', 'Curriculum Dev', 'Deployment options'],
    // Target third item (often dropped in deterministic parsers due to blank header cells):
    ['', '', '', '', 'Device communications via TerminAttr & gNMI', 'CloudVision and Device Communication', '00:18:45', 'video', 'TerminAttr, gNMI', 4, '2024.1.0', 'Curriculum Dev', 'Restored by Agent-Tracking'],
  ];

  const extracted = extractTabWithSemanticLayoutEngine('Automation Fundamentals', rawAutomationTab);

  assert(
    extracted.assets.length === 3,
    'T1.1: Agent-Tracking extracted all 3 items under Topic 1 without truncation',
    `Found: ${extracted.assets.length}`
  );

  const thirdAsset = extracted.assets[2];
  assert(
    thirdAsset.asset_name === 'CloudVision and Device Communication',
    'T1.2: Third extracted asset matches "CloudVision and Device Communication"',
    `Got: ${thirdAsset.asset_name}`
  );

  assert(
    thirdAsset.duration === 'PT00H18M45S',
    'T1.3: Companion duration normalized to ISO 8601 PT00H18M45S',
    `Got: ${thirdAsset.duration}`
  );

  const thirdPath = extracted.learningPaths[2];
  assert(
    thirdPath.track_name === 'Automation Fundamentals' &&
    thirdPath.lesson_name.includes('Cloudvision Fundamentals') &&
    thirdPath.topic_name.includes('CloudVision Overview') &&
    thirdPath.sub_topic_number === 3 &&
    thirdPath.asset_name === 'CloudVision and Device Communication',
    'T1.4: Learning Path correctly assigned sub_topic_number: 3 under Lesson 5, Topic 1',
    JSON.stringify(thirdPath)
  );

  // ---------------------------------------------------------------------------
  // 2. RECONCILIATION AGAINST MASTER SHEETS (RESCUING DROPPED NODE)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Hierarchy Reconciliation & Diff Verification ---');

  // Existing Master Learning Paths contains ONLY Sub Topics 1 & 2
  const existingMasterPaths: MasterLearningPathRow[] = [
    {
      track_number: 1,
      track_name: 'Automation Fundamentals',
      sub_track_number: 1,
      sub_track_name: 'CloudVision',
      lesson_number: 5,
      lesson_name: 'Lesson 5: Cloudvision Fundamentals',
      topic_number: 1,
      topic_name: 'Topic 1: CloudVision Overview',
      topic_description: 'Architectural overview of CloudVision',
      sub_topic_number: 1,
      asset_name: 'CloudVision Architecture',
    },
    {
      track_number: 1,
      track_name: 'Automation Fundamentals',
      sub_track_number: 1,
      sub_track_name: 'CloudVision',
      lesson_number: 5,
      lesson_name: 'Lesson 5: Cloudvision Fundamentals',
      topic_number: 1,
      topic_name: 'Topic 1: CloudVision Overview',
      topic_description: 'Deployment models and provisioning',
      sub_topic_number: 2,
      asset_name: 'CloudVision Deployment',
    },
  ];

  // Existing Master Assets contains all 3 assets
  const existingMasterAssets: MasterAssetRow[] = [
    {
      asset_name: 'CloudVision Architecture',
      asset_type: 'video',
      duration: 'PT00H15M30S',
      difficulty_level: 3,
      skill_tag: 'CloudVision, Telemetry',
      last_updated: '2025-01-15',
      'cvp_cv-cue_version': '2024.1.0',
      eos_version: '4.32.0F',
      avd_version: '',
      developer: 'Curriculum Dev',
      needs_update: false,
      comments: 'Existing asset',
    },
    {
      asset_name: 'CloudVision Deployment',
      asset_type: 'video',
      duration: 'PT00H22M15S',
      difficulty_level: 4,
      skill_tag: 'CloudVision, ZTP',
      last_updated: '2025-01-15',
      'cvp_cv-cue_version': '2024.1.0',
      eos_version: '4.32.0F',
      avd_version: '',
      developer: 'Curriculum Dev',
      needs_update: false,
      comments: 'Existing asset',
    },
    {
      asset_name: 'CloudVision and Device Communication',
      asset_type: 'video',
      duration: 'PT00H18M45S',
      difficulty_level: 4,
      skill_tag: 'TerminAttr, gNMI',
      last_updated: '2025-01-15',
      'cvp_cv-cue_version': '2024.1.0',
      eos_version: '4.32.0F',
      avd_version: '',
      developer: 'Curriculum Dev',
      needs_update: false,
      comments: 'Existing asset in Master Assets',
    },
  ];

  const report = reconcileWithMultiAgents(
    extracted.assets,
    existingMasterAssets,
    extracted.learningPaths,
    existingMasterPaths,
    {
      sourceTrackingSheetId: 'tracking-id',
      targetAssetsSheetId: 'assets-id',
      targetLearningPathsSheetId: 'paths-id',
    }
  );

  assert(
    report.summary.pathsToAdd === 1,
    'T2.1: Exactly 1 learning path node flagged as ADD (the rescued Sub Topic 3)',
    `pathsToAdd: ${report.summary.pathsToAdd}`
  );

  const addedPathDiff = report.learningPathDiffs.find(p => p.action === SyncAction.ADD);
  assert(
    addedPathDiff?.asset_name === 'CloudVision and Device Communication',
    'T2.2: The ADD diff item specifically corresponds to "CloudVision and Device Communication"',
    `Got: ${addedPathDiff?.asset_name}`
  );

  assert(
    addedPathDiff?.trackingRow?.sub_topic_number === 3,
    'T2.3: Rescued diff node retains sequential sub_topic_number: 3',
    `sub_topic_number: ${addedPathDiff?.trackingRow?.sub_topic_number}`
  );

  // ---------------------------------------------------------------------------
  // 3. MULTI-AGENT DIAGNOSTICS TELEMETRY
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: 4-Agent Diagnostics Telemetry ---');

  const maReport = report.multiAgentReport;
  assert(
    Boolean(maReport),
    'T3.1: Multi-Agent Audit Report successfully generated'
  );

  assert(
    maReport?.trackingAgent.agentId === 'Agent-Tracking' &&
    maReport?.trackingAgent.status === 'HEALTHY',
    'T3.2: Agent-Tracking status is HEALTHY with findings',
    `Status: ${maReport?.trackingAgent.status}`
  );

  assert(
    maReport?.masterAssetsAgent.agentId === 'Agent-MasterAssets' &&
    maReport?.masterAssetsAgent.status === 'HEALTHY',
    'T3.3: Agent-MasterAssets status is HEALTHY',
    `Status: ${maReport?.masterAssetsAgent.status}`
  );

  assert(
    maReport?.masterPathsAgent.agentId === 'Agent-MasterPaths' &&
    maReport?.masterPathsAgent.status === 'HEALTHY',
    'T3.4: Agent-MasterPaths status is HEALTHY',
    `Status: ${maReport?.masterPathsAgent.status}`
  );

  assert(
    maReport?.arbiterAgent.agentId === 'Agent-Arbiter' &&
    maReport?.overallHealth === 'HEALTHY' &&
    report.canCommit === true,
    'T3.5: Agent-Arbiter approves safety gate (canCommit: true)',
    `canCommit: ${report.canCommit}`
  );

  // ---------------------------------------------------------------------------
  // 4. SEQUENTIAL SUB-TOPIC RE-INDEXING ALGORITHM
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Sequential Sub-Topic Re-indexing Algorithm ---');

  const gappedPaths: MasterLearningPathRow[] = [
    {
      track_number: 1,
      track_name: 'Automation',
      sub_track_number: 1,
      sub_track_name: 'CloudVision',
      lesson_number: 5,
      lesson_name: 'Lesson 5',
      topic_number: 1,
      topic_name: 'Topic 1',
      topic_description: '',
      sub_topic_number: 1,
      asset_name: 'Item 1',
    },
    {
      track_number: 1,
      track_name: 'Automation',
      sub_track_number: 1,
      sub_track_name: 'CloudVision',
      lesson_number: 5,
      lesson_name: 'Lesson 5',
      topic_number: 1,
      topic_name: 'Topic 1',
      topic_description: '',
      sub_topic_number: 5, // Non-consecutive gap!
      asset_name: 'Item 2',
    },
    {
      track_number: 1,
      track_name: 'Automation',
      sub_track_number: 1,
      sub_track_name: 'CloudVision',
      lesson_number: 5,
      lesson_name: 'Lesson 5',
      topic_number: 1,
      topic_name: 'Topic 1',
      topic_description: '',
      sub_topic_number: 9, // Non-consecutive gap!
      asset_name: 'Item 3',
    },
  ];

  const { normalizedPaths, reindexedCount } = normalizeSequentialSubTopics(gappedPaths);

  assert(
    reindexedCount === 2,
    'T4.1: Detected and corrected 2 gapped sub_topic_number indices',
    `Reindexed count: ${reindexedCount}`
  );

  assert(
    normalizedPaths[0].sub_topic_number === 1 &&
    normalizedPaths[1].sub_topic_number === 2 &&
    normalizedPaths[2].sub_topic_number === 3,
    'T4.2: Normalized sequence restored to 1, 2, 3 consecutively',
    JSON.stringify(normalizedPaths.map(p => p.sub_topic_number))
  );

  // ---------------------------------------------------------------------------
  // 5. SHEETS BATCH WRITER SAFETY & SCHEMA BOUNDS
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Sheets Batch Writer Schema Bounds & Snapshots ---');

  const writer = new SheetsBatchWriter({
    trackingSpreadsheetId: 't-id',
    masterAssetsSpreadsheetId: 'a-id',
    masterLearningPathsSpreadsheetId: 'p-id',
  });

  const assetGrid = writer.formatAssetsToSheetGrid(existingMasterAssets);
  assert(
    assetGrid[0].length === MASTER_ASSETS_COLUMNS.length && MASTER_ASSETS_COLUMNS.length === 12,
    'T5.1: Master Assets grid is bounded strictly to 12 columns (A..L) protecting M:Z',
    `Cols: ${assetGrid[0].length}`
  );

  const pathGrid = writer.formatPathsToSheetGrid(existingMasterPaths);
  assert(
    pathGrid[0].length === MASTER_LEARNING_PATHS_COLUMNS.length && MASTER_LEARNING_PATHS_COLUMNS.length === 11,
    'T5.2: Master Learning Paths grid is bounded strictly to 11 columns (A..K) protecting L:Z',
    `Cols: ${pathGrid[0].length}`
  );

  const snapshot = await writer.createPreWriteSnapshot('test-sheet-id', 'Test Master Assets');
  assert(
    Boolean(snapshot.backupFileId) && snapshot.backupFileName.startsWith('[PRE-SYNC BACKUP'),
    'T5.3: Pre-write snapshot routine generates timestamped clone backup name',
    snapshot.backupFileName
  );

  console.log('\n================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
