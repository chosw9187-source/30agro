import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ActionForm } from "@/components/action-form";
import { InstantSelect } from "@/components/instant-select";
import { activePrismaWhere } from "@/lib/hr-analytics";
import { POSITION_LABEL } from "@/lib/permission-constants";
import { isCompetencyTarget, competencyExcluded } from "@/lib/competency";
import { loadCompetencyForm } from "@/lib/competency-form";
import { cyclePhaseRank, cycleYear } from "@/lib/goals";
import {
  ORG_GRADES,
  PERSON_GRADES,
  PERSON_GRADE_CLASS,
  businessUnitOf,
  parseRatios,
  ratioSum,
  theoreticalSeats,
  type GradeRatios,
  type PersonGrade,
} from "@/lib/final-grade";
import {
  loadFixedGrades,
  loadUnitScores,
  resolveUnitGrades,
} from "@/lib/final-grade-data";
import {
  seedQuotaTable,
  saveQuotaTable,
  setUnitOrgGrade,
  setFinalGrade,
} from "./actions";

export const dynamic = "force-dynamic";

const CARD = "rounded-xl border border-slate-200 bg-white shadow-sm";
const BTN =
  "rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark";
const BTN_GHOST =
  "rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50";
const NUM =
  "w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums focus:border-brand-green focus:outline-none";

/**
 * 등급 · 정원 관리 — 상대평가의 «몇 자리»를 정하는 자리.
 *
 * 우리 회사 인사평가는 상대평가다. 종합점수가 몇 점이냐로 등급이 정해지지 않고,
 * 업무단위 안에서 몇 등이냐와 그 업무단위에 몇 자리가 있느냐로 정해진다. 이
 * 화면은 그 «몇 자리»를 세 단계로 정한다.
 *
 *   ① 분포표 — 조직등급마다 개인등급 배분율(S 30% · A 60% …).
 *   ② 업무단위 — 그 해 업무단위마다 조직등급을 고른다. 고르는 순간 정원이 정해진다.
 *   ③ 명단 — 순위대로 배분된 등급을 보고, 경계에 걸린 사람을 인사팀이 확정한다.
 *
 * ③이 필요한 이유는 정원이 소수로 떨어지기 때문이다 — 스물한 명에게 5%면
 * 1.05자리이고, 그 0.05를 누구에게 주느냐는 표에 없다. 동점자가 경계를 넘는
 * 자리도 같다. 그런 줄만 「반올림 확인」으로 띄우고 나머지는 계산값을 그대로 둔다.
 */
