"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { activePrismaWhere } from "@/lib/hr-analytics";
import { notifyUsers } from "@/lib/notifications";
import {
  formatSessionDay,
  formatSessionTimeRange,
  parseKSTDateTime,
} from "@/lib/onboarding";

const PATH = "/platform/onboarding";
const LINK_FINAL = `${PATH}?tab=final`;

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * 잘못된 입력은 조용히 무시하지 말고 던진다 — 폼은 ActionForm으로 감싸져
 * 있어서, 던진 메시지가 그대로 사용자에게 알림으로 보인다.
 */
function fail(message: string): never {
  throw new Error(message);
}

/**
 * 서버 액션의 바깥 껍데기. 안에서 fail()이 던진 문구를 반환값으로 바꿔 준다.
 *
 * 프로덕션 빌드에서 Next는 서버 액션이 던진 오류의 message를 감추고 "An error
 * occurred in the Server Components render..."라는 영어 안내로 바꿔 버린다.
 * 그래서 던지기만 하면 사용자에게는 "직원을 선택해 주세요" 대신 무슨 말인지
 * 모를 문구가 뜬다. 반환값은 가려지지 않으므로 여기서 옮겨 담는다.
 */
async function run(body: () => Promise<void>): Promise<{ error?: string }> {
  try {
    await body();
    return {};
  } catch (error) {
    // redirect()/notFound() 같은 Next 내부 제어 신호는 그대로 흘려보낸다 —
    // requireRole()이 로그인 화면으로 보낼 때 이 경로를 탄다.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: unknown }).digest).startsWith("NEXT_")
    ) {
      throw error;
    }
    return { error: error instanceof Error ? error.message : "처리하지 못했습니다." };
  }
}

function parseDateOnly(value: FormDataEntryValue | null): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 폼의 날짜 + 시작/종료 시각을 읽는다. 시각을 분 단위로 받으므로 뒤집힌
 * 범위(종료 ≤ 시작)는 여기서 걸러 낸다 — 저장되고 나면 달력이 음수 길이의
 * 칸을 그리게 된다.
 */
function readTimeRange(formData: FormData, day?: string) {
  // 강사 응답·확정처럼 날짜가 이미 정해진 자리에서는 폼이 아니라 저장된
  // 날짜를 쓴다 — 시각만 받는 화면에서 날짜까지 바꿔 보낼 수 있으면 곤란하다.
  const date = day ?? formData.get("date");
  const startAt = parseKSTDateTime(date, formData.get("startTime"));
  const endAt = parseKSTDateTime(date, formData.get("endTime"));
  if (!startAt || !endAt) fail("날짜와 시작·종료 시간을 올바르게 입력해 주세요.");
  if (endAt <= startAt) fail("종료 시간이 시작 시간보다 빠르거나 같습니다.");
  return { startAt, endAt };
}

/**
 * 새로 적힌(또는 시각이 바뀐) 일정을 강사와 교육생에게 알린다. 여기 적히는
 * 일정은 이미 합의된 것이므로 "확인해 달라"가 아니라 "이렇게 잡혔다"는 통지다.
 */
async function notifyScheduled(
  programId: string,
  title: string,
  instructorIds: string[],
  when: string,
  changed = false
) {
  const trainees = await prisma.onboardingTrainee.findMany({
    where: { programId },
    select: { userId: true },
  });
  await notifyUsers(
    [...new Set([...instructorIds, ...trainees.map((t) => t.userId)])],
    "ONBOARDING_SCHEDULE_CHANGED",
    `[온보딩] "${title}" 일정이 ${changed ? "변경되었습니다" : "등록되었습니다"} — ${when}`,
    LINK_FINAL
  );
}

/**
 * 빈 칸은 null로 눕혀 둔다 — 빈 문자열이 들어가면 화면에서는 "적혀 있는데
 * 아무것도 없는" 칸이 된다.
 */
