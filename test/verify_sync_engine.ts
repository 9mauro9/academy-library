/**
 * Master Sheet Synchronization Engine — Verification Suite
 *
 * Verifies:
 *  1. Duration & Normalization Utility (durationParser.ts)
 *  2. Tracking Extraction & Hierarchical Derivation (trackingParser.ts)
 *  3. Two-Way Diff & Reconciliation Engine (diffService.ts)
 *  4. Google Drive & Sheets Service Layer formatting (sheetsEtlService.ts)
 *
 * Enforces Pillar 2: Empirical Verification Precedence.
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

import { SyncAction, type MasterAssetRow, type MasterLearningPathRow } from '../src/types/syncEngine.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

console.log('================================================================');
console.log('🧪 MASTER SHEET SYNCHRONIZATION ENGINE VERIFICATION SUITE');
console.log('================================================================\n');

// -------------------------------------------------------------
// TEST SUITE 1: DURATION PARSER & NORMALIZATION
// -------------------------------------------------------------
console.log('--- 1. Testing Duration Normalization Utility ---');

assert(
  normalizeToIso8601Duration('00:14:45') === 'PT00H14M45S',
  'HH:MM:SS format normalized to PT00H14M45S',
  normalizeToIso8601Duration('00:14:45')
);

assert(
  normalizeToIso8601Duration('01:20:00') === 'PT01H20M00S',
  'HH:MM:SS format normalized to PT01H20M00S',
  normalizeToIso8601Duration('01:20:00')
);

assert(
  normalizeToIso8601Duration('14:45') === 'PT00H14M45S',
  'MM:SS format normalized to PT00H14M45S',
  normalizeToIso8601Duration('14:45')
);

assert(
  normalizeToIso8601Duration('15 mins') === 'PT00H15M00S',
  'Text "15 mins" normalized to PT00H15M00S',
  normalizeToIso8601Duration('15 mins')
);

assert(
  normalizeToIso8601Duration('1.5 hrs') === 'PT01H30M00S',
  'Text "1.5 hrs" normalized to PT01H30M00S',
  normalizeToIso8601Duration('1.5 hrs')
);

assert(
  normalizeToIso8601Duration('14:45.5') === 'PT00H14M46S' || normalizeToIso8601Duration('14:45.5') === 'PT00H14M45S',
  'Decimal seconds parsed and rounded safely',
  normalizeToIso8601Duration('14:45.5')
);

assert(
  normalizeToIso8601Duration('') === 'PT00H00M00S',
  'Empty string defaults to zero duration PT00H00M00S'
);

assert(
  normalizeToIso8601Duration(null) === 'PT00H00M00S',
  'Null input defaults to zero duration PT00H00M00S'
);

assert(
  iso8601ToSeconds('PT00H14M45S') === 885,
  'PT00H14M45S converts back to 885 seconds'
);

assert(
  formatDurationDisplay('PT00H14M45S') === '14m 45s',
  'formatDurationDisplay displays human readable "14m 45s"',
  formatDurationDisplay('PT00H14M45S')
);

assert(
  isValidIso8601Duration('PT00H14M45S') === true,
  'isValidIso8601Duration correctly validates PT00H14M45S'
);

// -------------------------------------------------------------
// TEST SUITE 2: TRACKING PARSER & HIERARCHICAL DERIVATION
// -------------------------------------------------------------
console.log('\n--- 2. Testing Tracking Extraction & Hierarchy Derivation ---');

const sampleTabRows = [
  ['Track Name', 'Sub-Track Name', 'Lesson Name', 'Topic Name', 'Sub-Topic Name', 'Duration', 'Type', 'Skill Tag', 'Difficulty', 'EOS Version', 'Developer', 'Comments'],
  ['Data Center', 'Core Spine-Leaf', 'EVPN-VXLAN Fundamentals', 'Overlay Routing', 'EVPN Anycast Gateway Overview', '00:14:45', 'video', 'EVPN, Routing', 4, '4.32.0F', 'Curriculum Team', 'Updated for 4.32'],
  // Merged cell row (Track, Sub-Track, Lesson, Topic columns are blank)
  ['', '', '', '', 'Distributed vs Centralized Anycast', '00:18:20', 'video', 'EVPN, Gateway', 4, '4.32.0F', 'Curriculum Team', 'Follow-up lesson'],
  // New lesson
  ['', '', 'Day-2 Operations', 'Telemetry', 'Streaming Telemetry with TerminAttr', '15 mins', 'lab', 'Telemetry', 5, '4.32.0F', 'Cloud Team', 'Lab guide'],
];

const parsedTab = parseTrackingTab('DC Track', sampleTabRows);

assert(parsedTab.assets.length === 3, 'Extracted 3 assets from tab', `Count: ${parsedTab.assets.length}`);
assert(parsedTab.learningPaths.length === 3, 'Extracted 3 learning path nodes', `Count: ${parsedTab.learningPaths.length}`);

// Test merged cell carry-forward
const secondPath = parsedTab.learningPaths[1];
assert(
  secondPath.track_name === 'Data Center' &&
  secondPath.sub_track_name === 'Core Spine-Leaf' &&
  secondPath.lesson_name === 'EVPN-VXLAN Fundamentals' &&
  secondPath.topic_name === 'Overlay Routing',
  'Merged cell carry-forward correctly preserved Track, Sub-Track, Lesson, and Topic across blank rows'
);

// Test multi-tab aggregation and deduplication
const workbookTabs = {
  'DC Track': sampleTabRows,
  'Cross-Track Tab': [
    ['Track', 'Lesson', 'Topic', 'Asset Name', 'Duration', 'Type'],
    // Same asset name appearing in another track
    ['Automation Track', 'CI/CD Pipelines', 'Telemetry Integrations', 'Streaming Telemetry with TerminAttr', '15m', 'lab'],
  ]
};

const workbookExtraction = extractTrackingWorkbook(workbookTabs);
assert(
  workbookExtraction.assets.length === 3,
  'Assets deduplicated by asset_name across multiple tabs (3 unique assets expected)',
  `Count: ${workbookExtraction.assets.length}`
);
assert(
  workbookExtraction.learningPaths.length === 4,
  'Learning paths preserved across multiple tabs (4 hierarchy placements expected)',
  `Count: ${workbookExtraction.learningPaths.length}`
);

// -------------------------------------------------------------
// TEST SUITE 3: TWO-WAY DIFF & RECONCILIATION ENGINE
// -------------------------------------------------------------
console.log('\n--- 3. Testing Two-Way Diff & Reconciliation Engine ---');

const existingMasterAssets: MasterAssetRow[] = [
  {
    asset_name: 'EVPN Anycast Gateway Overview',
    asset_type: 'video',
    duration: 'PT00H12M00S', // Will be detected as MODIFIED (was 12m, tracking says 14m 45s)
    difficulty_level: 4,
    skill_tag: 'EVPN, Routing',
    last_updated: '2025-01-01',
    'cvp_cv-cue_version': '',
    eos_version: '4.30.0F',
    avd_version: '',
    developer: 'Curriculum Team',
    needs_update: false,
    comments: 'Old notes',
  },
  {
    asset_name: 'Distributed vs Centralized Anycast',
    asset_type: 'video',
    duration: 'PT00H18M20S', // Will be detected as NO_CHANGE
    difficulty_level: 4,
    skill_tag: 'EVPN, Gateway',
    last_updated: '2025-01-01',
    'cvp_cv-cue_version': '',
    eos_version: '4.32.0F',
    avd_version: '',
    developer: 'Curriculum Team',
    needs_update: false,
    comments: 'Follow-up lesson',
  },
  {
    asset_name: 'Obsolete 7150 Switch Architecture', // DEPRECATED (missing in tracking)
    asset_type: 'video',
    duration: 'PT00H30M00S',
    difficulty_level: 3,
    skill_tag: 'Hardware',
    last_updated: '2020-01-01',
    'cvp_cv-cue_version': '',
    eos_version: '',
    avd_version: '',
    developer: 'Legacy',
    needs_update: true,
    comments: '',
  }
];

const existingMasterPaths: MasterLearningPathRow[] = [
  {
    track_number: null,
    track_name: 'Data Center',
    sub_track_number: null,
    sub_track_name: 'Core Spine-Leaf',
    lesson_number: null,
    lesson_name: 'EVPN-VXLAN Fundamentals',
    topic_number: null,
    topic_name: 'Overlay Routing',
    topic_description: '',
    sub_topic_number: 1,
    asset_name: 'EVPN Anycast Gateway Overview',
  }
];

const reconReport = reconcileSheets(
  workbookExtraction.assets,
  existingMasterAssets,
  workbookExtraction.learningPaths,
  existingMasterPaths,
  {
    sourceTrackingSheetId: 'src_tracking_123',
    targetAssetsSheetId: 'target_assets_123',
    targetLearningPathsSheetId: 'target_paths_123',
  }
);

assert(reconReport.summary.assetsToAdd === 1, 'Correctly flagged 1 NEW asset to ADD', `Found: ${reconReport.summary.assetsToAdd}`);
assert(reconReport.summary.assetsToUpdate === 1, 'Correctly flagged 1 MODIFIED asset to UPDATE', `Found: ${reconReport.summary.assetsToUpdate}`);
assert(reconReport.summary.assetsUnchanged === 1, 'Correctly flagged 1 UNCHANGED asset', `Found: ${reconReport.summary.assetsUnchanged}`);
assert(reconReport.summary.assetsDeprecated === 1, 'Correctly flagged 1 DEPRECATED asset', `Found: ${reconReport.summary.assetsDeprecated}`);

const modifiedAssetDiff = reconReport.assetDiffs.find(d => d.asset_name === 'EVPN Anycast Gateway Overview');
assert(
  modifiedAssetDiff?.action === SyncAction.UPDATE &&
  modifiedAssetDiff.fieldChanges.some(f => f.field === 'duration' && f.previousValue === 'PT00H12M00S' && f.proposedValue === 'PT00H14M45S'),
  'Field change recorded duration difference accurately'
);

// -------------------------------------------------------------
// TEST SUITE 4: SHEETS ETL SERVICE LAYER & SCHEMA GRIDS
// -------------------------------------------------------------
console.log('\n--- 4. Testing Google Drive & Sheets Service Layer ---');

const etlService = new SheetsEtlService({
  trackingSpreadsheetId: 'track_123',
  masterAssetsSpreadsheetId: 'assets_123',
  masterLearningPathsSpreadsheetId: 'paths_123',
});

const formattedAssetsGrid = etlService.formatAssetsToSheetValues(workbookExtraction.assets);
assert(
  formattedAssetsGrid[0].join(',') === MASTER_ASSETS_HEADERS.join(','),
  'Formatted Master Assets values grid strictly matches MASTER_ASSETS_HEADERS'
);
assert(
  formattedAssetsGrid.length === workbookExtraction.assets.length + 1,
  'Formatted Assets grid contains header + all data rows'
);

const formattedPathsGrid = etlService.formatLearningPathsToSheetValues(workbookExtraction.learningPaths);
assert(
  formattedPathsGrid[0].join(',') === MASTER_LEARNING_PATHS_HEADERS.join(','),
  'Formatted Master Learning Paths values grid strictly matches MASTER_LEARNING_PATHS_HEADERS'
);
assert(
  formattedPathsGrid.length === workbookExtraction.learningPaths.length + 1,
  'Formatted Paths grid contains header + all data rows'
);

// Test pre-write snapshot creation
const snapshot = await etlService.createDriveSnapshot('assets_123', 'Academy Master Assets');
assert(
  snapshot.originalFileId === 'assets_123' && snapshot.backupFileName.includes('PRE-SYNC BACKUP'),
  'Pre-write snapshot routine generates timestamped backup clone metadata'
);

console.log('\n================================================================');
console.log(`VERIFICATION COMPLETE: ${passed} passed, ${failed} failed`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
