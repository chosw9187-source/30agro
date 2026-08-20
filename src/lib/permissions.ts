import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import {
  MODULES,
  HOME_BLOCKS,
  SIDEBAR_MODULES,
  ADMIN_ONLY_MODULES,
  DEFAULT_COMING_SOON_MODULES,
  POSITION_CARD_SCOPE_CEILING,
  narrowerCardScope,
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
  POSITION_CARD_SCOPE_CEILING,
  narrowerCardScope,
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
 * 인사카드 상세를 열 수 있는 사람을 고르는 Prisma `where` 조각 —
 * 개인정보 열람 규칙의 **단일 출처**다. `null`이면 제한 없음(관리자).
 *
 * 규칙은 세 줄로 끝난다:
 *
 *   1. 본인 정보는 언제나 볼 수 있다.
 *   2. 관리자 역할(role=ADMIN)은 전 직원을 볼 수 있다.
 *   3. 그 외에는 직책이 허용하는 본인 조직 범위 안의 사람만 볼 수 있다 —
 *      운영책임=본인 사업단위, 책임=본인 부문, 팀장=본인 팀, 담당=본인만
 *      (POSITION_CARD_SCOPE_CEILING).
 *
 * 권한 매트릭스(직책별)와 사용자별 개별 설정은 이 상한을 넘지 못하고
 * **좁히는 방향으로만** 작동한다. 따라서 매트릭스에 아무 설정이 없어
 * 기본값이 FULL이어도 담당은 본인 정보만 보게 된다. 비관리자에게 전 직원
 * 열람을 열어주려면 그 사람의 역할을 ADMIN으로 올려야 한다.
 *
 * 회장/부회장/사장(Position.CEO)의 인사 정보는 본인·관리자 외에는 누구에게도
 * 보이지 않는다(상한과 무관한 별도의 차단).
 */
export async function getCardScopeFilter(): Promise<Record<string, unknown> | null> {
  const BLOCK_ALL = { id: "__no_access__" };

  const session = await auth();
  if (!session?.user) return BLOCK_ALL;
  if (session.user.role === "ADMIN") return null;

  const viewerId = session.user.id;
  const viewer = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { position: true },
  });
  if (!viewer) return BLOCK_ALL;

  const position = (viewer.position ?? "STAFF") as Position;
  const configured = await getEffectiveModuleScope(
    viewerId,
    session.user.role,
    position,
    "EMPLOYEES"
  );
  const scope = narrowerCardScope(configured, POSITION_CARD_SCOPE_CEILING[position] ?? "SELF");

  const onlySelf = { id: viewerId };
  /** 본인 + (조건에 맞으면서 사장이 아닌 사람). */
  const selfOr = (cond: Record<string, unknown>) => ({
    OR: [onlySelf, { AND: [cond, { NOT: { position: "CEO" } }] }],
  });

  if (scope === "FULL") return { OR: [onlySelf, { NOT: { position: "CEO" } }] };
  if (scope === "NONE" || scope === "SELF") return onlySelf;

  const ctx = await loadViewerContext(viewerId);
  if (!ctx) return onlySelf;

  // 팀 범위(LIST_ONLY 포함): 같은 팀이거나, 내가 팀장으로 지정된 팀의
  // 구성원이면 "직속"으로 본다 — 팀장이 자기 팀에 소속돼 있지 않게 등록된
  // 경우까지 커버하기 위한 것.
  if (scope === "TEAM" || scope === "LIST_ONLY") {
    const sameTeamOrLed: Record<string, unknown>[] = [{ team: { leaderId: viewerId } }];
    if (ctx.teamId) sameTeamOrLed.push({ teamId: ctx.teamId });
    return selfOr({ OR: sameTeamOrLed });
  }

  // 팀이 없는 임원 등은 User 자신의 businessUnit/division을 쓰고, 팀이 있으면
  // 팀에 붙은 값을 쓴다 — loadViewerContext와 같은 우선순위.
  const belongsTo = (field: "division" | "businessUnit", value: string) => ({
    OR: [{ team: { [field]: value } }, { AND: [{ teamId: null }, { [field]: value }] }],
  });

  // 부문명은 사업단위가 다르면 겹칠 수 있으므로, 보는 사람에게 사업단위가
  // 있으면 그것까지 같아야 한다.
  if (scope === "DIVISION") {
    if (!ctx.division) return onlySelf;
    const conds: Record<string, unknown>[] = [belongsTo("division", ctx.division)];
    if (ctx.businessUnit) conds.push(belongsTo("businessUnit", ctx.businessUnit));
    return selfOr({ AND: conds });
  }

  if (scope === "BUSINESS_UNIT") {
    if (!ctx.businessUnit) return onlySelf;
    return selfOr(belongsTo("businessUnit", ctx.businessUnit));
  }

  return onlySelf;
}

/** 한 사람의 인사카드 상세를 열 수 있는지. 규칙은 getCardScopeFilter 참고. */
export async function canViewEmployeeCard(targetUserId: string): Promise<boolean> {
  const filter = await getCardScopeFilter();
  if (filter === null) return true;

  const hit = await prisma.user.findFirst({
    where: { AND: [{ id: targetUserId }, filter] },
    select: { id: true },
  });
  return !!hit;
}

/**
 * 여러 명을 한 번에 판정한다 — 조직도 팀 상세처럼 한 화면에 수십 명의
 * 생년월일·근속 같은 개인정보를 그리는 곳에서, 사람마다 질의를 날리지 않고
 * "이 중 누구의 정보를 보여줘도 되는지"를 한 번에 받아오기 위한 것.
 */
export async function getVisibleCardUserIds(userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Set();

  const filter = await getCardScopeFilter();
  if (filter === null) return new Set(ids);

  const rows = await prisma.user.findMany({
    where: { AND: [{ id: { in: ids } }, filter] },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
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
