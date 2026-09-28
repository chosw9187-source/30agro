/**
 * 역량평가 점수를 1~5 눈금에서 **1~10 눈금으로 옮긴다** — `npm run competency:rescale`.
 *
 * 2026년까지 받은 점수는 다섯 칸 눈금이다. 만점만 열 칸으로 바꾸면 예전 점수가
 * 그대로 남아(5점 = 만점이던 값이 5점 = 절반) 그 해 역량점수가 반 토막 난다.
 * 그래서 눈금을 바꾼 해의 점수는 **두 배**로 옮겨 준다: 5→10, 4→8, 3→6, 2→4, 1→2.
 *
 * 되돌릴 수 없는 일이라 기본은 **미리보기**다. 정말 바꿀 때만 `--apply`를 붙인다.
 *
 *   npx tsx scripts/rescale-competency.ts --year 2026            (미리보기)
 *   npx tsx scripts/rescale-competency.ts --year 2026 --apply    (실제 변경)
 *
 * 이미 6점 이상이 섞여 있으면 **이미 옮긴 해**로 보고 멈춘다 — 두 번 돌려 20점이
 * 되는 일을 막는다.
 */
import { prisma } from "../src/lib/prisma";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const year = Number(arg("year") ?? "");
  const apply = process.argv.includes("--apply");
  if (!Number.isInteger(year)) {
    console.log("연도를 넣어 주세요 — 예: --year 2026");
    process.exit(1);
  }

  const rows = await prisma.competencyScore.findMany({
    where: { review: { year } },
    select: { id: true, selfScore: true, leadScore: true },
  });
  if (rows.length === 0) {
    console.log(`${year}년 역량평가 점수가 없습니다.`);
    return;
  }

  const values = rows.flatMap((r) =>
    [r.selfScore, r.leadScore].filter((v): v is number => v != null),
  );
  const over5 = values.filter((v) => v > 5).length;
  console.log(
    `${year}년 · 줄 ${rows.length}개 · 적힌 칸 ${values.length}개 · 6점 이상 ${over5}개`,
  );
  if (over5 > 0) {
    console.log(
      "6점 이상이 이미 있습니다 — 이 해는 이미 1~10 눈금입니다. 아무것도 바꾸지 않았습니다.",
    );
    return;
  }

  if (!apply) {
    console.log("미리보기입니다. 모든 점수가 두 배가 됩니다 (5→10, 3→6, 1→2).");
    console.log("실제로 바꾸려면 --apply 를 붙여 주세요.");
    return;
  }

  let changed = 0;
  for (const r of rows) {
    await prisma.competencyScore.update({
      where: { id: r.id },
      data: {
        selfScore: r.selfScore == null ? null : r.selfScore * 2,
        leadScore: r.leadScore == null ? null : r.leadScore * 2,
      },
    });
    changed += 1;
  }
  console.log(`${changed}줄을 1~10 눈금으로 옮겼습니다.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
