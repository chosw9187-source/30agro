import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatKSTDate } from "@/lib/format-kst";
import {
  GOAL_CYCLE_ORDER,
  GOAL_CYCLE_STATUS_LABEL,
  cyclePhaseLabel,
  groupCyclesByYear,
  GOAL_STATUSES,
  GOAL_STATUS_LABEL,
  cycleLock,
  toDateInputValue,
  weightedProgress,
  buildGoalTree,
  type GoalCycleStatus,
} from "@/lib/goals";
import {
  copyGoalsFromCycle,
  createGoalCheckpoint,
  createGoalCycle,
  deleteGoalCheckpoint,
  deleteGoalCycle,
  lockGoalSetting,
  moveGoalCycle,
  renameGoalCycle,
  seedCompanyGoalTemplate,
  setGoalCycleStatus,
  unlockGoalSetting,
} from "@/app/platform/evaluation2/actions";
import { addOrgGoal, deleteOrgGoal, saveOrgGoals } from "./actions";
import { CycleSelect } from "@/app/platform/evaluation2/cycle-select";
import { ActionForm } from "@/components/action-form";

export const dynamic = "force-dynamic";

const INPUT_CLASS =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-green focus:outline-none";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-slate-500";
const PRIMARY_BUTTON_CLASS =
  "rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark";
const CARD_CLASS = "rounded-xl border border-slate-200 bg-white shadow-sm";

// 목표 카드마다 "이 목표 삭제" 폼이 따로 있어야 하는데, 카드가 일괄저장 폼
// 안에 들어가면 폼이 중첩된다(HTML에서 불가). 그래서 입력칸들은 form 속성으로
// 이 id를 가리키게 두고, 저장 폼은 카드 바깥에 따로 세운다.
const ORG_FORM_ID = "org-goals-form";

