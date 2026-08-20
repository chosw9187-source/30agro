import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import {
  MODULES,
  HOME_BLOCKS,
  SIDEBAR_MODULES,
  ADMIN_ONLY_MODULES,
  DEFAULT_COMING_SOON_MODULES,
  type Position,
  type Module,
  type HomeBlock,
  type PermissionScope,
  type ModuleUiConfigEntry,
  type AdminMenuKey,
} from "@/lib/permission-constants";

export {
  POSITIONS,
  POSITION_LABEL,
  EXECUTIVE_POSITIONS,
  MODULES,
  MODULE_LABEL,
  HOME_BLOCKS,
  HOME_BLOCK_LABEL,
  PERMISSION_SCOPES,
  PERMISSION_SCOPE_LABEL,
  SIDEBAR_MODULES,
  ADMIN_MENU_ITEMS,
  ADMIN_ONLY_MODULES,
  type Position,
  type Module,
  type HomeBlock,
  type PermissionScope,
  type ModuleUiConfigEntry,
  type AdminMenuKey,
} from "@/lib/permission-constants";

/**
 * Per-module access scope for a position: how much data that position can
 * see within a module, from 전체(FULL) down to 본인(SELF) or 접근
 * 불가(NONE). Absence of a configured row means FULL (matches the "저장
 * 안 하면 지금 그대로" default from the reference platform — nothing is
 * restricted until an admin sets it). This is the position-level default;
 * see getEffectiveModuleScope for the per-user-override-aware version.
 */
async function getPositionModuleScope(position: Position, module: Module): Promise<PermissionScope> {
  const entry = await prisma.permissionMatrixEntry.findUnique({
    where: { position_module: { position, module } },
    select: { scope: true },
  });
  return (entry?.scope as PermissionScope) ?? "FULL";
}

/**
 * Effective scope for a specific user in a module: a per-user override (set
 * in 권한 매트릭스 > 사용자별) wins if present, otherwise falls back to the
 * position's row in the matrix. Admins always get FULL.
 */
export async function getEffectiveModuleScope(
  userId: string,
  role: string,
  position: Position,
  module: Module
): Promise<PermissionScope> {
  if (role === "ADMIN") return "FULL";
  if (ADMIN_ONLY_MODULES.has(module)) return "NONE";

  const override = await prisma.userPermissionOverride.findUnique({
    where: { userId_module: { userId, module } },
    select: { scope: true },
  });
  if (override) return override.scope as PermissionScope;

  return getPositionModuleScope(position, module);
}

export async function getVisibleModules(
  userId: string,
  role: string,
  position: Position
): Promise<Set<Module>> {
  if (role === "ADMIN") return new Set(MODULES);

  const [entries, overrides] = await Promise.all([
    prisma.permissionMatrixEntry.findMany({
      where: { position, module: { in: MODULES } },
      select: { module: true, scope: true },
    }),
    prisma.userPermissionOverride.findMany({
      where: { userId, module: { in: MODULES } },
      select: { module: true, scope: true },
    }),
  ]);
  const scopeByModule = new Map(entries.map((e) => [e.module as Module, e.scope as PermissionScope]));
  for (const o of overrides) scopeByModule.set(o.module as Module, o.scope as PermissionScope);

  return new Set(
    MODULES.filter(
      (m) => !ADMIN_ONLY_MODULES.has(m) && (scopeByModule.get(m) ?? "FULL") !== "NONE"
    )
  );
}

/**
 * For use at the top of a /platform/* page to check whether the current
 * user is allowed to see this module, independent of whether the sidebar
 * link is shown (direct-URL access must be blocked too).
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
  const scope = await getEffectiveModuleScope(session.user.id, session.user.role, position, module);
  return scope !== "NONE";
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
 * 열람 가능. 회장/부회장/사장(Position.CEO)의 인사카드는 본인·관리자
 * 외에는 인사팀을 포함해 누구에게도 보이지 않는다. 그 외에는 권한
 * 매트릭스에서 설정한 EMPLOYEES 모듈 범위(전체/사업단위/부문/팀/본인/
 * 목록만/접근 불가)를 따르며, 사용자별로 개별 지정된 값이 있으면 직책
 * 기본값보다 우선한다(예: 특정 HR 임원은 부문장이라도 전체 열람 가능하도록
 * 개별 설정). LIST_ONLY는 목록 조회는 전 직원에게 열어두되 상세 카드는
 * 원래 막는 범위지만, 팀장이 자기 팀 구성원조차 못 보는 건 비실용적이라
 * 같은 팀에 한해서는 LIST_ONLY여도 상세 열람을 허용한다.
 */
