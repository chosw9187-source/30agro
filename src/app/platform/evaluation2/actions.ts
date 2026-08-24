"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireRole } from "@/lib/auth-helpers";
import { checkModuleAccess } from "@/lib/permissions";
import {
  GOAL_CYCLE_STATUSES,
  buildGoalTree,
  countsTowardProgress,
  cycleLock,
  evalTargetState,
  flattenGoalTree,
  needsAgreement,
  GOAL_LEVELS,
  GOAL_PARENT_LEVEL,
  GOAL_STATUSES,
  clampProgress,
  type GoalCycleStatus,
  type GoalLevel,
  type GoalStatus,
} from "@/lib/goals";

const ALL_ROLES = ["ADMIN", "EVALUATOR", "EMPLOYEE"] as const;
const PATH = "/platform/evaluation2";
const ADMIN_PATH = "/admin/org-goals";
const TARGETS_PATH = "/admin/eval-targets";

function str(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  const s = str(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 빈 칸은 "0"이 아니라 "값 없음"이다 — Number("")가 0이라서, 이걸 안 걸러내면
 * 폼에 없는 필드(예: 사이클의 연도)가 조용히 0으로 저장된다.
 */
function parseNumber(value: FormDataEntryValue | null, fallback = 0): number {
  const raw = str(value);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * "완료"로 저장하면 달성률도 100으로 맞춘다. 상태만 완료로 바꾸고 달성률
 * 칸을 안 채우면 완료 건수는 오르는데 달성률은 그대로라 숫자가 어긋난다.
 * 새로 만들 때는 비교할 이전 값이 없으므로 이 단순 규칙을 쓴다.
 */
function progressForStatus(status: GoalStatus, progress: number): number {
  return status === "DONE" ? 100 : progress;
}

/**
 * 달성률과 상태를 서로 맞춘다. 둘이 한 폼에 같이 있어서, 규칙 없이 저장하면
 * 서로를 덮어쓴다 — 100%로 한 번 완료된 목표의 달성률을 50으로 낮춰도 상태가
 * "완료"로 남아 화면에는 계속 100%로 보이는 문제가 그것이다.
 * 이번에 사람이 바꾼 쪽을 기준으로 삼고 나머지를 거기에 맞춘다.
 */
function reconcileProgressAndStatus(
  next: { progress: number; status: GoalStatus },
  prev: { progress: number; status: GoalStatus }
): { progress: number; status: GoalStatus } {
  // 상태를 완료로 바꿨다 → 달성률은 100.
  if (next.status !== prev.status && next.status === "DONE") {
    return { progress: 100, status: "DONE" };
  }
  // 달성률을 건드렸다 → 달성률이 기준. 100 미만으로 내렸는데 상태가 완료로
  // 남아 있으면 화면이 계속 100%가 되므로 진행중으로 되돌린다.
  if (next.progress !== prev.progress) {
    if (next.progress >= 100) return { progress: 100, status: "DONE" };
    return {
      progress: next.progress,
      status: next.status === "DONE" ? "ACTIVE" : next.status,
    };
  }
  // 둘 다 그대로 → 완료면 100을 유지한다.
  if (next.status === "DONE") return { progress: 100, status: "DONE" };
  return next;
}

function asLevel(value: FormDataEntryValue | null): GoalLevel | null {
  const s = str(value);
  return (GOAL_LEVELS as readonly string[]).includes(s) ? (s as GoalLevel) : null;
}

function asStatus(value: FormDataEntryValue | null): GoalStatus {
  const s = str(value);
  return (GOAL_STATUSES as readonly string[]).includes(s) ? (s as GoalStatus) : "ACTIVE";
}

/**
 * 목표관리 화면에 들어올 수 있는 사람인지 확인한다. 사이드바 링크를 숨기는
 * 것만으로는 액션 직접 호출을 막지 못하므로 모든 액션 앞에 둔다.
 */
async function requireGoalModule() {
  const session = await requireRole(...ALL_ROLES);
  if (!(await checkModuleAccess("EVALUATION_V2"))) {
    throw new Error("평가2 모듈 접근 권한이 없습니다.");
  }
  return session;
}

async function isAdmin() {
  const session = await auth();
  return session?.user.role === "ADMIN";
}

/**
 * 이 목표를 고칠 수 있는 사람인가. 관리자는 전부, 그 외에는 본인이
 * 담당자이거나 그 목표가 걸린 팀의 팀장인 경우만 허용한다. 진척률 갱신도
 * 같은 기준을 쓴다 — 남의 목표 달성률을 올릴 수 있으면 안 된다.
 */
async function canManageGoal(goalId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  if (session.user.role === "ADMIN") return true;

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { ownerId: true, team: { select: { leaderId: true } } },
  });
  if (!goal) return false;
  if (goal.ownerId === session.user.id) return true;
  return goal.team?.leaderId === session.user.id;
}

/**
 * 집계 제외를 걸 수 있는 사람 — 관리자와 그 팀의 팀장뿐이다.
 *
 * 목표를 고칠 권한(canManageGoal)에는 본인도 들어가지만, 제외는 그 목표를
 * 상위 달성률 계산에서 빼는 일이라 본인에게 맡길 수 없다. 진척이 안 나오는
 * 목표를 담당자가 스스로 빼 버리면 팀·책임·전사 달성률이 조용히 올라간다.
 */
async function canExcludeGoal(goalId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  if (session.user.role === "ADMIN") return true;

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { team: { select: { leaderId: true } } },
  });
  return !!goal && goal.team?.leaderId === session.user.id;
}

