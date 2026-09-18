/**
 * Tracking Extraction & Hierarchical Derivation Service
 *
 * Implements resilient extraction of the 5-tier curriculum hierarchy:
 *   Track -> Sub-Track -> Lesson -> Topic -> Sub-Topic -> asset_name
 *
 * Handles human-maintained spreadsheet quirks:
 *   - Merged cells & carry-forward state across blank downstream rows
 *   - Varied column header aliases and casing
 *   - Cross-tab tracking (e.g. 'DC Track', 'Campus Track', 'AI Track')
 *   - Multi-row blocks and embedded metadata
 */

import type {
  MasterAssetRow,
  MasterLearningPathRow,
  AuditLogEntry,
  TrackingTabExtraction,
} from '../types/syncEngine';
import { normalizeToIso8601Duration } from '../utils/durationParser';

/**
 * Normalizes header keys for case-insensitive, punctuation-resilient matching.
 * e.g., "Asset Name / Title" -> "asset_name_title"
 */
function normalizeHeaderKey(header: string): string {
  if (!header) return '';
  return header
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Helper to clean and sanitize string cell values
 */
function sanitizeString(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (
    str.toLowerCase() === 'n/a' ||
    str.toLowerCase() === 'none' ||
    str.toLowerCase() === 'null' ||
    str === '-'
  ) {
    return '';
  }
  return str;
}

/**
 * Parses numeric values safely
 */
function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? null : num;
}

/**
 * Parses boolean flags (e.g., for needs_update)
 */
function parseBoolean(val: unknown): boolean {
  if (!val) return false;
  const str = String(val).toLowerCase().trim();
  return ['yes', 'true', '1', 'y', 'x', 'flagged'].includes(str);
}

/**
 * Extracts a numeric prefix and cleaned title from strings like "01. Introduction" or "Lesson 3: EVPN"
 */
function extractNumberAndTitle(rawText: string): { number: number | null; title: string } {
  if (!rawText) return { number: null, title: '' };
  const trimmed = rawText.trim();

  // Pattern: "1.2 - Title" or "1. Title" or "01 Title"
  const prefixMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*[-.:)]\s*(.+)$/);
  if (prefixMatch) {
    const num = parseFloat(prefixMatch[1]);
    return {
      number: isNaN(num) ? null : num,
      title: prefixMatch[2].trim(),
    };
  }

  // Pattern: "Lesson 2 - Title" or "Track 1: Data Center"
  const labeledMatch = trimmed.match(/^(?:track|lesson|topic|module)\s*(\d+)\s*[-.:]\s*(.+)$/i);
  if (labeledMatch) {
    const num = parseFloat(labeledMatch[1]);
    return {
      number: isNaN(num) ? null : num,
      title: labeledMatch[2].trim(),
    };
  }

  return { number: null, title: trimmed };
}

/**
 * Finds the column index matching any of the candidate aliases
 */
