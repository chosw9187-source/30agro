import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { activePrismaWhere, regularOrExceptionTeamWhere } from "@/lib/hr-analytics";
import { POSITION_LABEL, type Position } from "@/lib/permission-constants";
import {
  GOAL_CYCLE_STATUS_LABEL,
  evalTargetState,
  toDateInputValue,
  type EvalTargetState,
  type GoalCycleStatus,
} from "@/lib/goals";
import { setGoalCycleHireCutoff } from "@/app/platform/evaluation2/actions";
import { CycleSelect } from "@/app/platform/evaluation2/cycle-select";
import { ActionForm } from "@/components/action-form";
import { resetAllEvalTargets, resetEvalTarget, setEvalTarget } from "./actions";

export const dynamic = "force-dynamic";

const CARD_CLASS = "rounded-xl border border-slate-200 bg-white shadow-sm";
const SMALL_BUTTON_CLASS =
  "rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50";

/** 조직도와 같은 순서로 본부를 세운다. */
const UNIT_PRIORITY: Record<string, number> = {
  제품사업: 0,
  연구생산: 1,
  재무경영관리: 2,
};

type Person = {
  id: string;
  name: string;
  position: Position;
  jobGrade: string | null;
  hireDate: Date | null;
  teamName: string | null;
  division: string | null;
  businessUnit: string | null;
  isLeader: boolean;
  goalCount: number;
  target: EvalTargetState;
};

type Group = { unit: string; division: string; team: string; people: Person[] };

