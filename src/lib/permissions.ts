import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

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

export type HomeBlock = "TEAM_SUMMARY" | "OVERALL_SUMMARY" | "QUICK_LINKS";

export const HOME_BLOCKS: HomeBlock[] = [
  "TEAM_SUMMARY",
  "OVERALL_SUMMARY",
  "QUICK_LINKS",
];

export const HOME_BLOCK_LABEL: Record<HomeBlock, string> = {
  TEAM_SUMMARY: "팀별 종합",
  OVERALL_SUMMARY: "전체 요약",
  QUICK_LINKS: "바로가기",
};

/**
 * Admins always see everything — the matrix only restricts non-admin
 * positions. Absence of a row means "visible" (matches the "저장 안 하면
 * 지금 그대로" default from the reference platform).
 */
export async function getVisibleModules(
  role: string,
  position: Position
): Promise<Set<Module>> {
  if (role === "ADMIN") return new Set(MODULES);

  const hidden = await prisma.permissionMatrixEntry.findMany({
    where: { position, visible: false },
    select: { module: true },
  });
  const hiddenSet = new Set(hidden.map((h) => h.module as Module));
  return new Set(MODULES.filter((m) => !hiddenSet.has(m)));
}

export async function canAccessModule(
  role: string,
  position: Position,
  module: Module
): Promise<boolean> {
  const visible = await getVisibleModules(role, position);
  return visible.has(module);
}

/**
 * For use at the top of a /platform/* page to check whether the current
 * user's position is allowed to see this module, independent of whether
 * the sidebar link is shown (direct-URL access must be blocked too).
 */
export async function checkModuleAccess(module: Module): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  if (session.user.role === "ADMIN") return true;

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { position: true },
  });
  const position = (dbUser?.position ?? "STAFF") as Position;
  return canAccessModule(session.user.role, position, module);
}

export async function getVisibleHomeBlocks(
  role: string,
  position: Position
): Promise<Set<HomeBlock>> {
  if (role === "ADMIN") return new Set(HOME_BLOCKS);

  const hidden = await prisma.homeLayoutEntry.findMany({
    where: { position, visible: false },
    select: { block: true },
  });
  const hiddenSet = new Set(hidden.map((h) => h.block as HomeBlock));
  return new Set(HOME_BLOCKS.filter((b) => !hiddenSet.has(b)));
}
