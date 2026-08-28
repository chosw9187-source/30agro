"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { activePrismaWhere } from "@/lib/hr-analytics";
import { notifyUser, notifyUsers } from "@/lib/notifications";
import {
  canCoordinateSessions,
  formatSessionDay,
  formatSessionTimeRange,
  canHandleTeamSession,
  parseKSTDateTime,
  toKSTInputValues,
} from "@/lib/onboarding";

const ALL_ROLES = ["ADMIN", "EVALUATOR", "EMPLOYEE"] as const;
const PATH = "/platform/onboarding";
const LINK_PROGRAM = `${PATH}?tab=program`;
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
 * 편성할 때 고르는 확정 방식. 강사에게 가능 여부를 물어야 하는 강의가 있는가
 * 하면, 관리자가 이미 다 정해 두고 공지만 하면 되는 강의도 있다. 값이 이상하면
 * 물어보는 쪽으로 둔다 — 묻지 않고 확정해 버리는 쪽이 되돌리기 번거롭다.
 */
function readConfirmMode(formData: FormData): "ASK" | "NOW" {
  return text(formData, "confirmMode") === "NOW" ? "NOW" : "ASK";
}

/** 확정된(또는 확정된 채로 시각이 바뀐) 일정을 강사와 교육생에게 알린다. */
async function notifyConfirmed(
  programId: string,
  title: string,
  instructorId: string | null,
  when: string,
  changed = false
) {
  const trainees = await prisma.onboardingTrainee.findMany({
    where: { programId },
    select: { userId: true },
  });
  await notifyUsers(
    [...new Set([...(instructorId ? [instructorId] : []), ...trainees.map((t) => t.userId)])],
    "ONBOARDING_SCHEDULE_CHANGED",
    `[온보딩] "${title}" 일정이 ${changed ? "변경" : "확정"}되었습니다 — ${when}`,
    LINK_FINAL
  );
}

/** "10월 19일 (월) 10:00 ~ 12:00" — 알림 문구에 쓰는 일시. */
function whenLabel(startAt: Date, endAt: Date) {
  return `${formatSessionDay(startAt)} ${formatSessionTimeRange(startAt, endAt)}`;
}

/**
 * 폼에서 넘어온 담당 배정을 읽는다. 개인 배정(사람)과 부서 배정(팀)은 서로
 * 배타적이다 — 둘 다 들어오면 무엇이 우선인지 화면과 서버가 어긋난다.
 *
 * 부서 배정은 "그 날 되는 사람이 맡는다"는 뜻이라 이 시점엔 사람이 없고,
 * 나중에 그 팀 강사 중 먼저 전송한 사람이 담당으로 들어간다.
 */
async function readAssignment(formData: FormData) {
  const mode = text(formData, "assignMode");
  if (mode === "TEAM" || mode === "TEAM_LEADER") {
    const leaderOnly = mode === "TEAM_LEADER";
    const instructorTeamId = text(formData, "instructorTeamId");
    if (!instructorTeamId) fail("담당 부서를 선택해 주세요.");

    const team = await prisma.team.findUnique({
      where: { id: instructorTeamId },
      select: { name: true, leaderId: true },
    });
    if (!team) fail("존재하지 않는 부서입니다");

    // 팀장에게만 맡기려면 그 팀에 팀장이 있어야 한다. 없는 채로 두면 알림
    // 받을 사람도, 강사를 정할 사람도 없어 그대로 멈춘다.
    if (leaderOnly && !team.leaderId) {
      fail(`${team.name}에 팀장이 지정되어 있지 않습니다. [팀관리]에서 팀장을 먼저 지정하거나 다른 담당 구분을 선택해 주세요.`);
    }
    return { instructorId: null, instructorTeamId, leaderOnly };
  }

  const instructorId = text(formData, "instructorId") || null;
  if (instructorId) await assertEmployeeExists(instructorId);
  return { instructorId, instructorTeamId: null, leaderOnly: false };
}

/**
 * 부서 배정을 알릴 대상. 강사를 정할 수 있는 사람에게만 보낸다 — 팀장에게만
 * 맡긴 강의면 팀장 한 사람에게, 부서에 열어 둔 강의면 재직자 전원에게.
 * 정할 수 없는 사람에게 "지정해 주세요"를 보내 봐야 소용이 없고, 반대로 한
 * 사람에게만 보내면 그 사람이 자리에 없을 때 아무도 모른 채 넘어간다.
 */
