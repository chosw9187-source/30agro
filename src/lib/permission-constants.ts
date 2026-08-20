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

/** 조직도에서 팀 트리 대신 상단 경영진 영역에 별도로 표시되는 직책. */
export const EXECUTIVE_POSITIONS: Position[] = ["CEO", "OPERATIONS_HEAD", "SENIOR_STAFF"];

export type Module =
  | "EMPLOYEES"
  | "ORG_CHART"
  | "JOB_MANAGEMENT"
  | "TASK_MANAGEMENT"
  | "LEGAL_LIBRARY"
  | "HR_REPORT"
  | "EVALUATION"
  | "EVALUATION_V2"
  | "TALENT_ASSESSMENT"
  | "ONBOARDING";

export const MODULES: Module[] = [
  "EMPLOYEES",
  "ORG_CHART",
  "JOB_MANAGEMENT",
  "TASK_MANAGEMENT",
  "LEGAL_LIBRARY",
  "HR_REPORT",
  "EVALUATION",
  "EVALUATION_V2",
  "TALENT_ASSESSMENT",
  "ONBOARDING",
];

export const MODULE_LABEL: Record<Module, string> = {
  EMPLOYEES: "직원정보 조회",
  ORG_CHART: "조직도",
  JOB_MANAGEMENT: "직무관리",
  TASK_MANAGEMENT: "업무 관리",
  LEGAL_LIBRARY: "인사 규정 챗봇",
  HR_REPORT: "HR REPORT",
  EVALUATION: "평가",
  EVALUATION_V2: "평가2",
  TALENT_ASSESSMENT: "SG 인적성검사",
  ONBOARDING: "온보딩 프로그램",
};

export type PermissionScope =
  | "NONE"
  | "SELF"
  | "TEAM"
  | "DIVISION"
  | "BUSINESS_UNIT"
  | "FULL"
  | "LIST_ONLY";

export const PERMISSION_SCOPES: PermissionScope[] = [
  "FULL",
  "LIST_ONLY",
  "BUSINESS_UNIT",
  "DIVISION",
  "TEAM",
  "SELF",
  "NONE",
];

export const PERMISSION_SCOPE_LABEL: Record<PermissionScope, string> = {
  FULL: "전체",
  LIST_ONLY: "목록만(상세 비공개)",
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
  "EVALUATION_V2",
  "TALENT_ASSESSMENT",
  "ONBOARDING",
];

// Starting default until an admin explicitly overrides it: everything shows
// "개발 중" except 조직도/직원정보조회, which are considered ready.
export const DEFAULT_COMING_SOON_MODULES = new Set<Module>([
  "HR_REPORT",
  "JOB_MANAGEMENT",
  "LEGAL_LIBRARY",
  "EVALUATION_V2",
]);

export type ModuleUiConfigEntry = { order: number; comingSoon: boolean; hidden: boolean };

/** 사이드바 "관리" 섹션 항목 — ADMIN 역할에게만 보이는 관리자 전용 메뉴. */
export type AdminMenuKey =
  | "USERS"
  | "TEAMS"
  | "DATA_UPLOAD"
  | "TEMPLATES"
  | "CYCLES"
  | "REPORTS"
  | "PERMISSION_MATRIX"
  | "SCREEN_CONFIG"
  | "TRAFFIC";

export const ADMIN_MENU_ITEMS: { key: AdminMenuKey; href: string; label: string }[] = [
  { key: "USERS", href: "/admin/users", label: "사용자 관리" },
  { key: "TEAMS", href: "/admin/teams", label: "팀 관리" },
  { key: "DATA_UPLOAD", href: "/platform/data-upload", label: "데이터 업로드" },
  { key: "TEMPLATES", href: "/admin/templates", label: "평가 템플릿" },
  { key: "CYCLES", href: "/admin/cycles", label: "평가 사이클" },
  { key: "REPORTS", href: "/admin/reports", label: "결과 다운로드" },
  { key: "PERMISSION_MATRIX", href: "/admin/permission-matrix", label: "권한 매트릭스" },
  { key: "SCREEN_CONFIG", href: "/admin/screen-config", label: "화면 구성" },
  { key: "TRAFFIC", href: "/admin/traffic", label: "일일 트래픽" },
];

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
