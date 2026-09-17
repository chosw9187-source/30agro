/**
 * 개인목표 달성률 셈 검사 — `npm run progress:check`.
 *
 * 대시보드의 «개인목표 평균 달성률»은 1차 평가자가 매긴 값으로 굴러간다. 화면을
 * 눌러 보는 것으로는 «한 건을 110%까지 넘겨 해냈을 때 모자란 몫이 메워지는가»나
 * «상태가 완료인 목표가 평가자의 70%를 100%로 올려 버리지 않는가»를 확인할 수
 * 없어서, 순수 함수만 따로 돌려 본다. DB도 서버도 필요 없다.
 */
import {
  buildGoalTree,
  flattenGoalTree,
  leafProgress,
  ownerAverageProgress,
  type GoalRow,
} from "../src/lib/goals";

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

/** 개인목표 한 건. 안 쓰는 칸은 빈 값으로 둔다. */
function goal(
  id: string,
  owner: string,
  weight: number,
  first: number | null,
  extra: Partial<GoalRow> = {},
): GoalRow {
  return {
    id,
    level: "INDIVIDUAL",
    parentId: null,
    title: id,
    description: null,
    division: null,
    teamId: "t1",
    ownerId: owner,
    weight,
    metric: null,
    targetValue: null,
    currentValue: null,
    half: "하반기",
    progress: 0,
    status: "ACTIVE",
    firstProgress: first,
    excluded: false,
    excludeReason: null,
    agreementStatus: "DRAFT",
    agreementNote: null,
    agreedAt: null,
    dueDate: null,
    sortOrder: 0,
    ...extra,
  };
}

/** 한 사람의 개인목표 다섯 건을 굴려 «평균 달성률»을 낸다. */
function average(rows: GoalRow[]): number {
  return ownerAverageProgress(flattenGoalTree(buildGoalTree(rows)));
}

/** 다섯 목표가 20%씩인 사람 — 사내 양식의 기본 꼴이다. */
const five = (values: (number | null)[], extra: Partial<GoalRow>[] = []) =>
  values.map((v, i) => goal(`g${i + 1}`, "u1", 20, v, extra[i] ?? {}));

// ---- 사용자가 든 세 가지 예 ---------------------------------------------
eq("1~4번 100% · 5번 90%", average(five([100, 100, 100, 100, 90])), 98);
eq(
  "한 건을 110%까지 넘겨 해내고 5번 90% — 모자란 몫을 메운다",
  average(five([110, 100, 100, 100, 90])),
  100,
);
eq(
  "한 건을 110%까지 넘겨 해내고 5번 70%",
  average(five([110, 100, 100, 100, 70])),
  96,
);

// ---- 가중치가 다르면 무게도 다르다 --------------------------------------
eq(
  "가중치 60·20·20에서 60%짜리가 절반만 되면",
  average([
    goal("a", "u1", 60, 50),
    goal("b", "u1", 20, 100),
    goal("c", "u1", 20, 100),
  ]),
  70,
);

// ---- 상태 «완료»가 평가자의 값을 덮지 않는다 ----------------------------
eq(
  "평가자가 70%로 매긴 목표는 상태가 완료라도 70%",
  leafProgress({ status: "DONE", progress: 100, firstProgress: 70 }),
  70,
);
eq(
  "아무도 평가하지 않았는데 완료면 최소 100%",
  leafProgress({ status: "DONE", progress: 0, firstProgress: null }),
  100,
);
eq(
  "110%를 적어 둔 완료 목표는 110% 그대로",
  leafProgress({ status: "DONE", progress: 110, firstProgress: null }),
  110,
);
eq(
  "완료 표시가 평균을 올리지 않는다",
  average(
    five(
      [100, 100, 100, 100, 70],
      [{}, {}, {}, {}, { status: "DONE", progress: 100 }],
    ),
  ),
  94,
);

// ---- 평가자가 안 적었으면 본인이 적은 값으로 굴린다 ---------------------
eq(
  "1차 평가자 칸이 비면 본인 달성률을 쓴다",
  average([
    goal("a", "u1", 50, null, { progress: 80 }),
    goal("b", "u1", 50, 60),
  ]),
  70,
);

// ---- 사람끼리는 한 사람에 한 표 -----------------------------------------
eq(
  "목표를 많이 적은 사람이 평균을 끌고 가지 않는다",
  average([
    goal("a", "u1", 100, 50),
    goal("b", "u2", 25, 100),
    goal("c", "u2", 25, 100),
    goal("d", "u2", 25, 100),
    goal("e", "u2", 25, 100),
  ]),
  75,
);

// ---- 중단·집계 제외은 평균에서 통째로 빠진다 ----------------------------
eq(
  "중단한 목표는 평균에서 빠진다",
  average([
    goal("a", "u1", 50, 100),
    goal("b", "u1", 50, 0, { status: "DROPPED" }),
  ]),
  100,
);
eq(
  "집계 제외한 목표도 빠진다",
  average([
    goal("a", "u1", 50, 100),
    goal("b", "u1", 50, 0, {
      excluded: true,
      excludeReason: "담당자 부서이동",
    }),
  ]),
  100,
);

if (fail > 0) {
  console.log(`\n${fail}건 실패`);
  process.exit(1);
}
console.log("\n모두 통과");
