/**
 * 직무기술서 엑셀은 팀마다·연도마다 양식이 제각각이라 고정 헤더를 가정할 수
 * 없다. 그래서 파서는 "어떤 컬럼이 무슨 뜻인지"를 스스로 확정하지 않고,
 * 시트를 격자(grid) 그대로 돌려준 뒤 관리자가 화면에서 컬럼을 매핑한다.
 * 자동 추측(guessMapping)은 그 매핑의 초기값일 뿐이다.
 *
 * 이 파일은 매핑 UI가 클라이언트에서 실시간 미리보기를 그릴 수 있도록
 * xlsx 의존성 없는 순수 함수만 담는다 — 실제 워크북 파싱은
 * job-analysis-import.ts(서버 전용).
 */

export type SheetGrid = {
  name: string;
  /** 시트 원본 격자. 잘렸으면 truncated=true. */
  rows: string[][];
  truncated: boolean;
};

export type JobTaskField =
  | "teamName"
  | "category"
  | "name"
  | "detail"
  | "requiredGrade"
  | "outputs"
  | "relatedDept"
  | "legalBasis"
  | "frequency"
  | "annualCount"
  | "hoursPerRun"
  | "performerCount";

export type JobTaskFieldSpec = {
  key: JobTaskField;
  label: string;
  /** 매핑이 없으면 임포트 자체가 불가능한 컬럼. */
  required: boolean;
  /** 숫자로 파싱할 컬럼. */
  numeric?: boolean;
  /** 병합셀 탓에 빈칸이 되는 컬럼 — 위 행 값을 이어받는다. */
  fillDown?: boolean;
  /** 헤더 텍스트 자동 추측용 키워드. 긴 키워드가 더 강하게 매칭된다. */
  keywords: string[];
};

export const JOB_TASK_FIELDS: JobTaskFieldSpec[] = [
  {
    key: "teamName",
    label: "팀(직무)명",
    required: false,
    fillDown: true,
    keywords: ["팀명", "부서명", "소속부서", "직무명", "부서", "소속", "팀", "직무"],
  },
  {
    key: "category",
    label: "책임·역할(대분류)",
    required: false,
    fillDown: true,
    keywords: [
      "주요책무",
      "대분류",
      "중분류",
      "책임영역",
      "직무영역",
      "업무구분",
      "책무",
      "책임",
      "역할",
      "duty",
    ],
  },
  {
    key: "name",
    label: "단위업무명",
    required: true,
    keywords: ["단위업무", "세부업무", "담당업무", "업무명", "과업명", "소분류", "과업", "업무"],
  },
  {
    key: "detail",
    label: "세부 수행내용",
    required: false,
    // "직무설명"은 teamName의 "직무"(2자)보다 길어 여기서 먼저 잡힌다.
    keywords: [
      "직무설명",
      "직무기술",
      "수행내용",
      "업무내용",
      "세부내용",
      "상세내용",
      "업무설명",
      "내용",
      "설명",
    ],
  },
  {
    key: "requiredGrade",
    label: "적정직급",
    required: false,
    keywords: ["적정직급", "요구직급", "수행직급", "직급", "등급"],
  },
  {
    key: "outputs",
    label: "산출물",
    required: false,
    keywords: ["산출물", "결과물", "아웃풋", "output"],
  },
  {
    key: "relatedDept",
    label: "관련부서",
    required: false,
    keywords: ["관련부서", "유관부서", "협업부서", "협조부서"],
  },
  {
    key: "legalBasis",
    label: "근거 규정·법령",
    required: false,
    keywords: ["관련규정", "근거법령", "근거규정", "관련법규", "근거", "규정", "법령", "지침"],
  },
  {
    key: "frequency",
    label: "수행주기",
    required: false,
    keywords: ["수행주기", "주기", "빈도", "발생주기"],
  },
  {
    key: "annualCount",
    label: "연간 수행횟수",
    required: false,
    numeric: true,
    keywords: ["연간횟수", "연간건수", "수행횟수", "연간", "횟수", "건수"],
  },
  {
    key: "hoursPerRun",
    label: "1회 소요시간(h)",
    required: false,
    numeric: true,
    keywords: ["소요시간", "처리시간", "투입시간", "시간"],
  },
  {
    key: "performerCount",
    label: "수행인원",
    required: false,
    numeric: true,
    keywords: ["수행인원", "담당인원", "투입인원", "인원"],
  },
];

export const JOB_TASK_FIELD_LABEL = Object.fromEntries(
  JOB_TASK_FIELDS.map((f) => [f.key, f.label])
) as Record<JobTaskField, string>;

const FIELD_SPEC_BY_KEY = new Map(JOB_TASK_FIELDS.map((f) => [f.key, f]));

/** 필드 → 시트 컬럼 인덱스. 값이 없으면 "이 필드는 안 씀". */
export type ColumnMapping = Partial<Record<JobTaskField, number>>;