function optional(formData: FormData, key: string) {
  return text(formData, key) || null;
}

/** "10월 19일 (월) 10:00 ~ 12:00" — 알림 문구에 쓰는 일시. */
function whenLabel(startAt: Date, endAt: Date) {
  return `${formatSessionDay(startAt)} ${formatSessionTimeRange(startAt, endAt)}`;
}

/**
 * 폼에서 넘어온 담당 배정을 읽는다. 사람과 부서를 함께 고를 수 있다 —
 * "영업지원팀에서 한 명 + 인사팀 김OO" 같은 편성이 실제로 있어서, 둘 중
 * 하나만 고르게 하면 그런 교육을 적을 자리가 없다.
 *
 * 같은 값이 두 번 넘어와도 한 번만 담는다(폼에서 중복으로 고를 수 있다).
 */
async function readAssignment(formData: FormData) {
  const instructorIds = [...new Set(formData.getAll("instructorIds").map((v) => String(v).trim()).filter(Boolean))];
  const teamIds = [...new Set(formData.getAll("teamIds").map((v) => String(v).trim()).filter(Boolean))];

  for (const id of instructorIds) await assertEmployeeExists(id);
  if (teamIds.length > 0) {
    const found = await prisma.team.count({ where: { id: { in: teamIds } } });
    if (found !== teamIds.length) fail("존재하지 않는 부서입니다");
  }
  return { instructorIds, teamIds };
}

/** 재직 중인 임직원인지. 폼에서 고르는 값이지만 얼마든지 바꿔 보낼 수 있다. */
async function assertEmployeeExists(userId: string) {
  const found = await prisma.user.findFirst({
    where: { id: userId, ...activePrismaWhere() },
    select: { id: true },
  });
  if (!found) fail("존재하지 않는 임직원 입니다");
}


/* ---------------------------------------------------------------- 프로그램 */

export async function createProgram(formData: FormData) {
  return run(async () => {
    const session = await requireRole("ADMIN");
    const name = text(formData, "name");
    if (!name) fail("프로그램명을 입력해 주세요.");

    const startDate = parseDateOnly(formData.get("startDate"));
    const endDate = parseDateOnly(formData.get("endDate"));
    if (startDate && endDate && endDate < startDate) fail("종료일이 시작일보다 빠릅니다.");

    await prisma.onboardingProgram.create({
      data: {
        name,
        description: text(formData, "description") || null,
        startDate,
        endDate,
        notice: optional(formData, "notice"),
        createdById: session.user.id,
      },
    });
    revalidatePath(PATH);
  });
}

export async function updateProgram(programId: string, formData: FormData) {
  return run(async () => {
    await requireRole("ADMIN");
    const name = text(formData, "name");
    if (!name) fail("프로그램명을 입력해 주세요.");

    const startDate = parseDateOnly(formData.get("startDate"));
    const endDate = parseDateOnly(formData.get("endDate"));
    if (startDate && endDate && endDate < startDate) fail("종료일이 시작일보다 빠릅니다.");

    await prisma.onboardingProgram.update({
      where: { id: programId },
      data: {
        name,
        description: text(formData, "description") || null,
        startDate,
        endDate,
        notice: optional(formData, "notice"),
      },
    });
    revalidatePath(PATH);
  });
}

export async function toggleProgramActive(programId: string) {
  return run(async () => {
    await requireRole("ADMIN");
    const program = await prisma.onboardingProgram.findUnique({
      where: { id: programId },
      select: { active: true },
    });
    if (!program) fail("프로그램을 찾을 수 없습니다.");

    await prisma.onboardingProgram.update({
      where: { id: programId },
      data: { active: !program.active },
    });
    revalidatePath(PATH);
  });
}

export async function deleteProgram(programId: string) {
  return run(async () => {
    await requireRole("ADMIN");
    await prisma.onboardingProgram.delete({ where: { id: programId } });
    revalidatePath(PATH);
  });
}

