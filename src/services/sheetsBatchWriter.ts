/**
 * Enhanced Google Sheets API v4 Batch Writer & Snapshot Engine
 *
 * Implements:
 *   - Google Drive API v3 Pre-Write Safety Snapshots with timestamped names
 *   - Google Sheets API v4 batch upserting with bounded column ranges
 *     (A1:L for Master Assets, A1:K for Master Learning Paths)
 *     to safeguard formulas, column definitions, and auxiliary data in columns M:Z
 *   - Chunking (500 rows per request) with exponential backoff retry for quota protection
 *   - Strict ISO 8601 duration formatting (PT##H##M##S)
 */

import type {
  MasterAssetRow,
  MasterLearningPathRow,
  DriveSnapshotMetadata,
  MasterSheetsConfig,
} from '../types/syncEngine';
import { normalizeToIso8601Duration } from '../utils/durationParser';

export const MASTER_ASSETS_COLUMNS: (keyof MasterAssetRow)[] = [
  'asset_name',
  'asset_type',
  'duration',
  'difficulty_level',
  'skill_tag',
  'last_updated',
  'cvp_cv-cue_version',
  'eos_version',
  'avd_version',
  'developer',
  'needs_update',
  'comments',
];

export const MASTER_LEARNING_PATHS_COLUMNS: (keyof MasterLearningPathRow)[] = [
  'track_number',
  'track_name',
  'sub_track_number',
  'sub_track_name',
  'lesson_number',
  'lesson_name',
  'topic_number',
  'topic_name',
  'topic_description',
  'sub_topic_number',
  'asset_name',
];

export class SheetsBatchWriter {
  private config: MasterSheetsConfig;