/**
 * 이 사이클에서 지금 무엇을 고칠 수 있는지 확인하고, 안 되면 막는다.
 *
 * `kind`는 두 가지다 — "goal"은 목표의 **내용**(제목·지표·가중치·담당·구조),
 * "progress"는 진척과 합의. 목표를 확정(마감)하면 내용만 잠기고 진척은
 * 계속 올릴 수 있다. 사이클을 종료하면 둘 다 잠긴다.
 *
 * 관리자도 통과시키지 않는다. 마감을 눌러 놓고도 관리자만 몰래 고칠 수 있으면
 * "마감"이라는 말이 화면에서 거짓이 된다. 고쳐야 하면 마감을 풀고 고친다.
 */
async function requireCycleEditable(cycleId: string, kind: "goal" | "progress") {
  const cycle = await prisma.goalCycle.findUnique({
    where: { id: cycleId },
    select: { status: true, goalsLockedAt: true },
  });
  if (!cycle) throw new Error("인사평가를 찾을 수 없습니다.");

  const lock = cycleLock(cycle);
  const allowed = kind === "goal" ? lock.canEditGoals : lock.canEditProgress;
  if (!allowed) throw new Error(lock.message ?? "지금은 고칠 수 없습니다.");
}

/** 목표 id로 그 목표가 속한 사이클의 잠금을 확인한다. */
async function requireGoalEditable(goalId: string, kind: "goal" | "progress") {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { cycleId: true },
  });
  if (!goal) throw new Error("목표를 찾을 수 없습니다.");
  await requireCycleEditable(goal.cycleId, kind);
}

// --- 목표 사이클 -----------------------------------------------------------

export async function createGoalCycle(formData: FormData) {
  await requireGoalModule();
  if (!(await isAdmin())) throw new Error("목표 사이클은 관리자만 만들 수 있습니다.");

  const name = str(formData.get("name"));
  const startDate = parseDate(formData.get("startDate"));
  const endDate = parseDate(formData.get("endDate"));
  if (!name || !startDate || !endDate) return;

  // 연도는 시작일 문자열("2026-07-01")에서 그대로 떼어낸다. Date 객체의
  // getFullYear()는 서버 시간대를 타서, 한국 밖 리전에서는 1월 1일 시작인
  // 사이클이 전년도로 잡힐 수 있다.
  const year = parseNumber(str(formData.get("startDate")).slice(0, 4), startDate.getFullYear());

  await prisma.goalCycle.create({
    data: { name, year, startDate, endDate, status: "OPEN" },
  });
  revalidatePath(PATH);
}

export async function setGoalCycleStatus(cycleId: string, status: GoalCycleStatus) {
  await requireGoalModule();
  if (!(await isAdmin())) throw new Error("목표 사이클은 관리자만 바꿀 수 있습니다.");
  if (!(GOAL_CYCLE_STATUSES as readonly string[]).includes(status)) return;

  await prisma.goalCycle.update({ where: { id: cycleId }, data: { status } });
  revalidatePath(PATH);
}