export type ParsedJobTaskRow = {
  /** 원본 시트의 행 번호(1-based) — 화면에서 문제 행을 짚어주기 위해 유지. */
  rowNumber: number;
  teamName: string | null;
  category: string | null;
  name: string;
  detail: string | null;
  requiredGrade: string | null;
  outputs: string | null;
  relatedDept: string | null;
  legalBasis: string | null;
  frequency: string | null;
  annualCount: number | null;
  hoursPerRun: number | null;
  performerCount: number | null;
};

/**
 * 헤더 행 추정: 사내 양식은 위쪽 몇 줄이 제목·작성일·결재란이라 1행이
 * 헤더가 아닌 경우가 흔하다. 앞부분에서 "채워진 셀이 가장 많은 행"을
 * 헤더로 본다(동점이면 더 위쪽). 어디까지나 초기값이고 화면에서 바꿀 수 있다.
 */
export function detectHeaderRow(rows: string[][]): number {
  const scanLimit = Math.min(rows.length, 15);
  let best = 0;
  let bestFilled = 0;
  for (let i = 0; i < scanLimit; i++) {
    const filled = rows[i].filter((c) => c !== "").length;
    if (filled > bestFilled) {
      bestFilled = filled;
      best = i;
    }
  }
  return best;
}

export function normalizeName(text: string): string {
  return text.toLowerCase().replace(/[\s()[\]{}·.,/\\-]/g, "");
}

/**
 * 헤더 텍스트로 필드를 자동 추측한다. (필드, 컬럼) 쌍마다 "매칭된 키워드
 * 길이"를 점수로 매기고 점수가 높은 쌍부터 확정하는 그리디 방식 —
 * "업무구분"이 category(키워드 '업무구분', 4자)와 name(키워드 '업무', 2자)에
 * 동시에 걸릴 때 더 구체적인 쪽이 이기게 하기 위함.
 */
export function guessMapping(headers: string[]): ColumnMapping {
  type Candidate = { field: JobTaskField; col: number; score: number };
  const candidates: Candidate[] = [];

  headers.forEach((header, col) => {
    const normalized = normalizeName(header);
    if (!normalized) return;
    for (const spec of JOB_TASK_FIELDS) {
      let score = 0;
      for (const keyword of spec.keywords) {
        const k = normalizeName(keyword);
        if (k && normalized.includes(k)) score = Math.max(score, k.length);
      }
      if (score > 0) candidates.push({ field: spec.key, col, score });
    }
  });

  candidates.sort((a, b) => b.score - a.score);

  const mapping: ColumnMapping = {};
  const usedCols = new Set<number>();
  for (const c of candidates) {
    if (mapping[c.field] !== undefined || usedCols.has(c.col)) continue;
    mapping[c.field] = c.col;
    usedCols.add(c.col);
  }
  return mapping;
}

function parseNumber(text: string): number | null {
  if (!text) return null;
  // "1,200", "8시간", "약 3회" 같은 표기에서 숫자만 추린다.
  const matched = text.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!matched) return null;
  const n = Number(matched[0]);
  return Number.isFinite(n) ? n : null;
}

export type BuildRowsResult = {
  rows: ParsedJobTaskRow[];
  /** 단위업무명이 비어 건너뛴 행 수 — 매핑이 틀렸을 때 바로 티가 나도록 보여준다. */
  skippedCount: number;
};

/**
 * 매핑을 적용해 저장 가능한 행으로 바꾼다. 단위업무명이 빈 행은 건너뛰고,
 * fillDown 필드(팀명·대분류)는 병합셀 때문에 생긴 빈칸을 위 행 값으로 채운다.
 */
export function buildRows(
  grid: SheetGrid,
  headerRowIndex: number,
  mapping: ColumnMapping
): BuildRowsResult {
  const rows: ParsedJobTaskRow[] = [];
  let skippedCount = 0;
  const carried: Partial<Record<JobTaskField, string>> = {};

  const read = (row: string[], field: JobTaskField): string => {
    const col = mapping[field];
    const value = col === undefined ? "" : (row[col] ?? "").trim();
    if (!FIELD_SPEC_BY_KEY.get(field)?.fillDown) return value;
    if (value) {
      carried[field] = value;
      return value;
    }
    return carried[field] ?? "";
  };

  for (let i = headerRowIndex + 1; i < grid.rows.length; i++) {
    const row = grid.rows[i];
    if (row.every((c) => c === "")) continue;

    // fillDown 필드는 이름이 비어 건너뛰는 행에서도 갱신돼야 하므로 먼저 읽는다.
    const teamName = read(row, "teamName");
    const category = read(row, "category");
    const name = read(row, "name");
    if (!name) {
      skippedCount++;
      continue;
    }

    rows.push({
      rowNumber: i + 1,
      teamName: teamName || null,
      category: category || null,
      name,
      detail: read(row, "detail") || null,
      requiredGrade: read(row, "requiredGrade") || null,
      outputs: read(row, "outputs") || null,
      relatedDept: read(row, "relatedDept") || null,
      legalBasis: read(row, "legalBasis") || null,
      frequency: read(row, "frequency") || null,
      annualCount: parseNumber(read(row, "annualCount")),
      hoursPerRun: parseNumber(read(row, "hoursPerRun")),
      performerCount: parseNumber(read(row, "performerCount")),
    });
  }

  return { rows, skippedCount };
}
