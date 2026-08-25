"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireRole } from "@/lib/auth-helpers";
import { checkModuleAccess } from "@/lib/permissions";
import {
  GOAL_CYCLE_ORDER,
  GOAL_CYCLE_STATUSES,
  GOAL_SCALES,
  GOAL_LEVEL_LABEL,
  OTHER_GOAL_TITLE,
  OTHER_PARENT_VALUE,
  buildGoalTree,
  countsTowardProgress,
  cycleLock,
  defaultOtherWeight,
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
 * 계속 올릴 수 있다. 사이클을 완료로 바꾸면 둘 다 잠긴다.
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
    data: {
      name,
      year,
      startDate,
      endDate,
      status: "OPEN",
      sourceCycleId: await resolveShareSource(str(formData.get("sourceCycleId")), null),
    },
  });
  revalidatePath(PATH);
  revalidatePath(ADMIN_PATH);
}

/**
 * 목표를 빌려올 사이클을 확인한다. 빈 값이면 자기 목표를 쓴다는 뜻이다.
 *
 * 두 가지를 막는다 — 자기 자신을 가리키는 것과, 이미 남의 목표를 빌려 쓰는
 * 사이클을 또 빌리는 것. 사슬이 길어지면 어디가 원본인지 따라가기 어려워지고,
 * 원본을 지울 때 무엇이 함께 비는지도 알 수 없게 된다.
 */
async function resolveShareSource(raw: string, selfId: string | null): Promise<string | null> {
  if (!raw) return null;
  if (raw === selfId) throw new Error("자기 자신의 목표를 빌려올 수는 없습니다.");

  const source = await prisma.goalCycle.findUnique({
    where: { id: raw },
    select: { id: true, name: true, sourceCycleId: true },
  });
  if (!source) throw new Error("빌려올 인사평가를 찾을 수 없습니다.");
  if (source.sourceCycleId) {
    throw new Error(`「${source.name}」도 다른 평가의 목표를 빌려 쓰고 있어 고를 수 없습니다.`);
  }
  return source.id;
}

/**
 * 인사평가 목록에서 한 칸 위(아래)로 옮긴다.
 *
 * 옮길 때마다 전체 순번을 1부터 다시 매긴다. 두 줄만 맞바꾸면 아직 순서를
 * 정한 적 없는 사이클들이 전부 0으로 묶여 있어서, 어느 것이 위인지 정해지지
 * 않은 채로 남는다. 전부 다시 매기면 목록이 늘 한 가지 순서로 읽힌다.
 */
export async function moveGoalCycle(cycleId: string, direction: "up" | "down") {
  await requireGoalModule();
  if (!(await isAdmin())) throw new Error("순서는 관리자만 바꿀 수 있습니다.");

  const list = await prisma.goalCycle.findMany({
    orderBy: GOAL_CYCLE_ORDER,
    select: { id: true },
  });
  const from = list.findIndex((c) => c.id === cycleId);
  if (from === -1) return;
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= list.length) return;

  const moved = [...list];
  [moved[from], moved[to]] = [moved[to], moved[from]];

  await prisma.$transaction(
    moved.map((c, i) =>
      prisma.goalCycle.update({ where: { id: c.id }, data: { sortOrder: i + 1 } })
    )
  );
  revalidatePath(PATH);
  revalidatePath(ADMIN_PATH);
  revalidatePath(TARGETS_PATH);
}

/** 이미 만들어 둔 사이클의 목표 공유 대상을 바꾼다. */
export async function setGoalCycleSource(formData: FormData) {
  await requireGoalModule();
  if (!(await isAdmin())) throw new Error("목표 공유는 관리자만 바꿀 수 있습니다.");

  const cycleId = str(formData.get("cycleId"));
  if (!cycleId) return;

  const sourceCycleId = await resolveShareSource(str(formData.get("sourceCycleId")), cycleId);
  if (sourceCycleId) {
    // 이 사이클의 목표를 빌려 쓰는 다른 사이클이 있으면, 그것들이 갈 곳을 잃는다.
    const dependents = await prisma.goalCycle.count({ where: { sourceCycleId: cycleId } });
    if (dependents > 0) {
      throw new Error("다른 평가가 이 평가의 목표를 빌려 쓰고 있어 바꿀 수 없습니다.");
    }
  }

  await prisma.goalCycle.update({ where: { id: cycleId }, data: { sourceCycleId } });
  revalidatePath(PATH);
  revalidatePath(ADMIN_PATH);
}