export async function deleteGoalCycle(cycleId: string) {
  await requireGoalModule();
  if (!(await isAdmin())) throw new Error("목표 사이클은 관리자만 지울 수 있습니다.");

  await prisma.goalCycle.delete({ where: { id: cycleId } });
  revalidatePath(PATH);
}

/**
 * 사내 "조직 단위별 목표" 보고 양식의 구분 5개. 새 사이클을 열면 이 뼈대를
 * 한 번에 깔아두고 목표 문구만 손보는 쪽이, 매번 빈 화면에서 다섯 줄을
 * 새로 만드는 것보다 빠르다. 문구는 등록 후 전사목표 탭에서 수정한다.
 */
const COMPANY_GOAL_TEMPLATE = [
  { category: "제품기획마케팅", title: "VISION 2028을 위한 신규시장 개척 및 대형 품목 육성" },
  { category: "영업고객관리", title: "매출 목표 달성" },
  { category: "기술연구", title: "신규제형 및 약제 효과 개선제품 개발과 판매제품의 안전성 자료 확보" },
  { category: "생산", title: "생산성 향상을 위한 자동화 공정 구축과 신제형 생산라인 신설 타당성 확보" },
  { category: "재무경영관리", title: "사업 경쟁력 강화를 위한 전략적 재무관리와 성과중심 조직문화 구축" },
] as const;

/**
 * 전사목표가 아직 하나도 없는 사이클에 위 양식을 깔아준다. 이미 한 건이라도
 * 있으면 아무것도 하지 않는다 — 두 번 눌러서 열 줄이 되는 사고를 막는다.
 */
export async function seedCompanyGoalTemplate(cycleId: string) {
  const session = await requireGoalModule();
  if (!(await isAdmin())) throw new Error("전사목표 양식은 관리자만 넣을 수 있습니다.");
  await requireCycleEditable(cycleId, "goal");

  const existing = await prisma.goal.count({ where: { cycleId, level: "COMPANY" } });
  if (existing > 0) return;

  const cycle = await prisma.goalCycle.findUnique({
    where: { id: cycleId },
    select: { id: true },
  });
  if (!cycle) return;

  await prisma.goal.createMany({
    data: COMPANY_GOAL_TEMPLATE.map((row, i) => ({
      cycleId,
      level: "COMPANY" as const,
      category: row.category,
      title: row.title,
      sortOrder: i + 1,
      createdById: session.user.id,
    })),
  });

  revalidatePath(PATH);
}

/**
 * 다른 사이클의 목표를 통째로 이 사이클로 복사한다 — 해마다 목표 체계를 처음부터
 * 다시 짜지 않도록.
 *
 * 복사되는 것: 층·구분·제목·설명·부문/팀/담당자·가중치·지표·목표수준, 그리고
 * 상하 연결(parentId)까지. 새 부모 id로 갈아 끼워야 하므로 층 순서대로
 * 만들면서 옛 id → 새 id 대응표를 쌓아간다.
 *
 * 복사되지 않는 것: 달성률·상태·체크인 이력·합의 상태·집계 제외. 지난해 성과를
 * 새해 목표에 얹으면 시작부터 숫자가 거짓이 된다. 기한도 옮기지 않는다 —
 * 지난 사이클 날짜가 그대로 넘어오면 만드는 즉시 전부 "지연"으로 뜬다.
 *
 * 이미 목표가 있는 사이클에는 넣지 않는다. 두 번 눌러 같은 목표가 두 벌
 * 생기면 가중치 합이 무너져 달성률이 통째로 어긋난다.
 */