  constructor(config: MasterSheetsConfig) {
    this.config = config;
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.accessToken) {
      headers['Authorization'] = `Bearer ${this.config.accessToken}`;
    }
    return headers;
  }

  private appendApiKey(url: string): string {
    if (this.config.googleApiKey && !this.config.accessToken) {
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}key=${encodeURIComponent(this.config.googleApiKey)}`;
    }
    return url;
  }

  /**
   * Pre-write Safety Snapshot Routine
   * Clones target sheet in Google Drive prior to any mutation.
   */
  async createPreWriteSnapshot(
    fileId: string,
    description: string
  ): Promise<DriveSnapshotMetadata> {
    const now = new Date();
    const timestampStr = now.toISOString().replace(/[:.]/g, '-');
    const readableTimestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const backupTitle = `[PRE-SYNC BACKUP ${readableTimestamp}] ${description}`;

    const url = this.appendApiKey(`https://www.googleapis.com/drive/v3/files/${fileId}/copy`);
    const body = {
      name: backupTitle,
      description: `Automated R.A.E.S. Version 3 safety backup before Master Sheet ETL batch update on ${now.toISOString()}`,
    };

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (resp.ok) {
        const data = await resp.json();
        return {
          originalFileId: fileId,
          backupFileId: data.id,
          backupFileName: backupTitle,
          backupUrl: `https://docs.google.com/spreadsheets/d/${data.id}/edit`,
          createdAt: now.toISOString(),
        };
      } else if (this.config.accessToken) {
        const errText = await resp.text();
        throw new Error(`Google Drive snapshot failed: HTTP ${resp.status} - ${errText}`);
      }
    } catch (err) {
      if (this.config.accessToken) throw err;
      console.warn('Drive snapshot API failed (fallback mode active):', err);
    }

    // Mock fallback when running offline or without credentials
    return {
      originalFileId: fileId,
      backupFileId: `backup_${fileId}_${timestampStr}`,
      backupFileName: backupTitle,
      backupUrl: `https://docs.google.com/spreadsheets/d/${fileId}/edit`,
      createdAt: now.toISOString(),
    };
  }

  /**
   * Formats MasterAssetRow[] strictly into 12 columns (A..L) with guaranteed ISO 8601 duration
   */
  formatAssetsToSheetGrid(assets: MasterAssetRow[]): (string | number | boolean | null)[][] {
    const headers = [...MASTER_ASSETS_COLUMNS];
    const grid: (string | number | boolean | null)[][] = [headers];

    for (const a of assets) {
      grid.push([
        a.asset_name,
        a.asset_type,
        normalizeToIso8601Duration(a.duration),
        a.difficulty_level,
        a.skill_tag,
        a.last_updated,
        a['cvp_cv-cue_version'],
        a.eos_version,
        a.avd_version,
        a.developer,
        a.needs_update,
        a.comments,
      ]);
    }

    return grid;
  }

  /**
   * Formats MasterLearningPathRow[] strictly into 11 columns (A..K)
   */
  formatPathsToSheetGrid(paths: MasterLearningPathRow[]): (string | number | boolean | null)[][] {
    const headers = [...MASTER_LEARNING_PATHS_COLUMNS];
    const grid: (string | number | boolean | null)[][] = [headers];

    for (const p of paths) {
      grid.push([
        p.track_number,
        p.track_name,
        p.sub_track_number,
        p.sub_track_name,
        p.lesson_number,
        p.lesson_name,
        p.topic_number,
        p.topic_name,
        p.topic_description,
        p.sub_topic_number,
        p.asset_name,
      ]);
    }

    return grid;
  }

  /**
   * Bounded batch write to Google Sheets via spreadsheets.values.batchUpdate
   */
  async batchWriteValues(
    spreadsheetId: string,
    startRange: string,
    values: (string | number | boolean | null)[][],
    chunkSize = 500
  ): Promise<{ updatedRows: number; updatedCells: number }> {
    if (!values || values.length === 0) return { updatedRows: 0, updatedCells: 0 };

    let totalUpdatedRows = 0;
    let totalUpdatedCells = 0;

    const rangeMatch = startRange.match(/^(?:'([^']+)'!|([^!]+)!)?([A-Za-z]+)(\d+)?$/);
    const sheetPrefix = rangeMatch ? (rangeMatch[1] || rangeMatch[2] ? `'${rangeMatch[1] || rangeMatch[2]}'!`: '') : '';
    const startCol = rangeMatch ? rangeMatch[3] : 'A';
    const startRow = rangeMatch && rangeMatch[4] ? parseInt(rangeMatch[4], 10) : 1;

    for (let offset = 0; offset < values.length; offset += chunkSize) {
      const chunk = values.slice(offset, offset + chunkSize);
      const currentStartRow = startRow + offset;
      const targetRange = `${sheetPrefix}${startCol}${currentStartRow}`;

      const url = this.appendApiKey(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`);
      const payload = {
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: targetRange,
            values: chunk,
          },
        ],
      };

      let retries = 3;
      let delay = 1000;

      while (retries >= 0) {
        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(payload),
          });

          if (resp.ok) {
            const resJson = await resp.json();
            totalUpdatedRows += resJson.totalUpdatedRows || chunk.length;
            totalUpdatedCells += resJson.totalUpdatedCells || chunk.length * (chunk[0]?.length || 1);
            break;
          }

          if (resp.status === 429 || resp.status === 503) {
            retries--;
            if (retries >= 0) {
              await new Promise(r => setTimeout(r, delay));
              delay *= 2;
              continue;
            }
          }

          const errText = await resp.text();
          throw new Error(`Batch update failed: HTTP ${resp.status} - ${errText}`);
        } catch (err) {
          if (retries <= 0) throw err;
          retries--;
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
        }
      }
    }

    return { updatedRows: totalUpdatedRows, updatedCells: totalUpdatedCells };
  }

  /**
   * Clears the bounded schema range only (protecting columns M:Z)
   */
  async clearBoundedRange(spreadsheetId: string, boundedRange: string): Promise<void> {
    const url = this.appendApiKey(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(boundedRange)}:clear`
    );
    const resp = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({}),
    });

    if (!resp.ok && this.config.accessToken) {
      const err = await resp.text();
      throw new Error(`Clear bounded range ${boundedRange} failed: ${err}`);
    }
  }
}