function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalizedHeaders = headers.map(normalizeHeaderKey);
  for (const alias of aliases) {
    const normAlias = normalizeHeaderKey(alias);
    const idx = normalizedHeaders.indexOf(normAlias);
    if (idx !== -1) return idx;
  }
  // Try substring match if exact match not found
  for (const alias of aliases) {
    const normAlias = normalizeHeaderKey(alias);
    const idx = normalizedHeaders.findIndex(h => h.includes(normAlias));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Tab Extraction Context State to handle merged cells across rows
 */
interface HierarchyState {
  trackNumber: number | null;
  trackName: string;
  subTrackNumber: number | null;
  subTrackName: string;
  lessonNumber: number | null;
  lessonName: string;
  topicNumber: number | null;
  topicName: string;
  topicDescription: string;
  subTopicNumber: number;
}

export interface ParseTrackingOptions {
  defaultTrackName?: string;
  skipEmptyRows?: boolean;
}

/**
 * Parses a single sheet tab (rows matrix or raw array of arrays) into normalized entities
 */
export function parseTrackingTab(
  tabName: string,
  rawRows: (string | number | null | undefined)[][],
  options: ParseTrackingOptions = {}
): TrackingTabExtraction {
  const assets: MasterAssetRow[] = [];
  const learningPaths: MasterLearningPathRow[] = [];
  const unresolvedRows: TrackingTabExtraction['unresolvedRows'] = [];

  if (!rawRows || rawRows.length < 2) {
    return { tabName, rawRowCount: rawRows ? rawRows.length : 0, assets, learningPaths, unresolvedRows };
  }

  // Identify header row (default to row 0, or inspect first 3 rows for 'asset' or 'topic' keywords)
  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(rawRows.length, 5); r++) {
    const rowStr = rawRows[r].map(c => String(c || '').toLowerCase()).join(' ');
    if (rowStr.includes('asset') || (rowStr.includes('topic') && rowStr.includes('lesson'))) {
      headerRowIndex = r;
      break;
    }
  }

  const rawHeaders = rawRows[headerRowIndex].map(c => String(c || '').trim());

  // Detect Column Indexes with extensive aliasing
  const colIdx = {
    trackNum: findColumnIndex(rawHeaders, ['track_number', 'track_no', 'track_num', 'track_#']),
    trackName: findColumnIndex(rawHeaders, ['track_name', 'track', 'track_title', 'curriculum_track']),
    subTrackNum: findColumnIndex(rawHeaders, ['sub_track_number', 'subtrack_number', 'sub_track_no']),
    subTrackName: findColumnIndex(rawHeaders, ['sub_track_name', 'sub_track', 'subtrack', 'sub_track_title']),
    lessonNum: findColumnIndex(rawHeaders, ['lesson_number', 'lesson_no', 'lesson_num', 'lesson_#']),
    lessonName: findColumnIndex(rawHeaders, ['lesson_name', 'lesson', 'lesson_title', 'module']),
    topicNum: findColumnIndex(rawHeaders, ['topic_number', 'topic_no', 'topic_num', 'topic_#']),
    topicName: findColumnIndex(rawHeaders, ['topic_name', 'topic', 'topic_title']),
    topicDesc: findColumnIndex(rawHeaders, ['topic_description', 'description', 'topic_desc', 'outcome']),
    subTopicNum: findColumnIndex(rawHeaders, ['sub_topic_number', 'subtopic_number', 'item_number', 'sub_topic_#']),
    subTopicName: findColumnIndex(rawHeaders, ['sub_topic_name', 'sub_topic', 'subtopic', 'item_name']),
    assetName: findColumnIndex(rawHeaders, ['asset_name', 'asset', 'asset_title', 'video_title', 'content_title']),
    assetType: findColumnIndex(rawHeaders, ['asset_type', 'type', 'media_type', 'format']),
    duration: findColumnIndex(rawHeaders, ['duration', 'length', 'time', 'duration_mins', 'duration_min']),
    difficulty: findColumnIndex(rawHeaders, ['difficulty_level', 'difficulty', 'diff_level', 'level']),
    skillTag: findColumnIndex(rawHeaders, ['skill_tag', 'skill_tags', 'skills', 'tags', 'competencies']),
    lastUpdated: findColumnIndex(rawHeaders, ['last_updated', 'date', 'updated', 'last_edit']),
    cvp: findColumnIndex(rawHeaders, ['cvp_cv-cue_version', 'cvp_cv_cue_version', 'cvp_version', 'cvp', 'cv-cue']),
    eos: findColumnIndex(rawHeaders, ['eos_version', 'eos', 'eos_release']),
    avd: findColumnIndex(rawHeaders, ['avd_version', 'avd', 'avd_release']),
    developer: findColumnIndex(rawHeaders, ['developer', 'author', 'owner', 'creator', 'engineer']),
    needsUpdate: findColumnIndex(rawHeaders, ['needs_update', 'update_required', 're_record', 'flag']),
    comments: findColumnIndex(rawHeaders, ['comments', 'notes', 'remarks', 'editorial_notes']),
  };

  // Derive initial Track from Tab Name if tab is named e.g. "DC Track", "Campus Track"
  const defaultTabTrack = options.defaultTrackName || tabName.replace(/(?:_|-|\s)*track$/i, '').trim() || 'General';

  // State to support vertical merged cell carry-forward
  const state: HierarchyState = {
    trackNumber: null,
    trackName: defaultTabTrack,
    subTrackNumber: null,
    subTrackName: 'General',
    lessonNumber: null,
    lessonName: 'General Lesson',
    topicNumber: null,
    topicName: 'General Topic',
    topicDescription: '',
    subTopicNumber: 0,
  };

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const getCell = (idx: number): string => (idx !== -1 && row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : '');

    // 1. Check for Track updates
    const rawTrackName = getCell(colIdx.trackName);
    const rawTrackNum = getCell(colIdx.trackNum);
    if (rawTrackName) {
      const parsed = extractNumberAndTitle(rawTrackName);
      state.trackName = parsed.title;
      state.trackNumber = parseNumber(rawTrackNum) ?? parsed.number;
      // Reset subordinate hierarchy on new track
      state.subTrackName = 'General';
      state.subTrackNumber = null;
      state.lessonName = 'General Lesson';
      state.lessonNumber = null;
      state.topicName = 'General Topic';
      state.topicNumber = null;
      state.subTopicNumber = 0;
    } else if (rawTrackNum) {
      state.trackNumber = parseNumber(rawTrackNum);
    }

    // 2. Check for Sub-Track updates
    const rawSubTrackName = getCell(colIdx.subTrackName);
    const rawSubTrackNum = getCell(colIdx.subTrackNum);
    if (rawSubTrackName) {
      const parsed = extractNumberAndTitle(rawSubTrackName);
      state.subTrackName = parsed.title;
      state.subTrackNumber = parseNumber(rawSubTrackNum) ?? parsed.number;
      state.lessonName = 'General Lesson';
      state.lessonNumber = null;
      state.topicName = 'General Topic';
      state.topicNumber = null;
      state.subTopicNumber = 0;
    } else if (rawSubTrackNum) {
      state.subTrackNumber = parseNumber(rawSubTrackNum);
    }

    // 3. Check for Lesson updates
    const rawLessonName = getCell(colIdx.lessonName);
    const rawLessonNum = getCell(colIdx.lessonNum);
    if (rawLessonName) {
      const parsed = extractNumberAndTitle(rawLessonName);
      state.lessonName = parsed.title;
      state.lessonNumber = parseNumber(rawLessonNum) ?? parsed.number;
      state.topicName = 'General Topic';
      state.topicNumber = null;
      state.subTopicNumber = 0;
    } else if (rawLessonNum) {
      state.lessonNumber = parseNumber(rawLessonNum);
    }

    // 4. Check for Topic updates
    const rawTopicName = getCell(colIdx.topicName);
    const rawTopicNum = getCell(colIdx.topicNum);
    const rawTopicDesc = getCell(colIdx.topicDesc);
    if (rawTopicName) {
      const parsed = extractNumberAndTitle(rawTopicName);
      state.topicName = parsed.title;
      state.topicNumber = parseNumber(rawTopicNum) ?? parsed.number;
      state.topicDescription = sanitizeString(rawTopicDesc);
      state.subTopicNumber = 0;
    } else if (rawTopicNum) {
      state.topicNumber = parseNumber(rawTopicNum);
    }
    if (rawTopicDesc && !rawTopicName) {
      const sanitized = sanitizeString(rawTopicDesc);
      if (sanitized) {
        state.topicDescription = state.topicDescription
          ? `${state.topicDescription} ${sanitized}`
          : sanitized;
      }
    }

    // 5. Extract asset_name (Definitive Primary Join Key)
    let assetName = getCell(colIdx.assetName);
    if (!assetName) {
      // Fallback: subTopicName or topicName if row represents standalone item
      assetName = getCell(colIdx.subTopicName);
    }

    if (!assetName) {
      // Row contains structural information but no asset leaf
      continue;
    }

    const cleanedAssetName = assetName.trim();
    if (!cleanedAssetName) {
      continue;
    }

    state.subTopicNumber += 1;
    const explicitSubTopicNum = parseNumber(getCell(colIdx.subTopicNum));
    const subTopicNumber = explicitSubTopicNum !== null ? explicitSubTopicNum : state.subTopicNumber;


    // 6. Build MasterLearningPathRow
    const learningPathRow: MasterLearningPathRow = {
      track_number: state.trackNumber,
      track_name: state.trackName || defaultTabTrack,
      sub_track_number: state.subTrackNumber,
      sub_track_name: state.subTrackName || 'General',
      lesson_number: state.lessonNumber,
      lesson_name: state.lessonName || 'General Lesson',
      topic_number: state.topicNumber,
      topic_name: state.topicName || 'General Topic',
      topic_description: state.topicDescription || '',
      sub_topic_number: subTopicNumber,
      asset_name: cleanedAssetName,
    };
    learningPaths.push(learningPathRow);

    // 7. Build MasterAssetRow
    const rawDuration = colIdx.duration !== -1 ? row[colIdx.duration] : null;
    const rawDiff = colIdx.difficulty !== -1 ? row[colIdx.difficulty] : null;
    const rawType = getCell(colIdx.assetType) || 'video';
    const rawSkill = getCell(colIdx.skillTag);
    const rawDate = getCell(colIdx.lastUpdated);
    const rawCvp = getCell(colIdx.cvp);
    const rawEos = getCell(colIdx.eos);
    const rawAvd = getCell(colIdx.avd);
    const rawDev = getCell(colIdx.developer);
    const rawNeedsUpdate = colIdx.needsUpdate !== -1 ? row[colIdx.needsUpdate] : null;
    const rawComments = getCell(colIdx.comments);

    const assetRow: MasterAssetRow = {
      asset_name: cleanedAssetName,
      asset_type: rawType.toLowerCase(),
      duration: normalizeToIso8601Duration(rawDuration),
      difficulty_level: parseNumber(rawDiff),
      skill_tag: sanitizeString(rawSkill),
      last_updated: sanitizeString(rawDate) || new Date().toISOString().split('T')[0],
      'cvp_cv-cue_version': sanitizeString(rawCvp),
      eos_version: sanitizeString(rawEos),
      avd_version: sanitizeString(rawAvd),
      developer: sanitizeString(rawDev),
      needs_update: parseBoolean(rawNeedsUpdate),
      comments: sanitizeString(rawComments),
    };
    assets.push(assetRow);
  }

  return {
    tabName,
    rawRowCount: rawRows.length,
    assets,
    learningPaths,
    unresolvedRows,
  };
}