export async function canViewEmployeeCard(targetUserId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  if (session.user.id === targetUserId) return true;
  if (session.user.role === "ADMIN") return true;

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { position: true },
  });
  if (target?.position === "CEO") return false;

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { position: true, team: { select: { name: true } } },
  });
  if (!viewer) return false;
  if (viewer.team?.name === "인사팀") return true;

  const scope = await getEffectiveModuleScope(
    session.user.id,
    session.user.role,
    viewer.position as Position,
    "EMPLOYEES"
  );
  if (scope === "NONE" || scope === "SELF") return false;
  if (scope === "FULL") return true;

  const [viewerCtx, targetCtx] = await Promise.all([
    loadViewerContext(session.user.id),
    loadViewerContext(targetUserId),
  ]);
  if (!viewerCtx || !targetCtx) return false;

  if (scope === "LIST_ONLY") return !!viewerCtx.teamId && viewerCtx.teamId === targetCtx.teamId;
  if (scope === "TEAM") return !!viewerCtx.teamId && viewerCtx.teamId === targetCtx.teamId;
  if (scope === "DIVISION") return !!viewerCtx.division && viewerCtx.division === targetCtx.division;
  if (scope === "BUSINESS_UNIT")
    return !!viewerCtx.businessUnit && viewerCtx.businessUnit === targetCtx.businessUnit;

  return false;
}

/**
 * Prisma `where` fragment restricting a User query to what the current
 * viewer is allowed to see for the EMPLOYEES module scope — used by the
 * 직원정보조회 list/search page, which (unlike the per-record
 * canViewEmployeeCard check on the detail page) must filter results up
 * front rather than just blocking navigation afterward. Returns `null` for
 * "no restriction" (FULL scope, or admin). Non-admin viewers never see
 * CEO(회장/부회장/사장) records — those are hidden even from 인사팀 — except
 * a CEO viewing their own row.
 */
export async function getEmployeeListScopeFilter(): Promise<Record<string, unknown> | null> {
  const BLOCK_ALL = { id: "__no_access__" };

  const session = await auth();
  if (!session?.user) return BLOCK_ALL;
  if (session.user.role === "ADMIN") return null;

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, position: true, team: { select: { name: true } } },
  });
  if (!viewer) return BLOCK_ALL;

  const hideCeo = { OR: [{ id: viewer.id }, { NOT: { position: "CEO" } }] };

  if (viewer.team?.name === "인사팀") return hideCeo;

  const scope = await getEffectiveModuleScope(
    session.user.id,
    session.user.role,
    viewer.position as Position,
    "EMPLOYEES"
  );
  if (scope === "FULL" || scope === "LIST_ONLY") return hideCeo;
  if (scope === "NONE" || scope === "SELF") return { id: viewer.id };

  const ctx = await loadViewerContext(viewer.id);
  if (!ctx) return BLOCK_ALL;

  if (scope === "TEAM") {
    return ctx.teamId ? { AND: [{ teamId: ctx.teamId }, hideCeo] } : BLOCK_ALL;
  }
  if (scope === "DIVISION") {
    if (!ctx.division) return BLOCK_ALL;
    return {
      AND: [
        {
          OR: [
            { team: { division: ctx.division } },
            { AND: [{ teamId: null }, { division: ctx.division }] },
          ],
        },
        hideCeo,
      ],
    };
  }
  if (scope === "BUSINESS_UNIT") {
    if (!ctx.businessUnit) return BLOCK_ALL;
    return {
      AND: [
        {
          OR: [
            { team: { businessUnit: ctx.businessUnit } },
            { AND: [{ teamId: null }, { businessUnit: ctx.businessUnit }] },
          ],
        },
        hideCeo,
      ],
    };
  }

  return BLOCK_ALL;
}

export async function getModuleUiConfig(): Promise<Record<Module, ModuleUiConfigEntry>> {
  const rows = await prisma.moduleUiConfig.findMany();
  const rowByModule = new Map(rows.map((r) => [r.module as Module, r]));

  const result = {} as Record<Module, ModuleUiConfigEntry>;
  SIDEBAR_MODULES.forEach((m, i) => {
    const row = rowByModule.get(m);
    result[m] = {
      order: row?.order ?? i,
      comingSoon: row ? row.comingSoon : DEFAULT_COMING_SOON_MODULES.has(m),
      hidden: row?.hidden ?? false,
    };
  });
  return result;
}

/** 사이드바 "관리" 섹션에서 숨김 처리된 항목의 key 집합. */
export async function getHiddenAdminMenuKeys(): Promise<Set<AdminMenuKey>> {
  const rows = await prisma.adminMenuConfig.findMany({ where: { hidden: true } });
  return new Set(rows.map((r) => r.key as AdminMenuKey));
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
