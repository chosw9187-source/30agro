import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatSessionDay, formatSessionTimeRange, kstDayKey } from "@/lib/onboarding";
import { EmptyBox, programPeriod } from "./ui";

/** 최종 스케줄 탭 링크. "내 교육만" 필터 상태를 유지한 채 기수를 옮길 수 있게. */
export function finalHref(programId: string | null, onlyMine: boolean) {
  const params = new URLSearchParams({ tab: "final" });
  if (programId) params.set("programId", programId);
  if (onlyMine) params.set("only", "mine");
  return `/platform/onboarding?${params.toString()}`;
}

/**
 * 일정과 강사 배정이 모두 반영된 확정 시간표. 교육생이 "우리 기수가 언제 뭘
 * 듣는지"와 "그중 내가 들어가야 하는 건 어느 것인지"를 한 화면에서 보는 것이
 * 목적이라, 강사가 아직 확정되지 않은 교육도 감추지 않고 "강사 미정"으로
 * 남겨 둔다 — 시간은 이미 잡혀 있으므로 교육생은 그 시간을 비워 둬야 한다.
 */
export async function FinalScheduleSection({
  programId,
  viewerId,
  onlyMine,
}: {
  programId: string | null;
  viewerId: string;
  onlyMine: boolean;
}) {
  if (!programId) return <EmptyBox>등록된 온보딩 기수가 없습니다.</EmptyBox>;

  const [program, sessions] = await Promise.all([
    prisma.onboardingProgram.findUnique({
      where: { id: programId },
      select: {
        id: true,
        name: true,
        description: true,
        startDate: true,
        endDate: true,
        trainees: {
          orderBy: { user: { name: "asc" } },
          select: { id: true, userId: true, user: { select: { name: true } } },
        },
      },
    }),
    prisma.onboardingSession.findMany({
      where: { programId },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        startAt: true,
        endAt: true,
        requiredInstructors: true,
        // 최종 스케줄이므로 확정(CONFIRMED)된 강사만 이름을 싣는다. 신청
        // 단계의 이름을 보여 주면 교육생이 확정된 것으로 오해한다.
        bookings: {
          where: { status: "CONFIRMED" },
          orderBy: { createdAt: "asc" },
          select: { user: { select: { name: true, team: { select: { name: true } } } } },
        },
        attendees: { select: { traineeId: true } },
      },
    }),
  ]);

  if (!program) return <EmptyBox>선택한 프로그램을 찾을 수 없습니다.</EmptyBox>;

  const myTrainee = program.trainees.find((t) => t.userId === viewerId) ?? null;

  // 대상이 따로 지정되지 않은 교육은 기수 전원이 듣는다 — 지정 명단이 비어
  // 있는 것을 "전원 대상"으로 읽는다.
  const isForMe = (s: (typeof sessions)[number]) =>
    !!myTrainee && (s.attendees.length === 0 || s.attendees.some((a) => a.traineeId === myTrainee.id));

  const myCount = myTrainee ? sessions.filter(isForMe).length : 0;
  const shown = onlyMine && myTrainee ? sessions.filter(isForMe) : sessions;
  const confirmedCount = sessions.filter((s) => s.bookings.length >= s.requiredInstructors).length;

  const days = new Map<string, typeof sessions>();
  for (const s of shown) {
    const key = kstDayKey(s.startAt);
    const bucket = days.get(key);
    if (bucket) bucket.push(s);
    else days.set(key, [s]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-800">{program.name}</h2>
          <span className="text-sm text-slate-500">{programPeriod(program) || "기간 미지정"}</span>
        </div>
        {program.description && <p className="mt-1 text-sm text-slate-600">{program.description}</p>}
        <p className="mt-3 text-xs text-slate-500">
          교육 {sessions.length}건 · 강사 확정 {confirmedCount}건 · 교육생 {program.trainees.length}명
        </p>
      </div>

      {myTrainee ? (
        <div className="rounded-lg border border-brand-green bg-brand-green-light p-4">
          <p className="text-sm font-medium text-brand-green-dark">
            {myTrainee.user.name}님은 이 기수 교육생입니다 — 참석 대상 교육 {myCount}건
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Link
              href={finalHref(programId, false)}
              className={`rounded-full border px-3 py-1 ${
                onlyMine ? "border-slate-200 bg-white text-slate-600" : "border-brand-green bg-white text-brand-green-dark"
              }`}
            >
              전체 일정
            </Link>
            <Link
              href={finalHref(programId, true)}
              className={`rounded-full border px-3 py-1 ${
                onlyMine ? "border-brand-green bg-white text-brand-green-dark" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              내 교육만 보기
            </Link>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          이 기수의 교육생 명단에 포함되어 있지 않아 전체 일정만 표시됩니다. 명단 등록은 관리자에게 문의하세요.
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyBox>
          {onlyMine ? "참석 대상으로 지정된 교육이 없습니다." : "이 기수에 등록된 교육 일정이 없습니다."}
        </EmptyBox>
      ) : (
        <div className="flex flex-col gap-4">
          {[...days.entries()].map(([key, daySessions]) => (
            <div key={key} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                {formatSessionDay(daySessions[0].startAt)}
              </div>
              <ul className="divide-y divide-slate-100">
                {daySessions.map((s) => {
                  const mine = isForMe(s);
                  const instructors = s.bookings.map((b) => b.user.name);
                  return (
                    <li key={s.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
                      <span className="w-32 shrink-0 text-sm font-medium text-slate-700">
                        {formatSessionTimeRange(s.startAt, s.endAt)}
                      </span>
                      <div className="min-w-[12rem] flex-1">
                        <p className="text-sm font-medium text-slate-800">
                          {s.title}
                          {mine && (
                            <span className="ml-2 rounded-full bg-brand-green-light px-2 py-0.5 text-[10px] font-semibold text-brand-green-dark">
                              참석
                            </span>
                          )}
                        </p>
                        {s.description && <p className="text-xs text-slate-500">{s.description}</p>}
                        <p className="mt-0.5 text-xs text-slate-500">
                          {s.location ?? "장소 미정"} ·{" "}
                          {instructors.length > 0 ? (
                            <span className="text-slate-700">강사 {instructors.join(", ")}</span>
                          ) : (
                            <span className="text-amber-600">강사 미정</span>
                          )}
                          {" · "}
                          {s.attendees.length === 0 ? "기수 전원" : `지정 ${s.attendees.length}명`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