export default async function GradePlanAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;

  /*
    해의 목록은 인사평가(사이클)에서 가져온다 — 등급은 그 해 평가 결과에 붙는
    것이라, 평가가 없는 해를 고르게 두면 빈 명단만 나온다.
  */
  const cycles = await prisma.goalCycle.findMany({
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      year: true,
      sourceCycleId: true,
    },
  });
  const years = [...new Set(cycles.map((c) => cycleYear(c)))].sort(
    (a, b) => b - a,
  );
  const thisYear = new Date().getFullYear();
  const year = params.year
    ? Number(params.year)
    : (years.find((y) => y === thisYear) ?? years[0] ?? thisYear);

  const yearCycles = cycles.filter((c) => cycleYear(c) === year);
  const finalCycle = yearCycles.find((c) => cyclePhaseRank(c) === 3) ?? null;
  const finalGoalCycleId = finalCycle
    ? (finalCycle.sourceCycleId ?? finalCycle.id)
    : null;

  const [quotaRows, unitRows, teams, people, form] = await Promise.all([
    prisma.gradeQuota.findMany({
      where: { year },
      select: { orgGrade: true, ratios: true },
    }),
    prisma.gradeUnitPlan.findMany({
      where: { year },
      select: { businessUnit: true, orgGrade: true },
    }),
    prisma.team.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, businessUnit: true },
    }),
    prisma.user.findMany({
      where: activePrismaWhere(),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        position: true,
        teamId: true,
        businessUnit: true,
        team: { select: { name: true } },
      },
    }),
    loadCompetencyForm(year),
  ]);

  const quotaByOrg = new Map(
    quotaRows.map((r) => [r.orgGrade, parseRatios(r.ratios)]),
  );
  const unitPlan = new Map(unitRows.map((r) => [r.businessUnit, r.orgGrade]));

  const teamUnitById = new Map(teams.map((t) => [t.id, t.businessUnit]));
  const unitOf = (p: { businessUnit: string | null; teamId: string | null }) =>
    businessUnitOf({
      businessUnit: p.businessUnit,
      team: p.teamId
        ? { businessUnit: teamUnitById.get(p.teamId) ?? null }
        : null,
    });

  /*
    모집단은 역량평가 대상과 같다 — 담당·팀장이고 평가에서 빠지지 않은 사람.
    결과지의 등급과 이 화면의 등급이 어긋나지 않게 같은 규칙을 쓴다.
  */
  const targets = people.filter(
    (p) =>
      isCompetencyTarget(p.position) &&
      !(form && competencyExcluded(p, form.targets).excluded),
  );

  const scores = await loadUnitScores(
    year,
    targets.map((p) => p.id),
    finalGoalCycleId,
  );
  const fixed = await loadFixedGrades(
    year,
    targets.map((p) => p.id),
  );

  /** 업무단위 목록 — 사람·팀에 적힌 값에서 뽑는다. 따로 조직표를 두지 않는다. */
  const unitNames = [
    ...new Set(
      [
        ...targets.map((p) => unitOf(p)),
        ...teams.map((t) => t.businessUnit?.trim() || null),
      ].filter((v): v is string => !!v),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const unitless = targets.filter((p) => unitOf(p) == null);

  type Row = {
    unit: string;
    orgGrade: string | null;
    ratios: GradeRatios | null;
    members: typeof targets;
    grades: Map<
      string,
      ReturnType<typeof resolveUnitGrades> extends Map<string, infer V>
        ? V
        : never
    >;
  };
  const unitBlocks: Row[] = unitNames.map((unit) => {
    const members = targets.filter((p) => unitOf(p) === unit);
    const orgGrade = unitPlan.get(unit) ?? null;
    const ratios = orgGrade ? (quotaByOrg.get(orgGrade) ?? null) : null;
    const usable = ratios && ratioSum(ratios) === 100 ? ratios : null;
    return {
      unit,
      orgGrade,
      ratios,
      members,
      grades: resolveUnitGrades(
        members.map((p) => ({
          userId: p.id,
          total: scores.get(p.id)?.total ?? null,
        })),
        usable,
        fixed,
      ),
    };
  });

  const orgOptions = [
    { value: "", label: "미지정" },
    ...ORG_GRADES.map((g) => ({ value: g, label: `${g} 등급` })),
  ];
  const personOptions = [
    { value: "", label: "계산값 그대로" },
    ...PERSON_GRADES.map((g) => ({ value: g, label: g })),
  ];

  const reviewCount = unitBlocks.reduce(
    (n, b) => n + [...b.grades.values()].filter((g) => g.needsReview).length,
    0,
  );

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-3 p-4">
      {/* 머리 */}
      <section className={`${CARD} px-4 py-3`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-lg font-bold text-slate-900">등급 · 정원 관리</h1>
          <span className="flex flex-wrap items-center gap-1.5">
            {years.map((y) => (
              <Link
                key={y}
                href={`/admin/grade?year=${y}`}
                className={`rounded-full px-2.5 py-0.5 text-xs ${
                  y === year
                    ? "bg-brand-green text-white"
                    : "border border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {y}년
              </Link>
            ))}
          </span>
          <Link href="/admin" className={`${BTN_GHOST} ml-auto`}>
            관리로
          </Link>
        </div>
        <p className="mt-1.5 text-xs break-keep text-slate-500">
          인사평가는 상대평가입니다 — 등급은 종합점수 구간이 아니라 업무단위
          안의 순위와 정원으로 정해집니다. ① 분포표에서 조직등급별 배분율을
          정하고, ② 업무단위마다 조직등급을 고르면, ③ 명단에 등급이 배분됩니다.
          {reviewCount > 0 && (
            <>
              {" "}
              지금{" "}
              <b className="font-semibold text-amber-700">{reviewCount}명</b>이
              경계에 걸려 있어 확정이 필요합니다.
            </>
          )}
        </p>
      </section>

      {/* ① 분포표 */}
      <section className={CARD}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <h2 className="text-sm font-bold text-slate-900">
            ① 조직등급별 분포표
          </h2>
          <span className="text-xs break-keep text-slate-500">
            조직(업무단위) 등급마다 개인등급을 몇 %씩 줄지. 합이 100%가 아닌
            줄은 등급 배분에 쓰이지 않습니다.
          </span>
          <ActionForm
            action={seedQuotaTable}
            successMessage="빠진 줄을 채웠습니다."
            className="ml-auto"
          >
            <input type="hidden" name="year" value={year} />
            <button type="submit" className={BTN_GHOST}>
              사내 표 기본값으로 채우기
            </button>
          </ActionForm>
        </div>
        {/*
          표 전체가 하나의 폼이다. 줄마다 저장 단추를 두려면 `<tr>` 안에 `<form>`을
          넣어야 하는데 그건 올바른 HTML이 아니고, 다섯 줄은 보통 같이 정하는
          값이라 한 번에 저장하는 쪽이 누르는 수도 적다.
        */}
        <ActionForm
          action={saveQuotaTable}
          successMessage="분포표를 저장했습니다."
        >
          <input type="hidden" name="year" value={year} />
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="w-24 px-3 py-2 text-left text-xs font-semibold">
                    조직등급
                  </th>
                  {PERSON_GRADES.map((g) => (
                    <th
                      key={g}
                      className="w-24 px-2 py-2 text-right text-xs font-semibold"
                    >
                      개인 {g}
                    </th>
                  ))}
                  <th className="w-20 px-3 py-2 text-right text-xs font-semibold">
                    합
                  </th>
                </tr>
              </thead>
              <tbody>
                {ORG_GRADES.map((org) => {
                  const ratios = quotaByOrg.get(org) ?? null;
                  const sum = ratios ? ratioSum(ratios) : 0;
                  return (
                    <tr key={org} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold whitespace-nowrap text-slate-900">
                        {org}
                      </td>
                      {PERSON_GRADES.map((g) => (
                        <td key={g} className="px-2 py-2 text-right">
                          <input
                            type="number"
                            name={`r_${org}_${g}`}
                            min={0}
                            max={100}
                            step="0.1"
                            defaultValue={ratios ? ratios[g] : 0}
                            /*
                              저장한 뒤 서버가 준 값이 칸에 보여야 한다.
                              `defaultValue`는 처음 그려질 때만 먹으므로 값을
                              열쇠에 넣는다.
                            */
                            key={`${org}-${g}-${ratios ? ratios[g] : "x"}`}
                            aria-label={`조직 ${org}의 개인 ${g} 배분율`}
                            className={NUM}
                          />
                        </td>
                      ))}
                      <td
                        className={`px-3 py-2 text-right text-sm font-semibold tabular-nums ${
                          !ratios
                            ? "text-slate-300"
                            : sum === 100
                              ? "text-slate-900"
                              : "text-status-critical"
                        }`}
                      >
                        {ratios ? `${sum}%` : "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end border-t border-slate-100 px-4 py-2">
            <button type="submit" className={BTN}>
              분포표 저장
            </button>
          </div>
        </ActionForm>
      </section>

      {/* ② 업무단위 */}
      <section className={CARD}>
        <div className="flex flex-wrap items-baseline gap-x-3 px-4 py-2.5">
          <h2 className="text-sm font-bold text-slate-900">② 업무단위</h2>
          <span className="text-xs break-keep text-slate-500">
            조직등급을 고르면 그 업무단위의 정원이 정해집니다. 「자리」는 인원에
            배분율을 곱해 최대잉여법으로 나눈 결과입니다 — 합이 항상 인원과
            같습니다.
          </span>
        </div>
        {unitNames.length === 0 ? (
          <p className="border-t border-slate-100 px-4 py-6 text-center text-sm break-keep text-slate-500">
            업무단위가 적힌 팀이나 사람이 없습니다 — 관리 → 팀 관리에서 팀의
            업무단위를 채워 주세요.
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold">
                    업무단위
                  </th>
                  <th className="w-28 px-2 py-2 text-right text-xs font-semibold">
                    대상 / 점수 있음
                  </th>
                  <th className="w-32 px-3 py-2 text-left text-xs font-semibold">
                    조직등급
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">
                    정원 (자리)
                  </th>
                </tr>
              </thead>
              <tbody>
                {unitBlocks.map((b) => {
                  const scored = b.members.filter(
                    (p) => scores.get(p.id)?.total != null,
                  ).length;
                  const usable = b.ratios && ratioSum(b.ratios) === 100;
                  const seats = usable
                    ? theoreticalSeats(scored, b.ratios!)
                    : null;
                  return (
                    <tr key={b.unit} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium break-keep text-slate-900">
                        {b.unit}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                        {b.members.length} / {scored}
                      </td>
                      <td className="px-3 py-2">
                        <InstantSelect
                          action={setUnitOrgGrade}
                          hidden={{
                            year: String(year),
                            businessUnit: b.unit,
                          }}
                          name="orgGrade"
                          value={b.orgGrade ?? ""}
                          options={orgOptions}
                          ariaLabel={`${b.unit} 조직등급`}
                          tone={b.orgGrade ? "plain" : "warn"}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs break-keep text-slate-600">
                        {!b.orgGrade ? (
                          <span className="text-slate-400">
                            조직등급을 고르면 정원이 나옵니다
                          </span>
                        ) : !b.ratios ? (
                          <span className="text-status-critical">
                            {b.orgGrade} 줄이 분포표에 없습니다
                          </span>
                        ) : !usable ? (
                          <span className="text-status-critical">
                            {b.orgGrade} 줄의 합이 {ratioSum(b.ratios)}%입니다 —
                            100%로 맞춰 주세요
                          </span>
                        ) : (
                          <span className="flex flex-wrap gap-x-3 gap-y-1">
                            {PERSON_GRADES.filter(
                              (g) => (b.ratios?.[g] ?? 0) > 0,
                            ).map((g) => (
                              <span key={g} className="whitespace-nowrap">
                                <b className="font-semibold text-slate-800">
                                  {g}
                                </b>{" "}
                                {b.ratios![g]}% ·{" "}
                                <span className="tabular-nums">
                                  {seats![g].exact}자리 → {seats![g].seats}명
                                </span>
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {unitless.length > 0 && (
          <p className="border-t border-slate-100 px-4 py-2 text-xs break-keep text-status-critical">
            업무단위가 비어 있어 등급을 매길 수 없는 사람 {unitless.length}명 ·{" "}
            {unitless.map((p) => p.name).join(", ")} — 관리 → 사용자 관리나 팀
            관리에서 업무단위를 채워 주세요.
          </p>
        )}
      </section>

      {/* ③ 명단 */}
      <section className={CARD}>
        <div className="flex flex-wrap items-baseline gap-x-3 px-4 py-2.5">
          <h2 className="text-sm font-bold text-slate-900">③ 명단 · 확정</h2>
          <span className="text-xs break-keep text-slate-500">
            종합점수 순위대로 정원만큼 끊은 결과입니다. 「반올림 확인」은
            표만으로 가를 수 없는 자리입니다 — 등급을 골라 확정하면 계산값을
            덮어씁니다.
          </span>
        </div>
        {unitBlocks.every((b) => b.members.length === 0) ? (
          <p className="border-t border-slate-100 px-4 py-6 text-center text-sm break-keep text-slate-500">
            {year}년 평가 대상자가 없습니다.
          </p>
        ) : (
          unitBlocks
            .filter((b) => b.members.length > 0)
            .map((b) => {
              const rows = [...b.members]
                .map((p) => ({
                  person: p,
                  score: scores.get(p.id) ?? null,
                  grade: b.grades.get(p.id) ?? null,
                }))
                .sort(
                  (x, y) =>
                    (y.score?.total ?? -1) - (x.score?.total ?? -1) ||
                    x.person.name.localeCompare(y.person.name),
                );
              return (
                <div key={b.unit} className="border-t border-slate-100">
                  <div className="flex flex-wrap items-baseline gap-x-2 bg-slate-50 px-4 py-1.5">
                    <h3 className="text-xs font-bold text-slate-800">
                      {b.unit}
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      {b.members.length}명 ·{" "}
                      {b.orgGrade
                        ? `조직등급 ${b.orgGrade}`
                        : "조직등급 미지정"}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="text-slate-500">
                        <tr className="border-b border-slate-100">
                          <th className="w-12 px-3 py-1.5 text-right text-xs font-semibold">
                            순위
                          </th>
                          <th className="px-3 py-1.5 text-left text-xs font-semibold">
                            이름
                          </th>
                          <th className="w-20 px-2 py-1.5 text-right text-xs font-semibold">
                            성과
                          </th>
                          <th className="w-20 px-2 py-1.5 text-right text-xs font-semibold">
                            역량
                          </th>
                          <th className="w-20 px-2 py-1.5 text-right text-xs font-semibold">
                            종합
                          </th>
                          <th className="w-16 px-2 py-1.5 text-center text-xs font-semibold">
                            등급
                          </th>
                          <th className="px-3 py-1.5 text-left text-xs font-semibold">
                            확정
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr
                            key={r.person.id}
                            className={`border-t border-slate-100 ${
                              i % 2 === 1 ? "bg-slate-50/70" : ""
                            }`}
                          >
                            <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-500">
                              {r.grade?.rank ?? "–"}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="font-medium text-slate-900">
                                {r.person.name}
                              </span>{" "}
                              <span className="text-xs text-slate-500">
                                {POSITION_LABEL[r.person.position]}
                                {r.person.team?.name
                                  ? ` · ${r.person.team.name}`
                                  : ""}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                              {r.score?.performance ?? "–"}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                              {r.score?.competency ?? "–"}
                            </td>
                            <td className="px-2 py-2 text-right font-semibold tabular-nums text-slate-900">
                              {r.score?.total ?? "–"}
                            </td>
                            <td className="px-2 py-2 text-center">
                              {r.grade ? (
                                <span
                                  className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${
                                    PERSON_GRADE_CLASS[
                                      r.grade.grade as PersonGrade
                                    ] ?? "bg-slate-500 text-white"
                                  }`}
                                >
                                  {r.grade.grade}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300">
                                  –
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="w-32 shrink-0">
                                  <InstantSelect
                                    action={setFinalGrade}
                                    hidden={{
                                      year: String(year),
                                      userId: r.person.id,
                                    }}
                                    name="grade"
                                    value={r.grade?.fixed ? r.grade.grade : ""}
                                    options={personOptions}
                                    ariaLabel={`${r.person.name} 확정 등급`}
                                  />
                                </span>
                                {r.grade?.fixed && (
                                  <span className="rounded-md bg-goal-4/10 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-goal-4">
                                    인사팀 확정
                                    {r.grade.computed &&
                                      r.grade.computed !== r.grade.grade &&
                                      ` · 표대로는 ${r.grade.computed}`}
                                  </span>
                                )}
                                {r.grade?.needsReview && (
                                  <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium break-keep text-amber-800">
                                    반올림 확인 · {r.grade.reviewReason}
                                  </span>
                                )}
                                {r.score?.total == null && (
                                  <span className="text-[11px] break-keep text-slate-400">
                                    성과·역량이 모두 있어야 순위에 듭니다
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
        )}
        <p className="border-t border-slate-100 px-4 py-2 text-[11px] break-keep text-slate-500">
          확정을 거두려면 등급을 「계산값 그대로」로 되돌립니다. 확정 사유는
          결과지에 그대로 실리므로, 계산값과 다르게 정할 때는 근거를 남기는 편이
          좋습니다 — 사유 칸은 다음 단계에서 붙입니다.
        </p>
      </section>
    </div>
  );
}
