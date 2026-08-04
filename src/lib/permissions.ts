import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import {
  MODULES,
  HOME_BLOCKS,
  type Position,
  type Module,
  type HomeBlock,
} from "@/lib/permission-constants";

export {
  POSITIONS,
  POSITION_LABEL,
  MODULES,
  MODULE_LABEL,
  HOME_BLOCKS,
  HOME_BLOCK_LABEL,
  type Position,
  type Module,
  type HomeBlock,
} from "@/lib/permission-constants";

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

const EXECUTIVE_POSITIONS: Position[] = ["CEO", "OPERATIONS_HEAD", "SENIOR_STAFF"];

/**
 * 인사카드(개인 인사정보) 열람 권한: 본인, 관리자, 임원급(사장/운영책임/책임),
 * 인사팀 소속은 전체 열람 가능. 팀장은 본인 팀 소속만 열람 가능. 그 외
 * 일반 직원은 본인만 열람 가능.
 */
export async function canViewEmployeeCard(targetUserId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  if (session.user.id === targetUserId) return true;
  if (session.user.role === "ADMIN") return true;

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { position: true, team: { select: { name: true } } },
  });
  if (!viewer) return false;
  if (EXECUTIVE_POSITIONS.includes(viewer.position as Position)) return true;
  if (viewer.team?.name === "인사팀") return true;

  if (viewer.position === "TEAM_LEADER") {
    const [viewerRow, target] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.user.id }, select: { teamId: true } }),
      prisma.user.findUnique({ where: { id: targetUserId }, select: { teamId: true } }),
    ]);
    return !!viewerRow?.teamId && viewerRow.teamId === target?.teamId;
  }

  return false;
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