export default async function OrgGoalsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ cycleId?: string }>;
}) {
  const params = await searchParams;

  const cycles = await prisma.goalCycle.findMany({
    orderBy: GOAL_CYCLE_ORDER,
  });
  const cycle = cycles.find((c) => c.id === params.cycleId) ?? cycles[0] ?? null;
  // 목표를 가져올 수 있는 다른 사이클 — 최근 것부터.
  const otherCycles = cycles.filter((c) => c.id !== cycle?.id);
  // 목표를 실제로 담고 있는 사이클. 남의 목표를 빌려 쓰는 평가라면 그쪽을 본다.
  const goalCycleId = cycle?.sourceCycleId ?? cycle?.id ?? null;
  const sharedFrom = cycle?.sourceCycleId
    ? (cycles.find((c) => c.id === cycle.sourceCycleId) ?? null)
    : null;

  const goals = goalCycleId
    ? await prisma.goal.findMany({
        where: { cycleId: goalCycleId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          level: true,
          parentId: true,
          title: true,
          description: true,
          division: true,
          teamId: true,
          ownerId: true,
          weight: true,
          metric: true,
          targetValue: true,
          currentValue: true,
          scaleS: true,
          scaleA: true,
          scaleB: true,
          scaleC: true,
          scaleD: true,
          formula: true,
          goalType: true,
          keyResults: true,
          progress: true,
          status: true,
          excluded: true,
          excludeReason: true,
          agreementStatus: true,
          agreementNote: true,
          agreedAt: true,
          agreedBy: { select: { id: true, name: true } },
          dueDate: true,
          sortOrder: true,
          team: { select: { id: true, name: true } },
          owner: {
            select: { id: true, name: true, teamId: true, terminationDate: true },
          },
        },
      })
    : [];

  // 달성률은 화면(평가2)과 같은 규칙으로 굴려 올린 값을 보여줘야, 관리자가
  // 여기서 본 숫자와 사용자가 보는 숫자가 어긋나지 않는다.
  const roots = buildGoalTree(goals);
  const orgGoals = roots.filter((g) => g.level === "COMPANY");
  const overall = orgGoals.length > 0 ? weightedProgress(orgGoals) : 0;
  const totalWeight = orgGoals.reduce((sum, g) => sum + (g.weight > 0 ? g.weight : 0), 0);

  // 이 사이클에 찍어 둔 평가 시점들. 목록에는 그 시점의 전사 종합 달성률을
  // 같이 보여준다 — 시점을 왜 남겼는지가 숫자로 바로 읽히도록.
  const checkpointRows = cycle
    ? await prisma.goalCheckpoint.findMany({
        where: { cycleId: cycle.id },
        orderBy: { takenAt: "desc" },
        select: {
          id: true,
          name: true,
          note: true,
          takenAt: true,
          entries: { select: { level: true, progress: true, excluded: true } },
        },
      })
    : [];
  const checkpoints = checkpointRows.map((cp) => {
    const company = cp.entries.filter((e) => e.level === "COMPANY" && !e.excluded);
    return {
      id: cp.id,
      name: cp.name,
      note: cp.note,
      takenAt: cp.takenAt,
      entryCount: cp.entries.length,
      companyProgress:
        company.length > 0
          ? Math.round(company.reduce((sum, e) => sum + e.progress, 0) / company.length)
          : 0,
    };
  });

  // 잠금은 목표를 담고 있는 사이클을 따른다 — 서버도 그 사이클로 판단한다.
  const lock = cycleLock(sharedFrom ?? cycle);

  const nextYear = cycles[0]?.year ?? new Date().getFullYear();
  // 새 사이클은 대개 "내년치 목표설정"을 미리 여는 경우라, 이름과 기간을
  // 미리 채워 두고 버튼만 누르면 되게 한다.
  const upcomingYear = Math.max(...cycles.map((c) => c.year), new Date().getFullYear()) + 1;

  function cycleHref(id: string) {
    return `/admin/org-goals?cycleId=${id}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">조직 목표 관리</h1>
          <p className="mt-1 text-slate-600">
            평가2 화면 맨 위에 고정되는 조직 목표 표를 여기서 만들고 고칩니다. 관리자만
            들어올 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cycle && cycles.length > 0 && (
            <CycleSelect
              value={cycle.id}
              groups={groupCyclesByYear(cycles).map((g) => ({
                label: `${g.year}년`,
                options: g.items.map((c) => ({
                  value: c.id,
                  label: `${cyclePhaseLabel(c)} (${
                    GOAL_CYCLE_STATUS_LABEL[c.status as GoalCycleStatus]
                  })`,
                })),
              }))}
            />
          )}
          <Link
            href="/platform/evaluation2"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            평가2 화면 보기 →
          </Link>
        </div>
      </div>

      {sharedFrom && (
        <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          이 평가는 <b className="text-slate-800">「{sharedFrom.name}」</b>의 목표를 그대로 씁니다 —
          여기서 고치면 두 화면에 함께 반영됩니다.
        </div>
      )}

      {!cycle ? (
        <section className={`${CARD_CLASS} p-5`}>
          <h2 className="text-base font-semibold">먼저 목표 사이클을 만드세요</h2>
          <p className="mt-1 text-sm text-slate-600">
            조직 목표는 사이클(운영 기간) 안에 들어갑니다. 아래 값은 올해 기준으로 채워뒀습니다.
          </p>
          <ActionForm
            action={createGoalCycle}
            successMessage="목표 사이클을 만들었습니다."
            className="mt-4 grid gap-3 md:grid-cols-4"
          >
            <div className="md:col-span-2">
              <label className={LABEL_CLASS}>사이클명</label>
              <input
                name="name"
                required
                defaultValue={`${nextYear}년 상반기`}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>시작일</label>
              <input
                type="date"
                name="startDate"
                required
                defaultValue={`${nextYear}-01-01`}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>종료일</label>
              <input
                type="date"
                name="endDate"
                required
                defaultValue={`${nextYear}-06-30`}
                className={INPUT_CLASS}
              />
            </div>
            <div className="md:col-span-4">
              <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                사이클 만들기
              </button>
            </div>
          </ActionForm>
        </section>
      ) : (
        <>
          {lock.message && (
            <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-600">
              <span className="font-medium text-slate-800">
                {cycle.status === "CLOSED" ? "완료됨" : "목표 확정됨"}
              </span>
              <span className="ml-2">{lock.message}</span>
              {cycle.goalsLockedAt && cycle.status !== "CLOSED" && (
                <span className="ml-2 text-xs text-slate-400">
                  {formatKSTDate(cycle.goalsLockedAt)} 마감 · 아래 「목표 사이클」에서 마감을 풀면
                  다시 고칠 수 있습니다.
                </span>
              )}
            </div>
          )}

          <section className={`${CARD_CLASS} p-5`}>
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-base font-semibold">
                {cycle.year}년 전사 목표
                <span className="ml-2 text-sm font-normal text-slate-400">{cycle.name}</span>
              </h2>
              <span className="text-xs text-slate-500">
                {formatKSTDate(cycle.startDate)} ~ {formatKSTDate(cycle.endDate)}
              </span>
              <span className="ml-auto text-sm text-slate-600">
                종합 달성률{" "}
                <strong className="text-lg text-slate-900 tabular-nums">{overall}%</strong>
              </span>
            </div>

            {orgGoals.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center">
                <p className="text-sm text-slate-500">등록된 조직 목표가 없습니다.</p>
                <ActionForm
                  action={seedCompanyGoalTemplate.bind(null, cycle.id)}
                  successMessage="조직 목표 양식을 넣었습니다."
                  className="mt-3"
                >
                  <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                    조직 단위별 목표 양식으로 채우기
                  </button>
                </ActionForm>
                <p className="mt-2 text-xs text-slate-500">
                  제품기획마케팅 · 영업고객관리 · 기술연구 · 생산 · 재무경영관리 다섯 줄이 한 번에
                  들어갑니다.
                </p>

                {otherCycles.length > 0 && (
                  <div className="mt-5 border-t border-slate-200 pt-4">
                    <p className="text-sm text-slate-600">
                      또는 지난 사이클의 목표 체계를 그대로 가져옵니다.
                    </p>
                    <ActionForm
                      action={copyGoalsFromCycle}
                      successMessage="목표를 가져왔습니다."
                      className="mt-3 flex flex-wrap items-center justify-center gap-2"
                    >
                      <input type="hidden" name="targetCycleId" value={cycle.id} />
                      <select
                        name="sourceCycleId"
                        defaultValue={otherCycles[0].id}
                        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        {otherCycles.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        이 사이클의 목표 가져오기
                      </button>
                    </ActionForm>
                    <p className="mt-2 text-xs text-slate-500">
                      전사 · 책임 · 팀 · 개인 목표와 그 연결이 그대로 복사됩니다. 달성률 · 상태 ·
                      합의 · 기한은 복사하지 않습니다 — 새 사이클은 0%에서 시작해야 합니다.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-col gap-3">
                  {orgGoals.map((g, i) => (
                    <div
                      key={g.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="grid gap-3 md:grid-cols-12">
                        <div className="md:col-span-1">
                          <label className={LABEL_CLASS}>순서</label>
                          <input
                            type="number"
                            name={`sortOrder:${g.id}`}
                            form={ORG_FORM_ID}
                            defaultValue={g.sortOrder || i + 1}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="md:col-span-11">
                          <label className={LABEL_CLASS}>목표</label>
                          <input
                            name={`title:${g.id}`}
                            form={ORG_FORM_ID}
                            defaultValue={g.title}
                            required
                            className={INPUT_CLASS}
                          />
                        </div>

                        <div className="md:col-span-3">
                          <label className={LABEL_CLASS}>측정지표</label>
                          <input
                            name={`metric:${g.id}`}
                            form={ORG_FORM_ID}
                            defaultValue={g.metric ?? ""}
                            placeholder="연매출"
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className={LABEL_CLASS}>목표수준</label>
                          <input
                            name={`targetValue:${g.id}`}
                            form={ORG_FORM_ID}
                            defaultValue={g.targetValue ?? ""}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className={LABEL_CLASS}>현재수준</label>
                          <input
                            name={`currentValue:${g.id}`}
                            form={ORG_FORM_ID}
                            defaultValue={g.currentValue ?? ""}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className={LABEL_CLASS}>가중치(%)</label>
                          <input
                            type="number"
                            name={`weight:${g.id}`}
                            form={ORG_FORM_ID}
                            min={0}
                            max={100}
                            defaultValue={g.weight}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className={LABEL_CLASS}>달성률(%)</label>
                          {/* 조직 목표는 아래 책임·팀·개인목표에서 굴려 올린 값이라
                              직접 못 고친다. 여기서 손으로 적게 두면 아래는 비어
                              있는데 위만 100%인 표가 만들어진다. */}
                          <p className="rounded-md border border-dashed border-slate-300 px-2 py-1.5 text-sm text-slate-500 tabular-nums">
                            {g.rollupProgress}% <span className="text-xs">(자동)</span>
                          </p>
                        </div>

                        <div className="md:col-span-3">
                          <label className={LABEL_CLASS}>상태</label>
                          <select
                            name={`status:${g.id}`}
                            form={ORG_FORM_ID}
                            defaultValue={g.status}
                            className={INPUT_CLASS}
                          >
                            {/*
                              전사목표에는 «완료»를 고를 수 없다. 달성률이 아래에서
                              굴러 올라오는데 상태만 손으로 완료로 두면 «0%인데 완료»가
                              된다 — 실제로 이렇게 남은 한 건 때문에 «완료 1건»이
                              떴다. 완료는 딸린 목표가 다 차면 저절로 붙는다.
                            */}
                            {GOAL_STATUSES.filter((st) => st !== "DONE").map((st) => (
                              <option key={st} value={st}>
                                {GOAL_STATUS_LABEL[st]}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-[11px] text-slate-400">
                            «완료»는 딸린 목표가 모두 달성되면 저절로 붙습니다
                          </p>
                        </div>
                        <div className="md:col-span-3">
                          <label className={LABEL_CLASS}>마감일</label>
                          <input
                            type="date"
                            name={`dueDate:${g.id}`}
                            form={ORG_FORM_ID}
                            defaultValue={toDateInputValue(g.dueDate)}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="flex items-end justify-between gap-3 md:col-span-6">
                          <p className="text-xs text-slate-500">
                            {g.children.length > 0
                              ? `하위 ${g.children.length}건의 가중평균으로 자동 계산 중 (${g.rollupProgress}%).`
                              : "연결된 하위 목표가 없어 0%입니다. 책임·팀·개인목표를 만들어 이 목표에 연결하세요."}
                          </p>
                          {lock.canEditGoals && (
                          <ActionForm
                            action={deleteOrgGoal.bind(null, g.id)}
                            successMessage="삭제되었습니다."
                            className="shrink-0"
                          >
                            <button
                              type="submit"
                              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs text-status-critical hover:bg-red-50"
                            >
                              이 목표 삭제
                            </button>
                          </ActionForm>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {lock.canEditGoals && (
                  <ActionForm
                    id={ORG_FORM_ID}
                    action={saveOrgGoals}
                    successMessage="저장되었습니다."
                    className="flex flex-wrap items-center gap-3"
                  >
                    <input type="hidden" name="cycleId" value={goalCycleId ?? cycle.id} />
                    <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                      표 저장
                    </button>
                    <span className="text-xs text-slate-500">
                      가중치 합계 {totalWeight}%
                      {totalWeight !== 100 && orgGoals.length > 0 && (
                        <span className="ml-1 text-status-critical">
                          — 100%로 맞추면 종합 달성률이 의도대로 계산됩니다
                        </span>
                      )}
                    </span>
                  </ActionForm>
                )}
              </div>
            )}
          </section>

          {orgGoals.length > 0 && lock.canEditGoals && (
            <section className={`${CARD_CLASS} p-5`}>
              <h2 className="text-base font-semibold">목표 추가</h2>
              <ActionForm
                action={addOrgGoal}
                successMessage="정상 등록되었습니다."
                className="mt-3 grid gap-3 md:grid-cols-4"
              >
                <input type="hidden" name="cycleId" value={goalCycleId ?? cycle.id} />
                <div className="md:col-span-3">
                  <label className={LABEL_CLASS}>목표</label>
                  <input name="newTitle" required className={INPUT_CLASS} />
                </div>
                <div className="flex items-end">
                  <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                    추가
                  </button>
                </div>
              </ActionForm>
            </section>
          )}

          <section className={`${CARD_CLASS} p-5`}>
            <h2 className="text-base font-semibold">평가 시점</h2>
            <p className="mt-1 text-sm text-slate-500">
              같은 목표로 상반기·하반기를 나눠 평가할 때 씁니다. 목표를 복사해 사이클을 새로 만들면
              같은 목표가 두 벌이 되고 어느 쪽이 진짜인지가 생깁니다. 목표는 한 벌로 두고 그 시점의
              달성률만 얼려 두면, 하반기에 숫자가 더 올라가도 상반기 성적은 그대로 남습니다.
            </p>

            <ActionForm
              action={createGoalCheckpoint}
              successMessage="평가 시점을 확정했습니다."
              className="mt-3 flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="cycleId" value={cycle.id} />
              <div className="min-w-56 flex-1">
                <label className={LABEL_CLASS}>평가 시점 이름</label>
                <input
                  name="name"
                  required
                  defaultValue={`${cycle.year}년 상반기 평가`}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="min-w-56 flex-1">
                <label className={LABEL_CLASS}>메모 (선택)</label>
                <input name="note" className={INPUT_CLASS} />
              </div>
              <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                지금 시점으로 확정
              </button>
            </ActionForm>

            {checkpoints.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">아직 확정한 평가 시점이 없습니다.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {checkpoints.map((cp) => (
                  <div
                    key={cp.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 p-3 text-sm"
                  >
                    <span className="font-medium">{cp.name}</span>
                    <span className="text-xs text-slate-500">{formatKSTDate(cp.takenAt)}</span>
                    <span className="text-xs text-slate-500">목표 {cp.entryCount}건</span>
                    <span className="text-xs text-slate-600">
                      그 시점 전사 종합{" "}
                      <b className="tabular-nums">{cp.companyProgress}%</b>
                    </span>
                    {cp.note && <span className="text-xs text-slate-400">{cp.note}</span>}
                    <ActionForm
                      action={deleteGoalCheckpoint.bind(null, cp.id)}
                      successMessage="삭제되었습니다."
                      className="ml-auto"
                    >
                      <button className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-status-critical hover:bg-red-50">
                        삭제
                      </button>
                    </ActionForm>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={`${CARD_CLASS} p-5`}>
            <h2 className="text-base font-semibold">목표 사이클</h2>
            <p className="mt-1 text-sm text-slate-500">
              위·아래 화살표로 순서를 바꾸면 평가2 화면 오른쪽 위 선택 목록도 같은 순서가 됩니다.
            </p>
            {/*
              연도 > 단계 두 층으로 묶는다. "2026년 목표설정 / 2026년 중간평가 /
              2026년 최종평가"가 평평하게 늘어서면 몇 해치가 섞이는 순간 읽기
              어려워지는데, 해 아래 단계가 들어가면 "2026년에는 이 세 가지가
              있다"가 한눈에 읽힌다.
            */}
            {groupCyclesByYear(cycles).map((group) => (
            <div key={group.year} className="mt-4">
            <h3 className="mb-2 text-sm font-bold text-slate-800">{group.year}년</h3>
            <div className="flex flex-col gap-2">
              {group.items.map((c, i) => (
                <div
                  key={c.id}
                  className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm ${
                    c.id === cycle.id ? "border-brand-green bg-brand-green-light" : "border-slate-200"
                  }`}
                >
                  {/*
                    순서 바꾸기. 연도·기간순으로만 세우면 "목표설정 → 상반기 →
                    최종평가"처럼 일이 진행되는 순서로 못 늘어놓는다.
                  */}
                  <div className="flex flex-col gap-0.5">
                    <ActionForm action={moveGoalCycle.bind(null, c.id, "up")} successMessage="순서를 바꿨습니다.">
                      <button
                        disabled={i === 0}
                        aria-label="위로"
                        title="위로"
                        className="rounded border border-slate-300 bg-white px-1.5 text-xs leading-4 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ▲
                      </button>
                    </ActionForm>
                    <ActionForm action={moveGoalCycle.bind(null, c.id, "down")} successMessage="순서를 바꿨습니다.">
                      <button
                        disabled={i === group.items.length - 1}
                        aria-label="아래로"
                        title="아래로"
                        className="rounded border border-slate-300 bg-white px-1.5 text-xs leading-4 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </ActionForm>
                  </div>

                  {/*
                    이름과 기간을 그 자리에서 고친다. 지웠다 다시 만들면 그 안에
                    달린 목표가 통째로 사라지는데, 이름은 운영하면서 계속 바뀐다
                    ("2026년 하반기" → "2026년 목표설정").
                  */}
                  <ActionForm
                    action={renameGoalCycle}
                    successMessage="저장되었습니다."
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    <input type="hidden" name="cycleId" value={c.id} />
                    <input
                      name="name"
                      defaultValue={c.name}
                      required
                      aria-label="인사평가 이름"
                      className="w-44 rounded-md border border-slate-300 px-2 py-1 text-sm font-medium"
                    />
                    <input
                      type="date"
                      name="startDate"
                      defaultValue={toDateInputValue(c.startDate)}
                      aria-label="시작일"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                    <span className="text-xs text-slate-400">~</span>
                    <input
                      type="date"
                      name="endDate"
                      defaultValue={toDateInputValue(c.endDate)}
                      aria-label="종료일"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                    <button className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
                      이름·기간 저장
                    </button>
                  </ActionForm>
                  <Link
                    href={cycleHref(c.id)}
                    className="text-xs text-brand-green-dark hover:underline"
                  >
                    이 사이클 열기
                  </Link>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-600">
                    {GOAL_CYCLE_STATUS_LABEL[c.status as GoalCycleStatus]}
                  </span>
                  {c.goalsLockedAt && (
                    <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[11px] text-white">
                      목표 마감 · {formatKSTDate(c.goalsLockedAt)}
                    </span>
                  )}
                  <div className="ml-auto flex gap-2">
                    {c.goalsLockedAt ? (
                      <ActionForm
                        action={unlockGoalSetting.bind(null, c.id)}
                        successMessage="목표 마감을 풀었습니다."
                      >
                        <button className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
                          목표 마감 해제
                        </button>
                      </ActionForm>
                    ) : (
                      <ActionForm
                        action={lockGoalSetting.bind(null, c.id)}
                        successMessage="목표를 마감했습니다."
                      >
                        <button className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
                          목표 마감
                        </button>
                      </ActionForm>
                    )}
                    {c.status !== "OPEN" && (
                      <ActionForm
                        action={setGoalCycleStatus.bind(null, c.id, "OPEN")}
                        successMessage="진행중으로 바꿨습니다."
                      >
                        <button className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
                          진행중으로
                        </button>
                      </ActionForm>
                    )}
                    {c.status !== "CLOSED" && (
                      <ActionForm
                        action={setGoalCycleStatus.bind(null, c.id, "CLOSED")}
                        successMessage="완료로 바꿨습니다."
                      >
                        <button className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
                          완료 처리
                        </button>
                      </ActionForm>
                    )}
                    <ActionForm action={deleteGoalCycle.bind(null, c.id)} successMessage="삭제되었습니다.">
                      <button className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-status-critical hover:bg-red-50">
                        삭제
                      </button>
                    </ActionForm>
                  </div>
                </div>
              ))}
            </div>
            </div>
            ))}

            <ActionForm
              action={createGoalCycle}
              successMessage="목표 사이클을 추가했습니다."
              className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-4"
            >
              <div className="md:col-span-2">
                <label className={LABEL_CLASS}>새 사이클명</label>
                <input
                  name="name"
                  required
                  defaultValue={`${upcomingYear}년 목표설정`}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>시작일</label>
                <input
                  type="date"
                  name="startDate"
                  required
                  defaultValue={`${upcomingYear}-01-01`}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>종료일</label>
                <input
                  type="date"
                  name="endDate"
                  required
                  defaultValue={`${upcomingYear}-12-31`}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="md:col-span-2">
                <label className={LABEL_CLASS}>목표 공유 (선택)</label>
                <select name="sourceCycleId" defaultValue="" className={INPUT_CLASS}>
                  <option value="">자기 목표 사용</option>
                  {cycles
                    .filter((o) => !o.sourceCycleId)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}의 목표를 그대로 사용
                      </option>
                    ))}

                </select>
              </div>
              <div className="md:col-span-4">
                <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                  사이클 추가
                </button>
              </div>
            </ActionForm>
          </section>
        </>
      )}
    </div>
  );
}
