import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatKSTDate } from "@/lib/format-kst";
import {
  GOAL_CYCLE_STATUS_LABEL,
  GOAL_STATUSES,
  GOAL_STATUS_LABEL,
  toDateInputValue,
  weightedProgress,
  buildGoalTree,
  type GoalCycleStatus,
} from "@/lib/goals";
import {
  createGoalCycle,
  deleteGoalCycle,
  seedCompanyGoalTemplate,
  setGoalCycleStatus,
} from "@/app/platform/evaluation2/actions";
import { addOrgGoal, deleteOrgGoal, saveOrgGoalNote, saveOrgGoals } from "./actions";
import { CycleSelect } from "@/app/platform/evaluation2/cycle-select";

export const dynamic = "force-dynamic";

const INPUT_CLASS =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-green focus:outline-none";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-slate-500";
const PRIMARY_BUTTON_CLASS =
  "rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark";
const CARD_CLASS = "rounded-xl border border-slate-200 bg-white shadow-sm";

export default async function OrgGoalsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ cycleId?: string }>;
}) {
  const params = await searchParams;

  const cycles = await prisma.goalCycle.findMany({
    orderBy: [{ year: "desc" }, { startDate: "desc" }],
  });
  const cycle = cycles.find((c) => c.id === params.cycleId) ?? cycles[0] ?? null;

  const goals = cycle
    ? await prisma.goal.findMany({
        where: { cycleId: cycle.id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          level: true,
          parentId: true,
          category: true,
          title: true,
          description: true,
          division: true,
          teamId: true,
          ownerId: true,
          weight: true,
          metric: true,
          targetValue: true,
          currentValue: true,
          unit: true,
          progress: true,
          status: true,
          dueDate: true,
          sortOrder: true,
          team: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
      })
    : [];

  // 달성률은 화면(평가2)과 같은 규칙으로 굴려 올린 값을 보여줘야, 관리자가
  // 여기서 본 숫자와 사용자가 보는 숫자가 어긋나지 않는다.
  const roots = buildGoalTree(goals);
  const orgGoals = roots.filter((g) => g.level === "COMPANY");
  const overall = orgGoals.length > 0 ? weightedProgress(orgGoals) : 0;
  const totalWeight = orgGoals.reduce((sum, g) => sum + (g.weight > 0 ? g.weight : 0), 0);

  const nextYear = cycles[0]?.year ?? new Date().getFullYear();

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
              options={cycles.map((c) => ({
                value: c.id,
                label: `${c.name} (${GOAL_CYCLE_STATUS_LABEL[c.status as GoalCycleStatus]})`,
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

      {!cycle ? (
        <section className={`${CARD_CLASS} p-5`}>
          <h2 className="text-base font-semibold">먼저 목표 사이클을 만드세요</h2>
          <p className="mt-1 text-sm text-slate-600">
            조직 목표는 사이클(운영 기간) 안에 들어갑니다. 아래 값은 올해 기준으로 채워뒀습니다.
          </p>
          <form action={createGoalCycle} className="mt-4 grid gap-3 md:grid-cols-4">
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
          </form>
        </section>
      ) : (
        <>
          <section className={`${CARD_CLASS} p-5`}>
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-base font-semibold">
                {cycle.year}년 조직 목표
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
                <form action={seedCompanyGoalTemplate.bind(null, cycle.id)} className="mt-3">
                  <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                    조직 단위별 목표 양식으로 채우기
                  </button>
                </form>
                <p className="mt-2 text-xs text-slate-500">
                  제품기획마케팅 · 영업고객관리 · 기술연구 · 생산 · 재무경영관리 5개 구분과 표
                  하단 안내문이 한 번에 들어갑니다.
                </p>
              </div>
            ) : (
              <form action={saveOrgGoals} className="mt-4 flex flex-col gap-3">
                <input type="hidden" name="cycleId" value={cycle.id} />
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
                            defaultValue={g.sortOrder || i + 1}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="md:col-span-3">
                          <label className={LABEL_CLASS}>구분</label>
                          <input
                            name={`category:${g.id}`}
                            defaultValue={g.category ?? ""}
                            placeholder="영업고객관리"
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="md:col-span-8">
                          <label className={LABEL_CLASS}>목표</label>
                          <input
                            name={`title:${g.id}`}
                            defaultValue={g.title}
                            required
                            className={INPUT_CLASS}
                          />
                        </div>

                        <div className="md:col-span-3">
                          <label className={LABEL_CLASS}>측정지표</label>
                          <input
                            name={`metric:${g.id}`}
                            defaultValue={g.metric ?? ""}
                            placeholder="연매출"
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className={LABEL_CLASS}>목표수준</label>
                          <input
                            name={`targetValue:${g.id}`}
                            defaultValue={g.targetValue ?? ""}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className={LABEL_CLASS}>현재수준</label>
                          <input
                            name={`currentValue:${g.id}`}
                            defaultValue={g.currentValue ?? ""}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="md:col-span-1">
                          <label className={LABEL_CLASS}>단위</label>
                          <input
                            name={`unit:${g.id}`}
                            defaultValue={g.unit ?? ""}
                            placeholder="억원"
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className={LABEL_CLASS}>가중치(%)</label>
                          <input
                            type="number"
                            name={`weight:${g.id}`}
                            min={0}
                            max={100}
                            defaultValue={g.weight}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className={LABEL_CLASS}>달성률(%)</label>
                          <input
                            type="number"
                            name={`progress:${g.id}`}
                            min={0}
                            max={100}
                            defaultValue={g.progress}
                            disabled={g.children.length > 0}
                            className={`${INPUT_CLASS} disabled:bg-slate-200 disabled:text-slate-400`}
                          />
                        </div>

                        <div className="md:col-span-3">
                          <label className={LABEL_CLASS}>상태</label>
                          <select
                            name={`status:${g.id}`}
                            defaultValue={g.status}
                            className={INPUT_CLASS}
                          >
                            {GOAL_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {GOAL_STATUS_LABEL[st]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-3">
                          <label className={LABEL_CLASS}>마감일</label>
                          <input
                            type="date"
                            name={`dueDate:${g.id}`}
                            defaultValue={toDateInputValue(g.dueDate)}
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="flex items-end justify-between gap-3 md:col-span-6">
                          <p className="text-xs text-slate-500">
                            {g.children.length > 0
                              ? `하위 ${g.children.length}건이 달려 있어 달성률은 하위 가중평균(${g.rollupProgress}%)으로 자동 계산됩니다.`
                              : "하위 목표를 달면 달성률이 자동 계산으로 바뀝니다."}
                          </p>
                          {/* 표 전체가 한 폼이라 중첩 폼을 못 쓴다. formAction으로
                              이 버튼만 다른 서버 액션에 보낸다. */}
                          <button
                            type="submit"
                            formAction={deleteOrgGoal.bind(null, g.id)}
                            className="shrink-0 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs text-status-critical hover:bg-red-50"
                          >
                            이 목표 삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-3">
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
                </div>
              </form>
            )}
          </section>

          {orgGoals.length > 0 && (
            <section className={`${CARD_CLASS} p-5`}>
              <h2 className="text-base font-semibold">목표 추가</h2>
              <form action={addOrgGoal} className="mt-3 grid gap-3 md:grid-cols-4">
                <input type="hidden" name="cycleId" value={cycle.id} />
                <div>
                  <label className={LABEL_CLASS}>구분</label>
                  <input name="newCategory" placeholder="사업개발" className={INPUT_CLASS} />
                </div>
                <div className="md:col-span-2">
                  <label className={LABEL_CLASS}>목표</label>
                  <input name="newTitle" required className={INPUT_CLASS} />
                </div>
                <div className="flex items-end">
                  <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                    추가
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className={`${CARD_CLASS} p-5`}>
            <h2 className="text-base font-semibold">표 하단 안내문</h2>
            <form action={saveOrgGoalNote} className="mt-3">
              <input type="hidden" name="cycleId" value={cycle.id} />
              <label className={LABEL_CLASS}>한 줄이 i), ii) 한 항목이 됩니다</label>
              <textarea
                name="note"
                rows={3}
                defaultValue={cycle.note ?? ""}
                placeholder={
                  "각 조직별 목표 달성을 위한 핵심 과제는 내부 공유 통해 정보 획득 및 실행 필요.\n사업개발의 경우 추후 확정 예정."
                }
                className={INPUT_CLASS}
              />
              <button type="submit" className={`${PRIMARY_BUTTON_CLASS} mt-2`}>
                안내문 저장
              </button>
            </form>
          </section>

          <section className={`${CARD_CLASS} p-5`}>
            <h2 className="text-base font-semibold">목표 사이클</h2>
            <div className="mt-3 flex flex-col gap-2">
              {cycles.map((c) => (
                <div
                  key={c.id}
                  className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm ${
                    c.id === cycle.id ? "border-brand-green bg-brand-green-light" : "border-slate-200"
                  }`}
                >
                  <Link href={cycleHref(c.id)} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {formatKSTDate(c.startDate)} ~ {formatKSTDate(c.endDate)}
                  </span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-600">
                    {GOAL_CYCLE_STATUS_LABEL[c.status as GoalCycleStatus]}
                  </span>
                  <div className="ml-auto flex gap-2">
                    {c.status !== "OPEN" && (
                      <form action={setGoalCycleStatus.bind(null, c.id, "OPEN")}>
                        <button className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
                          진행중으로
                        </button>
                      </form>
                    )}
                    {c.status !== "CLOSED" && (
                      <form action={setGoalCycleStatus.bind(null, c.id, "CLOSED")}>
                        <button className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
                          종료
                        </button>
                      </form>
                    )}
                    <form action={deleteGoalCycle.bind(null, c.id)}>
                      <button className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-status-critical hover:bg-red-50">
                        삭제
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>

            <form
              action={createGoalCycle}
              className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-4"
            >
              <div className="md:col-span-2">
                <label className={LABEL_CLASS}>새 사이클명</label>
                <input name="name" required placeholder={`${nextYear}년 하반기`} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>시작일</label>
                <input type="date" name="startDate" required className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>종료일</label>
                <input type="date" name="endDate" required className={INPUT_CLASS} />
              </div>
              <div className="md:col-span-4">
                <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                  사이클 추가
                </button>
              </div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