async function teamNotifyIds(teamId: string, leaderOnly: boolean): Promise<string[]> {
  if (leaderOnly) {
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { leaderId: true } });
    return team?.leaderId ? [team.leaderId] : [];
  }
  const members = await prisma.user.findMany({
    where: { teamId, ...activePrismaWhere() },
    select: { id: true },
  });
  return members.map((m) => m.id);
}

/** 재직 중인 임직원인지. 폼에서 고르는 값이지만 얼마든지 바꿔 보낼 수 있다. */
async function assertEmployeeExists(userId: string) {
  const found = await prisma.user.findFirst({
    where: { id: userId, ...activePrismaWhere() },
    select: { id: true },
  });
  if (!found) fail("존재하지 않는 임직원 입니다");
}

async function adminIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", ...activePrismaWhere() },
    select: { id: true },
  });
  return admins.map((a) => a.id);
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
      data: { name, description: text(formData, "description") || null, startDate, endDate },
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
  instructorId: string,
  startAt: Date,
  endAt: Date,
  exceptSessionId?: string
) {
  const clash = await prisma.onboardingSession.findFirst({
    where: {
      instructorId,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      status: "CONFIRMED",
      // 경계가 맞닿는 경우(12:00 종료 / 12:00 시작)는 겹침이 아니다.
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { title: true, startAt: true, endAt: true },
  });
  if (clash) {
    fail(`같은 시간에 "${clash.title}" (${whenLabel(clash.startAt, clash.endAt)}) 강의가 이미 확정되어 있습니다.`);
  }
}

/**
 * 관리자가 시간표 한 칸을 편성한다. 날짜와 시각을 분 단위로 적어 두고, 두 갈래
 * 중 하나를 고른다 — 강사에게 가능 여부를 물어보고 답을 받아 확정하거나,
 * 물어볼 것 없이 그 자리에서 바로 확정하거나. 바로 확정한 칸은 곧장
 * [최종 스케줄]에 나가고 교육생에게 알림이 간다.
 */
export async function createSession(formData: FormData) {
  return run(async () => {
    const session = await requireRole("ADMIN");

    const programId = text(formData, "programId");
    const title = text(formData, "title");

    if (!programId) fail("기수를 먼저 선택해 주세요.");
    if (!title) fail("과정명을 입력해 주세요.");

    const { startAt, endAt } = readTimeRange(formData);
    const { instructorId, instructorTeamId, leaderOnly } = await readAssignment(formData);
    const confirmNow = readConfirmMode(formData) === "NOW";

    // 확정하는 순간부터 그 강사의 시간이 잡힌다 — 물어보는 단계에서는 아직
    // 시각이 바뀔 수 있으므로 겹침은 확정할 때만 본다.
    if (confirmNow && instructorId) await assertNoInstructorOverlap(instructorId, startAt, endAt);

    const created = await prisma.onboardingSession.create({
      data: {
        programId,
        title,
        description: text(formData, "description") || null,
        location: text(formData, "location") || null,
        startAt,
        endAt,
        instructorId,
        instructorTeamId,
        leaderOnly,
        status: confirmNow ? "CONFIRMED" : "PLANNED",
        confirmedAt: confirmNow ? new Date() : null,
        createdById: session.user.id,
      },
    });

    const when = whenLabel(startAt, endAt);
    if (confirmNow) {
      await notifyConfirmed(programId, created.title, instructorId, when);
      // 사람을 못 박지 않고 부서에 맡긴 채 확정한 경우 — 시각은 정해졌지만
      // 누가 나갈지는 그 부서가 정해야 하므로 따로 알린다.
      if (instructorTeamId) {
        await notifyUsers(
          await teamNotifyIds(instructorTeamId, leaderOnly),
          "ONBOARDING_BOOKING_REQUESTED",
          `[온보딩] "${created.title}" 강의가 부서에 배정되었습니다 (${when} · 확정). 담당 강사를 지정해 주세요.`,
          LINK_PROGRAM
        );
      }
    } else if (instructorId) {
      await notifyUser(
        instructorId,
        "ONBOARDING_BOOKING_REQUESTED",
        `[온보딩] "${created.title}" 강의가 배정되었습니다 (${when}). 가능 여부를 알려 주세요.`,
        undefined,
        LINK_PROGRAM
      );
    } else if (instructorTeamId) {
      await notifyUsers(
        await teamNotifyIds(instructorTeamId, leaderOnly),
        "ONBOARDING_BOOKING_REQUESTED",
        `[온보딩] "${created.title}" 강의가 부서에 배정되었습니다 (${when}). 담당 강사를 지정해 주세요.`,
        LINK_PROGRAM
      );
    }
    revalidatePath(PATH);
  });
}

/** 관리자가 편성한 내용을 고친다. */
export async function updateSession(sessionId: string, formData: FormData) {
  return run(async () => {
    await requireRole("ADMIN");

    const target = await prisma.onboardingSession.findUnique({
      where: { id: sessionId },
      select: {
        status: true,
        programId: true,
        startAt: true,
        endAt: true,
        instructorId: true,
        instructorTeamId: true,
        leaderOnly: true,
      },
    });
    if (!target) fail("일정을 찾을 수 없습니다.");

    const title = text(formData, "title");
    if (!title) fail("과정명을 입력해 주세요.");

    const { startAt, endAt } = readTimeRange(formData);
    const { instructorId, instructorTeamId, leaderOnly } = await readAssignment(formData);

    const confirmed = target.status === "CONFIRMED";
    if (confirmed && instructorId) {
      await assertNoInstructorOverlap(instructorId, startAt, endAt, sessionId);
    }

    await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: {
        title,
        description: text(formData, "description") || null,
        location: text(formData, "location") || null,
        startAt,
        endAt,
        instructorId,
        instructorTeamId,
        leaderOnly,
      },
    });

    // 이미 확정돼 교육생이 그 시간을 비워 둔 강의라면, 시각이 바뀐 사실을
    // 알려야 한다 — 최종 스케줄만 조용히 바뀌면 헛걸음하는 사람이 생긴다.
    const timeChanged =
      target.startAt.getTime() !== startAt.getTime() || target.endAt.getTime() !== endAt.getTime();
    if (confirmed && timeChanged) {
      await notifyConfirmed(target.programId, title, instructorId, whenLabel(startAt, endAt), true);
    }

    const assignmentChanged =
      instructorId !== target.instructorId ||
      instructorTeamId !== target.instructorTeamId ||
      leaderOnly !== target.leaderOnly;
    if (assignmentChanged) {
      const when = whenLabel(startAt, endAt);
      if (instructorId) {
        await notifyUser(
          instructorId,
          "ONBOARDING_BOOKING_REQUESTED",
          `[온보딩] "${title}" 강의가 배정되었습니다 (${when}). 가능 여부를 알려 주세요.`,
          undefined,
          LINK_PROGRAM
        );
      } else if (instructorTeamId) {
        await notifyUsers(
          await teamNotifyIds(instructorTeamId, leaderOnly),
          "ONBOARDING_BOOKING_REQUESTED",
          `[온보딩] "${title}" 강의가 부서에 배정되었습니다 (${when}). 담당 강사를 지정해 주세요.`,
          LINK_PROGRAM
        );
      }
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

/* --------------------------------------------------- 부서·강사의 응답 */

/**
 * 이 사람이 이 강의에 답할 수 있는지. 담당 강사 본인이거나, 부서 배정 강의의
 * 그 부서 소속이면 된다 — 부서 안에서 서로 사정을 알고 대신 조율해 주는
 * 경우가 있어 같은 부서 사람이면 직급과 무관하게 답할 수 있게 열어 둔다.
 */
async function requireResponder(sessionId: string, userId: string, isAdmin: boolean) {
  const target = await prisma.onboardingSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      title: true,
      status: true,
      startAt: true,
      endAt: true,
      instructorId: true,
      instructorTeamId: true,
      leaderOnly: true,
      instructor: { select: { name: true } },
    },
  });
  if (!target) fail("일정을 찾을 수 없습니다.");
  if (target.status === "CONFIRMED") fail("이미 확정된 강의입니다. 변경이 필요하면 관리자에게 요청해 주세요.");

  if (isAdmin) return target;
  if (target.instructorId === userId) return target;
  if (
    target.instructorTeamId &&
    (await canHandleTeamSession(userId, target.instructorTeamId, target.leaderOnly))
  ) {
    return target;
  }

  fail(
    target.instructorId
      ? `${target.instructor?.name ?? "다른 분"}님이 담당인 강의입니다.`
      : "본인에게 배정된 강의만 답할 수 있습니다."
  );
}

