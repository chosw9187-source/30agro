import { prisma } from "@/lib/prisma";
import { evaluatesHalfHere } from "@/lib/goals";
import { pickCompetencySets } from "@/lib/competency";
import type { loadCompetencyForm } from "@/lib/competency-form";

/** `loadCompetencyForm`이 돌려주는 모양. 따로 타입을 적지 않고 그 함수에서 끌어온다. */
type CompetencyFormData = NonNullable<
  Awaited<ReturnType<typeof loadCompetencyForm>>
>;

/**
 * **누가 무엇을 아직 안 했는가** — 평가자와 인사팀이 읽는 진행 현황.
 *
 * 평가 시즌에 제일 많이 묻는 말이 «누구를 독촉해야 하나»인데, 그동안 그걸 볼
 * 자리가 없었다. 목표 목록은 반기별로만 묶여 있어서 담당자 한 명씩 펼쳐 봐야
 * 했고, 역량평가는 사람을 골라야 비로소 빈 칸이 보였다.
 *
 * 한 사람의 시즌 일감은 네 가지다.
 *   ① 목표를 세웠는가            — 그 반기 개인목표가 있는가
 *   ② 본인이 자기 점수를 적었는가 — `selfScore`
 *   ③ 1차 평가자가 점수를 적었는가 — `firstScore`, 그리고 「평가완료」를 눌렀는가
 *   ④ 역량평가 두 칸             — 자기평가 · 팀장평가
 *
 * 숫자는 **세는 것만** 한다. 점수를 여기서 다시 계산하지 않는다 — 점수는
 * `final-grade-data`가 한 군데서 낸다.
 */

export type EvalStatusRow = {
  userId: string;
  /** 그 반기(성과평가(최종)이 매기는 반기)의 개인목표 수. */
  goals: number;
  /** 본인이 점수를 적은 목표 수. */
  selfScored: number;
  /** 1차 평가자가 점수를 적은 목표 수. */
  firstScored: number;
  /** 「평가완료」가 찍힌 목표 수. */
  evalDone: number;
  /** 역량평가에서 그 사람이 받은 문항 수(자기 · 팀장 각각 이만큼 적어야 한다). */
  compItems: number;
  compSelf: number;
  compLead: number;
};

export type EvalStatusPerson = {
  id: string;
  position: string;
  teamId: string | null;
};

export async function loadEvalStatus(
  year: number,
  cycleIds: string[],
  finalCycle: { name: string } | null,
  people: EvalStatusPerson[],
  form: CompetencyFormData | null,
): Promise<Map<string, EvalStatusRow>> {
  const out = new Map<string, EvalStatusRow>();
  const ids = people.map((p) => p.id);
  if (ids.length === 0) return out;

  const [goalRows, reviews] = await Promise.all([
    cycleIds.length > 0
      ? prisma.goal.findMany({
          where: {
            cycleId: { in: cycleIds },
            level: "INDIVIDUAL",
            ownerId: { in: ids },
            excluded: false,
          },
          select: {
            ownerId: true,
            title: true,
            half: true,
            selfScore: true,
            firstScore: true,
            evalDoneAt: true,
          },
        })
      : Promise.resolve([]),
    prisma.competencyReview.findMany({
      where: { year, userId: { in: ids } },
      select: {
        userId: true,
        competencyScores: { select: { selfScore: true, leadScore: true } },
      },
    }),
  ]);

  const reviewByUser = new Map(reviews.map((r) => [r.userId, r]));

  for (const p of people) {
    /*
      목표는 «그 단계가 매기는 반기»만 센다(결과지·HR REPORT와 같은 규칙).
      같은 이름이 두 벌 있으면 한 줄로 본다 — 단계마다 목표를 나눠 갖던 시절의
      찌꺼기가 남아 있는 해가 있어서, 세면 두 배로 보인다.
    */
    const mine = goalRows.filter(
      (g) =>
        g.ownerId === p.id &&
        (!finalCycle || evaluatesHalfHere({ half: g.half }, finalCycle)),
    );
    const byTitle = new Map<string, (typeof mine)[number]>();
    for (const g of mine) {
      const key = g.title.trim();
      const kept = byTitle.get(key);
      if (!kept || (g.firstScore != null && kept.firstScore == null)) {
        byTitle.set(key, g);
      }
    }
    const goals = [...byTitle.values()];

    const review = reviewByUser.get(p.id);
    const compItems = form
      ? (() => {
          const picked = pickCompetencySets(
            { position: p.position, teamId: p.teamId, id: p.id },
            form.sets,
            form.assignments,
          );
          return (
            (picked.core?.items.length ?? 0) + (picked.job?.items.length ?? 0)
          );
        })()
      : 0;

    out.set(p.id, {
      userId: p.id,
      goals: goals.length,
      selfScored: goals.filter((g) => g.selfScore != null).length,
      firstScored: goals.filter((g) => g.firstScore != null).length,
      evalDone: goals.filter((g) => g.evalDoneAt != null).length,
      compItems,
      compSelf:
        review?.competencyScores.filter((s) => s.selfScore != null).length ?? 0,
      compLead:
        review?.competencyScores.filter((s) => s.leadScore != null).length ?? 0,
    });
  }
  return out;
}

/**
 * 그 사람에게 **남은 일**을 짧은 말로. 없으면 빈 배열이다.
 *
 * 숫자 표만 두면 읽는 사람이 칸마다 빼기를 해야 한다 — «3/5»가 몇 개 남은
 * 것인지. 남은 것만 말로 적어 주면 독촉 메일에 그대로 옮겨 적을 수 있다.
 */
export function evalTodo(row: EvalStatusRow): string[] {
  const todo: string[] = [];
  if (row.goals === 0) {
    todo.push("목표 미등록");
    return todo;
  }
  if (row.selfScored < row.goals)
    todo.push(`자기평가 ${row.goals - row.selfScored}건`);
  if (row.firstScored < row.goals)
    todo.push(`1차 점수 ${row.goals - row.firstScored}건`);
  else if (row.evalDone < row.goals)
    todo.push(`평가완료 ${row.goals - row.evalDone}건`);
  if (row.compItems > 0) {
    if (row.compSelf < row.compItems)
      todo.push(`역량 자기평가 ${row.compItems - row.compSelf}칸`);
    if (row.compLead < row.compItems)
      todo.push(`역량 팀장평가 ${row.compItems - row.compLead}칸`);
  }
  return todo;
}

/** 한 사람의 시즌 일감이 다 끝났는가 — 독촉 목록에서 빼는 기준. */
export function evalDoneAll(row: EvalStatusRow): boolean {
  return evalTodo(row).length === 0;
}
