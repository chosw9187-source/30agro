/**
 * 등급 정원 계산 검사 — `npm run grade:check`.
 *
 * 이 셈은 사람의 등급을 정하고 등급은 보상으로 이어진다. 화면을 눌러 보는 것으로는
 * «21명에게 30%면 몇 자리인가»나 «동점자가 경계를 넘으면 어떻게 되는가»를 확인할
 * 수 없어서, 순수 함수만 따로 돌려 본다. DB도 서버도 필요 없다.
 */
import {
  assignGrades,
  parseRatios,
  ratioSum,
  theoreticalSeats,
  type GradeRatios,
} from "../src/lib/final-grade";
import { buildDivisionLineMap, buildUnitHeadMap } from "../src/lib/evaluator";
import { competencyAverage } from "../src/lib/competency";
import { competencyScore100, overallScore } from "../src/lib/competency-result";

const R = (
  S: number,
  APlus: number,
  A: number,
  B: number,
  C: number,
): GradeRatios => ({ S, "A+": APlus, A, B, C });

let fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) {
    console.log(`✗ ${label}\n   나온 값 ${g}\n   기댓값  ${w}`);
    fail += 1;
  } else {
    console.log(`✓ ${label} = ${g}`);
  }
}

/** 조직등급 A의 정원 — S 30% · A 60% · B 5% · C 5%. */
const orgA = R(30, 0, 60, 5, 5);
const count = (rows: { grade: string }[]) =>
  rows.reduce<Record<string, number>>((m, r) => {
    m[r.grade] = (m[r.grade] ?? 0) + 1;
    return m;
  }, {});

eq("배분율 합", ratioSum(orgA), 100);

// 21명 — 6.3 / 12.6 / 1.05 / 1.05자리. 자리 합은 반드시 21이어야 한다.
const n21 = Array.from({ length: 21 }, (_, i) => ({
  userId: `u${i}`,
  score: 100 - i,
}));
const a21 = assignGrades(n21, orgA);
eq("21명 배분 합", a21.length, 21);
eq("21명 등급 분포", count(a21), { S: 6, A: 13, B: 1, C: 1 });
eq("21명 S 이론 정원", theoreticalSeats(21, orgA).S, { exact: 6.3, seats: 6 });
eq("1등은 S", a21[0].grade, "S");
eq("꼴찌는 C", a21[20].grade, "C");
eq(
  "순위가 1부터 이어진다",
  a21.map((r) => r.rank).join(","),
  Array.from({ length: 21 }, (_, i) => i + 1).join(","),
);

// 동점자 — 6등과 7등이 같은 점수다.
const tie = [100, 99, 98, 97, 96, 95, 95, 94, 93, 92].map((score, i) => ({
  userId: `t${i}`,
  score,
}));
const at = assignGrades(tie, orgA);
eq("동점 배분 합", at.length, 10);
eq(
  "동점자는 같은 순위",
  at.map((r) => r.rank).join(","),
  "1,2,3,4,5,6,6,8,9,10",
);
const flagged = at.filter((r) => r.needsReview);
eq("경계에 걸린 사람이 표시된다", flagged.length > 0, true);
console.log(
  `   확인 필요 · ${flagged
    .map((r) => `${r.userId} ${r.grade} (${r.reviewReason})`)
    .join(" / ")}`,
);

// 경계를 사이에 둔 동점 — 3등과 4등이 같으면 S/A가 갈린다.
const edge = [100, 99, 95, 95, 94, 93, 92, 91, 90, 89].map((score, i) => ({
  userId: `e${i}`,
  score,
}));
const ae = assignGrades(edge, orgA);
eq(
  "경계 동점은 양쪽 모두 표시",
  ae.filter((r) => r.reviewReason?.includes("동점")).map((r) => r.userId),
  ["e2", "e3"],
);

eq("빈 표로는 배분하지 않는다", assignGrades(n21, R(0, 0, 0, 0, 0)).length, 0);
eq(
  "한 명이면 잉여가 큰 등급으로",
  assignGrades([{ userId: "x", score: 90 }], orgA)[0].grade,
  "A",
);
// 합이 90%인 표 — 남는 몫이 S를 6.3자리보다 크게 만들면 안 된다.
eq(
  "합 90%: 남는 몫은 맨 아래 등급으로",
  count(assignGrades(n21, R(30, 0, 60, 0, 0))),
  { S: 6, A: 15 },
);
eq("JSON 읽기", parseRatios('{"S":30,"A":60,"B":5,"C":5}'), orgA);
eq("깨진 JSON은 전부 0", parseRatios("{nope"), R(0, 0, 0, 0, 0));