/**
 * 강사(또는 같은 부서 사람)가 가능 여부를 답한다. 가능하면 되는 시각을 적고
 * 필요하면 단서를 붙이고, 불가하면 사유를 남긴다 — 관리자가 다음 수를 두려면
 * "왜 안 되는지"가 있어야 다른 날로 옮기든 다른 사람을 찾든 할 수 있다.
 *
 * 날짜는 관리자가 잡은 날 그대로다. 강사가 정하는 것은 그 날 안에서의 시각,
 * 마지막으로 확정하는 것은 관리자다.
 */
export async function replyAvailability(sessionId: string, formData: FormData) {
  return run(async () => {
    const session = await requireRole(...ALL_ROLES);
    const isAdmin = session.user.role === "ADMIN";
    if (!isAdmin && !(await canCoordinateSessions(session.user.id))) {
      fail("배정된 강의가 있는 분만 사용할 수 있습니다.");
    }

    const target = await requireResponder(sessionId, session.user.id, isAdmin);
    if (!target.instructorId) {
      fail("담당 강사가 지정되지 않았습니다. 부서에서 강사를 먼저 지정해야 합니다.");
    }

    const available = text(formData, "available") === "yes";
    const note = text(formData, "note");
    if (!available && !note) fail("불가 사유를 적어 주세요.");

    const answered = available ? readTimeRange(formData, toKSTInputValues(target.startAt).date) : null;

    await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: {
        status: available ? "SUBMITTED" : "DECLINED",
        instructorStartAt: answered?.startAt ?? null,
        instructorEndAt: answered?.endAt ?? null,
        instructorNote: note || null,
        respondedAt: new Date(),
      },
    });

    const who = target.instructor?.name ?? session.user.name;
    await notifyUsers(
      await adminIds(),
      "ONBOARDING_BOOKING_REQUESTED",
      available && answered
        ? `[온보딩] ${who}님이 "${target.title}" 강의 가능으로 답했습니다 — ${whenLabel(
            answered.startAt,
            answered.endAt
          )}${note ? ` (${note})` : ""}. 시간을 확정해 주세요.`
        : `[온보딩] ${who}님이 "${target.title}" 강의 불가로 답했습니다 — ${note}`,
      LINK_PROGRAM
    );
    revalidatePath(PATH);
  });
}

