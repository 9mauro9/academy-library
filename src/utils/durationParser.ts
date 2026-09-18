/**
 * Duration & Normalization Utility
 *
 * Implements resilient parsing and bidirectional conversion between irregular
 * human-entered spreadsheet strings (HH:MM:SS, MM:SS, text minutes/hours, decimals)
 * and strict ISO 8601 duration representations (e.g., PT00H14M45S).
 */

import type { Iso8601Duration } from '../types/syncEngine';

/**
 * Standard Zero Duration Constant
 */
export const ZERO_ISO_DURATION: Iso8601Duration = 'PT00H00M00S';

/**
 * Pads a number to at least 2 digits (e.g., 5 -> "05")
 */
function pad2(n: number): string {
  const rounded = Math.floor(Math.max(0, n));
  return rounded < 10 ? `0${rounded}` : `${rounded}`;
}

/**
 * Converts total seconds into standard ISO 8601 format: PT##H##M##S
 * Guarantees 2-digit zero padding for hours, minutes, and seconds.
 *
 * Example:
 *  885 -> "PT00H14M45S"
 *  4800 -> "PT01H20M00S"
 */
export function secondsToIso8601(totalSeconds: number): Iso8601Duration {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return ZERO_ISO_DURATION;
  }

  const roundedSecs = Math.round(totalSeconds);
  const hours = Math.floor(roundedSecs / 3600);
  const minutes = Math.floor((roundedSecs % 3600) / 60);
  const seconds = roundedSecs % 60;

  return `PT${pad2(hours)}H${pad2(minutes)}M${pad2(seconds)}S`;
}

/**
 * Parses an ISO 8601 duration string back into total integer seconds.
 * Supports both padded format (PT00H14M45S) and variable length (PT1H20M, PT45S, PT15M).
 */
export function iso8601ToSeconds(isoString: string): number {
  if (!isoString || typeof isoString !== 'string') {
    return 0;
  }

  const trimmed = isoString.trim().toUpperCase();
  if (!trimmed.startsWith('PT')) {
    return 0;
  }

  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/;
  const match = trimmed.match(regex);
  if (!match) {
    return 0;
  }

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = match[3] ? Math.round(parseFloat(match[3])) : 0;

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Resilient parser that extracts total seconds from varied and irregular human entries:
 *  - "00:14:45", "1:20:00", "01:20:00"
 *  - "14:45", "05:30"
 *  - "14:45.5" (decimal seconds)
 *  - "15m", "15 mins", "15 min", "20 minutes"
 *  - "1.5h", "1.5 hrs", "2 hours"
 *  - "1h 20m 45s", "15m 30s"
 *  - Raw numbers (e.g., 900 for seconds, or Excel fraction 0.0104166 for time)
 *  - Blank, null, undefined, "N/A" -> 0
 */
export function parseDurationToSeconds(input: unknown): number {
  if (input === null || input === undefined) {
    return 0;
  }

  // If already a number
  if (typeof input === 'number') {
    if (isNaN(input) || input <= 0) return 0;
    // Heuristic: Excel serial day fraction (e.g. 0.010416666 = 15 mins)
    if (input > 0 && input < 1) {
      return Math.round(input * 86400);
    }
    return Math.round(input);
  }

  const raw = String(input).trim();
  if (!raw || raw.toLowerCase() === 'n/a' || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'none') {
    return 0;
  }

  // Check if input is already ISO 8601 (e.g., PT00H14M45S)
  if (raw.toUpperCase().startsWith('PT')) {
    return iso8601ToSeconds(raw);
  }

  // 1. Check for compound text formats: e.g., "1h 20m 30s", "1hr 15min", "45s"
  const compoundHourMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/i);
  const compoundMinMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)/i);
  const compoundSecMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)/i);

  if (compoundHourMatch || compoundMinMatch || compoundSecMatch) {
    let secs = 0;
    if (compoundHourMatch) secs += parseFloat(compoundHourMatch[1]) * 3600;
    if (compoundMinMatch) secs += parseFloat(compoundMinMatch[1]) * 60;
    if (compoundSecMatch) secs += parseFloat(compoundSecMatch[1]);
    return Math.round(secs);
  }

  // 2. Check for colon-delimited formats (HH:MM:SS or MM:SS)
  if (raw.includes(':')) {
    const parts = raw.split(':').map(p => p.trim());
    if (parts.length === 3) {
      // HH:MM:SS (possibly with decimal seconds like 00:14:45.5)
      const h = parseFloat(parts[0]) || 0;
      const m = parseFloat(parts[1]) || 0;
      const s = parseFloat(parts[2]) || 0;
      return Math.round(h * 3600 + m * 60 + s);
    } else if (parts.length === 2) {
      // MM:SS
      const m = parseFloat(parts[0]) || 0;
      const s = parseFloat(parts[1]) || 0;
      return Math.round(m * 60 + s);
    }
  }

  // 3. Check for standalone numeric string
  const num = parseFloat(raw);
  if (!isNaN(num) && num > 0) {
    // If it has decimal and < 1, assume Excel serial time
    if (num > 0 && num < 1) {
      return Math.round(num * 86400);
    }
    // If number is small (< 120) and no units, in curriculum tracking it's commonly minutes
    // However, if >= 120, could be seconds.
    // If string originally had words like "minutes" it was caught above.
    // If it's pure integer <= 180, check if likely minutes:
    // Human editors writing "15" in duration column mean 15 minutes.
    if (num <= 180 && !raw.includes('.')) {
      return Math.round(num * 60);
    }
    return Math.round(num);
  }

  return 0;
}

/**
 * Normalizes any irregular duration input into the definitive ISO 8601 Duration format.
 * Guarantees PT##H##M##S format.
 *
 * Examples:
 *  "00:14:45"  -> "PT00H14M45S"
 *  "14:45"     -> "PT00H14M45S"
 *  "01:20:00"  -> "PT01H20M00S"
 *  "15 mins"   -> "PT00H15M00S"
 *  "" / null   -> "PT00H00M00S"
 */
export function normalizeToIso8601Duration(input: unknown): Iso8601Duration {
  const seconds = parseDurationToSeconds(input);
  return secondsToIso8601(seconds);
}

/**
 * Formats a duration into a human-readable display string (e.g., "14m 45s", "1h 20m 00s").
 * Useful for side-by-side reconciliation tables in the admin UI.
 */
export function formatDurationDisplay(input: unknown): string {
  const seconds = typeof input === 'string' && input.startsWith('PT')
    ? iso8601ToSeconds(input)
    : parseDurationToSeconds(input);

  if (seconds <= 0) {
    return '0m 00s';
  }

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}h ${pad2(m)}m ${pad2(s)}s`;
  }
  return `${m}m ${pad2(s)}s`;
}

/**
 * Validates whether a given string is a valid ISO 8601 duration
 */
export function isValidIso8601Duration(val: string): boolean {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim().toUpperCase();
  if (!trimmed.startsWith('PT') || trimmed === 'PT') return false;
  return /^PT(?:(?:\d+(?:\.\d+)?H)?(?:\d+(?:\.\d+)?M)?(?:\d+(?:\.\d+)?S)?)$/.test(trimmed);
}