export default async function EvalTargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ cycleId?: string }>;
}) {
  const params = await searchParams;

  const cycles = await prisma.goalCycle.findMany({
    orderBy: [{ year: "desc" }, { startDate: "desc" }],
  });
  const cycle = cycles.find((c) => c.id === params.cycleId) ?? cycles[0] ?? null;

  const [teams, users, targets, goals] = await Promise.all([
    prisma.team.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, division: true, businessUnit: true, leaderId: true },
    }),
    // 조직도와 같은 모수 — 재직 중인 정규직(계약직 예외 팀 포함), 명부 비공개 제외.
    // 저장된 명단이 아니라 매번 이 쿼리를 새로 읽기 때문에, 입사·퇴사·부서이동이
    // 조직도에 반영되면 이 화면도 같이 맞는다.
    prisma.user.findMany({
      where: { AND: [activePrismaWhere(), regularOrExceptionTeamWhere()] },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        position: true,
        jobGrade: true,
        hireDate: true,
        teamId: true,
        division: true,
        businessUnit: true,
        team: { select: { id: true, name: true, division: true, businessUnit: true } },
      },
    }),
    cycle
      ? prisma.goalCycleTarget.findMany({
          where: { cycleId: cycle.id },
          select: { userId: true, included: true, reason: true },
        })
      : Promise.resolve([]),
    cycle
      ? prisma.goal.groupBy({
          by: ["ownerId"],
          where: { cycleId: cycle.id, level: "INDIVIDUAL" },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const manualByUser = new Map(targets.map((t) => [t.userId, t]));
  const goalCountByUser = new Map(
    goals.filter((g) => g.ownerId).map((g) => [g.ownerId!, g._count._all])
  );
  const leaderIds = new Set(teams.map((t) => t.leaderId).filter((id): id is string => !!id));

  const people: Person[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    position: (u.position ?? "STAFF") as Position,
    jobGrade: u.jobGrade,
    hireDate: u.hireDate,
    teamName: u.team?.name ?? null,
    division: u.team?.division ?? u.division ?? null,
    businessUnit: u.team?.businessUnit ?? u.businessUnit ?? null,
    isLeader: leaderIds.has(u.id),
    goalCount: goalCountByUser.get(u.id) ?? 0,
    target: evalTargetState(u, cycle, manualByUser.get(u.id) ?? null),
  }));

  // 본부 > 책임(부문) > 팀 순으로 묶는다. 조직도 화면과 같은 계층이다.
  const groupMap = new Map<string, Group>();
  for (const p of people) {
    const unit = p.businessUnit ?? "본부 미지정";
    const division = p.division ?? "책임 미지정";
    // 운영책임·책임은 팀에 속하지 않고 팀들 위에 있다. 이런 사람을 전부
    // "팀 미지정"으로 묶으면 본부가 다른 사람들이 한 덩어리로 보인다.
    const team = p.teamName ?? `${division} 직속`;
    const key = `${unit}/${division}/${team}`;
    let g = groupMap.get(key);
    if (!g) {
      g = { unit, division, team, people: [] };
      groupMap.set(key, g);
    }
    g.people.push(p);
  }
  const groups = Array.from(groupMap.values()).sort((a, b) => {
    const u = (UNIT_PRIORITY[a.unit] ?? 9) - (UNIT_PRIORITY[b.unit] ?? 9);
    if (u !== 0) return u;
    if (a.unit !== b.unit) return a.unit.localeCompare(b.unit);
    if (a.division !== b.division) return a.division.localeCompare(b.division);
    return a.team.localeCompare(b.team);
  });
  // 팀장을 맨 앞에 세우고 나머지는 이름순.
  for (const g of groups) {
    g.people.sort((a, b) =>
      a.isLeader === b.isLeader ? a.name.localeCompare(b.name) : a.isLeader ? -1 : 1
    );
  }

  const includedCount = people.filter((p) => p.target.included).length;
  const autoExcluded = people.filter((p) => p.target.source === "hireCutoff").length;
  const manualExcluded = people.filter(
    (p) => p.target.source === "manual" && !p.target.included
  ).length;
  const manualCount = people.filter((p) => p.target.source === "manual").length;
  // 개인목표를 세우는 건 담당(팀원)이다 — 팀장·책임·운영책임의 성과는 아래
  // 목표가 굴러 올라온 값이라 개인목표가 없는 게 정상이고, 이들까지 "미등록"으로
  // 세면 정작 챙겨야 할 사람이 숫자에 묻힌다.
  const needsOwnGoal = (p: Person) => p.position === "STAFF";
  const withoutGoal = people.filter(
    (p) => p.target.included && needsOwnGoal(p) && p.goalCount === 0
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-xl font-bold">평가대상자 관리</h1>
        <Link href="/platform/evaluation2" className={SMALL_BUTTON_CLASS}>
          평가2로 이동
        </Link>
        <div className="ml-auto">
          {cycles.length > 0 && (
            <CycleSelect
              value={cycle?.id ?? ""}
              options={cycles.map((c) => ({
                value: c.id,
                label: `${c.name} (${GOAL_CYCLE_STATUS_LABEL[c.status as GoalCycleStatus]})`,
              }))}
            />
          )}
        </div>
      </header>

      {!cycle ? (
        <p className={`${CARD_CLASS} p-8 text-center text-sm text-slate-500`}>
          먼저 「조직 목표 관리」에서 사이클을 만들어 주세요.
        </p>
      ) : (
        <>
          <section className={`${CARD_CLASS} p-4`}>
            <p className="text-sm text-slate-500">
              명단은 조직도와 같은 곳에서 매번 새로 읽습니다 — 입사·퇴사·부서이동이 조직도에
              반영되면 이 화면도 같이 맞습니다. 아래 기준일과 개별 지정만 여기에 저장됩니다.
            </p>

            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
              <ActionForm
                action={setGoalCycleHireCutoff}
                successMessage="기준일을 반영했습니다."
                className="flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="cycleId" value={cycle.id} />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    입사일 기준일 — 이 날짜 <b>이후</b> 입사자는 자동 제외
                  </label>
                  <input
                    type="date"
                    name="hireCutoff"
                    defaultValue={toDateInputValue(cycle.hireCutoff)}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-green focus:outline-none"
                  />
                </div>
                <button type="submit" className={SMALL_BUTTON_CLASS}>
                  기준일 저장
                </button>
                <span className="text-xs text-slate-500">
                  비우면 규칙 없음. 기준일 당일 입사자는 대상입니다.
                </span>
              </ActionForm>

              <div className="ml-auto flex items-center gap-5 whitespace-nowrap">
                <span className="text-sm">
                  대상 <b className="tabular-nums">{includedCount}</b>명
                </span>
                <span className="text-sm text-slate-500">
                  자동 제외 <b className="tabular-nums">{autoExcluded}</b>명
                </span>
                <span className="text-sm text-slate-500">
                  개별 제외 <b className="tabular-nums">{manualExcluded}</b>명
                </span>
                <span className="text-sm text-slate-500">
                  개인목표 없음 <b className="tabular-nums">{withoutGoal}</b>명
                </span>
                {manualCount > 0 && (
                  <ActionForm action={resetAllEvalTargets} successMessage="정상 반영되었습니다.">
                    <input type="hidden" name="cycleId" value={cycle.id} />
                    <button type="submit" className={SMALL_BUTTON_CLASS}>
                      개별 지정 전체 해제
                    </button>
                  </ActionForm>
                )}
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <section key={`${g.unit}/${g.division}/${g.team}`} className={CARD_CLASS}>
                <header className="flex flex-wrap items-baseline gap-x-2 border-b border-slate-200 px-4 py-2">
                  <span className="text-xs text-slate-400">
                    {g.unit} &rsaquo; {g.division}
                  </span>
                  <h2 className="text-sm font-semibold text-slate-900">{g.team}</h2>
                  <span className="text-xs text-slate-500">{g.people.length}명</span>
                </header>
                <ul className="divide-y divide-slate-100">
                  {g.people.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                      <span className="text-sm font-medium text-slate-900">{p.name}</span>
                      <span className="text-xs text-slate-500">
                        {p.jobGrade ?? POSITION_LABEL[p.position]}
                      </span>
                      {p.isLeader && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                          팀장
                        </span>
                      )}
                      {p.hireDate && (
                        <span className="text-xs text-slate-400">
                          입사 {toDateInputValue(p.hireDate)}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">개인목표 {p.goalCount}건</span>
                      {p.target.included && needsOwnGoal(p) && p.goalCount === 0 && (
                        <span className="rounded bg-status-warning/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                          목표 미등록
                        </span>
                      )}
                      {!p.target.included && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          제외{p.target.reason ? ` · ${p.target.reason}` : ""}
                          {p.target.source === "hireCutoff" ? " (자동)" : ""}
                        </span>
                      )}
                      {p.target.included && p.target.source === "manual" && (
                        <span className="rounded bg-brand-green-light px-1.5 py-0.5 text-[10px] font-medium text-brand-green-dark">
                          대상 지정{p.target.reason ? ` · ${p.target.reason}` : ""}
                        </span>
                      )}

                      <div className="ml-auto flex items-center gap-1.5">
                        {p.target.source === "manual" && (
                          <ActionForm action={resetEvalTarget} successMessage="정상 반영되었습니다.">
                            <input type="hidden" name="cycleId" value={cycle.id} />
                            <input type="hidden" name="userId" value={p.id} />
                            <button
                              type="submit"
                              className={SMALL_BUTTON_CLASS}
                              title="손으로 정한 값을 지우고 기준일·조직도 규칙만 따르게 합니다."
                            >
                              지정 해제
                            </button>
                          </ActionForm>
                        )}
                        {p.target.included ? (
                          <ActionForm
                            action={setEvalTarget}
                            successMessage="정상 반영되었습니다."
                            className="flex items-center gap-1.5"
                          >
                            <input type="hidden" name="cycleId" value={cycle.id} />
                            <input type="hidden" name="userId" value={p.id} />
                            <input type="hidden" name="included" value="false" />
                            <input
                              type="text"
                              name="reason"
                              placeholder="사유(퇴사·부서이동 등)"
                              className="w-44 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-brand-green focus:outline-none"
                            />
                            <button type="submit" className={SMALL_BUTTON_CLASS}>
                              제외
                            </button>
                          </ActionForm>
                        ) : (
                          <ActionForm action={setEvalTarget} successMessage="정상 반영되었습니다.">
                            <input type="hidden" name="cycleId" value={cycle.id} />
                            <input type="hidden" name="userId" value={p.id} />
                            <input type="hidden" name="included" value="true" />
                            <button
                              type="submit"
                              className="rounded-md bg-brand-green px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-green-dark"
                            >
                              대상에 넣기
                            </button>
                          </ActionForm>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
