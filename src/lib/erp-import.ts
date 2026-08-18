import * as XLSX from "xlsx";
import type { Position } from "@/lib/permission-constants";
import { TEAM_MAPPING_NONE } from "@/lib/erp-constants";
import { readWorkbook } from "@/lib/xlsx-read";

export type RawErpRow = Record<string, string>;

const REQUIRED_HEADER = "사번";

/** 시스템 어디에서도 쓰지 않는 민감정보 컬럼 — 저장 자체를 하지 않는다. */
const EXCLUDED_HEADERS = ["주민등록번호", "주민번호"];

/**
 * ERP "사원명부조회" 원본 엑셀은 1행이 리포트 제목, 2행이 실제 헤더라서
 * 고정 인덱스 대신 "사번" 컬럼이 있는 행을 헤더로 찾아 파싱한다 —
 * 리포트 양식이 살짝 바뀌어도(제목 행 추가/삭제 등) 안전하도록.
 */
export function parseErpWorkbook(buffer: Buffer): RawErpRow[] {
  const workbook = readWorkbook(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

  const headerIndex = rows.findIndex(
    (r) => Array.isArray(r) && r.some((c) => String(c).trim() === REQUIRED_HEADER)
  );
  if (headerIndex === -1) {
    throw new Error(`헤더 행을 찾을 수 없습니다 ('${REQUIRED_HEADER}' 컬럼이 있는 행이 없음).`);
  }
  const header = rows[headerIndex] as unknown[];
  const empColIdx = header.findIndex((h) => String(h).trim() === REQUIRED_HEADER);

  return rows
    .slice(headerIndex + 1)
    .filter((r) => Array.isArray(r) && String((r as unknown[])[empColIdx] ?? "").trim())
    .map((r) => {
      const arr = r as unknown[];
      const obj: RawErpRow = {};
      header.forEach((h, i) => {
        const key = String(h ?? "").trim();
        if (!key || EXCLUDED_HEADERS.includes(key)) return;
        const v = arr[i];
        obj[key] = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").trim();
      });
      return obj;
    });
}

function parseErpDate(text: string): Date | null {
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeGender(text: string): string | undefined {
  if (text === "남자" || text === "남") return "남";
  if (text === "여자" || text === "여") return "여";
  return undefined;
}

export type ErpTransformed = {
  employeeNumber: string;
  name: string;
  isActive: boolean;
  email?: string;
  gender?: string;
  birthDate?: Date;
  hireDate?: Date;
  employmentType?: string;
  jobGrade?: string;
  jobFamily?: string;
  educationLevel?: string;
  school?: string;
  major?: string;
  degree?: string;
  terminationDateRaw: Date | null;
  positionRawKey: string;
  teamRawKey: string;
};

export function transformErpRow(row: RawErpRow): ErpTransformed {
  const get = (k: string) => (row[k] ?? "").trim();
  return {
    employeeNumber: get("사번"),
    name: get("사원"),
    isActive: get("재직/퇴직구분") === "재직자",
    email: get("이메일") || undefined,
    gender: normalizeGender(get("성별")),
    birthDate: parseErpDate(get("생년월일")) ?? undefined,
    hireDate: parseErpDate(get("입사일")) ?? undefined,
    employmentType: get("사원구분") || undefined,
    jobGrade: get("직급") || undefined,
    jobFamily: get("직무") || undefined,
    educationLevel: get("학력") || undefined,
    school: get("학교") || undefined,
    major: get("전공") || undefined,
    degree: get("학위") || undefined,
    terminationDateRaw: parseErpDate(get("퇴사일")),
    positionRawKey: `${get("직책")}|${get("직위")}`,
    teamRawKey: get("부서"),
  };
}

/**
 * 직책·직위 조합(예: "팀장|팀장", "팀원|담당")으로 Position을 해석한다.
 * 순서: (1) 관리자가 지정해둔 ErpFieldMapping, (2) 직책 문구가 우리
 * Position 라벨과 정확히 같은 명백한 경우(팀장/책임/운영책임), (3) 직위가
 * "담당"이거나 직책이 평사원급("팀원"/"계약사원")인 경우 STAFF.
 * 그 외(임원/본부장/부서장 등)는 애매하므로 매핑 필요로 남긴다.
 */
export function resolvePosition(
  positionRawKey: string,
  dbMap: Map<string, string>
): { position: Position | null; needsMapping: boolean } {
  const fromDb = dbMap.get(positionRawKey);
  if (fromDb) return { position: fromDb as Position, needsMapping: false };

  const [jikchaek, jikwi] = positionRawKey.split("|");
  if (jikchaek === "팀장") return { position: "TEAM_LEADER", needsMapping: false };
  if (jikchaek === "책임") return { position: "SENIOR_STAFF", needsMapping: false };
  if (jikchaek === "운영책임") return { position: "OPERATIONS_HEAD", needsMapping: false };
  if (jikwi === "담당") return { position: "STAFF", needsMapping: false };
  if (jikchaek === "팀원" || jikchaek === "계약사원") return { position: "STAFF", needsMapping: false };

  return { position: null, needsMapping: true };
}

/**
 * ERP 부서명을 기존 Team.name과 매칭한다. 정확히 일치하는 팀이 있으면
 * 그 팀(과 그 팀에 이미 지정된 사업단위/본부)을 그대로 쓰고, 없으면
 * 관리자가 매핑 화면에서 기존 팀 연결/신규 생성/미배정을 선택하게 한다.
 */
export function resolveTeam(
  teamRawKey: string,
  existingTeamsByName: Map<string, string>,
  dbMap: Map<string, string>
): { teamId: string | null; needsMapping: boolean } {
  if (!teamRawKey) return { teamId: null, needsMapping: false };

  const fromDb = dbMap.get(teamRawKey);
  if (fromDb !== undefined) {
    return { teamId: fromDb === TEAM_MAPPING_NONE ? null : fromDb, needsMapping: false };
  }

  const matched = existingTeamsByName.get(teamRawKey);
  if (matched) return { teamId: matched, needsMapping: false };

  return { teamId: null, needsMapping: true };
}

export type FieldDiff = { field: string; label: string; before: unknown; after: unknown };

export const FIELD_LABEL: Record<string, string> = {
  name: "이름",
  email: "이메일",
  gender: "성별",
  birthDate: "생년월일",
  hireDate: "입사일",
  terminationDate: "퇴사일",
  employmentType: "사원구분",
  jobGrade: "직급",
  jobFamily: "직군",
  educationLevel: "학력",
  school: "학교",
  major: "전공",
  degree: "학위",
  position: "직책",
  teamId: "팀",
  businessUnit: "사업단위",
  division: "본부",
  hiddenFromDirectory: "조직도·직원조회 숨김",
};

export function normalizeForCompare(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

/** Date 등을 포함한 diff를 Prisma Json 컬럼에 저장 가능한 순수 JSON 값으로 변환한다. */
export function toJsonSafe(value: unknown): object {
  return JSON.parse(JSON.stringify(value));
}

/** next에서 undefined인 필드는 "ERP가 값을 안 줌 = 건드리지 않음"이라 diff에서 제외한다. */
export function computeDiff(
  existing: Record<string, unknown> | null,
  next: Record<string, unknown>
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const [field, after] of Object.entries(next)) {
    if (after === undefined) continue;
    const before = existing ? existing[field] : null;
    if (normalizeForCompare(before) !== normalizeForCompare(after)) {
      diffs.push({ field, label: FIELD_LABEL[field] ?? field, before: before ?? null, after });
    }
  }
  return diffs;
}