/**
 * 인사평가의 이름과 기간을 고친다.
 *
 * 이름이 틀렸다고 지웠다 다시 만들면 그 안에 달린 목표가 통째로 사라진다.
 * 이름은 운영하면서 계속 바뀌는 값이라("2026년 하반기" → "2026년 목표설정")
 * 고칠 수 있어야 한다.
 */
export async function renameGoalCycle(formData: FormData) {
  await requireGoalModule();
  if (!(await isAdmin())) throw new Error("인사평가는 관리자만 고칠 수 있습니다.");

  const cycleId = str(formData.get("cycleId"));
  const name = str(formData.get("name"));
  if (!cycleId || !name) throw new Error("이름을 적어 주세요.");

  const startDate = parseDate(formData.get("startDate"));
  const endDate = parseDate(formData.get("endDate"));

  await prisma.goalCycle.update({
    where: { id: cycleId },
    data: {
      name,
      // 연도는 시작일에서 뽑는다. 사람이 따로 적게 하면 이름과 어긋난 값이 남는다.
      ...(startDate ? { startDate, year: startDate.getFullYear() } : {}),
      ...(endDate ? { endDate } : {}),
    },
  });
  revalidatePath(PATH);
  revalidatePath(ADMIN_PATH);
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
 * 사내 "조직 단위별 목표" 보고 양식의 다섯 줄. 새 사이클을 열면 이 뼈대를
 * 한 번에 깔아두고 목표 문구만 손보는 쪽이, 매번 빈 화면에서 다섯 줄을
 * 새로 만드는 것보다 빠르다. 문구는 등록 후 전사목표 탭에서 수정한다.
 */
const COMPANY_GOAL_TEMPLATE = [
  { title: "VISION 2028을 위한 신규시장 개척 및 대형 품목 육성" },
  { title: "매출 목표 달성" },
  { title: "신규제형 및 약제 효과 개선제품 개발과 판매제품의 안전성 자료 확보" },
  { title: "생산성 향상을 위한 자동화 공정 구축과 신제형 생산라인 신설 타당성 확보" },
  { title: "사업 경쟁력 강화를 위한 전략적 재무관리와 성과중심 조직문화 구축" },
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
 * 복사되는 것: 층·제목·설명·부문/팀/담당자·가중치·지표·목표수준, 그리고
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
      title: true,
      description: true,
      division: true,
      teamId: true,
      ownerId: true,
      weight: true,
      metric: true,
      targetValue: true,
      unit: true,
      scaleS: true,
      scaleA: true,
      scaleB: true,
      scaleC: true,
      scaleD: true,
      formula: true,
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
              title: row.title,
          description: row.description,
          division: row.division,
          teamId: row.teamId,
          ownerId: row.ownerId,
          weight: row.weight,
          metric: row.metric,
          targetValue: row.targetValue,
          unit: row.unit,
          scaleS: row.scaleS,
          scaleA: row.scaleA,
          scaleB: row.scaleB,
          scaleC: row.scaleC,
          scaleD: row.scaleD,
          formula: row.formula,
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
    select: { id: true, hireCutoff: true, sourceCycleId: true },
  });
  if (!cycle) throw new Error("인사평가를 찾을 수 없습니다.");
  // 남의 목표를 빌려 쓰는 평가라면 그쪽 목표를 찍는다. 시점 자체는 이 평가에
  // 남아서, 같은 목표를 상반기·최종평가로 나눠 결산할 수 있다.
  const goalCycleId = cycle.sourceCycleId ?? cycle.id;

  const [rows, targets] = await Promise.all([
    prisma.goal.findMany({
      where: { cycleId: goalCycleId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        level: true,
        parentId: true,
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
      where: { cycleId: goalCycleId },
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

/**
 * 그 층·그 조직의 "기타" 묶음 목표를 찾고, 없으면 만든다.
 *
 * 위 층까지 거슬러 올라가며 만든다 — 팀 기타를 만들려면 그 팀이 속한 책임의
 * 기타가 있어야 하고, 그건 다시 전사 기타에 매달려야 한다. 이 사슬이 끊기면
 * 기타에 담은 일이 전사 달성률까지 굴러 올라가지 못해서, 기타를 만든 의미가
 * 없어진다.
 *
 * scope는 그 층에서 기타를 몇 개 둘지를 정한다: 전사 기타는 사이클에 하나,
 * 책임 기타는 부문마다 하나, 팀 기타는 팀마다 하나.
 */
async function ensureOtherGoal(
  level: GoalLevel,
  cycleId: string,
  scope: { division: string | null; teamId: string | null },
  createdById: string
): Promise<string | null> {
  const where = {
    cycleId,
    level,
    isOther: true,
    ...(level === "DIVISION" ? { division: scope.division } : {}),
    ...(level === "TEAM" ? { teamId: scope.teamId } : {}),
  };
  const existing = await prisma.goal.findFirst({ where, select: { id: true } });
  if (existing) return existing.id;

  // 위 층 기타를 먼저 확보한다. 전사는 위가 없으므로 여기서 멈춘다.
  const parentLevel = GOAL_PARENT_LEVEL[level];
  const parentId = parentLevel
    ? await ensureOtherGoal(parentLevel, cycleId, scope, createdById)
    : null;

  const siblings = await prisma.goal.findMany({
    where: { cycleId, level, parentId },
    select: { weight: true },
  });

  const created = await prisma.goal.create({
    data: {
      cycleId,
      level,
      parentId,
      isOther: true,
      title: OTHER_GOAL_TITLE,
      description: "위 층 목표에 직접 붙지 않는 일을 모아 두는 자리입니다.",
      division: level === "DIVISION" || level === "TEAM" ? scope.division : null,
      teamId: level === "TEAM" ? scope.teamId : null,
      weight: defaultOtherWeight(siblings),
      sortOrder: 9999,
      createdById,
    },
    select: { id: true },
  });
  return created.id;
}

/** 평가척도 다섯 칸과 산출식을 폼에서 그대로 받아 넘긴다. */
function scaleFields(formData: FormData) {
  const out: Record<string, string | null> = {
    formula: str(formData.get("formula")) || null,
  };
  for (const s of GOAL_SCALES) out[s.field] = str(formData.get(s.field)) || null;
  return out;
}

/**
 * 책임목표에는 가중치 칸이 없으므로 0으로 둔다 — 폼에 없는 값을 우연히 0으로
 * 떨어뜨리는 게 아니라 일부러 0이다. 가중평균은 형제가 전부 0이면 동일가중으로
 * 떨어지므로, 부문끼리는 비중을 따지지 않고 똑같이 센다는 뜻이 된다.
 */
function weightFor(level: GoalLevel, formData: FormData): number {
  if (level === "DIVISION") return 0;
  return parseNumber(formData.get("weight"), 0);
}

/** 기타 사슬을 만들 때 쓸 소속. 부문이 비어 있으면 팀에서 끌어온다. */
async function resolveOtherScope(scope: { division?: string | null; teamId?: string | null }) {
  let division = scope.division ?? null;
  if (!division && scope.teamId) {
    const team = await prisma.team.findUnique({
      where: { id: scope.teamId },
      select: { division: true },
    });
    division = team?.division ?? null;
  }
  return { division, teamId: scope.teamId ?? null };
}

/** 상위 목표는 반드시 바로 윗 층이어야 캐스케이드가 어긋나지 않는다. */
async function resolveParentId(
  level: GoalLevel,
  rawParentId: string,
  cycleId: string,
  scope: { division: string | null; teamId: string | null },
  createdById: string
) {
  const expected = GOAL_PARENT_LEVEL[level];
  if (!expected || !rawParentId) return null;

  // "기타"를 고르면 그 층의 기타 묶음에 매단다(없으면 사슬째 만든다).
  if (rawParentId === OTHER_PARENT_VALUE) {
    return ensureOtherGoal(expected, cycleId, scope, createdById);
  }

  const parent = await prisma.goal.findUnique({
    where: { id: rawParentId },
    select: { level: true, cycleId: true },
  });
  if (!parent || parent.level !== expected || parent.cycleId !== cycleId) return null;
  return rawParentId;
}

/**
 * 등록·수정 폼의 필수값 검사. 브라우저의 required만 믿으면 안 된다 — 폼을
 * 우회해 서버 액션을 부르면 그냥 통과한다.
 *
 * 전사목표는 제외한다. 관리자가 조직 목표 관리 화면에서 표를 채우는 방식이라
 * 담당자·팀 같은 칸이 애초에 없다.
 */
function requireGoalFields(level: GoalLevel, formData: FormData) {
  if (level === "COMPANY") return;

  const need: [string, string][] = [
    ["title", "목표명"],
    ["parentId", `상위 ${GOAL_LEVEL_LABEL[GOAL_PARENT_LEVEL[level]!]}`],
    ["ownerId", level === "INDIVIDUAL" ? "담당자" : "책임자"],
    ["status", "상태"],
    ["dueDate", "마감일"],
  ];
  // 책임목표에는 목표수준·현재수준 칸이 없다 — 아래 팀목표가 굴러 올라온 값이다.
  if (level !== "DIVISION") need.push(["targetValue", "목표수준"], ["currentValue", "현재수준"]);
  if (level === "DIVISION") need.splice(2, 0, ["division", "책임"]);
  if (level === "TEAM" || level === "INDIVIDUAL") need.splice(2, 0, ["teamId", "팀"]);
  // 책임목표에는 가중치·측정지표·단위 칸이 없다 — 화면에 없는 걸 요구하면
  // 저장이 안 되는 이유를 아무도 알 수 없다.
  if (level !== "DIVISION") {
    need.splice(3, 0, ["weight", "가중치"], ["metric", "측정지표"], ["unit", "단위"]);
  }
  // 책임·팀 목표의 달성률은 하위에서 자동 계산되므로 입력칸 자체가 없다.
  if (level === "INDIVIDUAL") need.push(["progress", "달성률"]);

  const missing = need.filter(([field]) => !str(formData.get(field))).map(([, label]) => label);
  if (missing.length > 0) {
    throw new Error(`필수 항목을 입력해 주세요: ${missing.join(", ")}`);
  }
}

export async function createGoal(formData: FormData) {
  const session = await requireGoalModule();

  const level = asLevel(formData.get("level"));
  const cycleId = str(formData.get("cycleId"));
  const title = str(formData.get("title"));
  if (!level || !cycleId || !title) return;
  await requireCycleEditable(cycleId, "goal");

  requireGoalFields(level, formData);

  const admin = await isAdmin();
  const scope = scopeFieldsFor(level, formData);
  // 개인·팀 목표 폼에는 부문 칸이 없다. 기타 사슬(전사 → 책임 → 팀)을 만들려면
  // 어느 책임 아래인지 알아야 하므로 팀에서 끌어온다.
  const otherScope = await resolveOtherScope(scope);

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
      parentId: await resolveParentId(
        level,
        str(formData.get("parentId")),
        cycleId,
        otherScope,
        session.user.id
      ),
      title,
      description: str(formData.get("description")) || null,
      ...scope,
      weight: weightFor(level, formData),
      metric: str(formData.get("metric")) || null,
      targetValue: str(formData.get("targetValue")) || null,
      currentValue: str(formData.get("currentValue")) || null,
      unit: str(formData.get("unit")) || null,
      ...scaleFields(formData),
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
  const session = await requireGoalModule();

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

  requireGoalFields(existing.level as GoalLevel, formData);

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
  // 때문이다. 사이클이 완료(CLOSED)되면 그것마저 막힌다.
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
      description: str(formData.get("description")) || null,
      ...scope,
      ...(admin
        ? {
            parentId: await resolveParentId(
              level,
              str(formData.get("parentId")),
              existing.cycleId,
              await resolveOtherScope(scopeFieldsFor(level, formData)),
              session.user.id
            ),
            weight: weightFor(level, formData),
            sortOrder: parseNumber(formData.get("sortOrder"), 0),
          }
        : {}),
      metric: str(formData.get("metric")) || null,
      targetValue: str(formData.get("targetValue")) || null,
      currentValue: str(formData.get("currentValue")) || null,
      unit: str(formData.get("unit")) || null,
      ...scaleFields(formData),
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
