import * as XLSX from "xlsx";
import { readWorkbook } from "@/lib/xlsx-read";
import type { SheetGrid } from "@/lib/job-analysis-fields";

/**
 * 직무기술서 엑셀 워크북을 "격자 그대로" 읽는다 — 컬럼의 의미 해석은 하지
 * 않는다(그건 화면에서 관리자가 매핑한다, job-analysis-fields.ts 참고).
 * xlsx 의존성이 있어 서버에서만 쓴다.
 */

/** 매핑 화면으로 넘기는 payload가 지나치게 커지지 않도록 자르는 상한. */
export const MAX_ROWS_PER_SHEET = 3000;
export const MAX_COLS_PER_SHEET = 60;

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\s+/g, " ").trim();
}

export function parseWorkbookGrids(buffer: Buffer): SheetGrid[] {
  const workbook = readWorkbook(buffer);

  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    const truncated = raw.length > MAX_ROWS_PER_SHEET;
    const rows = raw
      .slice(0, MAX_ROWS_PER_SHEET)
      .map((r) => (Array.isArray(r) ? r : []).slice(0, MAX_COLS_PER_SHEET).map(cellToText));

    // 행마다 길이가 달라 컬럼 선택 UI가 들쭉날쭉해지므로 최대 폭에 맞춰 패딩한다.
    const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
    return {
      name,
      rows: rows.map((r) => (r.length === width ? r : [...r, ...Array(width - r.length).fill("")])),
      truncated,
    };
  });
}
