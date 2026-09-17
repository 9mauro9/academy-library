/**
 * Two-Way Diff & Reconciliation Engine
 *
 * Reconciles the extracted tracking records against the existing Google Master Sheets:
 *   1. Master Assets: Keyed strictly by `asset_name` (globally unique).
 *   2. Master Learning Paths: Keyed by composite curriculum node signature.
 *
 * Classifies all changes into explicit actions:
 *   - ADD: Present in Tracking, absent in Master.
 *   - UPDATE: Present in both, but 1+ attributes or hierarchy fields differ.
 *   - NO_CHANGE: Identical in both.
 *   - DEPRECATED: Present in Master, missing from Tracking.
 *
 * Produces a strongly typed ReconciliationReport with field-level diffs.
 */

import {
  SyncAction,
  type MasterAssetRow,
  type MasterLearningPathRow,
  type AssetDiffItem,
  type LearningPathDiffItem,
  type FieldDiff,
  type ReconciliationReport,
  type ReconciliationSummary,
  type AuditLogEntry,
} from '../types/syncEngine';

/**
 * Normalizes string values for comparison (handles whitespace, nulls, casing)
 */
function normStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/**
 * Normalizes numbers for comparison
 */
function normNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}

/**
 * Normalizes boolean flags for comparison
 */
function normBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (!v) return false;
  return ['true', 'yes', '1'].includes(String(v).toLowerCase().trim());
}

/**
 * Generates a unique composite key for a learning path node
 */
export function generatePathKey(row: MasterLearningPathRow): string {
  const t = (row.track_name || 'General').toLowerCase().trim();
  const st = (row.sub_track_name || 'General').toLowerCase().trim();
  const l = (row.lesson_name || 'General Lesson').toLowerCase().trim();
  const top = (row.topic_name || 'General Topic').toLowerCase().trim();
  const a = (row.asset_name || '').toLowerCase().trim();
  return `${t}::${st}::${l}::${top}::${a}`;
}

/**
 * Compares two MasterAssetRow objects and generates a list of field differences
 */
export function compareAssetRows(
  master: MasterAssetRow,
  tracking: MasterAssetRow
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  const check = <T>(
    field: keyof MasterAssetRow,
    label: string,
    vMaster: T,
    vTracking: T,
    comparator: (a: T, b: T) => boolean = (a, b) => a === b
  ) => {
    if (!comparator(vMaster, vTracking)) {
      diffs.push({
        field: String(field),
        label,
        previousValue: vMaster,
        proposedValue: vTracking,
      });
    }
  };

  check('asset_type', 'Asset Type', normStr(master.asset_type).toLowerCase(), normStr(tracking.asset_type).toLowerCase());
  check('duration', 'Duration', normStr(master.duration), normStr(tracking.duration));
  check('difficulty_level', 'Difficulty Level', normNum(master.difficulty_level), normNum(tracking.difficulty_level));
  check('skill_tag', 'Skill Tag', normStr(master.skill_tag), normStr(tracking.skill_tag));
  check('cvp_cv-cue_version', 'CVP Version', normStr(master['cvp_cv-cue_version']), normStr(tracking['cvp_cv-cue_version']));
  check('eos_version', 'EOS Version', normStr(master.eos_version), normStr(tracking.eos_version));
  check('avd_version', 'AVD Version', normStr(master.avd_version), normStr(tracking.avd_version));
  check('developer', 'Developer', normStr(master.developer), normStr(tracking.developer));
  check('needs_update', 'Needs Update', normBool(master.needs_update), normBool(tracking.needs_update));
  check('comments', 'Comments', normStr(master.comments), normStr(tracking.comments));

  return diffs;
}

/**
 * Compares two MasterLearningPathRow objects and generates a list of field differences
 */
export function compareLearningPathRows(
  master: MasterLearningPathRow,
  tracking: MasterLearningPathRow
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  const check = <T>(
    field: keyof MasterLearningPathRow,
    label: string,
    vMaster: T,
    vTracking: T,
    comparator: (a: T, b: T) => boolean = (a, b) => a === b
  ) => {
    if (!comparator(vMaster, vTracking)) {
      diffs.push({
        field: String(field),
        label,
        previousValue: vMaster,
        proposedValue: vTracking,
      });
    }
  };

  check('track_number', 'Track #', normNum(master.track_number), normNum(tracking.track_number));
  check('track_name', 'Track Name', normStr(master.track_name), normStr(tracking.track_name));
  check('sub_track_number', 'Sub-Track #', normNum(master.sub_track_number), normNum(tracking.sub_track_number));
  check('sub_track_name', 'Sub-Track Name', normStr(master.sub_track_name), normStr(tracking.sub_track_name));
  check('lesson_number', 'Lesson #', normNum(master.lesson_number), normNum(tracking.lesson_number));
  check('lesson_name', 'Lesson Name', normStr(master.lesson_name), normStr(tracking.lesson_name));
  check('topic_number', 'Topic #', normNum(master.topic_number), normNum(tracking.topic_number));
  check('topic_name', 'Topic Name', normStr(master.topic_name), normStr(tracking.topic_name));
  check('topic_description', 'Topic Description', normStr(master.topic_description), normStr(tracking.topic_description));
  check('sub_topic_number', 'Sub-Topic #', normNum(master.sub_topic_number), normNum(tracking.sub_topic_number));

  return diffs;
}