/* --------------------------------------------------------- 관리자 확정 */

/**
 * 관리자가 최종 시각을 정해 확정한다 — 이때부터 [최종 스케줄]에 나타난다.
 * 강사가 답해 온 시각을 그대로 쓸 수도, 조정해서 확정할 수도 있다.
 */
export async function confirmSession(sessionId: string, formData: FormData) {
  return run(async () => {
    await requireRole("ADMIN");
    const target = await prisma.onboardingSession.findUnique({
      where: { id: sessionId },
      select: {
        title: true,
        status: true,
        startAt: true,
        instructorId: true,
        programId: true,
      },
    });
    if (!target) fail("일정을 찾을 수 없습니다.");
    if (target.status === "CONFIRMED") fail("이미 확정된 일정입니다.");

    // 날짜는 편성된 날을 그대로 쓰고, 시각만 새로 받는다.
    const { startAt, endAt } = readTimeRange(formData, toKSTInputValues(target.startAt).date);

    if (target.instructorId) {
      await assertNoInstructorOverlap(target.instructorId, startAt, endAt, sessionId);
    }

    await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: { startAt, endAt, status: "CONFIRMED", confirmedAt: new Date() },
    });

    await notifyConfirmed(target.programId, target.title, target.instructorId, whenLabel(startAt, endAt));
    revalidatePath(PATH);
  });
}

/** 확정을 되돌린다 — 강사가 다시 답할 수 있는 상태로. */
export async function unconfirmSession(sessionId: string) {
  return run(async () => {
    await requireRole("ADMIN");
    const target = await prisma.onboardingSession.findUnique({
      where: { id: sessionId },
      select: { title: true, instructorId: true },
    });
    if (!target) fail("일정을 찾을 수 없습니다.");

    await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: {
        status: "PLANNED",
        confirmedAt: null,
        respondedAt: null,
        instructorStartAt: null,
        instructorEndAt: null,
      },
    });

    if (target.instructorId) {
      await notifyUser(
        target.instructorId,
        "ONBOARDING_BOOKING_DECIDED",
        `[온보딩] "${target.title}" 강의 확정이 해제되었습니다. 가능 여부를 다시 알려 주세요.`,
        undefined,
        LINK_PROGRAM
      );
    }
    revalidatePath(PATH);
  });
}

