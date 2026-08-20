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

const COMPANY_GOAL_TEMPLATE_NOTE =
  "각 조직별 목표 달성을 위한 핵심 과제는 내부 공유 통해 정보 획득 및 실행 필요.\n사업개발의 경우 추후 확정 예정.";

/**
 * 전사목표가 아직 하나도 없는 사이클에 위 양식을 깔아준다. 이미 한 건이라도
 * 있으면 아무것도 하지 않는다 — 두 번 눌러서 열 줄이 되는 사고를 막는다.
 */
export async function seedCompanyGoalTemplate(cycleId: string) {
  const session = await requireGoalModule();
  if (!(await isAdmin())) throw new Error("전사목표 양식은 관리자만 넣을 수 있습니다.");

  const existing = await prisma.goal.count({ where: { cycleId, level: "COMPANY" } });
  if (existing > 0) return;

  const cycle = await prisma.goalCycle.findUnique({
    where: { id: cycleId },
    select: { id: true, note: true },
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

  if (!cycle.note) {
    await prisma.goalCycle.update({
      where: { id: cycleId },
      data: { note: COMPANY_GOAL_TEMPLATE_NOTE },
    });
  }
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
    select: { level: true, cycleId: true, progress: true, status: true },
  });
  if (!existing) return;

  const synced = reconcileProgressAndStatus(
    {
      progress: clampProgress(parseNumber(formData.get("progress"), 0)),
      status: asStatus(formData.get("status")),
    },
    { progress: existing.progress, status: existing.status as GoalStatus }
  );

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

  // 하위 목표는 지우지 않고 부모만 끊어서, 실수로 팀·개인 목표가 통째로
  // 사라지는 일이 없게 한다.
  await prisma.goal.updateMany({ where: { parentId: goalId }, data: { parentId: null } });
  await prisma.goal.delete({ where: { id: goalId } });
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
  if (!(await canManageGoal(goalId))) throw new Error("이 목표의 집계 여부를 바꿀 권한이 없습니다.");

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
