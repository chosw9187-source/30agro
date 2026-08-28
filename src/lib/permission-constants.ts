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

/**
 * 권한 매트릭스와 무관하게 ADMIN에게만 열리는 모듈. 사이드바에서 감추는
 * 것만으로는 URL을 직접 치고 들어오는 걸 막지 못하므로, 목록 계산
 * (getVisibleModules)과 화면 진입 검사(checkModuleAccess) 양쪽에서 같이
 * 막는다. 서버 액션도 checkModuleAccess를 거치므로 함께 잠긴다.
 *
 * 지금은 비어 있다 — 평가2(목표관리)를 팀장·팀원까지 열면서 뺐다. 평가2 안의
 * 층별 노출과 목록 범위는 직책으로 갈리고(lib/goals.ts), 편집 화면
 * (조직 목표 관리 / 평가대상자 관리)만 관리자로 남는다.
 */
export const ADMIN_ONLY_MODULES = new Set<Module>([]);

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
  | "TRAFFIC"
  | "ORG_GOALS"
  | "EVAL_TARGETS";

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
  { key: "ORG_GOALS", href: "/admin/org-goals", label: "조직 목표 관리" },
  { key: "EVAL_TARGETS", href: "/admin/eval-targets", label: "평가대상자 관리" },
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

/**
 * 인사카드(개인 상세) 열람의 **직책별 상한**.
 *
 * 조직도에서 이름을 눌러 들어가는 개인 상세 화면은 발령·학력·경력·자격·
 * 상벌까지 담고 있어서, 권한 매트릭스 설정과 무관하게 직책이 허용하는
 * 범위를 절대 넘지 못하게 막는다. 상한은 조직도에 그려지는 계층을 그대로
 * 따른다:
 *
 *   사장(CEO)          → 전사
 *   운영책임            → 본인 사업단위
 *   책임                → 본인 부문
 *   팀장                → 본인 팀(본인이 이끄는 팀 포함)
 *   담당                → 본인 정보만
 *
 * 관리자 역할(role=ADMIN)만 이 상한의 예외로 전 직원을 열람한다.
 * 권한 매트릭스/사용자별 개별 설정은 이 상한보다 **좁게만** 만들 수 있다.
 */
export const POSITION_CARD_SCOPE_CEILING: Record<Position, PermissionScope> = {
  CEO: "FULL",
  OPERATIONS_HEAD: "BUSINESS_UNIT",
  SENIOR_STAFF: "DIVISION",
  TEAM_LEADER: "TEAM",
  STAFF: "SELF",
};

/**
 * 상세 열람 관점에서 본 범위의 넓이(클수록 넓음). LIST_ONLY는 "목록만
 * 보이고 상세는 막힘"이라 상세 기준으로는 팀과 같은 칸에 둔다 — 같은 팀에
 * 한해 상세를 허용하는 기존 예외를 그대로 유지하기 위해서다.
 */
const CARD_SCOPE_WIDTH: Record<PermissionScope, number> = {
  NONE: 0,
  SELF: 1,
  LIST_ONLY: 2,
  TEAM: 2,
  DIVISION: 3,
  BUSINESS_UNIT: 4,
  FULL: 5,
};

/** 두 범위 중 더 좁은 쪽을 고른다(같은 넓이면 앞의 값). */
export function narrowerCardScope(a: PermissionScope, b: PermissionScope): PermissionScope {
  return CARD_SCOPE_WIDTH[a] <= CARD_SCOPE_WIDTH[b] ? a : b;
}
