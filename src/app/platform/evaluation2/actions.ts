"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireRole } from "@/lib/auth-helpers";
import { checkModuleAccess } from "@/lib/permissions";
import {
  GOAL_CYCLE_STATUSES,
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

function str(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  const s = str(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseNumber(value: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(str(value));
  return Number.isFinite(n) ? n : fallback;
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

// --- 목표 사이클 -----------------------------------------------------------

export async function createGoalCycle(formData: FormData) {
  await requireGoalModule();
  if (!(await isAdmin())) throw new Error("목표 사이클은 관리자만 만들 수 있습니다.");

  const name = str(formData.get("name"));
  const startDate = parseDate(formData.get("startDate"));
  const endDate = parseDate(formData.get("endDate"));
  if (!name || !startDate || !endDate) return;

  const year = parseNumber(formData.get("year"), startDate.getFullYear());

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

/** 전사목표 표 아래 안내문. 줄바꿈 한 줄이 각주 한 항목이 된다. */
export async function updateGoalCycleNote(formData: FormData) {
  await requireGoalModule();
  if (!(await isAdmin())) throw new Error("안내문은 관리자만 고칠 수 있습니다.");

  const cycleId = str(formData.get("cycleId"));
  if (!cycleId) return;

  await prisma.goalCycle.update({
    where: { id: cycleId },
    data: { note: str(formData.get("note")) || null },
  });
  revalidatePath(PATH);
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
      progress: clampProgress(parseNumber(formData.get("progress"), 0)),
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
    select: { level: true, cycleId: true },
  });
  if (!existing) return;

  const level = existing.level as GoalLevel;
  const admin = await isAdmin();

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
      progress: clampProgress(parseNumber(formData.get("progress"), 0)),
      status: asStatus(formData.get("status")),
      dueDate: parseDate(formData.get("dueDate")),
    },
  });
  revalidatePath(PATH);
}

export async function deleteGoal(goalId: string) {
  await requireGoalModule();
  if (!(await isAdmin())) throw new Error("목표 삭제는 관리자만 할 수 있습니다.");

  // 하위 목표는 지우지 않고 부모만 끊어서, 실수로 팀·개인 목표가 통째로
  // 사라지는 일이 없게 한다.
  await prisma.goal.updateMany({ where: { parentId: goalId }, data: { parentId: null } });
  await prisma.goal.delete({ where: { id: goalId } });
  revalidatePath(PATH);
}

/** 진척 갱신 한 건 = 목표의 progress 갱신 + 이력 한 줄. */
export async function addGoalCheckIn(formData: FormData) {
  const session = await requireGoalModule();

  const goalId = str(formData.get("goalId"));
  if (!goalId) return;
  if (!(await canManageGoal(goalId))) throw new Error("이 목표의 진척을 올릴 권한이 없습니다.");

  const progress = clampProgress(parseNumber(formData.get("progress"), 0));
  const note = str(formData.get("note"));
  const currentValue = str(formData.get("currentValue"));

  await prisma.$transaction([
    prisma.goal.update({
      where: { id: goalId },
      data: {
        progress,
        ...(currentValue ? { currentValue } : {}),
        ...(progress >= 100 ? { status: "DONE" as const } : {}),
      },
    }),
    prisma.goalCheckIn.create({
      data: { goalId, progress, note: note || null, authorId: session.user.id },
    }),
  ]);
  revalidatePath(PATH);
}