/*
  역량 100점 환산 — 사람이 칸을 다 더해 맞춰 볼 수 있어야 한다.

  스무 칸 합 83점이면 83점이다. 화면에 적는 평균(4.2)으로 곱하면 84점이 되는데,
  그 한 점은 어디서 왔는지 설명할 수 없다 — 실제로 «다 더하면 83점 아니야?»라는
  말을 들었다.
*/
console.log("\n[역량 점수 환산]");
const sheet: [number, number][] = [
  [5, 5],
  [5, 4],
  [4, 3],
  [5, 4],
  [4, 1],
  [5, 5],
  [3, 5],
  [2, 4],
  [5, 4],
  [5, 5],
];
const scores = sheet.map(([selfScore, leadScore], i) => ({
  itemKey: `i${i}`,
  selfScore,
  leadScore,
}));
const avg = competencyAverage(scores);
eq("스무 칸 합", avg.sum, 83);
eq("칸 수", avg.count, 20);
eq("화면에 적는 평균(끊은 값)", avg.overall, 4.2);
eq("환산에 쓰는 평균(안 끊은 값)", avg.overallExact, 4.15);
eq("100점 환산 = 칸 합", competencyScore100(avg.overallExact), 83);
eq(
  "끊은 평균으로 곱하면 한 점이 붙는다(그래서 쓰지 않는다)",
  competencyScore100(avg.overall),
  84,
);
eq("종합점수 = 성과 95×60% + 역량 83×40%", overallScore(95, 83), 90.2);
// 한 칸도 안 적힌 사람은 0점이 아니라 «아직 없음»이다.
const blank = competencyAverage([
  { itemKey: "a", selfScore: null, leadScore: null },
]);
eq(
  "빈 평가는 null",
  [blank.overallExact, competencyScore100(null)],
  [null, null],
);
// 적은 칸만 센다 — 안 적은 칸을 0으로 채우면 점수가 반 토막 난다.
const half = competencyAverage([
  { itemKey: "a", selfScore: 4, leadScore: null },
  { itemKey: "b", selfScore: 4, leadScore: null },
]);
eq("적힌 칸만 센다", [half.sum, half.count, half.overallExact], [8, 2, 4]);

/*
  묶음 — 등급은 «어느 라인 안에서 몇 등»이라, 사람이 어느 라인에 들어가느냐가
  점수 못지않게 등급을 가른다. 조직도(본부 → 부문)를 따라가는지 본다.
*/
console.log("\n[라인 묶기]");
const P = (
  id: string,
  position: string,
  extra: { teamId?: string; division?: string; businessUnit?: string } = {},
) =>
  ({
    id,
    name: id,
    position,
    ...extra,
  }) as Parameters<typeof buildUnitHeadMap>[0][number];
const orgPeople = [
  P("오동률", "OPERATIONS_HEAD", { businessUnit: "재무경영관리" }),
  P("이장훈", "OPERATIONS_HEAD", { businessUnit: "제품사업" }),
  P("경책임", "SENIOR_STAFF", { division: "경영관리" }),
  P("정책임", "SENIOR_STAFF", { division: "영업고객관리" }),
  P("경팀장", "TEAM_LEADER", { teamId: "t_hr" }),
  P("네담당", "STAFF", { teamId: "t_hr" }),
  P("한담당", "STAFF", { teamId: "t_sales" }),
  P("생산담당", "STAFF", { teamId: "t_prod" }),
  P("떠돌이", "STAFF", {}),
];
const orgTeams = [
  {
    id: "t_hr",
    name: "인사팀",
    division: "경영관리",
    businessUnit: "재무경영관리",
    leaderId: "경팀장",
  },
  {
    id: "t_prod",
    name: "생산팀",
    division: "생산",
    businessUnit: "제품사업",
    leaderId: null,
  },
  {
    id: "t_sales",
    name: "영업고객관리팀",
    division: "영업고객관리",
    businessUnit: "제품사업",
    leaderId: null,
  },
];
const unitOf = buildUnitHeadMap(orgPeople, orgTeams);
const deptOf = buildDivisionLineMap(orgPeople, orgTeams);
const name = (m: Map<string, { id: string } | null>, id: string) =>
  m.get(id)?.id ?? null;
/** 책임 라인은 «부문 이름 / 그 부문의 책임»으로 돌아온다. */
const line = (id: string) => {
  const l = deptOf.get(id);
  return l ? [l.key, l.head?.id ?? null] : null;
};
eq("팀의 본부를 따라 운영책임이 붙는다", name(unitOf, "네담당"), "오동률");
eq("운영책임 본인은 자기 라인의 장", name(unitOf, "오동률"), "오동률");
eq("본부를 못 찾으면 미지정", name(unitOf, "떠돌이"), null);
eq("팀의 부문을 따라 책임이 붙는다", line("네담당"), ["경영관리", "경책임"]);
eq("팀장도 자기 부문의 책임 밑", line("경팀장"), ["경영관리", "경책임"]);
eq("책임 본인은 자기 라인의 장", line("경책임"), ["경영관리", "경책임"]);
// 운영책임을 책임 밑에 넣으면 자기 부하 라인에 섞인다.
eq("운영책임은 책임 라인에 들어가지 않는다", line("오동률"), null);
eq("부문을 못 찾으면 미지정", line("떠돌이"), null);
/* 책임이 아직 없는 부문도 조직도대로 갈린다 — 사람으로 묶으면 「책임 미지정」
   한 덩어리로 몰려 조직도와 다른 그림이 된다. */
eq("책임이 없는 부문도 부문 이름으로 갈린다", line("생산담당"), ["생산", null]);
// 두 묶음은 겹쳐 놓아도 어긋나지 않는다 — 책임 라인은 한 운영책임 안에 있다.
eq(
  "책임 라인은 한 운영책임 안에 있다",
  [name(unitOf, "한담당"), line("한담당")],
  ["이장훈", ["영업고객관리", "정책임"]],
);

if (fail > 0) {
  console.log(`\n${fail}건 실패`);
  process.exit(1);
}
console.log("\n모두 통과");
