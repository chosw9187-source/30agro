export type Position =
  | "CEO"
  | "OPERATIONS_HEAD"
  | "SENIOR_STAFF"
  | "TEAM_LEADER"
  | "STAFF";

export const POSITIONS: Position[] = [
  "CEO",
  "OPERATIONS_HEAD",
  "SENIOR_STAFF",
  "TEAM_LEADER",
  "STAFF",
];

export const POSITION_LABEL: Record<Position, string> = {
  CEO: "사장",
  OPERATIONS_HEAD: "운영책임",
  SENIOR_STAFF: "책임",
  TEAM_LEADER: "팀장",
  STAFF: "담당",
};

export type Module =
  | "EMPLOYEES"
  | "ORG_CHART"
  | "JOB_MANAGEMENT"
  | "TASK_MANAGEMENT"
  | "LEGAL_LIBRARY"
  | "HR_REPORT"
  | "EVALUATION";

export const MODULES: Module[] = [
  "EMPLOYEES",
  "ORG_CHART",
  "JOB_MANAGEMENT",
  "TASK_MANAGEMENT",
  "LEGAL_LIBRARY",
  "HR_REPORT",
  "EVALUATION",
];

export const MODULE_LABEL: Record<Module, string> = {
  EMPLOYEES: "직원정보 조회",
  ORG_CHART: "조직도",
  JOB_MANAGEMENT: "직무관리",
  TASK_MANAGEMENT: "업무 관리",
  LEGAL_LIBRARY: "AI 법률 라이브러리",
  HR_REPORT: "HR REPORT",
  EVALUATION: "평가",
};

export type PermissionScope =
  | "NONE"
  | "SELF"
  | "TEAM"
  | "DIVISION"
  | "BUSINESS_UNIT"
  | "FULL";

export const PERMISSION_SCOPES: PermissionScope[] = [
  "FULL",
  "BUSINESS_UNIT",
  "DIVISION",
  "TEAM",
  "SELF",
  "NONE",
];

export const PERMISSION_SCOPE_LABEL: Record<PermissionScope, string> = {
  FULL: "전체",
  BUSINESS_UNIT: "사업단위",
  DIVISION: "부문",
  TEAM: "팀",
  SELF: "본인",
  NONE: "접근 불가",
};

/**
 * Sidebar main-nav modules that support admin-configurable order and a
 * "개발 중" badge. 홈/알림 aren't modules and are always first/last.
 */
export const SIDEBAR_MODULES: Module[] = [
  "HR_REPORT",
  "ORG_CHART",
  "JOB_MANAGEMENT",
  "TASK_MANAGEMENT",
  "EMPLOYEES",
  "LEGAL_LIBRARY",
  "EVALUATION",
];

// Starting default until an admin explicitly overrides it: everything shows
// "개발 중" except 조직도/직원정보조회, which are considered ready.
export const DEFAULT_COMING_SOON_MODULES = new Set<Module>([
  "HR_REPORT",
  "JOB_MANAGEMENT",
  "TASK_MANAGEMENT",
  "LEGAL_LIBRARY",
]);

export type ModuleUiConfigEntry = { order: number; comingSoon: boolean };

export type HomeBlock = "TEAM_SUMMARY" | "OVERALL_SUMMARY" | "QUICK_LINKS";

export const HOME_BLOCKS: HomeBlock[] = [
  "TEAM_SUMMARY",
  "OVERALL_SUMMARY",
  "QUICK_LINKS",
];

export const HOME_BLOCK_LABEL: Record<HomeBlock, string> = {
  TEAM_SUMMARY: "직군별 종합 · 조직 현황",
  OVERALL_SUMMARY: "전체 요약 · 오늘 처리할 일",
  QUICK_LINKS: "바로가기",
};
