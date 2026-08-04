import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import {
  MODULES,
  HOME_BLOCKS,
  type Position,
  type Module,
  type HomeBlock,
  type PermissionScope,
} from "@/lib/permission-constants";

export {
  POSITIONS,
  POSITION_LABEL,
  MODULES,
  MODULE_LABEL,
  HOME_BLOCKS,
  HOME_BLOCK_LABEL,
  PERMISSION_SCOPES,
  PERMISSION_SCOPE_LABEL,
  type Position,
  type Module,
  type HomeBlock,
  type PermissionScope,
} from "@/lib/permission-constants";

/**
 * Per-module access scope for a position: how much data that position can
 * see within a module, from 전체(FULL) down to 본인(SELF) or 접근
 * 불가(NONE). Admins always get FULL. Absence of a configured row also
 * means FULL (matches the "저장 안 하면 지금 그대로" default from the
 * reference platform — nothing is restricted until an admin sets it).
 */
export async function getModuleScope(
  role: string,
  position: Position,
  module: Module
): Promise<PermissionScope> {
  if (role === "ADMIN") return "FULL";

  const entry = await prisma.permissionMatrixEntry.findUnique({
    where: { position_module: { position, module } },
    select: { scope: true },
  });
  return (entry?.scope as PermissionScope) ?? "FULL";
}

export async function getVisibleModules(
  role: string,
  position: Position
): Promise<Set<Module>> {
  if (role === "ADMIN") return new Set(MODULES);

  const entries = await prisma.permissionMatrixEntry.findMany({
    where: { position, module: { in: MODULES } },
    select: { module: true, scope: true },
  });
  const scopeByModule = new Map(entries.map((e) => [e.module as Module, e.scope as PermissionScope]));
  return new Set(MODULES.filter((m) => (scopeByModule.get(m) ?? "FULL") !== "NONE"));
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

type ViewerContext = {
  teamId: string | null;
  division: string | null;
  businessUnit: string | null;
};

async function loadViewerContext(userId: string): Promise<ViewerContext | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      teamId: true,
      businessUnit: true,
      division: true,
      team: { select: { businessUnit: true, division: true } },
    },
  });
  if (!row) return null;
  return {
    teamId: row.teamId,
    division: row.team?.division ?? row.division ?? null,
    businessUnit: row.team?.businessUnit ?? row.businessUnit ?? null,
  };
}

/**
 * 인사카드(개인 인사정보) 열람 권한: 본인·관리자·인사팀 소속은 항상 전체
 * 열람 가능. 그 외에는 사용자 관리 > 권한 매트릭스에서 직책별로 설정한
 * EMPLOYEES 모듈 범위(전체/사업단위/부문/팀/본인/접근 불가)를 따른다.
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
  if (viewer.team?.name === "인사팀") return true;

  const scope = await getModuleScope(session.user.role, viewer.position as Position, "EMPLOYEES");
  if (scope === "NONE" || scope === "SELF") return false;
  if (scope === "FULL") return true;

  const [viewerCtx, targetCtx] = await Promise.all([
    loadViewerContext(session.user.id),
    loadViewerContext(targetUserId),
  ]);
  if (!viewerCtx || !targetCtx) return false;

  if (scope === "TEAM") return !!viewerCtx.teamId && viewerCtx.teamId === targetCtx.teamId;
  if (scope === "DIVISION") return !!viewerCtx.division && viewerCtx.division === targetCtx.division;
  if (scope === "BUSINESS_UNIT")
    return !!viewerCtx.businessUnit && viewerCtx.businessUnit === targetCtx.businessUnit;

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