/**
 * 부서에 배정된 강의의 담당 강사를 그 부서에서 지정한다. 관리자는 "이 강의는
 * OO팀"까지만 정하고, 그 안에서 누가 할지는 부서가 정한다.
 *
 * 누가 정하느냐는 편성할 때 고른 담당 구분에 달렸다 — «부서 내 지정»이면
 * 부서원 누구나, «팀장 지정»이면 그 팀 팀장만. 부서원 전원에게 열어 두면
 * 두 사람이 동시에 손대 서로의 지정을 덮어쓸 수 있어, 그럴 여지를 없애야 하는
 * 부서는 팀장 한 사람으로 좁힌다.
 */
export async function designateTeamInstructor(sessionId: string, formData: FormData) {
  return run(async () => {
    const session = await requireRole(...ALL_ROLES);

    const target = await prisma.onboardingSession.findUnique({
      where: { id: sessionId },
      select: {
        title: true,
        status: true,
        startAt: true,
        endAt: true,
        instructorId: true,
        instructorTeamId: true,
        leaderOnly: true,
        instructorTeam: { select: { name: true } },
      },
    });
    if (!target) fail("일정을 찾을 수 없습니다.");
    if (!target.instructorTeamId) fail("부서에 배정된 강의가 아닙니다.");
    // 관리자가 시각까지 정해 확정해 둔 채 "이 강의는 OO팀"으로만 남겨 둔 경우가
    // 있다. 그때 부서가 강사를 정하는 것은 남은 절차이므로 열어 두고, 이미
    // 사람까지 정해진 확정 강의를 부서에서 바꾸는 것만 막는다.
    if (target.status === "CONFIRMED" && target.instructorId) {
      fail("이미 확정된 강의입니다. 담당 강사 변경이 필요하면 관리자에게 요청해 주세요.");
    }

    const isAdmin = session.user.role === "ADMIN";
    if (!isAdmin && !(await canHandleTeamSession(session.user.id, target.instructorTeamId, target.leaderOnly))) {
      fail(
        target.leaderOnly
          ? "이 강의는 해당 부서 팀장만 강사를 지정할 수 있습니다."
          : "해당 부서 소속만 강사를 지정할 수 있습니다."
      );
    }

    const instructorId = text(formData, "instructorId");
    if (!instructorId) fail("강사를 선택해 주세요.");

    // 배정된 부서 소속인지 다시 확인한다 — 폼에는 팀원만 뜨지만 값은 바꿔 보낼
    // 수 있고, 남의 부서 사람이 담당으로 박히면 그 사람은 영문도 모른다.
    const picked = await prisma.user.findFirst({
      where: { id: instructorId, teamId: target.instructorTeamId, ...activePrismaWhere() },
      select: { id: true, name: true },
    });
    if (!picked) fail("해당 부서에 속한 재직자만 강사로 지정할 수 있습니다.");

    // 확정된 강의라면 그 시각이 곧 그 강사의 시간이 된다 — 이미 다른 확정
    // 강의를 맡고 있지 않은지 여기서 본다.
    if (target.status === "CONFIRMED") {
      await assertNoInstructorOverlap(picked.id, target.startAt, target.endAt, sessionId);
    }

    await prisma.onboardingSession.update({
      where: { id: sessionId },
      data: { instructorId: picked.id },
    });

    const when = whenLabel(target.startAt, target.endAt);
    const confirmed = target.status === "CONFIRMED";
    await notifyUser(
      picked.id,
      "ONBOARDING_BOOKING_REQUESTED",
      confirmed
        ? `[온보딩] "${target.title}" 강의 담당 강사로 지정되었습니다 (${when} · 확정된 일정입니다).`
        : `[온보딩] "${target.title}" 강의 담당 강사로 지정되었습니다 (${when}). 가능 여부를 알려 주세요.`,
      undefined,
      confirmed ? LINK_FINAL : LINK_PROGRAM
    );
    await notifyUsers(
      await adminIds(),
      "ONBOARDING_BOOKING_REQUESTED",
      `[온보딩] ${target.instructorTeam?.name ?? "부서"}에서 "${target.title}" 강의 강사로 ${picked.name}님을 지정했습니다 (${when}).`,
      LINK_PROGRAM
    );
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