export async function copyGoalsFromCycle(formData: FormData) {
  const session = await requireGoalModule();
  if (!(await isAdmin())) throw new Error("목표 복사는 관리자만 할 수 있습니다.");

  const targetCycleId = str(formData.get("targetCycleId"));
  const sourceCycleId = str(formData.get("sourceCycleId"));
  if (!targetCycleId || !sourceCycleId) throw new Error("가져올 사이클을 골라 주세요.");
  if (targetCycleId === sourceCycleId) throw new Error("같은 사이클끼리는 복사할 수 없습니다.");
  await requireCycleEditable(targetCycleId, "goal");

  const existing = await prisma.goal.count({ where: { cycleId: targetCycleId } });
  if (existing > 0) {
    throw new Error("이미 목표가 있는 사이클입니다. 비운 뒤에 다시 시도해 주세요.");
  }

  const [source, target] = await Promise.all([
    prisma.goalCycle.findUnique({ where: { id: sourceCycleId }, select: { id: true } }),
    prisma.goalCycle.findUnique({ where: { id: targetCycleId }, select: { id: true } }),
  ]);
  if (!source || !target) throw new Error("사이클을 찾을 수 없습니다.");

  const rows = await prisma.goal.findMany({
    where: { cycleId: sourceCycleId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      level: true,
      parentId: true,
      category: true,
      title: true,
      description: true,
      division: true,
      teamId: true,
      ownerId: true,
      weight: true,
      metric: true,
      targetValue: true,
      unit: true,
      sortOrder: true,
    },
  });

  const newIdByOldId = new Map<string, string>();
  // 위층부터 만들어야 아래층이 붙을 부모의 새 id가 이미 준비돼 있다.
  for (const level of GOAL_LEVELS) {
    for (const row of rows.filter((r) => r.level === level)) {
      const created = await prisma.goal.create({
        data: {
          cycleId: targetCycleId,
          level: row.level,
          parentId: row.parentId ? (newIdByOldId.get(row.parentId) ?? null) : null,
          category: row.category,
          title: row.title,
          description: row.description,
          division: row.division,
          teamId: row.teamId,
          ownerId: row.ownerId,
          weight: row.weight,
          metric: row.metric,
          targetValue: row.targetValue,
          unit: row.unit,
          sortOrder: row.sortOrder,
          createdById: session.user.id,
        },
        select: { id: true },
      });
      newIdByOldId.set(row.id, created.id);
    }
  }

  revalidatePath(PATH);
  revalidatePath("/admin/org-goals");
}

/**
 * 입사일 기준일을 정한다. 이 날짜 **이후** 입사자는 이번 평가 대상에서 자동으로
 * 빠진다. 사람마다 손으로 빼는 대신 규칙 한 줄로 두면, 조직도에 새 입사자가
 * 들어와도 명단을 다시 손볼 필요가 없다. 비우면 규칙을 없앤다.
 */
export async function setGoalCycleHireCutoff(formData: FormData) {
  await requireGoalModule();
  if (!(await isAdmin())) throw new Error("기준일은 관리자만 정할 수 있습니다.");

  const cycleId = str(formData.get("cycleId"));
  if (!cycleId) return;

  await prisma.goalCycle.update({
    where: { id: cycleId },
    data: { hireCutoff: parseDate(formData.get("hireCutoff")) },
  });
  revalidatePath(PATH);
  revalidatePath(TARGETS_PATH);
}

/**
 * 목표를 확정(마감)한다. 이후로는 목표의 **내용**을 아무도 못 고치고 진척만
 * 올린다. 관리자도 예외가 아니다 — 고쳐야 하면 마감을 풀고 고쳐야 "언제
 * 무엇이 바뀌었나"가 남는다.
 */
export async function lockGoalSetting(cycleId: string) {
  const session = await requireGoalModule();
  if (!(await isAdmin())) throw new Error("목표 마감은 관리자만 할 수 있습니다.");

  await prisma.goalCycle.update({
    where: { id: cycleId },
    data: { goalsLockedAt: new Date(), goalsLockedById: session.user.id },
  });
  revalidatePath(PATH);
  revalidatePath(ADMIN_PATH);
}

/** 목표 마감을 푼다. */
export async function unlockGoalSetting(cycleId: string) {
  await requireGoalModule();
  if (!(await isAdmin())) throw new Error("목표 마감 해제는 관리자만 할 수 있습니다.");

  await prisma.goalCycle.update({
    where: { id: cycleId },
    data: { goalsLockedAt: null, goalsLockedById: null },
  });
  revalidatePath(PATH);
  revalidatePath(ADMIN_PATH);
}

