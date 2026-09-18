/**
 * Comprehensive QA & Audit Test Suite for Master Sheet Synchronization Engine
 * Simulates Scenarios A, B, C, D and edge cases.
 */

import {
  normalizeToIso8601Duration,
  parseDurationToSeconds,
  secondsToIso8601,
  iso8601ToSeconds,
  formatDurationDisplay,
  isValidIso8601Duration,
} from '../src/utils/durationParser.ts';

import {
  parseTrackingTab,
  extractTrackingWorkbook,
} from '../src/services/trackingParser.ts';

import {
  reconcileSheets,
  compareAssetRows,
  compareLearningPathRows,
} from '../src/services/diffService.ts';

import {
  SheetsEtlService,
  MASTER_ASSETS_HEADERS,
  MASTER_LEARNING_PATHS_HEADERS,
} from '../src/services/sheetsEtlService.ts';

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
console.log('🔬 RIGOROUS QA & AUDIT TEST SUITE — STAGE 1 PRE-SYNC ENGINE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// 1. DURATION PARSER AUDIT & EDGE CASES
// -----------------------------------------------------------------------------
console.log('--- TEST GROUP 1: Duration Parsing & ISO 8601 Precision ---');

assert(
  normalizeToIso8601Duration('00:14:45') === 'PT00H14M45S',
  'T1.1: Standard HH:MM:SS format (00:14:45)'
);

assert(
  normalizeToIso8601Duration('14:45') === 'PT00H14M45S',
  'T1.2: Standard MM:SS format (14:45)'
);

assert(
  normalizeToIso8601Duration('01:20:00') === 'PT01H20M00S',
  'T1.3: Hour overflow HH:MM:SS format (01:20:00)'
);

// Fractional seconds edge case: PT00H14M21.999S
const normFractional = normalizeToIso8601Duration('PT00H14M21.999S');
assert(
  normFractional === 'PT00H14M22S',
  'T1.4: Fractional seconds in ISO string (PT00H14M21.999S) normalized to integer seconds PT00H14M22S',
  `Got: ${normFractional}`
);

// Fractional seconds validation
assert(
  isValidIso8601Duration('PT00H14M21.999S') === true,
  'T1.5: isValidIso8601Duration recognizes fractional seconds PT00H14M21.999S as valid ISO 8601',
  `Result: ${isValidIso8601Duration('PT00H14M21.999S')}`
);

// Blank and irregular cells
assert(
  normalizeToIso8601Duration('') === 'PT00H00M00S' &&
  normalizeToIso8601Duration(null) === 'PT00H00M00S' &&
  normalizeToIso8601Duration(undefined) === 'PT00H00M00S' &&
  normalizeToIso8601Duration('   ') === 'PT00H00M00S' &&
  normalizeToIso8601Duration('N/A') === 'PT00H00M00S',
  'T1.6: Blank, null, whitespace, and N/A cells deterministically return PT00H00M00S'
);

// -----------------------------------------------------------------------------
// 2. HIERARCHY DERIVATION & MULTI-ROW TOPIC DESCRIPTIONS
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Hierarchy Derivation & Multi-Row Topic Descriptions ---');

const multiRowTrackingTab = [
  ['Track Name', 'Sub-Track Name', 'Lesson Name', 'Topic Name', 'Topic Description', 'Asset Name', 'Duration', 'Type'],
  ['Data Center', 'Spine-Leaf', 'EVPN-VXLAN', 'Anycast Gateway', 'Part 1: Basic concepts and spine-leaf routing.', 'EVPN Video 1', '10:00', 'video'],
  // Second row under same topic with additional description text
  ['', '', '', '', 'Part 2: Multi-chassis LAG considerations.', 'EVPN Video 2', '12:00', 'video'],
];

const parsedMultiRow = parseTrackingTab('DC Track', multiRowTrackingTab);
assert(
  parsedMultiRow.learningPaths.length === 2,
  'T2.1: Extracted both curriculum nodes'
);

// Check if multi-row topic description is preserved or dropped
const pathNode1 = parsedMultiRow.learningPaths[0];
const pathNode2 = parsedMultiRow.learningPaths[1];
console.log(`    Node 1 topic_description: "${pathNode1.topic_description}"`);
console.log(`    Node 2 topic_description: "${pathNode2.topic_description}"`);

assert(
  pathNode1.topic_description.includes('Part 1'),
  'T2.2: Node 1 contains Part 1 description'
);

// Tab with standalone topic description continuation row (no asset on row 2, asset on row 3)
const splitDescriptionTab = [
  ['Track Name', 'Sub-Track Name', 'Lesson Name', 'Topic Name', 'Topic Description', 'Asset Name', 'Duration'],
  ['Data Center', 'Spine-Leaf', 'EVPN', 'Routing Architecture', 'First line of topic overview.', '', ''],
  ['', '', '', '', 'Second line of continuation.', '', ''],
  ['', '', '', '', '', 'Architecture Deep Dive Asset', '15:00'],
];

const parsedSplit = parseTrackingTab('DC Track', splitDescriptionTab);
assert(
  parsedSplit.learningPaths.length === 1,
  'T2.3: Extracted 1 asset from split-row tab'
);
const splitPath = parsedSplit.learningPaths[0];
console.log(`    Split path description: "${splitPath?.topic_description}"`);
assert(
  Boolean(splitPath && splitPath.topic_description.includes('First line') && splitPath.topic_description.includes('Second line')),
  'T2.4: Multi-row topic description preserved without dropping preceding lines',
  `Got: "${splitPath?.topic_description}"`
);

// -----------------------------------------------------------------------------
// 3. SCENARIO A (NEW RECORDS)
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Scenario A (New Records) ---');

const trackingA: MasterAssetRow[] = [
  {
    asset_name: 'Brand New Asset 101',
    asset_type: 'video',
    duration: 'PT00H15M00S' as const,
    difficulty_level: 3,
    skill_tag: 'Automation, Python',
    last_updated: '2026-03-01',
    'cvp_cv-cue_version': '2024.1.0',
    eos_version: '4.32.0F',
    avd_version: '',
    developer: 'Alice Dev',
    needs_update: false,
    comments: 'Brand new curriculum item',
  }
];

const pathsA: MasterLearningPathRow[] = [
  {
    track_number: 1,
    track_name: 'Automation',
    sub_track_number: 1,
    sub_track_name: 'Python',
    lesson_number: 1,
    lesson_name: 'Scripting Intro',
    topic_number: 1,
    topic_name: 'Basics',
    topic_description: 'Python setup',
    sub_topic_number: 1,
    asset_name: 'Brand New Asset 101',
  }
];

const reportA = reconcileSheets(trackingA, [], pathsA, [], {
  sourceTrackingSheetId: 'src',
  targetAssetsSheetId: 'ast',
  targetLearningPathsSheetId: 'lp',
});

assert(
  reportA.summary.assetsToAdd === 1 && reportA.summary.pathsToAdd === 1,
  'T3.1: Scenario A flags 1 new asset and 1 new path as ADD'
);
assert(
  reportA.assetDiffs[0].action === SyncAction.ADD &&
  reportA.assetDiffs[0].masterRow === null &&
  reportA.assetDiffs[0].trackingRow?.asset_name === 'Brand New Asset 101',
  'T3.2: Scenario A diff item holds tracking row and null masterRow'
);

// -----------------------------------------------------------------------------
// 4. SCENARIO B (FIELD MUTATIONS)
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: Scenario B (Field Mutations) ---');

const masterB: MasterAssetRow = {
  asset_name: 'Telemetry Streaming Guide',
  asset_type: 'video',
  duration: 'PT00H10M00S',
  difficulty_level: 2,
  skill_tag: 'Telemetry',
  last_updated: '2025-01-01',
  'cvp_cv-cue_version': '',
  eos_version: '4.30.0F',
  avd_version: '',
  developer: 'Curriculum Team',
  needs_update: false,
  comments: 'Original version',
};

const trackingB: MasterAssetRow = {
  ...masterB,
  duration: 'PT00H14M45S', // modified duration
  skill_tag: 'Telemetry, gNMI, Streaming', // modified tags
  comments: 'Updated with gNMI coverage', // modified comments
};

const masterPathB: MasterLearningPathRow = {
  track_number: 1,
  track_name: 'Data Center',
  sub_track_number: 1,
  sub_track_name: 'Telemetry',
  lesson_number: 1,
  lesson_name: 'Monitoring',
  topic_number: 1,
  topic_name: 'TerminAttr',
  topic_description: 'Old topic description',
  sub_topic_number: 1,
  asset_name: 'Telemetry Streaming Guide',
};

const trackingPathB: MasterLearningPathRow = {
  ...masterPathB,
  topic_description: 'New comprehensive topic description', // modified topic description
};

const reportB = reconcileSheets([trackingB], [masterB], [trackingPathB], [masterPathB], {
  sourceTrackingSheetId: 'src',
  targetAssetsSheetId: 'ast',
  targetLearningPathsSheetId: 'lp',
});

assert(
  reportB.summary.assetsToUpdate === 1 && reportB.summary.pathsToUpdate === 1,
  'T4.1: Scenario B flags 1 modified asset and 1 modified learning path as UPDATE'
);

const assetDiffB = reportB.assetDiffs[0];
const durChange = assetDiffB.fieldChanges.find(f => f.field === 'duration');
const tagChange = assetDiffB.fieldChanges.find(f => f.field === 'skill_tag');
assert(
  durChange?.previousValue === 'PT00H10M00S' && durChange?.proposedValue === 'PT00H14M45S',
  'T4.2: Field diff captures duration old/new values accurately'
);
assert(
  tagChange?.previousValue === 'Telemetry' && tagChange?.proposedValue === 'Telemetry, gNMI, Streaming',
  'T4.3: Field diff captures skill_tag old/new values accurately'
);

const pathDiffB = reportB.learningPathDiffs[0];
const descChange = pathDiffB.fieldChanges.find(f => f.field === 'topic_description');
assert(
  descChange?.previousValue === 'Old topic description' && descChange?.proposedValue === 'New comprehensive topic description',
  'T4.4: Learning path diff captures topic_description modification accurately'
);

// Confirm unedited fields remain untouched (no diff entries for them)
assert(
  !assetDiffB.fieldChanges.some(f => f.field === 'eos_version'),
  'T4.5: Unedited field (eos_version) remains untouched with no spurious diff'
);

// -----------------------------------------------------------------------------
// 5. SCENARIO C (ORPHANED / DEPRECATED RECORDS)
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 5: Scenario C (Orphaned / Deprecated Records) ---');

const masterC: MasterAssetRow = {
  asset_name: 'Deprecated 7050 Switch Architecture',
  asset_type: 'video',
  duration: 'PT00H45M00S',
  difficulty_level: 4,
  skill_tag: 'Legacy',
  last_updated: '2022-01-01',
  'cvp_cv-cue_version': '',
  eos_version: '4.20.0F',
  avd_version: '',
  developer: 'Legacy Team',
  needs_update: true,
  comments: 'Old hardware',
};

const reportC = reconcileSheets([], [masterC], [], [], {
  sourceTrackingSheetId: 'src',
  targetAssetsSheetId: 'ast',
  targetLearningPathsSheetId: 'lp',
});

assert(
  reportC.summary.assetsDeprecated === 1,
  'T5.1: Scenario C flags removed asset as DEPRECATED'
);
assert(
  reportC.assetDiffs[0].action === SyncAction.DEPRECATED &&
  reportC.assetDiffs[0].masterRow?.asset_name === 'Deprecated 7050 Switch Architecture',
  'T5.2: Preserves masterRow for non-destructive deprecation tagging'
);

// -----------------------------------------------------------------------------
// 6. SCENARIO D (DUPLICATE DETECTION & WRITE SAFETY)
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 6: Scenario D (Duplicate Primary Key Detection) ---');

const duplicateTrackingRows = [
  ['Track Name', 'Lesson Name', 'Topic Name', 'Asset Name', 'Duration', 'Type'],
  ['Data Center', 'EVPN', 'Gateway', 'Identical Asset Name', '10:00', 'video'],
  ['Data Center', 'EVPN', 'Gateway', 'Identical Asset Name', '15:00', 'video'], // Injected duplicate
];

const parsedDuplicates = parseTrackingTab('DC Track', duplicateTrackingRows);

// When reconcileSheets encounters duplicate assets, does it flag a validation error?
const reportD = reconcileSheets(
  parsedDuplicates.assets,
  [],
  parsedDuplicates.learningPaths,
  [],
  {
    sourceTrackingSheetId: 'src',
    targetAssetsSheetId: 'ast',
    targetLearningPathsSheetId: 'lp',
  }
);

// Check if duplicate is flagged as a validation error
const hasDuplicateValidationError =
  (reportD as any).validationErrors?.some((e: any) => e.type === 'DUPLICATE_PRIMARY_KEY' || e.message?.toLowerCase().includes('duplicate')) ||
  reportD.auditLogs.some(l => l.level === 'ERROR' && l.message.toLowerCase().includes('duplicate'));

assert(
  Boolean(hasDuplicateValidationError),
  'T6.1: Scenario D flags duplicate asset_name as a validation error in audit logs / report',
  `Audit logs count: ${reportD.auditLogs.length}`
);

// Check if report blocks write when validation error is present
assert(
  (reportD as any).hasValidationErrors === true || (reportD as any).canCommit === false,
  'T6.2: Scenario D prevents corrupt writes by setting hasValidationErrors/blocking commit',
  `hasValidationErrors: ${(reportD as any).hasValidationErrors}`
);

// -----------------------------------------------------------------------------
// 7. GOOGLE SHEETS BATCH WRITE & SAFETY AUDIT
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 7: Sheets API Range & Quota Safety ---');

const etl = new SheetsEtlService({
  trackingSpreadsheetId: 'src',
  masterAssetsSpreadsheetId: 'ast',
  masterLearningPathsSpreadsheetId: 'lp',
});

const assetValues = etl.formatAssetsToSheetValues([masterB]);
assert(
  assetValues[0].length === 12 && assetValues[0][0] === 'asset_name',
  'T7.1: formatAssetsToSheetValues produces exactly 12 columns matching MASTER_ASSETS_HEADERS'
);

const pathValues = etl.formatLearningPathsToSheetValues([masterPathB]);
assert(
  pathValues[0].length === 11 && pathValues[0][0] === 'track_number',
  'T7.2: formatLearningPathsToSheetValues produces exactly 11 columns matching MASTER_LEARNING_PATHS_HEADERS'
);

console.log('\n================================================================');
console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
if (failures.length > 0) {
  console.log('FAILURES:');
  failures.forEach(f => console.log(`  ❌ ${f}`));
}
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
