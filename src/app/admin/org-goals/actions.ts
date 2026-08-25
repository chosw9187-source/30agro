"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { GOAL_STATUSES, cycleLock, type GoalStatus } from "@/lib/goals";


const ADMIN_PATH = "/admin/org-goals";
const VIEW_PATH = "/platform/evaluation2";

function str(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function parseDate(value: FormDataEntryValue | null): Date | null {
  const s = str(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 빈 칸은 0이 아니라 "값 없음" — Number("")가 0이라 그냥 두면 조용히 0이 박힌다. */
function parseNumber(value: FormDataEntryValue | null, fallback = 0): number {
  const raw = str(value);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function asStatus(value: FormDataEntryValue | null): GoalStatus {
  const s = str(value);
  return (GOAL_STATUSES as readonly string[]).includes(s) ? (s as GoalStatus) : "ACTIVE";
}

function revalidateBoth() {
  revalidatePath(ADMIN_PATH);
  revalidatePath(VIEW_PATH);
}

/**
 * 마감된 사이클의 목표는 관리자도 못 고친다. 마감을 눌러 놓고 관리자만 몰래
 * 고칠 수 있으면 "마감"이라는 말이 화면에서 거짓이 된다 — 고쳐야 하면 목표
 * 사이클 목록에서 마감을 풀고 고친다.
 */
async function requireCycleUnlocked(cycleId: string) {
  const cycle = await prisma.goalCycle.findUnique({
    where: { id: cycleId },
    select: { status: true, goalsLockedAt: true },
  });
  if (!cycle) throw new Error("인사평가를 찾을 수 없습니다.");
  const lock = cycleLock(cycle);
  if (!lock.canEditGoals) throw new Error(lock.message ?? "지금은 고칠 수 없습니다.");
}

/**
 * 조직 목표 표를 통째로 저장한다. 행마다 저장 버튼을 두면 다섯 줄 고치는 데
 * 다섯 번 눌러야 해서, 표 하나에 저장 한 번으로 맞춘다. 넘어온 id 중
 * 이 사이클의 전사목표가 아닌 건 무시한다.
 */
export async function saveOrgGoals(formData: FormData) {
  await requireRole("ADMIN");

  const cycleId = str(formData.get("cycleId"));
  if (!cycleId) return;
  await requireCycleUnlocked(cycleId);

  const rows = await prisma.goal.findMany({
    where: { cycleId, level: "COMPANY" },
    select: { id: true },
  });

  await prisma.$transaction(
    rows.map((row, i) =>
      prisma.goal.update({
        where: { id: row.id },
        data: {
          title: str(formData.get(`title:${row.id}`)) || undefined,
          metric: str(formData.get(`metric:${row.id}`)) || null,
          targetValue: str(formData.get(`targetValue:${row.id}`)) || null,
          currentValue: str(formData.get(`currentValue:${row.id}`)) || null,
          weight: parseNumber(formData.get(`weight:${row.id}`), 0),
          // 조직 목표 달성률은 하위에서 자동 계산되는 값이라 여기서 건드리지
          // 않는다. 폼에도 입력칸이 없다.
          status: asStatus(formData.get(`status:${row.id}`)),
          dueDate: parseDate(formData.get(`dueDate:${row.id}`)),
          sortOrder: parseNumber(formData.get(`sortOrder:${row.id}`), i + 1),
        },
      })
    )
  );
  revalidateBoth();
}

/** 표 맨 아래에 한 줄 추가. */
export async function addOrgGoal(formData: FormData) {
  const session = await requireRole("ADMIN");

  const cycleId = str(formData.get("cycleId"));
  const title = str(formData.get("newTitle"));
  if (!cycleId || !title) return;
  await requireCycleUnlocked(cycleId);

  const last = await prisma.goal.findFirst({
    where: { cycleId, level: "COMPANY" },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.goal.create({
    data: {
      cycleId,
      level: "COMPANY",
      title,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      createdById: session.user.id,
    },
  });
  revalidateBoth();
}

/**
 * 조직 목표 한 줄 삭제. 하위(책임·팀·개인) 목표는 지우지 않고 부모 연결만
 * 끊어서, 실수로 아래 계층이 통째로 사라지지 않게 한다.
 */
export async function deleteOrgGoal(goalId: string) {
  await requireRole("ADMIN");

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { level: true, cycleId: true },
  });
  if (goal?.level !== "COMPANY") return;
  await requireCycleUnlocked(goal.cycleId);

  await prisma.goal.updateMany({ where: { parentId: goalId }, data: { parentId: null } });
  await prisma.goal.delete({ where: { id: goalId } });
  revalidateBoth();
}

