import { prisma } from "@/lib/prisma";
import { activePrismaWhere } from "@/lib/hr-analytics";
import { ActionForm } from "@/components/action-form";
import { SearchableSelect } from "@/components/searchable-select";
import {
  SESSION_STATUS_BADGE_CLASS,
  SESSION_STATUS_LABEL,
  SLOTS,
  SLOT_DEFAULT_TIME,
  SLOT_LABEL,
  formatSessionDay,
  formatSessionTimeRange,
  kstDayKey,
  type SessionStatus,
  type Slot,
} from "@/lib/onboarding";
import { confirmSession, designateTeamInstructor, replyAvailability, unconfirmSession } from "./actions";
import { EmptyBox, INPUT_CLASS, LABEL_CLASS, PRIMARY_BUTTON_CLASS, programPeriod } from "./ui";

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SESSION_STATUS_BADGE_CLASS[status]}`}>
      {SESSION_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * 강의 일정을 조율하는 화면.
 *
 * 관리자가 [일정 관리]에서 "이 날 오전"까지만 가이드라인을 잡아 두면, 배정된
 * 강사(또는 그 부서에서 정할 수 있는 사람)가 가능한지 답한다. 가능하면 되는 시간대를 고르고,
 * 불가하면 사유를 남긴다. 그 답을 보고 관리자가 실제 시각을 짜서 확정하며,
 * 확정된 것만 [최종 스케줄]에 나간다.
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

  // 부서에 배정된 강의는 그 부서가 강사를 정한다. 누가 정하느냐는 편성할 때
  // 고른 담당 구분에 달렸다 — 부서원 누구나이거나, 팀장 한 사람이거나.
  const me = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { teamId: true, team: { select: { leaderId: true } } },
  });
  const myTeamId = me?.teamId ?? null;
  const iLeadMyTeam = !!myTeamId && me?.team?.leaderId === viewerId;

  const [program, sessions] = await Promise.all([
    prisma.onboardingProgram.findUnique({
      where: { id: programId },
      select: { name: true, startDate: true, endDate: true },
    }),
    prisma.onboardingSession.findMany({
      where: {
        programId,
        ...(isAdmin
          ? {}
          : {
              OR: [
                { instructorId: viewerId },
                // 팀장 전용으로 잠근 강의는 팀장에게만 보인다 — 부서원에게
                // 보여 봐야 손댈 수 없고 목록만 길어진다.
                ...(myTeamId
                  ? [{ instructorTeamId: myTeamId, ...(iLeadMyTeam ? {} : { leaderOnly: false }) }]
                  : []),
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
        slot: true,
        instructorSlot: true,
        instructorNote: true,
        instructorId: true,
        instructor: { select: { name: true, team: { select: { name: true } } } },
        instructorTeamId: true,
        instructorTeam: { select: { name: true } },
        leaderOnly: true,
      },
    }),
  ]);

  if (!program) return <EmptyBox>선택한 프로그램을 찾을 수 없습니다.</EmptyBox>;

  const assignedTeamIds = [...new Set(sessions.map((s) => s.instructorTeamId).filter((v): v is string => !!v))];
  const teamMembersById = new Map(
    (
      await prisma.user.findMany({
        where: { teamId: { in: assignedTeamIds }, ...activePrismaWhere() },
        orderBy: { name: "asc" },
        select: { id: true, name: true, employeeNumber: true, teamId: true },
      })
    ).reduce((acc, u) => {
      const list = acc.get(u.teamId!) ?? [];
      list.push(u);
      acc.set(u.teamId!, list);
      return acc;
    }, new Map<string, { id: string; name: string; employeeNumber: string }[]>())
  );

  const waiting = sessions.filter((s) => s.status === "SUBMITTED");
  const declined = sessions.filter((s) => s.status === "DECLINED");

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-800">{program.name}</h2>
          <span className="text-sm text-slate-500">{programPeriod(program) || "기간 미지정"}</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {isAdmin
            ? "강사가 보내온 답을 보고 실제 시각을 정해 확정합니다. 확정한 일정만 [최종 스케줄]에 나타납니다."
            : "배정된 강의의 가능 여부를 알려 주세요. 부서에 배정된 강의는 담당 강사도 정해 주세요. 실제 시각은 관리자가 정합니다."}
        </p>
        {isAdmin && waiting.length > 0 && (
          <p className="mt-3 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
            강사가 가능으로 답한 강의가 {waiting.length}건 있습니다 — 시각을 정해 확정해 주세요.
          </p>
        )}
        {isAdmin && declined.length > 0 && (
          <p className="mt-2 rounded border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-800">
            강의 불가로 답한 건이 {declined.length}건 있습니다 — 날짜를 옮기거나 다른 분을 배정해 주세요.
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
          const slot = s.slot as Slot;
          const answered = s.instructorSlot as Slot | null;
          const mine = s.instructorId === viewerId;
          const locked = s.status === "CONFIRMED";
          // 담당 강사 본인, 또는 부서 배정 강의를 다룰 수 있는 사람이면 답할 수
          // 있다. 팀장 전용으로 잠근 강의는 그 팀 팀장만이다.
          const myTeamsSession =
            !!s.instructorTeamId && s.instructorTeamId === myTeamId && (!s.leaderOnly || iLeadMyTeam);
          const canReply = !locked && !!s.instructorId && (mine || myTeamsSession);
          const canDesignate = !locked && !!s.instructorTeamId && (isAdmin || myTeamsSession);
          const teamMembers = s.instructorTeamId ? teamMembersById.get(s.instructorTeamId) ?? [] : [];
          const newDay = i === 0 || kstDayKey(s.startAt) !== kstDayKey(sessions[i - 1].startAt);
          const defaults = SLOT_DEFAULT_TIME[answered ?? slot];

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
                    {/* 관리자가 편성할 때 적어 둔 설명. 강사가 놓치면 안 되는
                        전달사항이 여기 담기므로 눈에 띄게 둔다. */}
                    {s.description && (
                      <p className="mt-1 text-sm font-bold text-brand-green-dark">{s.description}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {formatSessionDay(s.startAt)}{" "}
                      {locked ? (
                        <span className="font-medium text-slate-700">{formatSessionTimeRange(s.startAt, s.endAt)}</span>
                      ) : (
                        <>
                          <span className="font-medium text-slate-700">{SLOT_LABEL[slot]}</span>
                          <span className="ml-1 text-slate-400">(관리자 가이드라인 · 시각 미확정)</span>
                        </>
                      )}
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
                          <span className="ml-1 text-slate-400">
                            — {s.leaderOnly ? "팀장이 지정" : "부서 내 지정"} · 강사 미지정
                          </span>
                        </>
                      ) : (
                        "담당 미배정"
                      )}
                    </p>
                  </div>
                  {isAdmin && locked && (
                    <ActionForm
                      action={unconfirmSession.bind(null, s.id)}
                      successMessage="확정을 해제했습니다."
                      confirmMessage="확정을 해제하면 최종 스케줄에서 빠지고 강사가 다시 답해야 합니다. 해제할까요?"
                    >
                      <button type="submit" className="text-xs text-slate-600 hover:underline">
                        확정 해제
                      </button>
                    </ActionForm>
                  )}
                </div>

                {/* ------------------------------------------- 강사 응답 결과 */}
                {s.status === "SUBMITTED" && (
                  <p className="mt-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
                    <span className="font-bold text-blue-700">강의 가능</span>
                    <span className="ml-1 text-blue-800">— {SLOT_LABEL[answered ?? slot]} 가능</span>
                    {s.instructorNote && <span className="ml-1 text-slate-700">· {s.instructorNote}</span>}
                  </p>
                )}
                {s.status === "DECLINED" && (
                  <p className="mt-3 rounded border border-orange-300 bg-orange-50 px-3 py-2 text-sm">
                    <span className="font-bold text-orange-800">강의 불가</span>
                    {s.instructorNote && <span className="ml-1 text-orange-900">— {s.instructorNote}</span>}
                  </p>
                )}

                {/* ------------------------------------- 부서 안에서 강사 지정 */}
                {canDesignate && (
                  <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3">
                    <p className="text-xs font-medium text-blue-800">
                      {s.instructorId ? "담당 강사 변경" : "담당 강사 지정"}
                      <span className="ml-1 font-normal text-blue-700">
                        — {s.instructorTeam?.name}에 배정된 강의입니다
                        {s.leaderOnly ? " (팀장만 지정)" : ""}. 이번에 강의할 분을 정해 주세요.
                      </span>
                    </p>
                    <ActionForm
                      action={designateTeamInstructor.bind(null, s.id)}
                      className="mt-2 flex flex-wrap items-end gap-3"
                      successMessage="담당 강사를 지정했습니다."
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

                {/* ------------------------------------ 강사·부서의 가능 응답 */}
                {canReply && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-xs font-medium text-slate-600">
                      가능 여부 {s.status !== "PLANNED" && <span className="text-slate-400">(다시 답하면 새로 반영됩니다)</span>}
                    </p>

                    <ActionForm
                      action={replyAvailability.bind(null, s.id)}
                      className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-4"
                      successMessage="가능으로 답했습니다. 관리자가 시각을 정합니다."
                    >
                      <input type="hidden" name="available" value="yes" />
                      <div>
                        <label className={LABEL_CLASS}>가능한 시간대</label>
                        <select name="instructorSlot" defaultValue={answered ?? slot} className={INPUT_CLASS}>
                          {SLOTS.map((v) => (
                            <option key={v} value={v}>
                              {SLOT_LABEL[v]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <label className={LABEL_CLASS}>설명 (선택)</label>
                        <input
                          name="note"
                          defaultValue={s.status === "SUBMITTED" ? s.instructorNote ?? "" : ""}
                          placeholder="예: 오전은 가능하지만 10시~11시는 불가능합니다."
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                          강의 가능
                        </button>
                      </div>
                    </ActionForm>

                    <details className="mt-3" open={s.status === "DECLINED"}>
                      <summary className="cursor-pointer text-xs text-orange-700">이 날은 강의가 어렵습니다</summary>
                      <ActionForm
                        action={replyAvailability.bind(null, s.id)}
                        className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-4"
                        successMessage="불가로 답했습니다. 관리자에게 사유가 전달됩니다."
                      >
                        <input type="hidden" name="available" value="no" />
                        <div className="sm:col-span-4">
                          <label className={LABEL_CLASS}>불가 사유</label>
                          <input
                            name="note"
                            required
                            defaultValue={s.status === "DECLINED" ? s.instructorNote ?? "" : ""}
                            placeholder="예: 해당일은 연차라 강의가 불가능합니다. / 오전에 외근인 관계로 강의가 어렵습니다."
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <button
                            type="submit"
                            className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                          >
                            강의 불가로 보내기
                          </button>
                        </div>
                      </ActionForm>
                    </details>
                  </div>
                )}

                {/* --------------------------------------- 관리자의 시각 확정 */}
                {isAdmin && !locked && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-xs font-medium text-slate-600">
                      시각 확정
                      <span className="ml-1 font-normal text-slate-400">
                        — {formatSessionDay(s.startAt)} 안에서 실제 시각을 정합니다.
                      </span>
                    </p>
                    <ActionForm
                      action={confirmSession.bind(null, s.id)}
                      className="mt-2 flex flex-wrap items-end gap-3"
                      successMessage="일정을 확정했습니다. 최종 스케줄에 반영됩니다."
                    >
                      <div>
                        <label className={LABEL_CLASS}>시작 시간</label>
                        <input
                          type="time"
                          name="startTime"
                          required
                          defaultValue={defaults.start}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label className={LABEL_CLASS}>종료 시간</label>
                        <input type="time" name="endTime" required defaultValue={defaults.end} className={INPUT_CLASS} />
                      </div>
                      <button
                        type="submit"
                        className="rounded bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark"
                      >
                        확정
                      </button>
                      {s.status === "PLANNED" && (
                        <span className="pb-2 text-xs text-slate-500">아직 강사 응답이 없습니다.</span>
                      )}
                    </ActionForm>
                  </div>
                )}

                {locked && (
                  <p className="mt-3 border-t border-slate-100 pt-3 text-xs">
                    <span className="font-bold text-blue-700">확정된 일정입니다.</span>{" "}
                    <span className="text-slate-500">
                      변경이 필요하면 {isAdmin ? "확정을 해제한 뒤 조정하세요." : "관리자에게 요청해 주세요."}
                    </span>
                  </p>
                )}
                {!locked && !canReply && !canDesignate && !isAdmin && (
                  <p className="mt-3 border-t border-slate-100 pt-3 text-xs">
                    <span className="font-bold text-red-600">아직 담당 강사가 지정되지 않았습니다.</span>
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
