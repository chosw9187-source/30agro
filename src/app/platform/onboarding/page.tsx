import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { SearchableSelect } from "@/components/searchable-select";
import { ActionForm } from "@/components/action-form";
import { activePrismaWhere } from "@/lib/hr-analytics";
import {
  SLOTS,
  SLOT_LABEL,
  formatSessionDay,
  type Slot,
  formatSessionTimeRange,
  canCoordinateSessions,
  toKSTInputValues,
  type SessionStatus,
} from "@/lib/onboarding";
import {
  addTrainee,
  addTraineesBulk,
  createProgram,
  createSession,
  deleteProgram,
  deleteSession,
  removeTrainee,
  setSessionAudience,
  toggleProgramActive,
  updateProgram,
  updateSession,
} from "./actions";
import { ProgramPeriodFields } from "./program-period-fields";
import { AssignFields } from "./assign-fields";
import { FinalScheduleSection, finalHref } from "./final-schedule";
import { ProgramManagementSection, StatusBadge } from "./program-management";
import { SelectAllToggle } from "./select-all-toggle";
import { EmptyBox, INPUT_CLASS, LABEL_CLASS, PRIMARY_BUTTON_CLASS, programPeriod } from "./ui";

export const dynamic = "force-dynamic";

// 세 개면 충분하다 — 보는 곳(최종 스케줄), 관리자가 짜는 곳(일정 관리),
// 강사가 조율하는 곳(교육 프로그램 관리). [교육 프로그램 관리]는 관리자가
// 지정한 강사에게만 보이고, 관리자는 확정을 위해 함께 본다.
const TABS = [
  { key: "final", label: "최종 스케줄", role: "all" },
  { key: "manage", label: "일정 관리", role: "admin" },
  { key: "program", label: "교육 프로그램 관리", role: "staff" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function TabLink({ tab, active, programId }: { tab: (typeof TABS)[number]; active: boolean; programId?: string }) {
  const query = programId ? `&programId=${programId}` : "";
  return (
    <Link
      href={`/platform/onboarding?tab=${tab.key}${query}`}
      className={`rounded px-3 py-1.5 text-sm font-medium ${
        active ? "bg-brand-green text-white" : "bg-white text-slate-600 hover:bg-slate-100"
      }`}
    >
      {tab.label}
    </Link>
  );
}

/* --------------------------------------------------------------- 일정 관리 */

/**
 * 관리자 전용. 기수를 만들고, 교육 일정의 틀을 짜고, 교육
 * 대상자 명단을 관리한다. 강의 담당은 사람으로 직접 지정하거나 부서에 맡기고,
 * 부서에 맡긴 경우 누가 할지는 그 부서 사람이 [교육 프로그램 관리]에서 정한다.
 */
async function ManageSection({ programId }: { programId: string | null }) {
  const [programs, employees, teams] = await Promise.all([
    prisma.onboardingProgram.findMany({
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        description: true,
        startDate: true,
        endDate: true,
        active: true,
        _count: { select: { sessions: true, trainees: true } },
      },
    }),
    prisma.user.findMany({
      where: activePrismaWhere(),
      orderBy: { name: "asc" },
      select: { id: true, name: true, employeeNumber: true, team: { select: { name: true } } },
    }),
    prisma.team.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, division: true, _count: { select: { members: true } } },
    }),
  ]);

  const selected = programs.find((p) => p.id === programId) ?? null;

  const [sessions, trainees] = selected
    ? await Promise.all([
        prisma.onboardingSession.findMany({
          where: { programId: selected.id },
          orderBy: { startAt: "asc" },
          select: {
            id: true,
            status: true,
            title: true,
            description: true,
            location: true,
            startAt: true,
            endAt: true,
            slot: true,
            instructorId: true,
            instructor: { select: { name: true } },
            instructorTeamId: true,
            instructorTeam: { select: { name: true } },
            leaderOnly: true,
            attendees: { select: { traineeId: true } },
          },
        }),
        prisma.onboardingTrainee.findMany({
          where: { programId: selected.id },
          orderBy: { user: { name: "asc" } },
          select: {
            id: true,
            note: true,
            user: { select: { id: true, name: true, employeeNumber: true, team: { select: { name: true } } } },
          },
        }),
      ])
    : [[], []];

  const teamOptions = teams.map((t) => ({
    value: t.id,
    label: t.name,
    sublabel: t.division ?? `${t._count.members}명`,
  }));
  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: e.name,
    sublabel: e.team?.name ?? e.employeeNumber,
  }));
  const enrolled = new Set(trainees.map((t) => t.user.id));

  // 편성은 대개 기수 기간 안에서 이뤄지는데, 날짜 칸을 비워 두면 달력이 이번
  // 달에서 열린다. 기수가 몇 달 뒤면 매번 그 달까지 넘겨 들어가야 하므로,
  // 기간이 정해진 기수라면 시작일을 미리 채워 달력이 거기서 열리게 한다.
  const periodAnchor = selected?.startDate ?? selected?.endDate ?? null;
  const sessionDateDefault = periodAnchor ? toKSTInputValues(periodAnchor).date : "";
  const periodLabel = selected ? programPeriod(selected) : "";

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------------------------------------------- 프로그램 등록 */}
      <ActionForm
        action={createProgram}
        className="rounded-lg border border-slate-200 bg-white p-5"
        successMessage="프로그램을 등록했습니다."
      >
        <h2 className="text-lg font-semibold text-slate-800">온보딩 프로그램 등록</h2>
        <p className="mt-1 text-sm text-slate-600">
          기수를 만든 뒤 아래에서 교육 일정·교육생 명단·강사를 채웁니다. 관리자만 등록할 수 있습니다.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>프로그램명</label>
            <input name="name" required placeholder="예: 2026년 상반기 신입 온보딩" className={INPUT_CLASS} />
          </div>
          <ProgramPeriodFields inputClassName={INPUT_CLASS} labelClassName={LABEL_CLASS} />
          <div className="sm:col-span-4">
            <label className={LABEL_CLASS}>설명 (선택)</label>
            <input name="description" placeholder="대상·목적 등" className={INPUT_CLASS} />
          </div>
        </div>
        <button type="submit" className={`mt-4 ${PRIMARY_BUTTON_CLASS}`}>
          프로그램 등록
        </button>
      </ActionForm>

      {programs.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">프로그램</th>
                <th className="px-4 py-3">기간</th>
                <th className="px-4 py-3">일정</th>
                <th className="px-4 py-3">교육생</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/onboarding?tab=manage&programId=${p.id}`}
                      className={`font-medium hover:underline ${
                        p.id === programId ? "text-brand-green-dark" : "text-slate-800"
                      }`}
                    >
                      {p.name}
                    </Link>
                    {p.description && <p className="text-xs text-slate-400">{p.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{programPeriod(p) || "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{p._count.sessions}건</td>
                  <td className="px-4 py-3 text-slate-600">{p._count.trainees}명</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        p.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {p.active ? "진행" : "종료"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3 text-xs">
                      <ActionForm
                        action={toggleProgramActive.bind(null, p.id)}
                        successMessage="프로그램 상태를 변경했습니다."
                      >
                        <button type="submit" className="text-slate-600 hover:underline">
                          {p.active ? "종료 처리" : "다시 진행"}
                        </button>
                      </ActionForm>
                      <ActionForm
                        action={deleteProgram.bind(null, p.id)}
                        successMessage="프로그램을 삭제했습니다."
                        confirmMessage="이 기수를 삭제하면 소속된 교육 일정·교육생 명단이 모두 함께 삭제되며 되돌릴 수 없습니다. 삭제할까요?"
                      >
                        <button type="submit" className="text-red-500 hover:underline">
                          삭제
                        </button>
                      </ActionForm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!selected ? (
        <EmptyBox>위에서 기수를 먼저 만들거나 선택해 주세요.</EmptyBox>
      ) : (
        <>
          {/* ------------------------------------------------ 기수 정보 수정 */}
          <details className="rounded-lg border border-slate-200 bg-white p-5">
            <summary className="cursor-pointer text-sm font-medium text-brand-green-dark">
              «{selected.name}» 기수 정보 수정
            </summary>
            <ActionForm
              action={updateProgram.bind(null, selected.id)}
              className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4"
              successMessage="기수 정보를 저장했습니다."
            >
              <div className="sm:col-span-2">
                <label className={LABEL_CLASS}>프로그램명</label>
                <input name="name" required defaultValue={selected.name} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>시작일</label>
                <input
                  type="date"
                  name="startDate"
                  defaultValue={selected.startDate ? toKSTInputValues(selected.startDate).date : ""}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>종료일</label>
                <input
                  type="date"
                  name="endDate"
                  defaultValue={selected.endDate ? toKSTInputValues(selected.endDate).date : ""}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="sm:col-span-4">
                <label className={LABEL_CLASS}>설명</label>
                <input name="description" defaultValue={selected.description ?? ""} className={INPUT_CLASS} />
              </div>
              <div className="sm:col-span-4">
                <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                  저장
                </button>
              </div>
            </ActionForm>
          </details>

          {/* -------------------------------------------------- 교육생 명단 */}
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-800">교육 대상자 명단</h2>
            <p className="mt-1 text-sm text-slate-600">
              이 기수에 참여하는 신규 직원입니다. 사람마다 듣는 교육이 다를 수 있어, 교육별 참석 대상은 아래
              [교육 일정 편성]에서 따로 지정합니다.
            </p>
            <ActionForm
              action={addTrainee}
              className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
              successMessage="교육생을 등록했습니다."
            >
              <input type="hidden" name="programId" value={selected.id} />
              <div>
                <label className={LABEL_CLASS}>직원</label>
                <SearchableSelect
                  name="userId"
                  options={employeeOptions.filter((o) => !enrolled.has(o.value))}
                  placeholder="이름 검색..."
                  emptyLabel="선택 안 함"
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>비고 (선택)</label>
                <input name="note" placeholder="예: 중도 합류" className={INPUT_CLASS} />
              </div>
              <div className="flex items-end">
                <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                  교육생 등록
                </button>
              </div>
            </ActionForm>

            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-brand-green-dark">여러 명 한 번에 등록</summary>
              <ActionForm action={addTraineesBulk} className="mt-2" successMessage="교육생을 일괄 등록했습니다.">
                <input type="hidden" name="programId" value={selected.id} />
                <textarea
                  name="entries"
                  rows={4}
                  placeholder={"사번 또는 이름을 한 줄에 하나씩 붙여넣으세요.\n예)\n20260101\n20260102\n홍길동"}
                  className={`${INPUT_CLASS} font-mono`}
                />
                <p className="mt-1 text-xs text-slate-500">
                  이미 명단에 있는 사람은 건너뜁니다. 이름이 겹치는 경우에는 사번으로 넣어 주세요.
                </p>
                <button type="submit" className={`mt-2 ${PRIMARY_BUTTON_CLASS}`}>
                  일괄 등록
                </button>
              </ActionForm>
            </details>

            {trainees.length === 0 ? (
              <p className="mt-4 rounded border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                등록된 교육생이 없습니다.
              </p>
            ) : (
              <ul className="mt-4 flex flex-wrap gap-2">
                {trainees.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-2 text-xs"
                  >
                    <span className="font-medium text-slate-700">{t.user.name}</span>
                    <span className="text-slate-400">{t.user.team?.name ?? t.user.employeeNumber}</span>
                    {t.note && <span className="text-slate-400">· {t.note}</span>}
                    <ActionForm
                      action={removeTrainee.bind(null, t.id)}
                      successMessage="교육생을 명단에서 제외했습니다."
                      confirmMessage="이 교육생을 명단에서 제외할까요?"
                    >
                      <button type="submit" className="text-red-500 hover:underline" aria-label={`${t.user.name} 제외`}>
                        ×
                      </button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ---------------------------------------------- 교육 일정 편성 */}
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-800">교육 일정 편성</h2>
            <p className="mt-1 text-sm text-slate-600">
              전체 일정의 틀을 잡습니다. 강의는 담당 강사를 정해 두면 그 강사가 [교육 프로그램 관리]에서 최소 시간
              안에서 가능 여부를 답하고, 관리자가 실제 시각을 정해 확정하면 [최종 스케줄]에 나타납니다.
            </p>
            <ActionForm
              action={createSession}
              className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4"
              successMessage="일정을 추가했습니다."
            >
              <input type="hidden" name="programId" value={selected.id} />
              <div className="sm:col-span-2">
                <label className={LABEL_CLASS}>과정명</label>
                <input name="title" required placeholder="예: 회사 소개 / 점심 시간" className={INPUT_CLASS} />
              </div>
              <AssignFields
                instructorOptions={employeeOptions}
                teamOptions={teamOptions}
                inputClassName={INPUT_CLASS}
                labelClassName={LABEL_CLASS}
              />
              <div>
                <label className={LABEL_CLASS}>날짜</label>
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={sessionDateDefault}
                  className={INPUT_CLASS}
                />
                {periodLabel && <p className="mt-1 text-[11px] text-slate-400">기수 기간 {periodLabel}</p>}
              </div>
              <div>
                <label className={LABEL_CLASS}>강의 시간</label>
                <select name="slot" defaultValue="MORNING" className={INPUT_CLASS}>
                  {SLOTS.map((v) => (
                    <option key={v} value={v}>
                      {SLOT_LABEL[v]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>장소 (선택)</label>
                <input name="location" placeholder="예: 본사 대회의실" className={INPUT_CLASS} />
              </div>
              <div className="sm:col-span-3">
                <label className={LABEL_CLASS}>설명 (선택)</label>
                <input name="description" placeholder="교육 내용 요약" className={INPUT_CLASS} />
              </div>
              <div className="sm:col-span-4">
                <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                  일정 추가
                </button>
              </div>
            </ActionForm>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-slate-800">편성된 일정</h2>
            {sessions.length === 0 ? (
              <EmptyBox>이 기수에 편성된 일정이 없습니다.</EmptyBox>
            ) : (
              sessions.map((s) => {
                const start = toKSTInputValues(s.startAt);
                return (
                  <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-800">
                          {s.title} <StatusBadge status={s.status as SessionStatus} />
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatSessionDay(s.startAt)}{" "}
                          {s.status === "CONFIRMED"
                            ? formatSessionTimeRange(s.startAt, s.endAt)
                            : `${SLOT_LABEL[s.slot as Slot]} (시각 미확정)`}
                          {s.location && ` · ${s.location}`}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          담당{" "}
                          {s.instructor?.name ??
                            (s.instructorTeam
                              ? `${s.instructorTeam.name} (${s.leaderOnly ? "팀장이 지정" : "부서 내 지정"} · 강사 미지정)`
                              : "미배정")}{" "}
                          ·{" "}
                          {s.attendees.length === 0 ? "교육생 전원" : `교육생 ${s.attendees.length}명 지정`}
                        </p>
                      </div>
                      <ActionForm
                        action={deleteSession.bind(null, s.id)}
                        successMessage="일정을 삭제했습니다."
                        confirmMessage="이 일정을 삭제할까요?"
                      >
                        <button type="submit" className="text-xs text-red-500 hover:underline">
                          삭제
                        </button>
                      </ActionForm>
                    </div>

                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-brand-green-dark">일정 수정</summary>
                      <ActionForm
                        action={updateSession.bind(null, s.id)}
                        className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4"
                        successMessage="일정을 저장했습니다."
                      >
                        <div className="sm:col-span-2">
                          <label className={LABEL_CLASS}>과정명</label>
                          <input name="title" required defaultValue={s.title} className={INPUT_CLASS} />
                        </div>
                        <AssignFields
                          instructorOptions={employeeOptions}
                          teamOptions={teamOptions}
                          defaultInstructorId={s.instructorId ?? ""}
                          defaultTeamId={s.instructorTeamId ?? ""}
                          defaultLeaderOnly={s.leaderOnly}
                          inputClassName={INPUT_CLASS}
                          labelClassName={LABEL_CLASS}
                        />
                        <div>
                          <label className={LABEL_CLASS}>날짜</label>
                          <input type="date" name="date" required defaultValue={start.date} className={INPUT_CLASS} />
                        </div>
                        <div>
                          <label className={LABEL_CLASS}>강의 시간</label>
                          <select name="slot" defaultValue={s.slot} className={INPUT_CLASS}>
                            {SLOTS.map((v) => (
                              <option key={v} value={v}>
                                {SLOT_LABEL[v]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={LABEL_CLASS}>장소</label>
                          <input name="location" defaultValue={s.location ?? ""} className={INPUT_CLASS} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={LABEL_CLASS}>설명</label>
                          <input name="description" defaultValue={s.description ?? ""} className={INPUT_CLASS} />
                        </div>
                        <div className="sm:col-span-4">
                          <button
                            type="submit"
                            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                          >
                            저장
                          </button>
                        </div>
                      </ActionForm>
                    </details>

                    {trainees.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-brand-green-dark">참석 대상 지정</summary>
                        <ActionForm
                          action={setSessionAudience.bind(null, s.id)}
                          className="mt-3"
                          successMessage="참석 대상을 저장했습니다."
                        >
                          <p className="text-xs text-slate-500">
                            아무도 체크하지 않으면 기수 전원이 대상입니다. 일부만 듣는 교육일 때만 골라 주세요.
                          </p>
                          <SelectAllToggle groupId={`audience-${s.id}`} />
                          <div id={`audience-${s.id}`} className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                            {trainees.map((t) => (
                              <label key={t.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                                <input
                                  type="checkbox"
                                  name="traineeIds"
                                  value={t.id}
                                  defaultChecked={s.attendees.some((a) => a.traineeId === t.id)}
                                />
                                {t.user.name}
                              </label>
                            ))}
                          </div>
                          <button
                            type="submit"
                            className="mt-3 rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                          >
                            대상 저장
                          </button>
                        </ActionForm>
                      </details>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 페이지 */

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    programId?: string;
    view?: string;
    month?: string;
    only?: string;
    sessionId?: string;
  }>;
}) {
  if (!(await checkModuleAccess("ONBOARDING"))) {
    return <NoModuleAccess title="온보딩 프로그램" />;
  }

  const session = await auth();
  const viewerId = session!.user.id;
  const isAdmin = session!.user.role === "ADMIN";
  const amInstructor = await canCoordinateSessions(viewerId);

  const {
    tab: tabParam,
    programId: programIdParam,
    view: viewParam,
    month: monthParam,
    only: onlyParam,
    sessionId: sessionIdParam,
  } = await searchParams;

  const visibleTabs = TABS.filter(
    (t) => t.role === "all" || (t.role === "admin" && isAdmin) || (t.role === "staff" && (isAdmin || amInstructor))
  );

  const programs = await prisma.onboardingProgram.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, active: true, startDate: true },
  });

  // 교육생이면 본인이 속한 기수를 먼저 연다 — 활성 기수가 둘 이상일 때
  // 남의 기수가 열려 있으면 "내 일정이 왜 없지" 하고 헤매게 된다.
  const myTraineeProgram = await prisma.onboardingTrainee.findFirst({
    where: { userId: viewerId },
    orderBy: { program: { createdAt: "desc" } },
    select: { programId: true },
  });

  // 평소에는 확정 시간표로 들어온다. 다만 기수가 아직 하나도 없는 관리자는
  // 거기서 할 수 있는 게 없으므로 [일정 관리]로 보낸다.
  const defaultTab: TabKey = isAdmin && programs.length === 0 ? "manage" : "final";
  const tab: TabKey = visibleTabs.some((t) => t.key === tabParam) ? (tabParam as TabKey) : defaultTab;
  const selectedProgram =
    programs.find((p) => p.id === programIdParam) ??
    programs.find((p) => p.id === myTraineeProgram?.programId) ??
    programs.find((p) => p.active) ??
    programs[0] ??
    null;
  const programId = selectedProgram?.id ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">SG 온보딩 프로그램</h1>
        <p className="mt-1 text-slate-600">
          관리자가 기수와 교육 일정의 틀을 짜고, 배정된 강사가 세부 시간을 조정해 보내면 관리자가 확정합니다.
          확정된 일정만 [최종 스케줄]에 나타납니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {visibleTabs.map((t) => (
          <TabLink key={t.key} tab={t} active={t.key === tab} programId={programId ?? undefined} />
        ))}
      </div>

      {programs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">프로그램</span>
          {programs.map((p) => (
            <Link
              key={p.id}
              href={
                tab === "final"
                  ? finalHref({
                      programId: p.id,
                      view: viewParam === "list" ? "list" : "calendar",
                      onlyMine: onlyParam === "mine",
                    })
                  : `/platform/onboarding?tab=${tab}&programId=${p.id}`
              }
              className={`rounded-full border px-3 py-1 text-xs ${
                p.id === programId
                  ? "border-brand-green bg-brand-green-light text-brand-green-dark"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {p.name}
              {!p.active && <span className="ml-1 text-slate-400">(종료)</span>}
            </Link>
          ))}
        </div>
      )}

      {tab === "final" && (
        <FinalScheduleSection
          programId={programId}
          viewerId={viewerId}
          onlyMine={onlyParam === "mine"}
          view={viewParam === "list" ? "list" : "calendar"}
          month={monthParam}
          sessionId={sessionIdParam}
        />
      )}
      {tab === "manage" && <ManageSection programId={programId} />}
      {tab === "program" && (
        <ProgramManagementSection programId={programId} viewerId={viewerId} isAdmin={isAdmin} />
      )}
    </div>
  );
}
