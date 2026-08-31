/**
 * Scope box limits derived from the canonical CowAg template
 * (114693 - TANK INSTALL - CRAIG LAWSON.xlsx).
 *
 * Quotation sheet merge A70:L82, Ebrima 14pt, combined row height ~277.5pt.
 * The sample scope in that file is 814 characters / 14 logical lines.
 */
export const SCOPE_MERGE_RANGE = "A70:L82" as const;
export const SCOPE_MAX_CHARACTERS = 814;
export const SCOPE_MAX_ESTIMATED_LINES = 17;
/** Approximate wrap width inside the merged A:L box at Ebrima 14pt */
export const SCOPE_CHARS_PER_LINE = 92;
export const SCOPE_BOX_HEIGHT_PT = 277.5;
export const SCOPE_EXPANDED_MAX_HEIGHT_PT = 320;

export interface ScopeCapacityStatus {
  charCount: number;
  maxCharacters: number;
  estimatedLines: number;
  maxLines: number;
  isOverLimit: boolean;
  percentUsed: number;
}

export function estimateWrappedLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").reduce((total, line) => {
    if (line.length === 0) return total + 1;
    return total + Math.ceil(line.length / SCOPE_CHARS_PER_LINE);
  }, 0);
}

export function getScopeCapacityStatus(text: string): ScopeCapacityStatus {
  const charCount = text.length;
  const estimatedLines = estimateWrappedLines(text);
  const charRatio = charCount / SCOPE_MAX_CHARACTERS;
  const lineRatio = estimatedLines / SCOPE_MAX_ESTIMATED_LINES;
  const percentUsed = Math.round(Math.max(charRatio, lineRatio) * 100);
  const isOverLimit = charCount > SCOPE_MAX_CHARACTERS || estimatedLines > SCOPE_MAX_ESTIMATED_LINES;

  return {
    charCount,
    maxCharacters: SCOPE_MAX_CHARACTERS,
    estimatedLines,
    maxLines: SCOPE_MAX_ESTIMATED_LINES,
    isOverLimit,
    percentUsed: Math.min(percentUsed, 999),
  };
}

/** Rows 70–81 in the template merge (12 rows at 15pt) */
const SCOPE_INNER_ROW_COUNT = 12;
const SCOPE_INNER_ROW_HEIGHT_PT = 15;

export function estimateScopeLastRowHeight(text: string): number {
  const status = getScopeCapacityStatus(text);
  if (!status.isOverLimit) {
    return 96;
  }
  const extraLines = Math.max(0, status.estimatedLines - SCOPE_MAX_ESTIMATED_LINES);
  const fixedRowsHeight = SCOPE_INNER_ROW_COUNT * SCOPE_INNER_ROW_HEIGHT_PT;
  const maxLastRowHeight = SCOPE_EXPANDED_MAX_HEIGHT_PT - fixedRowsHeight;
  return Math.max(96, Math.min(maxLastRowHeight, 96 + extraLines * 14));
}