/* ------------------------------------------------------------- 일정 편성 */

/** 한 강사가 같은 시간에 두 강의를 맡지 않도록. */
async function assertNoInstructorOverlap(
  instructorIds: string[],
  startAt: Date,
  endAt: Date,
  exceptSessionId?: string
) {
  if (instructorIds.length === 0) return;

  const clash = await prisma.onboardingSession.findFirst({
    where: {
      instructors: { some: { userId: { in: instructorIds } } },
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      // 경계가 맞닿는 경우(12:00 종료 / 12:00 시작)는 겹침이 아니다.
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: {
      title: true,
      startAt: true,
      endAt: true,
      instructors: {
        where: { userId: { in: instructorIds } },
        select: { user: { select: { name: true } } },
      },
    },
  });
  if (clash) {
    const who = clash.instructors.map((i) => i.user.name).join(", ");
    fail(
      `${who}님은 같은 시간에 "${clash.title}" (${whenLabel(clash.startAt, clash.endAt)}) 강의가 이미 잡혀 있습니다.`
    );
  }
}

/**
 * 이미 합의된 교육 일정 한 칸을 적어 넣는다. 조율은 이 화면 밖에서 끝내고
 * 오는 것이라 여기 적히는 순간 확정본이고, 곧바로 온보딩 안내에 실린다.
 */
export async function createSession(formData: FormData) {
  return run(async () => {
    const session = await requireRole("ADMIN");

    const programId = text(formData, "programId");
    const title = text(formData, "title");

    if (!programId) fail("기수를 먼저 선택해 주세요.");
    if (!title) fail("과정명을 입력해 주세요.");

    const { startAt, endAt } = readTimeRange(formData);
    const { instructorIds, teamIds } = await readAssignment(formData);
    await assertNoInstructorOverlap(instructorIds, startAt, endAt);

    const created = await prisma.onboardingSession.create({
      data: {
        programId,
        title,
        description: optional(formData, "description"),
        location: optional(formData, "location"),
        startAt,
        endAt,
        instructors: { create: instructorIds.map((userId) => ({ userId })) },
        teams: { create: teamIds.map((teamId) => ({ teamId })) },
        createdById: session.user.id,
      },
    });

    await notifyScheduled(programId, created.title, instructorIds, whenLabel(startAt, endAt));
    revalidatePath(PATH);
  });
}

/** 적어 둔 일정을 고친다. */
export async function updateSession(sessionId: string, formData: FormData) {
  return run(async () => {
    await requireRole("ADMIN");

    const target = await prisma.onboardingSession.findUnique({
      where: { id: sessionId },
      select: {
        programId: true,
        startAt: true,
        endAt: true,
        instructors: { select: { userId: true } },
        teams: { select: { teamId: true } },
      },
    });
    if (!target) fail("일정을 찾을 수 없습니다.");

    const title = text(formData, "title");
    if (!title) fail("과정명을 입력해 주세요.");

    const { startAt, endAt } = readTimeRange(formData);
    const { instructorIds, teamIds } = await readAssignment(formData);
    await assertNoInstructorOverlap(instructorIds, startAt, endAt, sessionId);

    await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: {
        title,
        description: optional(formData, "description"),
        location: optional(formData, "location"),
        startAt,
        endAt,
        // 통째로 갈아 끼운다 — 빠진 사람을 지우고 새로 든 사람을 넣는 일을
        // 따로 계산하는 것보다 이쪽이 어긋날 여지가 없다.
        instructors: { deleteMany: {}, create: instructorIds.map((userId) => ({ userId })) },
        teams: { deleteMany: {}, create: teamIds.map((teamId) => ({ teamId })) },
      },
    });

    // 교육생이 이미 그 시간을 비워 둔 뒤라, 시각이 바뀐 사실은 알려야 한다 —
    // 안내서만 조용히 바뀌면 헛걸음하는 사람이 생긴다. 담당이 바뀐 경우도
    // 새로 맡은 사람은 알아야 한다.
    const timeChanged =
      target.startAt.getTime() !== startAt.getTime() || target.endAt.getTime() !== endAt.getTime();
    const same = (before: string[], after: string[]) =>
      before.length === after.length && [...before].sort().join() === [...after].sort().join();
    const assignmentChanged =
      !same(target.instructors.map((i) => i.userId), instructorIds) ||
      !same(target.teams.map((t) => t.teamId), teamIds);
    if (timeChanged || assignmentChanged) {
      await notifyScheduled(target.programId, title, instructorIds, whenLabel(startAt, endAt), timeChanged);
    }
    revalidatePath(PATH);
  });
}

