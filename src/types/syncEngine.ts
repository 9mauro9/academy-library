/**
 * Master Sheet Synchronization Engine (Spreadsheet Pre-Sync Engine)
 * Core Domain Types & Entity Schemas
 *
 * Adheres to Agentic Engineering Standard (OS 2.2) and AES v3 architecture.
 * Maintains strict separation of concerns for Stage 1 (Pre-Sync Sheet ETL)
 * prior to Stage 2 (Firestore Ingestion).
 */

/**
 * ISO 8601 Duration representation (e.g., 'PT00H14M45S', 'PT01H20M00S').
 * Strict template literal typing to guarantee deterministic formatting.
 */
export type Iso8601Duration = `PT${string}`;

/**
 * Reconciliation Action Enumeration.
 * Explicit states for tracking changes between Source Tracking and Target Masters.
 */
export type SyncAction = 'ADD' | 'UPDATE' | 'NO_CHANGE' | 'DEPRECATED';

export const SyncAction = {
  ADD: 'ADD',
  UPDATE: 'UPDATE',
  NO_CHANGE: 'NO_CHANGE',
  DEPRECATED: 'DEPRECATED',
} as const;

/**
 * Target Master 1 Entity: Academy Master Assets
 * Key: asset_name (case-sensitive/trimmed, globally unique)
 */
export interface MasterAssetRow {
  /** Primary Key: Globally unique asset identifier */
  asset_name: string;
  /** Media type: video, quiz, lab, document, interactive */
  asset_type: string;
  /** Normalized ISO 8601 duration format: PT##H##M##S */
  duration: Iso8601Duration;
  /** Difficulty scale (e.g., 1-10 or numeric rating) */
  difficulty_level: number | null;
  /** Comma-separated or tag string representing competencies */
  skill_tag: string;
  /** ISO Date string of last modification (YYYY-MM-DD) */
  last_updated: string;
  /** Target CVP / CloudVision portal version */
  'cvp_cv-cue_version': string;
  /** Target EOS network operating system version */
  eos_version: string;
  /** Target AVD (Arista Validated Design) version */
  avd_version: string;
  /** Author / Curriculum developer */
  developer: string;
  /** Maintenance flag indicating if the content requires revision */
  needs_update: boolean;
  /** Editorial or release notes */
  comments: string;
}

/**
 * Target Master 2 Entity: Academy Master Learning Paths
 * Foreign Key: asset_name -> references MasterAssetRow.asset_name
 */
export interface MasterLearningPathRow {
  /** 1-based order index of the top-level Track */
  track_number: number | null;
  /** Name of the Track (e.g., Data Center, Campus, AI Networking) */
  track_name: string;
  /** Sub-track sequence index */
  sub_track_number: number | null;
  /** Sub-track name (e.g., Core Architecture, Automation) */
  sub_track_name: string;
  /** Lesson sequence index */
  lesson_number: number | null;
  /** Lesson title */
  lesson_name: string;
  /** Topic sequence index */
  topic_number: number | null;
  /** Topic title */
  topic_name: string;
  /** Pedagogical description or outcome of the topic */
  topic_description: string;
  /** Sub-topic / asset position within topic */
  sub_topic_number: number | null;
  /** Foreign Key: Join key linking curriculum node to asset metadata */
  asset_name: string;
}

/**
 * Raw Tracking Sheet cell dictionary (human-maintained unstructured sheet)
 */
export interface RawTrackingRow {
  [key: string]: any;
}

/**
 * Parsed tracking sheet tab container
 */
export interface TrackingTabExtraction {
  tabName: string;
  rawRowCount: number;
  assets: MasterAssetRow[];
  learningPaths: MasterLearningPathRow[];
  unresolvedRows: Array<{
    rowIndex: number;
    reason: string;
    rawContent: Record<string, any>;
  }>;
}

/**
 * Granular Field Change record for reconciliation diffs
 */
export interface FieldDiff<T = any> {
  field: string;
  previousValue: T;
  proposedValue: T;
  label?: string;
  isSignificant?: boolean;
}

/**
 * Reconciliation item for Master Assets
 */
export interface AssetDiffItem {
  asset_name: string;
  action: SyncAction;
  fieldChanges: FieldDiff[];
  masterRow: MasterAssetRow | null;
  trackingRow: MasterAssetRow | null;
}

/**
 * Reconciliation item for Master Learning Paths
 */
export interface LearningPathDiffItem {
  pathKey: string;
  asset_name: string;
  action: SyncAction;
  fieldChanges: FieldDiff[];
  masterRow: MasterLearningPathRow | null;
  trackingRow: MasterLearningPathRow | null;
  track_name: string;
  lesson_name: string;
  topic_name: string;
}

/**
 * High-level Summary Metrics for the Pre-Sync Engine
 */
export interface ReconciliationSummary {
  totalTrackingAssets: number;
  totalMasterAssets: number;
  assetsToAdd: number;
  assetsToUpdate: number;
  assetsUnchanged: number;
  assetsDeprecated: number;
  totalTrackingPaths: number;
  totalMasterPaths: number;
  pathsToAdd: number;
  pathsToUpdate: number;
  pathsUnchanged: number;
  pathsDeprecated: number;
  generatedAt: string;
}

/**
 * Structured Audit Log Entry for tracing ETL and Sync operations
 */
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  category: 'EXTRACTION' | 'DIFF' | 'BACKUP' | 'SYNC' | 'VALIDATION';
  message: string;
  details?: Record<string, any>;
}

/**
 * Complete Reconciliation Diff Report
 */
export interface ReconciliationReport {
  id: string;
  generatedAt: string;
  sourceTrackingSheetId: string;
  targetAssetsSheetId: string;
  targetLearningPathsSheetId: string;
  summary: ReconciliationSummary;
  assetDiffs: AssetDiffItem[];
  learningPathDiffs: LearningPathDiffItem[];
  auditLogs: AuditLogEntry[];
}

/**
 * Google Drive Pre-Write Snapshot Backup Metadata
 */
export interface DriveSnapshotMetadata {
  originalFileId: string;
  backupFileId: string;
  backupFileName: string;
  backupUrl: string;
  createdAt: string;
}

/**
 * Execution Plan for applying mutations to Google Master Sheets
 */
export interface SyncExecutionPlan {
  reportId: string;
  assetsToUpsert: MasterAssetRow[];
  pathsToUpsert: MasterLearningPathRow[];
  deprecateOrphans: boolean;
  createDriveBackups: boolean;
}

/**
 * Execution Result after applying changes to Google Sheets
 */
export interface SyncExecutionResult {
  success: boolean;
  executedAt: string;
  reportId: string;
  snapshots: DriveSnapshotMetadata[];
  assetsUpsertedCount: number;
  assetsDeprecatedCount: number;
  pathsUpsertedCount: number;
  pathsDeprecatedCount: number;
  masterAssetsSheetUrl: string;
  masterLearningPathsSheetUrl: string;
  auditLogs: AuditLogEntry[];
  error?: string;
}

/**
 * Configuration for Master Sheet IDs and authentication options
 */
export interface MasterSheetsConfig {
  trackingSpreadsheetId: string;
  masterAssetsSpreadsheetId: string;
  masterLearningPathsSpreadsheetId: string;
  googleApiKey?: string;
  accessToken?: string;
}
