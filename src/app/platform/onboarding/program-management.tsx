import { prisma } from "@/lib/prisma";
import { activePrismaWhere } from "@/lib/hr-analytics";
import { ActionForm } from "@/components/action-form";
import {
  SESSION_STATUS_BADGE_CLASS,
  SESSION_STATUS_LABEL,
  durationMinutes,
  formatDuration,
  formatSessionDay,
  formatSessionTimeRange,
  kstDayKey,
  toKSTInputValues,
  type SessionStatus,
} from "@/lib/onboarding";
import { SearchableSelect } from "@/components/searchable-select";
import { confirmSession, designateTeamInstructor, saveSessionDetail, unconfirmSession } from "./actions";
import { EmptyBox, INPUT_CLASS, LABEL_CLASS, PRIMARY_BUTTON_CLASS, programPeriod } from "./ui";

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SESSION_STATUS_BADGE_CLASS[status]}`}>
      {SESSION_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * 강의 일정을 조율하는 화면. 관리자가 [일정 관리]에서 틀(과정·담당 강사·최소
 * 강의 시간)을 잡아 두면, 배정된 강사가 여기서 실제 날짜·시간을 정하고 의견을
 * 남겨 보낸다. 관리자는 보내온 것을 확정하고, 확정된 것만 [최종 스케줄]에
 * 나간다.
 *
 * 강사는 본인에게 배정된 강의만 본다 — 남의 강의까지 보이면 이 화면이 다시
 * 전체 시간표가 되어 버린다. 관리자는 조율 상황을 봐야 하므로 전부 본다.
 */
export async function ProgramManagementSection({
  programId,
  viewerId,
  isAdmin,
}: {
  programId: string | null;
  viewerId: string;
  isAdmin: boolean;
}) {
  if (!programId) return <EmptyBox>등록된 온보딩 기수가 없습니다.</EmptyBox>;

  // 부서에 배정된 강의는 담당 강사를 그 부서 팀장이 정한다. 그래서 팀장에게는
  // 본인이 맡은 강의뿐 아니라 본인이 이끄는 팀에 걸린 강의도 보여야 한다.
  const ledTeams = await prisma.team.findMany({
    where: { leaderId: viewerId },
    select: { id: true, name: true, members: { where: activePrismaWhere(), orderBy: { name: "asc" },
      select: { id: true, name: true, employeeNumber: true } } },
  });
  const ledTeamIds = ledTeams.map((t) => t.id);
  const membersByTeam = new Map(ledTeams.map((t) => [t.id, t.members]));

  const [program, sessions] = await Promise.all([
    prisma.onboardingProgram.findUnique({
      where: { id: programId },
      select: { name: true, startDate: true, endDate: true },
    }),
    prisma.onboardingSession.findMany({
      where: {
        programId,
        kind: "LECTURE",
        ...(isAdmin
          ? {}
          : {
              OR: [
                { instructorId: viewerId },
                // 내가 팀장인 부서에 배정된 강의 — 강사를 지정해야 한다.
                ...(ledTeamIds.length ? [{ instructorTeamId: { in: ledTeamIds } }] : []),
              ],
            }),
      },
      // 교육 날짜 · 시간 순. 같은 시각이 겹쳐도 순서가 흔들리지 않도록
      // 종료 시각과 과정명까지 보조 기준으로 둔다.
      orderBy: [{ startAt: "asc" }, { endAt: "asc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        startAt: true,
        endAt: true,
        status: true,
        minMinutes: true,
        maxMinutes: true,
        instructorNote: true,
        submittedAt: true,
        instructorId: true,
        instructor: { select: { name: true, team: { select: { name: true } } } },
        instructorTeamId: true,
        instructorTeam: { select: { name: true } },
      },
    }),
  ]);

  if (!program) return <EmptyBox>선택한 프로그램을 찾을 수 없습니다.</EmptyBox>;

  const waiting = sessions.filter((s) => s.status === "SUBMITTED");

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-800">{program.name}</h2>
          <span className="text-sm text-slate-500">{programPeriod(program) || "기간 미지정"}</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {isAdmin
            ? "강사가 보내온 시간을 확인하고 확정합니다. 확정한 일정만 [최종 스케줄]에 나타납니다."
            : ledTeams.length > 0
              ? "부서에 배정된 강의는 담당 강사를 지정해 주세요. 본인이 맡은 강의는 날짜·시간을 정한 뒤 [관리자에게 전송]을 눌러 주세요."
              : "배정된 강의의 날짜·시간을 정하고 의견을 남긴 뒤 [관리자에게 전송]을 눌러 주세요."}
        </p>
        {isAdmin && waiting.length > 0 && (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            강사가 시간 선택을 확정한 강의가 {waiting.length}건 있습니다 — 확인 후 확정해 주세요.
          </p>
        )}
      </div>

      {sessions.length === 0 ? (
        <EmptyBox>
          {isAdmin
            ? "이 기수에 편성된 강의가 없습니다. [일정 관리]에서 먼저 추가해 주세요."
            : "배정된 강의가 없습니다. 관리자가 강의를 배정하면 여기에 나타납니다."}
        </EmptyBox>
      ) : (
        sessions.map((s, i) => {
          const start = toKSTInputValues(s.startAt);
          const end = toKSTInputValues(s.endAt);
          const mine = s.instructorId === viewerId;
          const locked = s.status === "CONFIRMED";
          const editable = mine && !locked;
          // 내가 팀장인 부서에 배정된 강의면 담당 강사를 지정할 수 있다.
          const canDesignate =
            !locked && !!s.instructorTeamId && (isAdmin || ledTeamIds.includes(s.instructorTeamId));
          const teamMembers = s.instructorTeamId ? membersByTeam.get(s.instructorTeamId) ?? [] : [];
          // 건수가 늘어나면 날짜 경계가 보여야 순서가 읽힌다.
          const newDay = i === 0 || kstDayKey(s.startAt) !== kstDayKey(sessions[i - 1].startAt);

          return (
            <div key={s.id}>
              {newDay && (
                <p className="mb-2 mt-2 text-sm font-semibold text-slate-700">{formatSessionDay(s.startAt)}</p>
              )}
              <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-800">
                    {s.title} <StatusBadge status={s.status as SessionStatus} />
                  </h3>
                  {s.description && <p className="mt-1 text-sm text-slate-600">{s.description}</p>}
                  <p className="mt-1 text-xs text-slate-500">
                    현재 {formatSessionDay(s.startAt)} {formatSessionTimeRange(s.startAt, s.endAt)} (
                    {formatDuration(durationMinutes(s.startAt, s.endAt))})
                    {s.location && ` · ${s.location}`}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {s.instructor ? (
                      <>
                        담당 강사 {s.instructor.name}
                        {s.instructor.team && <span className="ml-1 text-slate-400">{s.instructor.team.name}</span>}
                      </>
                    ) : s.instructorTeam ? (
                      <>
                        담당 {s.instructorTeam.name}
                        <span className="ml-1 text-slate-400">— 강사 미지정</span>
                      </>
                    ) : (
                      "담당 미배정"
                    )}
                    {" · "}
                    최소 {formatDuration(s.minMinutes)}
                    {s.maxMinutes ? ` · 최대 ${formatDuration(s.maxMinutes)}` : ""}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {s.status !== "CONFIRMED" ? (
                      <ActionForm
                        action={confirmSession.bind(null, s.id)}
                        successMessage="일정을 확정했습니다. 최종 스케줄에 반영됩니다."
                      >
                        <button type="submit" className="rounded bg-brand-green px-3 py-1.5 font-medium text-white hover:bg-brand-green-dark">
                          확정
                        </button>
                      </ActionForm>
                    ) : (
                      <ActionForm
                        action={unconfirmSession.bind(null, s.id)}
                        successMessage="확정을 해제했습니다."
                        confirmMessage="확정을 해제하면 최종 스케줄에서 빠지고 강사가 다시 시간을 조정할 수 있습니다. 해제할까요?"
                      >
                        <button type="submit" className="text-slate-600 hover:underline">
                          확정 해제
                        </button>
                      </ActionForm>
                    )}
                  </div>
                )}
              </div>

              {canDesignate && (
                <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-medium text-blue-800">
                    {s.instructorId ? "담당 강사 변경" : "담당 강사 지정"}
                    <span className="ml-1 font-normal text-blue-700">
                      — {s.instructorTeam?.name}에 배정된 강의입니다. 이번에 강의할 분을 정해 주세요.
                    </span>
                  </p>
                  <ActionForm
                    action={designateTeamInstructor.bind(null, s.id)}
                    className="mt-2 flex flex-wrap items-end gap-3"
                    successMessage="담당 강사를 지정했습니다. 관리자에게도 알림이 갔습니다."
                  >
                    <div className="min-w-[14rem]">
                      <label className={LABEL_CLASS}>강사</label>
                      <SearchableSelect
                        name="instructorId"
                        options={teamMembers.map((m) => ({
                          value: m.id,
                          label: m.name,
                          sublabel: m.employeeNumber,
                        }))}
                        defaultValue={s.instructorId ?? ""}
                        placeholder="팀원 검색..."
                        emptyLabel="선택 안 함"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark"
                    >
                      {s.instructorId ? "변경" : "지정"}
                    </button>
                  </ActionForm>
                </div>
              )}

              {s.instructorNote && (
                <p className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  강사 의견: {s.instructorNote}
                </p>
              )}

              {locked ? (
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs">
                  <span className="font-bold text-blue-700">확정된 일정입니다.</span>{" "}
                  <span className="text-slate-500">
                    변경이 필요하면 {isAdmin ? "확정을 해제한 뒤 조정하세요." : "관리자에게 요청해 주세요."}
                  </span>
                </p>
              ) : editable ? (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="text-xs">
                    {s.status === "SUBMITTED" ? (
                      <>
                        <span className="font-bold text-blue-700">확정된 일정입니다.</span>{" "}
                        <span className="text-slate-500">다시 보내면 관리자가 새 시간으로 확인합니다.</span>
                      </>
                    ) : (
                      <span className="font-bold text-red-600">아직 시간이 조율되지 않았습니다.</span>
                    )}
                  </p>
                  <p className="mt-2 text-xs font-medium text-slate-600">세부일정</p>
                  <ActionForm
                    action={saveSessionDetail.bind(null, s.id)}
                    className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-4"
                    successMessage="저장했습니다."
                  >
                    <div>
                      <label className={LABEL_CLASS}>날짜</label>
                      <input type="date" name="date" required defaultValue={start.date} className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>시작 시간</label>
                      <input type="time" name="startTime" required defaultValue={start.time} className={INPUT_CLASS} />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>종료 시간</label>
                      <input type="time" name="endTime" required defaultValue={end.time} className={INPUT_CLASS} />
                    </div>
                    <div className="flex items-end">
                      <span className="pb-2 text-xs text-slate-500">최소 {formatDuration(s.minMinutes)} 이상</span>
                    </div>
                    <div className="sm:col-span-4">
                      <label className={LABEL_CLASS}>비고 (관리자에게 전달할 의견)</label>
                      <input
                        name="instructorNote"
                        defaultValue={s.instructorNote ?? ""}
                        placeholder="예: 실습 자료 필요 · 오전만 가능"
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div className="sm:col-span-4 flex flex-wrap items-center gap-3">
                      {/* 같은 폼에 버튼 두 개 — 눌린 버튼의 intent 값이 함께
                          넘어가서, 저장만 할지 전송까지 할지를 서버가 안다. */}
                      <button
                        type="submit"
                        name="intent"
                        value="save"
                        className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        저장
                      </button>
                      <button type="submit" name="intent" value="submit" className={PRIMARY_BUTTON_CLASS}>
                        관리자에게 전송
                      </button>
                      <span className="text-xs text-slate-500">
                        {s.status === "SUBMITTED"
                          ? "이미 전송했습니다. 다시 보내면 관리자가 새 시간으로 확인합니다."
                          : "전송하면 관리자에게 확정 요청이 갑니다."}
                      </span>
                    </div>
                  </ActionForm>
                </div>
              ) : (
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs">
                  {s.status === "SUBMITTED" ? (
                    <>
                      <span className="font-bold text-blue-700">확정된 일정입니다.</span>{" "}
                      <span className="text-slate-500">강사가 시간 선택을 확정하였습니다 — 관리자 확정을 기다리는 중입니다.</span>
                    </>
                  ) : (
                    <span className="font-bold text-red-600">아직 시간이 조율되지 않았습니다.</span>
                  )}
                </p>
              )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