export async function deleteSession(sessionId: string) {
  return run(async () => {
    await requireRole("ADMIN");
    await prisma.onboardingSession.delete({ where: { id: sessionId } });
    revalidatePath(PATH);
  });
}

/* ------------------------------------------------------- 숙박 · 교통 안내 */

/** 폼에서 넘어온 구분. 값이 이상하면 숙박으로 둔다. */
function readLogisticsKind(formData: FormData): "LODGING" | "TRANSPORT" {
  return text(formData, "kind") === "TRANSPORT" ? "TRANSPORT" : "LODGING";
}

/** 날짜와 내용을 읽는다. 끝나는 날이 시작보다 빠른 기간은 막는다. */
function readLogistics(formData: FormData) {
  const startDate = parseDateOnly(formData.get("startDate"));
  if (!startDate) fail("날짜를 입력해 주세요.");
  const endDate = parseDateOnly(formData.get("endDate"));
  if (endDate && endDate < startDate) fail("끝나는 날이 시작하는 날보다 빠릅니다.");

  const title = text(formData, "title");
  if (!title) fail("내용을 입력해 주세요.");

  return {
    kind: readLogisticsKind(formData),
    startDate,
    // 하루짜리면 굳이 같은 날짜를 두 번 담지 않는다 — 화면에서 "8월 12일 ~
    // 8월 12일"로 나가는 것을 막는다.
    endDate: endDate && endDate.getTime() !== startDate.getTime() ? endDate : null,
    title,
    detail: optional(formData, "detail"),
  };
}

export async function addLogistics(formData: FormData) {
  return run(async () => {
    const session = await requireRole("ADMIN");
    const programId = text(formData, "programId");
    if (!programId) fail("기수를 먼저 선택해 주세요.");

    await prisma.onboardingLogistics.create({
      data: { programId, ...readLogistics(formData), createdById: session.user.id },
    });
    revalidatePath(PATH);
  });
}

export async function updateLogistics(logisticsId: string, formData: FormData) {
  return run(async () => {
    await requireRole("ADMIN");
    await prisma.onboardingLogistics.update({
      where: { id: logisticsId },
      data: readLogistics(formData),
    });
    revalidatePath(PATH);
  });
}

export async function deleteLogistics(logisticsId: string) {
  return run(async () => {
    await requireRole("ADMIN");
    await prisma.onboardingLogistics.delete({ where: { id: logisticsId } });
    revalidatePath(PATH);
  });
}

/* ---------------------------------------------------------------- 교육생 */

export async function addTrainee(formData: FormData) {
  return run(async () => {
    const session = await requireRole("ADMIN");
    const programId = text(formData, "programId");
    const userId = text(formData, "userId");
    if (!programId) fail("기수를 먼저 선택해 주세요.");
    if (!userId) fail("직원을 선택해 주세요.");
    await assertEmployeeExists(userId);

    await prisma.onboardingTrainee.upsert({
      where: { programId_userId: { programId, userId } },
      create: { programId, userId, note: text(formData, "note") || null, addedById: session.user.id },
      update: { note: text(formData, "note") || null },
    });
    revalidatePath(PATH);
  });
}