/**
 * Aggregates extraction across multiple tabs of the Academy Tracking workbook.
 * Deduplicates MasterAssetRow entries by asset_name while preserving all Learning Paths.
 */
export function extractTrackingWorkbook(
  tabsMap: Record<string, (string | number | null | undefined)[][]>,
  options: ParseTrackingOptions = {}
): {
  assets: MasterAssetRow[];
  learningPaths: MasterLearningPathRow[];
  tabSummaries: TrackingTabExtraction[];
  auditLogs: AuditLogEntry[];
} {
  const auditLogs: AuditLogEntry[] = [];
  const tabSummaries: TrackingTabExtraction[] = [];
  const assetMap = new Map<string, MasterAssetRow>();
  const allLearningPaths: MasterLearningPathRow[] = [];

  const tabNames = Object.keys(tabsMap);
  auditLogs.push({
    id: `log-${Date.now()}-init`,
    timestamp: new Date().toISOString(),
    level: 'INFO',
    category: 'EXTRACTION',
    message: `Starting extraction for ${tabNames.length} tracking tabs: [${tabNames.join(', ')}]`,
  });

  for (const tabName of tabNames) {
    const rawRows = tabsMap[tabName];
    const extraction = parseTrackingTab(tabName, rawRows, options);
    tabSummaries.push(extraction);

    // Accumulate learning paths
    allLearningPaths.push(...extraction.learningPaths);

    // Merge assets (keyed by asset_name)
    for (const asset of extraction.assets) {
      if (!assetMap.has(asset.asset_name)) {
        assetMap.set(asset.asset_name, asset);
      } else {
        // If asset was already extracted from another tab/row, merge metadata if richer
        const existing = assetMap.get(asset.asset_name)!;
        const merged: MasterAssetRow = {
          ...existing,
          // If existing duration was zero but current has duration, update
          duration: existing.duration === 'PT00H00M00S' ? asset.duration : existing.duration,
          difficulty_level: existing.difficulty_level ?? asset.difficulty_level,
          skill_tag: existing.skill_tag || asset.skill_tag,
          'cvp_cv-cue_version': existing['cvp_cv-cue_version'] || asset['cvp_cv-cue_version'],
          eos_version: existing.eos_version || asset.eos_version,
          avd_version: existing.avd_version || asset.avd_version,
          developer: existing.developer || asset.developer,
          needs_update: existing.needs_update || asset.needs_update,
          comments: existing.comments ? `${existing.comments}; ${asset.comments}` : asset.comments,
        };
        assetMap.set(asset.asset_name, merged);

        auditLogs.push({
          id: `log-${Date.now()}-dup-${asset.asset_name}`,
          timestamp: new Date().toISOString(),
          level: 'WARN',
          category: 'VALIDATION',
          message: `Duplicate asset_name '${asset.asset_name}' detected in tracking sheet tab '${tabName}'. Metadata merged.`,
          details: { asset_name: asset.asset_name, tabName },
        });
      }
    }


    auditLogs.push({
      id: `log-${Date.now()}-${tabName}`,
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category: 'EXTRACTION',
      message: `Tab '${tabName}': extracted ${extraction.assets.length} raw assets, ${extraction.learningPaths.length} hierarchy nodes.`,
    });
  }

  const uniqueAssets = Array.from(assetMap.values());

  auditLogs.push({
    id: `log-${Date.now()}-complete`,
    timestamp: new Date().toISOString(),
    level: 'SUCCESS',
    category: 'EXTRACTION',
    message: `Extraction complete: ${uniqueAssets.length} unique assets and ${allLearningPaths.length} total learning path nodes derived.`,
  });

  return {
    assets: uniqueAssets,
    learningPaths: allLearningPaths,
    tabSummaries,
    auditLogs,
  };
}
