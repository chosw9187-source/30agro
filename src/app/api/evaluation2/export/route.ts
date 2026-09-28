/**
 * 평가2 결과 **엑셀 내보내기** — HR REPORT의 「엑셀 내보내기」가 부르는 자리.
 *
 * 화면은 한 해를 한 표로 읽지만, 보상 검토 · 경영 보고 · 이력 보관은 결국 엑셀에서
 * 이뤄진다. 그동안 「결과 다운로드」는 **구 평가 모듈** 전용이라 평가2 결과를 뺄
 * 길이 아예 없었다(그래서 화면을 캡처해 옮겨 적었다).
 *
 * 숫자는 화면과 **같은 함수**에서 읽는다(`loadUnitScores` · `resolveUnitGrades`) —
 * 엑셀이 화면과 다른 점수를 말하면 어느 쪽을 믿어야 하는지 아무도 모른다.
 *
 * 네 장을 담는다.
 *   ① 종합       — 사람 한 줄. 성과 · 역량 · 가산점 · 최종점수 · 등급 · 순위.
 *   ② 성과 상세  — 목표 한 줄. 가중치 · 달성률 · 점수 · 만점 · 집계 제외.
 *   ③ 역량 상세  — 문항 한 줄. 자기 · 팀장 · 평균 · 차이.
 *   ④ 라인 요약  — 라인 한 줄. 인원 · 완료 · 조직등급 · 정원 · 평균 · 등급 분포.
 */
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { activePrismaWhere, isEvalPopulation } from "@/lib/hr-analytics";
import { POSITION_LABEL } from "@/lib/permission-constants";
import {
  buildDivisionLineMap,
  buildEvaluatorMap,
  buildUnitHeadMap,
  evaluatorLabel,
} from "@/lib/evaluator";
import { GOAL_CYCLE_ORDER, cyclePhaseRank, cycleYear } from "@/lib/goals";
import {
  isCompetencyTarget,
  competencyAverage,
  competencyExcluded,
  pickCompetencySets,
} from "@/lib/competency";
import { loadCompetencyForm } from "@/lib/competency-form";
import {
  loadFixedGrades,
  loadPerformanceScores,
  loadQuotaTable,
  loadUnitPlans,
  loadUnitScores,
  resolveUnitGrades,
} from "@/lib/final-grade-data";
import { COMPETENCY_WEIGHT, PERFORMANCE_WEIGHT } from "@/lib/competency-result";
import { PERSON_GRADES, type GradeRatios } from "@/lib/final-grade";

const NO_UNIT = "__no_head__";