export async function removeTrainee(traineeId: string) {
  return run(async () => {
    await requireRole("ADMIN");
    await prisma.onboardingTrainee.delete({ where: { id: traineeId } });
    revalidatePath(PATH);
  });
}

/**
 * 사번이나 이름을 여러 줄(또는 쉼표로) 붙여넣어 교육생을 한 번에 등록한다.
 * 찾지 못했거나 이름이 겹쳐 특정할 수 없는 줄은 그대로 돌려준다 — 조용히
 * 빼먹으면 명단이 비는데도 아무도 모른 채 넘어간다.
 */
export async function addTraineesBulk(formData: FormData) {
  return run(async () => {
    const session = await requireRole("ADMIN");
    const programId = text(formData, "programId");
    if (!programId) fail("기수를 먼저 선택해 주세요.");

    const tokens = [
      ...new Set(
        text(formData, "entries")
          .split(/[\n,\t;]+/)
          .map((t) => t.trim())
          .filter(Boolean)
      ),
    ];
    if (tokens.length === 0) fail("사번이나 이름을 한 줄에 하나씩 붙여넣어 주세요.");

    const candidates = await prisma.user.findMany({
      where: { ...activePrismaWhere(), OR: [{ employeeNumber: { in: tokens } }, { name: { in: tokens } }] },
      select: { id: true, name: true, employeeNumber: true },
    });

    const matched: string[] = [];
    const unmatched: string[] = [];
    const ambiguous: string[] = [];
    for (const token of tokens) {
      const byNumber = candidates.filter((c) => c.employeeNumber === token);
      const hits = byNumber.length > 0 ? byNumber : candidates.filter((c) => c.name === token);
      if (hits.length === 0) unmatched.push(token);
      else if (hits.length > 1) ambiguous.push(token);
      else matched.push(hits[0].id);
    }

    if (matched.length > 0) {
      await prisma.onboardingTrainee.createMany({
        data: matched.map((userId) => ({ programId, userId, addedById: session.user.id })),
        skipDuplicates: true,
      });
    }
    revalidatePath(PATH);

    const problems = [
      unmatched.length ? `존재하지 않는 임직원 입니다: ${unmatched.join(", ")}` : "",
      ambiguous.length ? `이름이 겹쳐 사번이 필요합니다: ${ambiguous.join(", ")}` : "",
    ].filter(Boolean);
    if (problems.length > 0) {
      // 한 명도 못 넣었으면 "0명 등록했습니다"를 앞에 붙일 이유가 없다.
      fail(matched.length > 0 ? `${matched.length}명 등록했습니다. ${problems.join(" / ")}` : problems.join(" / "));
    }
  });
}

/**
 * 한 교육의 참석 대상을 지정한다. 아무도 체크하지 않으면 지정을 모두 지워
 * "기수 전원 대상"으로 되돌린다 — 사람마다 듣는 프로그램이 다르므로, 일부만
 * 듣는 교육에는 명단을 넣는다.
 */
export async function setSessionAudience(sessionId: string, formData: FormData) {
  return run(async () => {
    await requireRole("ADMIN");

    const target = await prisma.onboardingSession.findUnique({
      where: { id: sessionId },
      select: { programId: true },
    });
    if (!target) fail("일정을 찾을 수 없습니다.");

    const requested = formData.getAll("traineeIds").map((v) => String(v));
    const valid = requested.length
      ? await prisma.onboardingTrainee.findMany({
          where: { id: { in: requested }, programId: target.programId },
          select: { id: true },
        })
      : [];

    await prisma.$transaction([
      prisma.onboardingSessionAttendee.deleteMany({ where: { sessionId } }),
      ...(valid.length
        ? [
            prisma.onboardingSessionAttendee.createMany({
              data: valid.map((t) => ({ sessionId, traineeId: t.id })),
            }),
          ]
        : []),
    ]);
    revalidatePath(PATH);
  });
}