/**
 * 평가 시점 스냅샷을 찍는다 — "2026년 상반기 평가"처럼 한 사이클 안에서
 * 성적을 끊어 읽어야 할 때.
 *
 * 목표를 복사해 새 사이클을 만드는 대신 이 방식을 쓴다. 복사하면 같은 목표가
 * 두 벌이 되어 어느 쪽이 진짜인지가 생기고, 목표 하나의 1년치 진척 이력도
 * 끊긴다. 목표는 한 벌로 두고 시점만 남기면 하반기에 달성률이 더 올라가도
 * 상반기 성적은 그대로다.
 *
 * 저장하는 값은 **굴려 올린 달성률**이다. 화면에서 보는 숫자가 그것이라,
 * 저장된 progress를 그대로 넣으면 전사·책임·팀 목표가 전부 0으로 찍힌다.
 */
export async function createGoalCheckpoint(formData: FormData) {
  const session = await requireGoalModule();
  if (!(await isAdmin())) throw new Error("평가 시점은 관리자만 확정할 수 있습니다.");

  const cycleId = str(formData.get("cycleId"));
  const name = str(formData.get("name"));
  if (!cycleId || !name) throw new Error("평가 시점 이름을 적어 주세요.");

  const cycle = await prisma.goalCycle.findUnique({
    where: { id: cycleId },
    select: { id: true, hireCutoff: true },
  });
  if (!cycle) throw new Error("인사평가를 찾을 수 없습니다.");

  const [rows, targets] = await Promise.all([
    prisma.goal.findMany({
      where: { cycleId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        level: true,
        parentId: true,
        category: true,
        title: true,
        description: true,
        division: true,
        teamId: true,
        ownerId: true,
        weight: true,
        metric: true,
        targetValue: true,
        currentValue: true,
        unit: true,
        progress: true,
        status: true,
        excluded: true,
        excludeReason: true,
        agreementStatus: true,
        agreementNote: true,
        agreedAt: true,
        dueDate: true,
        sortOrder: true,
        owner: { select: { id: true, name: true, teamId: true, hireDate: true } },
      },
    }),
    prisma.goalCycleTarget.findMany({
      where: { cycleId },
      select: { userId: true, included: true, reason: true },
    }),
  ]);
  if (rows.length === 0) throw new Error("확정할 목표가 없습니다.");

  const manualByUser = new Map(targets.map((t) => [t.userId, t]));
  const withTarget = rows.map((r) => {
    const state = r.ownerId
      ? evalTargetState(
          { hireDate: r.owner?.hireDate ?? null },
          cycle,
          manualByUser.get(r.ownerId) ?? null
        )
      : null;
    return {
      ...r,
      targetExcluded: state ? !state.included : false,
      targetExcludeReason: state?.reason ?? null,
    };
  });

  const nodes = flattenGoalTree(buildGoalTree(withTarget));

  const checkpoint = await prisma.goalCheckpoint.create({
    data: {
      cycleId,
      name,
      note: str(formData.get("note")) || null,
      createdById: session.user.id,
      entries: {
        create: nodes.map((n) => ({
          goalId: n.id,
          level: n.level as GoalLevel,
          progress: n.rollupProgress,
          status: n.status as GoalStatus,
          excluded: !countsTowardProgress(n),
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath(PATH);
  revalidatePath(ADMIN_PATH);
  return checkpoint.id;
}

/** 잘못 찍은 평가 시점을 지운다. 목표 자체는 건드리지 않는다. */
export async function deleteGoalCheckpoint(checkpointId: string) {
  await requireGoalModule();
  if (!(await isAdmin())) throw new Error("평가 시점은 관리자만 지울 수 있습니다.");

  await prisma.goalCheckpoint.delete({ where: { id: checkpointId } });
  revalidatePath(PATH);
  revalidatePath(ADMIN_PATH);
}

// --- 목표 ------------------------------------------------------------------

/**
 * 층에 따라 필요한 소속값(책임 부문 / 팀 / 담당자)을 정리한다. 예를 들어
 * 팀목표에 개인 담당자가 들어와도 그 층에서 의미 있는 값만 남긴다.
 */
function scopeFieldsFor(level: GoalLevel, formData: FormData) {
  const division = str(formData.get("division"));
  const teamId = str(formData.get("teamId"));
  const ownerId = str(formData.get("ownerId"));

  if (level === "COMPANY") return { division: null, teamId: null, ownerId: ownerId || null };
  if (level === "DIVISION")
    return { division: division || null, teamId: null, ownerId: ownerId || null };
  if (level === "TEAM")
    return { division: division || null, teamId: teamId || null, ownerId: ownerId || null };
  return { division: division || null, teamId: teamId || null, ownerId: ownerId || null };
}

/** 상위 목표는 반드시 바로 윗 층이어야 캐스케이드가 어긋나지 않는다. */
async function resolveParentId(level: GoalLevel, rawParentId: string, cycleId: string) {
  const expected = GOAL_PARENT_LEVEL[level];
  if (!expected || !rawParentId) return null;

  const parent = await prisma.goal.findUnique({
    where: { id: rawParentId },
    select: { level: true, cycleId: true },
  });
  if (!parent || parent.level !== expected || parent.cycleId !== cycleId) return null;
  return rawParentId;
}

export async function createGoal(formData: FormData) {
  const session = await requireGoalModule();

  const level = asLevel(formData.get("level"));
  const cycleId = str(formData.get("cycleId"));
  const title = str(formData.get("title"));
  if (!level || !cycleId || !title) return;
  await requireCycleEditable(cycleId, "goal");

  const admin = await isAdmin();
  const scope = scopeFieldsFor(level, formData);

  // 관리자가 아니면 자기 개인목표만 새로 만들 수 있다. 팀장은 자기 팀
  // 팀목표까지 허용한다 — 그 위(책임·전사)는 인사팀이 내려주는 값이다.
  if (!admin) {
    if (level === "INDIVIDUAL") {
      scope.ownerId = session.user.id;
    } else if (level === "TEAM") {
      const leads = await prisma.team.findFirst({
        where: { id: scope.teamId ?? "", leaderId: session.user.id },
        select: { id: true },
      });
      if (!leads) throw new Error("본인이 팀장인 팀의 팀목표만 만들 수 있습니다.");
    } else {
      throw new Error("전사·책임 목표는 관리자만 만들 수 있습니다.");
    }
  }

  await prisma.goal.create({
    data: {
      cycleId,
      level,
      parentId: await resolveParentId(level, str(formData.get("parentId")), cycleId),
      category: str(formData.get("category")) || null,
      title,
      description: str(formData.get("description")) || null,
      ...scope,
      weight: parseNumber(formData.get("weight"), 0),
      metric: str(formData.get("metric")) || null,
      targetValue: str(formData.get("targetValue")) || null,
      currentValue: str(formData.get("currentValue")) || null,
      unit: str(formData.get("unit")) || null,
      progress: progressForStatus(
        asStatus(formData.get("status")),
        clampProgress(parseNumber(formData.get("progress"), 0))
      ),
      status: asStatus(formData.get("status")),
      dueDate: parseDate(formData.get("dueDate")),
      sortOrder: parseNumber(formData.get("sortOrder"), 0),
      createdById: session.user.id,
    },
  });
  revalidatePath(PATH);
}

export async function updateGoal(formData: FormData) {
  await requireGoalModule();

  const goalId = str(formData.get("goalId"));
  if (!goalId) return;
  if (!(await canManageGoal(goalId))) throw new Error("이 목표를 수정할 권한이 없습니다.");

  const existing = await prisma.goal.findUnique({
    where: { id: goalId },
    select: {
      level: true,
      cycleId: true,
      progress: true,
      status: true,
      agreementStatus: true,
    },
  });
  if (!existing) return;

  // 합의가 끝난 목표는 담당자가 혼자 바꿀 수 없다. 바꾸려면 팀장이 합의를
  // 해제하고 다시 받는 게 맞다 — 아니면 승인한 내용과 실제 목표가 달라진다.
  if (existing.agreementStatus === "AGREED" && !(await canApproveGoal(goalId))) {
    throw new Error("합의 완료된 목표입니다. 팀장에게 합의 해제를 요청해 주세요.");
  }

  const synced = reconcileProgressAndStatus(
    {
      progress: clampProgress(parseNumber(formData.get("progress"), 0)),
      status: asStatus(formData.get("status")),
    },
    { progress: existing.progress, status: existing.status as GoalStatus }
  );

  const level = existing.level as GoalLevel;
  const admin = await isAdmin();

  // 목표 확정(마감) 이후에는 내용은 그대로 두고 진척과 상태만 받는다. 여기서
  // 통째로 막지 않는 이유는, 마감한 뒤에도 "완료" 처리는 계속 해야 하기
  // 때문이다. 사이클이 종료(CLOSED)되면 그것마저 막힌다.
  const cycle = await prisma.goalCycle.findUnique({
    where: { id: existing.cycleId },
    select: { status: true, goalsLockedAt: true },
  });
  const lock = cycleLock(cycle);
  if (!lock.canEditProgress) throw new Error(lock.message ?? "지금은 고칠 수 없습니다.");

  if (!lock.canEditGoals) {
    await prisma.goal.update({
      where: { id: goalId },
      data: {
        currentValue: str(formData.get("currentValue")) || null,
        progress: synced.progress,
        status: synced.status,
      },
    });
    revalidatePath(PATH);
    return;
  }

  // 담당자·팀 같은 소속값을 옮기는 건 조직 배치의 문제라 관리자만 건드린다.
  const scope = admin ? scopeFieldsFor(level, formData) : {};

  await prisma.goal.update({
    where: { id: goalId },
    data: {
      title: str(formData.get("title")) || undefined,
      category: str(formData.get("category")) || null,
      description: str(formData.get("description")) || null,
      ...scope,
      ...(admin
        ? {
            parentId: await resolveParentId(
              level,
              str(formData.get("parentId")),
              existing.cycleId
            ),
            weight: parseNumber(formData.get("weight"), 0),
            sortOrder: parseNumber(formData.get("sortOrder"), 0),
          }
        : {}),
      metric: str(formData.get("metric")) || null,
      targetValue: str(formData.get("targetValue")) || null,
      currentValue: str(formData.get("currentValue")) || null,
      unit: str(formData.get("unit")) || null,
      progress: synced.progress,
      status: synced.status,
      dueDate: parseDate(formData.get("dueDate")),
    },
  });
  revalidatePath(PATH);
}

export async function deleteGoal(goalId: string) {
  await requireGoalModule();
  if (!(await isAdmin())) throw new Error("목표 삭제는 관리자만 할 수 있습니다.");

  await requireGoalEditable(goalId, "goal");

  // 하위 목표는 지우지 않고 부모만 끊어서, 실수로 팀·개인 목표가 통째로
  // 사라지는 일이 없게 한다.
  await prisma.goal.updateMany({ where: { parentId: goalId }, data: { parentId: null } });
  await prisma.goal.delete({ where: { id: goalId } });
  revalidatePath(PATH);
}

/**
 * 이 목표를 승인(합의)할 수 있는 사람인지. 팀장 승인까지만 받기로 했으므로,
 * 목표가 걸린 팀의 팀장과 관리자만 승인·되돌림을 할 수 있다. 담당자 본인은
 * 자기 목표를 스스로 승인하지 못한다 — 그러면 합의가 아니라 자기 선언이 된다.
 */
async function canApproveGoal(goalId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  if (session.user.role === "ADMIN") return true;

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { team: { select: { leaderId: true } } },
  });
  return !!goal?.team?.leaderId && goal.team.leaderId === session.user.id;
}

/** 담당자가 목표를 팀장에게 올린다. */
export async function requestGoalAgreement(goalId: string) {
  await requireGoalModule();
  if (!(await canManageGoal(goalId))) throw new Error("이 목표를 올릴 권한이 없습니다.");
  await requireGoalEditable(goalId, "progress");

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { level: true, agreementStatus: true },
  });
  if (!goal || !needsAgreement(goal.level)) return;
  if (goal.agreementStatus === "AGREED") throw new Error("이미 합의된 목표입니다.");

  await prisma.goal.update({
    where: { id: goalId },
    data: { agreementStatus: "REQUESTED", agreementNote: null },
  });
  revalidatePath(PATH);
}

/** 팀장이 승인한다. */
export async function approveGoalAgreement(goalId: string, formData?: FormData) {
  const session = await requireGoalModule();
  if (!(await canApproveGoal(goalId))) {
    throw new Error("팀장 또는 관리자만 합의할 수 있습니다.");
  }
  await requireGoalEditable(goalId, "progress");

  await prisma.goal.update({
    where: { id: goalId },
    data: {
      agreementStatus: "AGREED",
      agreementNote: str(formData?.get("agreementNote") ?? null) || null,
      agreedAt: new Date(),
      agreedById: session.user.id,
    },
  });
  revalidatePath(PATH);
}

/** 팀장이 사유를 달아 되돌린다. 담당자가 고쳐서 다시 올리는 흐름. */
export async function returnGoalAgreement(goalId: string, formData?: FormData) {
  await requireGoalModule();
  if (!(await canApproveGoal(goalId))) {
    throw new Error("팀장 또는 관리자만 되돌릴 수 있습니다.");
  }
  await requireGoalEditable(goalId, "progress");

  const note = str(formData?.get("agreementNote") ?? null);
  if (!note) throw new Error("되돌리는 사유를 적어 주세요.");

  await prisma.goal.update({
    where: { id: goalId },
    data: {
      agreementStatus: "RETURNED",
      agreementNote: note,
      agreedAt: null,
      agreedById: null,
    },
  });
  revalidatePath(PATH);
}

/**
 * 합의 완료된 목표를 다시 작성 단계로 돌린다. 합의 후 사정이 바뀌어 목표를
 * 고쳐야 할 때 쓰며, 고친 뒤에는 다시 팀장 승인을 받아야 한다.
 */
export async function reopenGoalAgreement(goalId: string) {
  await requireGoalModule();
  if (!(await canApproveGoal(goalId))) {
    throw new Error("팀장 또는 관리자만 합의를 해제할 수 있습니다.");
  }

  await requireGoalEditable(goalId, "progress");

  await prisma.goal.update({
    where: { id: goalId },
    data: { agreementStatus: "DRAFT", agreedAt: null, agreedById: null },
  });
  revalidatePath(PATH);
}

/**
 * 집계 제외를 켜고 끈다. 담당자가 퇴사하거나 부서를 옮겨서 이 목표를 더는 그
 * 조직의 성과로 보기 어려울 때 쓴다. 목표를 지우면 왜 빠졌는지가 같이
 * 사라지므로, 삭제 대신 제외 플래그를 켜고 사유를 남긴다.
 */
export async function setGoalExcluded(
  goalId: string,
  excluded: boolean,
  formData?: FormData
) {
  await requireGoalModule();
  if (!(await canExcludeGoal(goalId))) {
    throw new Error("집계 제외는 관리자와 팀장만 할 수 있습니다.");
  }
  await requireGoalEditable(goalId, "progress");

  const reason = str(formData?.get("excludeReason") ?? null);

  await prisma.goal.update({
    where: { id: goalId },
    data: {
      excluded,
      excludeReason: excluded ? reason || "담당자 퇴사·부서이동" : null,
    },
  });
  revalidatePath(PATH);
}

/** 진척 갱신 한 건 = 목표의 progress 갱신 + 이력 한 줄. */
export async function addGoalCheckIn(formData: FormData) {
  const session = await requireGoalModule();

  const goalId = str(formData.get("goalId"));
  if (!goalId) return;
  if (!(await canManageGoal(goalId))) throw new Error("이 목표의 진척을 올릴 권한이 없습니다.");
  await requireGoalEditable(goalId, "progress");

  const progress = clampProgress(parseNumber(formData.get("progress"), 0));
  const note = str(formData.get("note"));
  const currentValue = str(formData.get("currentValue"));

  const current = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { status: true },
  });

  // 100%를 찍으면 완료로 올리고, 100% 아래로 내리면 완료를 풀어준다. 안 풀면
  // 상태가 "완료"로 남아 화면에는 계속 100%로 보인다(완료 = 100%로 보므로).
  const nextStatus =
    progress >= 100 ? "DONE" : current?.status === "DONE" ? "ACTIVE" : undefined;

  await prisma.$transaction([
    prisma.goal.update({
      where: { id: goalId },
      data: {
        progress,
        ...(currentValue ? { currentValue } : {}),
        ...(nextStatus ? { status: nextStatus } : {}),
      },
    }),
    prisma.goalCheckIn.create({
      data: { goalId, progress, note: note || null, authorId: session.user.id },
    }),
  ]);
  revalidatePath(PATH);
}