/** 빈 칸은 0이 아니라 빈 칸으로 내보낸다 — 엑셀에서 0과 «미입력»은 다른 말이다. */
const cell = (v: number | string | null | undefined) => v ?? "";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const year = Number(req.nextUrl.searchParams.get("year") ?? "");
  if (!Number.isInteger(year)) {
    return Response.json({ error: "연도를 확인해 주세요." }, { status: 400 });
  }

  const [people, teams, cycles, form] = await Promise.all([
    prisma.user.findMany({
      where: activePrismaWhere(),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        position: true,
        jobGrade: true,
        teamId: true,
        employeeNumber: true,
        employmentType: true,
        hiddenFromDirectory: true,
        division: true,
        businessUnit: true,
        hireDate: true,
        team: { select: { name: true } },
      },
    }),
    prisma.team.findMany({
      select: {
        id: true,
        name: true,
        division: true,
        businessUnit: true,
        leaderId: true,
      },
    }),
    prisma.goalCycle.findMany({
      orderBy: GOAL_CYCLE_ORDER,
      select: {
        id: true,
        name: true,
        year: true,
        startDate: true,
        endDate: true,
      },
    }),
    loadCompetencyForm(year),
  ]);

  const yearCycles = cycles.filter((c) => cycleYear(c) === year);
  if (yearCycles.length === 0) {
    return Response.json(
      { error: `${year}년 인사평가가 없습니다.` },
      { status: 404 },
    );
  }
  const finalCycle =
    yearCycles.find((c) => cyclePhaseRank(c) === 3) ??
    yearCycles[yearCycles.length - 1];
  const rankOfCycle = (id: string) => {
    const c = cycles.find((x) => x.id === id);
    return c ? cyclePhaseRank(c) : 9;
  };

  /*
    모수는 화면과 같다 — 조직도 기준(정규직 + 영업관리팀 계약직) 중 담당 · 팀장,
    인사팀이 평가에서 빼 두지 않은 사람.
  */
  const targets = people.filter(
    (p) =>
      isEvalPopulation(p) &&
      isCompetencyTarget(p.position) &&
      !(form && competencyExcluded(p, form.targets).excluded),
  );
  const ids = targets.map((p) => p.id);

  const unitHead = buildUnitHeadMap(people, teams);
  const deptLine = buildDivisionLineMap(people, teams);
  const chains = buildEvaluatorMap(people, teams);
  const unitLabel = (key: string) => {
    if (key === NO_UNIT) return "운영책임 미지정";
    const head = people.find((p) => p.id === key);
    return head ? `${head.name} ${POSITION_LABEL[head.position]}` : "운영책임";
  };

  const [scores, plans, quota, fixed, perf] = await Promise.all([
    loadUnitScores(year, ids, yearCycles, finalCycle, rankOfCycle),
    loadUnitPlans(year),
    loadQuotaTable(year),
    loadFixedGrades(year, ids),
    loadPerformanceScores(
      ids,
      yearCycles.map((c) => c.id),
      finalCycle,
      rankOfCycle,
    ),
  ]);

  // 라인별로 등급을 매긴다 — 상대평가라 라인을 섞으면 정원표가 뜻을 잃는다.
  const byUnit = new Map<string, typeof targets>();
  for (const p of targets) {
    const key = unitHead.get(p.id)?.id ?? NO_UNIT;
    byUnit.set(key, [...(byUnit.get(key) ?? []), p]);
  }
  const unitInfo = [...byUnit.entries()].map(([key, members]) => {
    const orgGrade = plans.get(key) ?? null;
    const ratios: GradeRatios | null = orgGrade
      ? (quota.get(orgGrade) ?? null)
      : null;
    const grades = resolveUnitGrades(
      members.map((p) => ({
        userId: p.id,
        total: scores.get(p.id)?.total ?? null,
      })),
      ratios,
      fixed,
    );
    return { key, members, orgGrade, ratios, grades };
  });
  const gradeOf = (userId: string) =>
    unitInfo.find((u) => u.grades.has(userId))?.grades.get(userId) ?? null;

  const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  /* ── ① 종합 ─────────────────────────────────────────────── */
  const summary = targets.map((p) => {
    const sc = scores.get(p.id);
    const gr = gradeOf(p.id);
    const chain = chains.get(p.id) ?? null;
    const unit = unitHead.get(p.id)?.id ?? NO_UNIT;
    const dept = deptLine.get(p.id);
    const info = unitInfo.find((u) => u.key === unit);
    const pf = perf.get(p.id);
    return {
      사번: p.employeeNumber,
      이름: p.name,
      직책: POSITION_LABEL[p.position],
      직급: p.jobGrade ?? "",
      소속팀: p.team?.name ?? "",
      "부문(책임 라인)": dept?.key ?? "",
      책임: dept?.head ? dept.head.name : "",
      "운영책임 라인": unitLabel(unit),
      고용형태: p.employmentType ?? "",
      입사일: dateOnly(p.hireDate),
      "1차 평가자": chain?.first ? evaluatorLabel(chain.first) : "",
      "2차 평가자": chain?.second ? evaluatorLabel(chain.second) : "",
      [`성과 ${Math.round(PERFORMANCE_WEIGHT * 100)}%`]: cell(sc?.performance),
      "성과 목표수": pf?.goals.length ?? 0,
      "성과 평가완료수": pf?.filled ?? 0,
      "성과 가중치합(%)": pf?.weightSum ?? 0,
      [`역량 ${Math.round(COMPETENCY_WEIGHT * 100)}%`]: cell(sc?.competency),
      가산점: sc?.bonus ?? 0,
      "가산점 사유": sc?.bonusNote ?? "",
      최종점수: cell(sc?.total),
      등급: gr?.grade ?? "",
      "표대로 등급": gr?.computed ?? "",
      "인사팀 확정": gr?.fixed ? "Y" : "",
      "확정 사유": gr?.fixedNote ?? "",
      "라인 인원": gr?.of ?? "",
      "라인 순위": gr?.rank ?? "",
      조직등급: info?.orgGrade ?? "",
    };
  });

  /* ── ② 성과 상세 ────────────────────────────────────────── */
  const nameById = new Map(targets.map((p) => [p.id, p]));
  const perfRows = targets.flatMap((p) => {
    const pf = perf.get(p.id);
    if (!pf) return [];
    const rows = [...pf.goals, ...pf.dropped];
    return rows.map((g) => ({
      사번: p.employeeNumber,
      이름: p.name,
      소속팀: p.team?.name ?? "",
      반기: g.half ?? "",
      목표: g.title,
      "가중치(%)": g.weight,
      "달성률(%)": cell(g.firstProgress ?? g.progress),
      점수: cell(g.firstScore),
      만점: Math.round(g.weight * 1.1),
      "집계 제외": g.excluded ? "Y" : "",
      "제외 사유": g.excludeReason ?? "",
    }));
  });

  /* ── ③ 역량 상세 ────────────────────────────────────────── */
  const reviews = await prisma.competencyReview.findMany({
    where: { year, userId: { in: ids } },
    select: {
      userId: true,
      leadComment: true,
      competencyScores: {
        select: { itemKey: true, selfScore: true, leadScore: true },
      },
    },
  });
  const compRows: Record<string, string | number>[] = [];
  for (const r of reviews) {
    const p = nameById.get(r.userId);
    if (!p || !form) continue;
    const picked = pickCompetencySets(
      { position: p.position, teamId: p.teamId, id: p.id },
      form.sets,
      form.assignments,
    );
    const saved = new Map(r.competencyScores.map((s) => [s.itemKey, s]));
    for (const set of [picked.core, picked.job]) {
      if (!set) continue;
      const group =
        set.kind === "JOB"
          ? "직무역량"
          : set.kind === "LEADERSHIP"
            ? "리더십역량"
            : "핵심가치";
      for (const item of set.items) {
        const s = saved.get(item.key);
        const self = s?.selfScore ?? null;
        const lead = s?.leadScore ?? null;
        const both = [self, lead].filter((v): v is number => v != null);
        compRows.push({
          사번: p.employeeNumber,
          이름: p.name,
          구분: group,
          역량: item.area,
          문항: item.question,
          자기평가: cell(self),
          팀장평가: cell(lead),
          평균: both.length
            ? Math.round((both.reduce((a, b) => a + b, 0) / both.length) * 10) /
              10
            : "",
          "차이(팀장−자기)": self != null && lead != null ? lead - self : "",
        });
      }
    }
    const avg = competencyAverage(
      r.competencyScores.map((s) => ({
        itemKey: s.itemKey,
        selfScore: s.selfScore,
        leadScore: s.leadScore,
      })),
    );
    compRows.push({
      사번: p.employeeNumber,
      이름: p.name,
      구분: "합계",
      역량: `적힌 칸 ${avg.count}개`,
      문항: r.leadComment ?? "",
      자기평가: avg.selfCount,
      팀장평가: avg.leadCount,
      평균: avg.overall ?? "",
      "차이(팀장−자기)": "",
    });
  }

  /* ── ④ 라인 요약 ────────────────────────────────────────── */
  const mean = (xs: number[]) =>
    xs.length
      ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
      : "";
  const unitRows = unitInfo
    .sort((a, b) => unitLabel(a.key).localeCompare(unitLabel(b.key)))
    .map((u) => {
      const got = (pick: (id: string) => number | null | undefined) =>
        mean(
          u.members
            .map((p) => pick(p.id))
            .filter((v): v is number => v != null),
        );
      const dist: Record<string, number> = {};
      for (const g of PERSON_GRADES) dist[g] = 0;
      for (const p of u.members) {
        const g = u.grades.get(p.id)?.grade;
        if (g) dist[g] += 1;
      }
      return {
        라인: unitLabel(u.key),
        인원: u.members.length,
        "점수 산출 완료": u.members.filter(
          (p) => scores.get(p.id)?.total != null,
        ).length,
        조직등급: u.orgGrade ?? "",
        ...Object.fromEntries(
          PERSON_GRADES.map((g) => [`정원 ${g}(%)`, u.ratios?.[g] ?? ""]),
        ),
        "평균 성과": got((id) => scores.get(id)?.performance),
        "평균 역량": got((id) => scores.get(id)?.competency),
        "평균 최종": got((id) => scores.get(id)?.total),
        ...Object.fromEntries(PERSON_GRADES.map((g) => [`${g} 인원`, dist[g]])),
      };
    });

  const book = XLSX.utils.book_new();
  const add = (name: string, rows: object[]) => {
    const sheet = XLSX.utils.json_to_sheet(
      rows.length > 0 ? rows : [{ 안내: "해당하는 줄이 없습니다." }],
    );
    XLSX.utils.book_append_sheet(book, sheet, name);
  };
  add("종합", summary);
  add("성과 상세", perfRows);
  add("역량 상세", compRows);
  add("라인 요약", unitRows);

  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
  const filename = `${year}년_인사평가결과_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="evaluation2_${year}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