/**
 * Performs full reconciliation of Tracking data against existing Master Sheets.
 */
export function reconcileSheets(
  trackingAssets: MasterAssetRow[],
  masterAssets: MasterAssetRow[],
  trackingPaths: MasterLearningPathRow[],
  masterPaths: MasterLearningPathRow[],
  config: {
    sourceTrackingSheetId: string;
    targetAssetsSheetId: string;
    targetLearningPathsSheetId: string;
  }
): ReconciliationReport {
  const auditLogs: AuditLogEntry[] = [];
  const now = new Date().toISOString();
  const reportId = `recon-${Date.now()}`;

  auditLogs.push({
    id: `log-${Date.now()}-1`,
    timestamp: now,
    level: 'INFO',
    category: 'DIFF',
    message: `Beginning reconciliation: ${trackingAssets.length} tracking assets vs ${masterAssets.length} master assets; ${trackingPaths.length} tracking paths vs ${masterPaths.length} master paths.`,
  });

  // -------------------------------------------------------------
  // 1. RECONCILE ASSETS (Keyed strictly by asset_name)
  // -------------------------------------------------------------
  const masterAssetMap = new Map<string, MasterAssetRow>();
  for (const a of masterAssets) {
    const key = a.asset_name.trim();
    if (key) {
      masterAssetMap.set(key, a);
    }
  }

  const trackingAssetMap = new Map<string, MasterAssetRow>();
  for (const a of trackingAssets) {
    const key = a.asset_name.trim();
    if (key) {
      trackingAssetMap.set(key, a);
    }
  }

  const assetDiffs: AssetDiffItem[] = [];

  // Evaluate additions and modifications from Tracking
  for (const [assetName, trackingRow] of trackingAssetMap.entries()) {
    const masterRow = masterAssetMap.get(assetName);
    if (!masterRow) {
      // Asset is new in Tracking
      assetDiffs.push({
        asset_name: assetName,
        action: SyncAction.ADD,
        fieldChanges: [
          {
            field: 'ALL',
            label: 'New Asset Record',
            previousValue: null,
            proposedValue: trackingRow,
          },
        ],
        masterRow: null,
        trackingRow,
      });
    } else {
      // Asset exists in both; compare attributes
      const fieldChanges = compareAssetRows(masterRow, trackingRow);
      if (fieldChanges.length > 0) {
        assetDiffs.push({
          asset_name: assetName,
          action: SyncAction.UPDATE,
          fieldChanges,
          masterRow,
          trackingRow,
        });
      } else {
        assetDiffs.push({
          asset_name: assetName,
          action: SyncAction.NO_CHANGE,
          fieldChanges: [],
          masterRow,
          trackingRow,
        });
      }
    }
  }

  // Evaluate orphaned/deprecated assets (present in Master, missing in Tracking)
  for (const [assetName, masterRow] of masterAssetMap.entries()) {
    if (!trackingAssetMap.has(assetName)) {
      assetDiffs.push({
        asset_name: assetName,
        action: SyncAction.DEPRECATED,
        fieldChanges: [
          {
            field: 'STATUS',
            label: 'Missing from Source Tracking',
            previousValue: 'ACTIVE',
            proposedValue: 'DEPRECATED',
          },
        ],
        masterRow,
        trackingRow: null,
      });
    }
  }

  // -------------------------------------------------------------
  // 2. RECONCILE LEARNING PATHS (Keyed by path composite signature)
  // -------------------------------------------------------------
  const masterPathMap = new Map<string, MasterLearningPathRow>();
  for (const p of masterPaths) {
    const key = generatePathKey(p);
    masterPathMap.set(key, p);
  }

  const trackingPathMap = new Map<string, MasterLearningPathRow>();
  for (const p of trackingPaths) {
    const key = generatePathKey(p);
    trackingPathMap.set(key, p);
  }

  const learningPathDiffs: LearningPathDiffItem[] = [];

  // Evaluate additions and modifications from Tracking
  for (const [key, trackingRow] of trackingPathMap.entries()) {
    const masterRow = masterPathMap.get(key);
    if (!masterRow) {
      learningPathDiffs.push({
        pathKey: key,
        asset_name: trackingRow.asset_name,
        track_name: trackingRow.track_name,
        lesson_name: trackingRow.lesson_name,
        topic_name: trackingRow.topic_name,
        action: SyncAction.ADD,
        fieldChanges: [
          {
            field: 'ALL',
            label: 'New Curriculum Node',
            previousValue: null,
            proposedValue: trackingRow,
          },
        ],
        masterRow: null,
        trackingRow,
      });
    } else {
      const fieldChanges = compareLearningPathRows(masterRow, trackingRow);
      if (fieldChanges.length > 0) {
        learningPathDiffs.push({
          pathKey: key,
          asset_name: trackingRow.asset_name,
          track_name: trackingRow.track_name,
          lesson_name: trackingRow.lesson_name,
          topic_name: trackingRow.topic_name,
          action: SyncAction.UPDATE,
          fieldChanges,
          masterRow,
          trackingRow,
        });
      } else {
        learningPathDiffs.push({
          pathKey: key,
          asset_name: trackingRow.asset_name,
          track_name: trackingRow.track_name,
          lesson_name: trackingRow.lesson_name,
          topic_name: trackingRow.topic_name,
          action: SyncAction.NO_CHANGE,
          fieldChanges: [],
          masterRow,
          trackingRow,
        });
      }
    }
  }

  // Evaluate orphaned/deprecated learning path nodes
  for (const [key, masterRow] of masterPathMap.entries()) {
    if (!trackingPathMap.has(key)) {
      learningPathDiffs.push({
        pathKey: key,
        asset_name: masterRow.asset_name,
        track_name: masterRow.track_name,
        lesson_name: masterRow.lesson_name,
        topic_name: masterRow.topic_name,
        action: SyncAction.DEPRECATED,
        fieldChanges: [
          {
            field: 'STATUS',
            label: 'Curriculum Node Removed in Tracking',
            previousValue: 'ACTIVE',
            proposedValue: 'DEPRECATED',
          },
        ],
        masterRow,
        trackingRow: null,
      });
    }
  }

  // Sort diffs: ADD first, then UPDATE, then DEPRECATED, then NO_CHANGE
  const actionPriority: Record<SyncAction, number> = {
    ADD: 1,
    UPDATE: 2,
    DEPRECATED: 3,
    NO_CHANGE: 4,
  };

  assetDiffs.sort((a, b) => {
    const diff = actionPriority[a.action] - actionPriority[b.action];
    if (diff !== 0) return diff;
    return a.asset_name.localeCompare(b.asset_name);
  });

  learningPathDiffs.sort((a, b) => {
    const diff = actionPriority[a.action] - actionPriority[b.action];
    if (diff !== 0) return diff;
    return a.pathKey.localeCompare(b.pathKey);
  });

  // Calculate Summary Metrics
  const summary: ReconciliationSummary = {
    totalTrackingAssets: trackingAssetMap.size,
    totalMasterAssets: masterAssetMap.size,
    assetsToAdd: assetDiffs.filter(a => a.action === SyncAction.ADD).length,
    assetsToUpdate: assetDiffs.filter(a => a.action === SyncAction.UPDATE).length,
    assetsUnchanged: assetDiffs.filter(a => a.action === SyncAction.NO_CHANGE).length,
    assetsDeprecated: assetDiffs.filter(a => a.action === SyncAction.DEPRECATED).length,
    totalTrackingPaths: trackingPathMap.size,
    totalMasterPaths: masterPathMap.size,
    pathsToAdd: learningPathDiffs.filter(p => p.action === SyncAction.ADD).length,
    pathsToUpdate: learningPathDiffs.filter(p => p.action === SyncAction.UPDATE).length,
    pathsUnchanged: learningPathDiffs.filter(p => p.action === SyncAction.NO_CHANGE).length,
    pathsDeprecated: learningPathDiffs.filter(p => p.action === SyncAction.DEPRECATED).length,
    generatedAt: now,
  };

  auditLogs.push({
    id: `log-${Date.now()}-summary`,
    timestamp: now,
    level: 'SUCCESS',
    category: 'DIFF',
    message: `Reconciliation summary: Assets [${summary.assetsToAdd} Add, ${summary.assetsToUpdate} Update, ${summary.assetsDeprecated} Deprecated, ${summary.assetsUnchanged} No Change]. Learning Paths [${summary.pathsToAdd} Add, ${summary.pathsToUpdate} Update, ${summary.pathsDeprecated} Deprecated, ${summary.pathsUnchanged} No Change].`,
  });

  return {
    id: reportId,
    generatedAt: now,
    sourceTrackingSheetId: config.sourceTrackingSheetId,
    targetAssetsSheetId: config.targetAssetsSheetId,
    targetLearningPathsSheetId: config.targetLearningPathsSheetId,
    summary,
    assetDiffs,
    learningPathDiffs,
    auditLogs,
  };
}
