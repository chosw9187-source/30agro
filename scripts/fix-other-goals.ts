/**
 * 「기타 목표」 묶음이 한 자리에 두 개 이상 생긴 것을 하나로 합친다.
 *
 *   npm run goals:fix-other          — 무엇을 합칠지 보여 주고 실제로 합친다
 *   npm run goals:fix-other -- --dry — 보여 주기만 하고 아무것도 바꾸지 않는다
 *
 * 왜 필요한가. 개인목표를 「기타」에 매달아 두고 그 목표를 **고치면**, 예전
 * 코드가 기타 사슬을 만들 때 폼에서 팀을 읽었다. 그런데 개인목표 폼에는 팀 칸이
 * 없어서(사람을 고르면 팀이 따라온다) 늘 빈 값이 왔고, 그러면 이미 있는 팀
 * 기타를 못 찾아 «팀 없는 기타»를 하나 더 만들었다. 화면에는 이름이 같은
 * 「기타 목표」가 두 줄로 뜬다. 만드는 쪽은 고쳤지만(actions.ts), 이미 생긴
 * 줄은 여기서 치운다.
 *
 * 하는 일은 셋뿐이다.
 *   1. 같은 사이클·같은 층·같은 소속에 기타가 여럿이면 **가장 먼저 만들어진**
 *      것만 남기고, 나머지에 매달린 목표를 그리로 옮긴다.
 *   2. 소속이 비어 있는 기타(위에서 말한 «팀 없는 기타»)에 매달린 목표는 그
 *      목표의 소속을 보고 제 자리 기타로 옮긴다.
 *   3. 그렇게 해서 아무것도 안 매달린 기타만 지운다.
 *
 * 기타 묶음 자체에는 사람이 적어 넣은 내용이 없다(지표·설명 없이 담아 두는
 * 칸이다). 옮길 곳을 못 찾은 목표가 하나라도 남아 있으면 그 기타는 지우지
 * 않으므로, 이 스크립트로 사라지는 목표는 없다.
 *
 * 서버에 셸을 붙이기 어려운 경우를 위해 기동 시에도 한 번 돈다(`--boot`,
 * package.json의 start에 물려 있다). 이미 정리된 데이터에서는 아무 일도 하지
 * 않으므로 몇 번을 돌려도 같다.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// main()에서 .env를 읽은 뒤에 만든다 — DATABASE_URL이 채워지기 전에
// 어댑터를 쥐면 빈 문자열로 붙는다.
let prisma!: PrismaClient;

const TAG = "[goals:fix-other]";

type OtherGoal = {
  id: string;
  cycleId: string;
  level: string;
  division: string | null;
  teamId: string | null;
  createdAt: Date;
};

/** 그 층에서 기타를 가르는 값 — 팀 기타는 팀마다, 책임 기타는 부문마다 하나다. */
function scopeKey(level: string, division: string | null, teamId: string | null) {
  if (level === "TEAM") return teamId;
  if (level === "DIVISION") return division;
  return ""; // 전사 기타는 사이클에 하나뿐이라 가를 것이 없다.
}

async function run(dry: boolean) {
  const others: OtherGoal[] = await prisma.goal.findMany({
    where: { isOther: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, cycleId: true, level: true, division: true, teamId: true, createdAt: true },
  });

  // 팀 → 부문. 책임 기타로 옮길 때 팀목표의 부문을 되짚는 데 쓴다.
  const teams = await prisma.team.findMany({ select: { id: true, division: true } });
  const divisionOfTeam = new Map(teams.map((t) => [t.id, t.division]));

  // 사이클·층별로 «제자리 기타»를 모아 둔다(소속이 있는 것 중 가장 오래된 것).
  const canonical = new Map<string, string>();
  for (const g of others) {
    const key = scopeKey(g.level, g.division, g.teamId);
    if (key === null) continue; // 소속이 비어 있는 것은 제자리가 아니다.
    const id = `${g.cycleId}|${g.level}|${key}`;
    if (!canonical.has(id)) canonical.set(id, g.id);
  }

  /*
    아래 층부터 치운다. 팀 기타를 먼저 비워야 그것을 매달고 있던 책임 기타가
    «아무것도 안 매달린» 상태가 되어 같은 판에서 함께 지워진다. 위에서부터
    훑으면 책임 기타는 아직 팀 기타를 안고 있어 한 번 더 돌려야 한다.
  */
  const depth = (level: string) =>
    ["COMPANY", "DIVISION", "TEAM", "INDIVIDUAL"].indexOf(level);
  const deepestFirst = [...others].sort((a, b) => depth(b.level) - depth(a.level));

  let moved = 0;
  let removed = 0;

  for (const g of deepestFirst) {
    const key = scopeKey(g.level, g.division, g.teamId);
    const keeperId = key === null ? null : canonical.get(`${g.cycleId}|${g.level}|${key}`);
    // 제자리에 있고 자기가 대표인 기타는 그대로 둔다.
    if (keeperId === g.id) continue;

    const children = await prisma.goal.findMany({
      where: { parentId: g.id },
      select: { id: true, title: true, division: true, teamId: true },
    });

    let stuck = 0;
    for (const child of children) {
      // 이 목표가 매달려야 할 자리 — 팀 기타면 그 목표의 팀, 책임 기타면 부문이다.
      const childKey =
        g.level === "TEAM"
          ? child.teamId
          : g.level === "DIVISION"
            ? (child.division ?? (child.teamId ? (divisionOfTeam.get(child.teamId) ?? null) : null))
            : "";
      const target =
        keeperId ??
        (childKey === null ? undefined : canonical.get(`${g.cycleId}|${g.level}|${childKey}`));
      if (!target || target === g.id) {
        stuck += 1;
        continue;
      }
      console.log(`${TAG} 옮김: 「${child.title}」 → ${g.level} 기타 ${target}`);
      if (!dry) {
        await prisma.goal.update({ where: { id: child.id }, data: { parentId: target } });
      }
      moved += 1;
    }

    if (stuck > 0) {
      console.warn(
        `${TAG} 남김: ${g.level} 기타 ${g.id} — 옮길 곳을 못 찾은 목표 ${stuck}건이 매달려 있습니다.`
      );
      continue;
    }
    console.log(`${TAG} 지움: 중복된 ${g.level} 기타 ${g.id} (사이클 ${g.cycleId})`);
    if (!dry) await prisma.goal.delete({ where: { id: g.id } });
    removed += 1;
  }

  console.log(
    `${TAG} ${dry ? "(확인만) " : ""}옮긴 목표 ${moved}건, 지운 기타 묶음 ${removed}개.`
  );
}

async function main() {
  const args = process.argv.slice(2);
  const isBoot = args.includes("--boot");

  try {
    await import("dotenv/config");
  } catch {
    console.warn(`${TAG} .env를 읽지 못했습니다 — 플랫폼 환경변수만 씁니다.`);
  }

  if (!process.env.DATABASE_URL) {
    if (isBoot) {
      console.log(`${TAG} DATABASE_URL이 없어 건너뜁니다.`);
      return;
    }
    throw new Error("DATABASE_URL이 설정되어 있지 않습니다.");
  }

  prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) });
  await run(args.includes("--dry") || args.includes("--dry-run"));
}

main()
  .catch((error) => {
    console.error(error);
    // --boot은 서비스 기동 앞에 물려 있다. 여기서 0이 아닌 값을 내면 앱이
    // 아예 안 뜨므로, 기동 경로에서는 실패해도 조용히 넘긴다.
    if (!process.argv.includes("--boot")) process.exitCode = 1;
  })
  .finally(() => prisma?.$disconnect());
