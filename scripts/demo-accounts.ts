/**
 * 시연용 테스트 계정 만들기 / 지우기.
 *
 *   npm run demo:accounts              — 삼공팀과 계정 3개를 만든다(이미 있으면 갱신)
 *   npm run demo:accounts -- --unhide  — 위에 더해, 숨김 처리된 모듈을 전부 다시 켠다
 *   npm run demo:accounts:remove       — 시연이 끝난 뒤 계정과 팀을 지운다
 *
 * 서버에 셸을 붙이기 어려운 경우를 위해 기동 시에도 한 번 돌 수 있게 해 뒀다
 * (`--boot`, package.json의 start에 물려 있다). 환경변수 DEMO_ACCOUNTS로만
 * 움직이고, 값이 없으면 아무것도 하지 않는다 —
 *
 *   DEMO_ACCOUNTS=1        계정을 만든다(이미 있으면 갱신)
 *   DEMO_ACCOUNTS=unhide   만들면서 숨김 처리된 모듈까지 다시 켠다
 *   DEMO_ACCOUNTS=remove   계정과 팀을 지운다
 *
 * 기동 경로에서는 무슨 일이 있어도 예외를 밖으로 내보내지 않는다. 시연용
 * 계정을 못 만든 것 때문에 서비스가 안 뜨는 쪽이 훨씬 나쁘다.
 *
 * 시연 때 관리자가 아닌 눈으로 화면을 보여 주기 위한 것이라, 세 계정 모두
 * 역할은 EMPLOYEE로 두고 직책만 팀장/담당으로 가른다. 모듈 접근 권한은
 * 사용자별 override(UserPermissionOverride)에 FULL로 박아 둔다 — 권한
 * 매트릭스(직책별 기본값)를 건드리면 시연과 무관한 다른 직원들의 화면까지
 * 바뀌기 때문에, 이 세 사람에게만 붙는 방식으로 연다.
 *
 * 만들어지는 것은 팀 1개 · 사용자 3개 · 권한 override 30줄이 전부다. 지우는
 * 쪽도 딱 그만큼만 지운다.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { MODULES, MODULE_LABEL } from "../src/lib/permission-constants";

// main()에서 .env를 읽은 뒤에 만든다 — DATABASE_URL이 채워지기 전에
// 어댑터를 쥐면 빈 문자열로 붙는다.
let prisma!: PrismaClient;

const TEAM_NAME = "삼공팀";
const PASSWORD = "demo1234!";

const ACCOUNTS = [
  { name: "김팀장", email: "leader@demo.kr", employeeNumber: "DEMO001", position: "TEAM_LEADER" as const },
  { name: "김담당", email: "staff1@demo.kr", employeeNumber: "DEMO002", position: "STAFF" as const },
  { name: "이담당", email: "staff2@demo.kr", employeeNumber: "DEMO003", position: "STAFF" as const },
];

async function up(unhideModules: boolean) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const team = await prisma.team.upsert({
    where: { name: TEAM_NAME },
    update: { active: true },
    // sortOrder를 크게 둬서 조직도·팀 목록 맨 뒤에 붙는다. 시연용 팀이
    // 실제 조직 사이에 끼어 들어가면 다른 화면을 볼 때 눈에 거슬린다.
    create: { name: TEAM_NAME, active: true, sortOrder: 900 },
  });

  const users = [];
  for (const a of ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: {
        name: a.name,
        employeeNumber: a.employeeNumber,
        passwordHash,
        role: "EMPLOYEE",
        position: a.position,
        teamId: team.id,
        // 시연 도중에 비밀번호 변경 화면으로 튕기면 곤란하다.
        mustChangePassword: false,
        terminationDate: null,
      },
      create: {
        name: a.name,
        email: a.email,
        employeeNumber: a.employeeNumber,
        passwordHash,
        role: "EMPLOYEE",
        position: a.position,
        teamId: team.id,
        mustChangePassword: false,
      },
      select: { id: true, name: true, email: true, position: true },
    });
    users.push(user);

    // 모든 모듈을 FULL로. 직책별 매트릭스가 무엇으로 잠겨 있든 이 override가
    // 이깁니다(lib/permissions.ts의 getEffectiveModuleScope).
    for (const m of MODULES) {
      await prisma.userPermissionOverride.upsert({
        where: { userId_module: { userId: user.id, module: m } },
        update: { scope: "FULL" },
        create: { userId: user.id, module: m, scope: "FULL" },
      });
    }
  }

  // 회사 이름이 한국삼공이라 «삼공팀»이 실제로 있을 수 있다. 그 팀에 이미
  // 팀장이 있으면 시연 때문에 갈아치우지 않는다 — 시연이 끝나고 되돌릴 때
  // 원래 누구였는지 아무도 기억 못 하는 종류의 사고다.
  const leader = users.find((u) => u.name === "김팀장")!;
  const demoIds = new Set(users.map((u) => u.id));
  const current = await prisma.team.findUnique({ where: { id: team.id }, select: { leaderId: true } });
  if (!current?.leaderId || demoIds.has(current.leaderId)) {
    await prisma.team.update({ where: { id: team.id }, data: { leaderId: leader.id } });
  } else {
    console.log(`(${TEAM_NAME}에 이미 팀장이 있어 그대로 두었습니다 — 김팀장은 팀원으로 들어갑니다.)`);
  }

  console.log(`\n[완료] ${TEAM_NAME} · 계정 ${users.length}개 (비밀번호는 모두 ${PASSWORD})`);
  console.table(
    ACCOUNTS.map((a) => ({
      이름: a.name,
      직책: a.position === "TEAM_LEADER" ? "팀장" : "담당",
      "로그인 이메일": a.email,
      사번: a.employeeNumber,
      비밀번호: PASSWORD,
    }))
  );
  console.log(`모듈 ${MODULES.length}개 전부 «전체(FULL)»로 열었습니다.`);

  // 사이드바에는 사용자 권한 말고도 관문이 하나 더 있다 — 관리자가 모듈을
  // «숨김»으로 꺼 두면 관리자가 아닌 사람에게는 아예 안 보인다. 이건 전 직원이
  // 함께 보는 설정이라 묻지 않고 바꾸지 않는다.
  const hidden = await prisma.moduleUiConfig.findMany({
    where: { hidden: true },
    select: { module: true },
  });
  if (hidden.length === 0) {
    console.log("숨김 처리된 모듈은 없습니다 — 세 계정 모두 전체 메뉴가 보입니다.\n");
    return;
  }

  const names = hidden.map((h) => MODULE_LABEL[h.module as keyof typeof MODULE_LABEL] ?? h.module);
  if (unhideModules) {
    await prisma.moduleUiConfig.updateMany({ where: { hidden: true }, data: { hidden: false } });
    console.log(`숨김이 걸려 있던 모듈 ${hidden.length}개를 다시 켰습니다: ${names.join(", ")}`);
    console.log("이건 전 직원에게 함께 적용되는 설정입니다. 시연 뒤 [화면 구성]에서 되돌려 주세요.\n");
  } else {
    console.log(`\n⚠ 숨김 처리된 모듈이 ${hidden.length}개 있습니다: ${names.join(", ")}`);
    console.log("  숨김은 관리자가 아닌 모든 사람에게 적용돼, 이 계정들도 해당 메뉴를 볼 수 없습니다.");
    console.log("  [화면 구성]에서 직접 켜거나, `npm run demo:accounts -- --unhide`로 한 번에 켤 수 있습니다.\n");
  }
}

async function down() {
  const emails = ACCOUNTS.map((a) => a.email);
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, name: true },
  });

  const team = await prisma.team.findUnique({
    where: { name: TEAM_NAME },
    select: { id: true, _count: { select: { members: true } } },
  });

  // 팀장으로 걸려 있으면 사용자를 지울 수 없다(Team.leaderId 참조).
  if (team) await prisma.team.update({ where: { id: team.id }, data: { leaderId: null } });

  try {
    const removed = await prisma.user.deleteMany({ where: { email: { in: emails } } });
    console.log(`[삭제] 계정 ${removed.count}개 (${users.map((u) => u.name).join(", ") || "없음"})`);
  } catch (error) {
    console.error(
      "\n계정을 지우지 못했습니다. 이 계정이 만든 자료(예: 온보딩 기수)가 남아 있으면 지워지지 않습니다.",
      "\n해당 자료를 먼저 지우거나 다른 사람 앞으로 옮긴 뒤 다시 실행해 주세요.\n"
    );
    throw error;
  }

  if (!team) {
    console.log(`[삭제] ${TEAM_NAME}은(는) 없습니다.`);
    return;
  }
  const left = await prisma.user.count({ where: { teamId: team.id } });
  if (left > 0) {
    console.log(`[보존] ${TEAM_NAME}에 다른 팀원이 ${left}명 남아 있어 팀은 지우지 않았습니다.`);
    return;
  }
  await prisma.team.delete({ where: { id: team.id } });
  console.log(`[삭제] ${TEAM_NAME}`);
}

/** 기동 시 호출되는 자리. 환경변수가 시키는 것만 하고, 실패해도 넘어간다. */
async function boot() {
  const mode = (process.env.DEMO_ACCOUNTS ?? "").trim().toLowerCase();
  // 켜져 있든 아니든 한 줄은 남긴다. "변수를 넣었는데 계정이 없다"를 볼 때
  // 로그에 아무 흔적이 없으면 변수가 안 들어간 건지 실패한 건지 알 수 없다.
  if (!mode || mode === "0" || mode === "false" || mode === "off") {
    console.log("[demo:accounts] DEMO_ACCOUNTS가 없어 시연 계정은 건드리지 않습니다.");
    return;
  }
  console.log(`[demo:accounts] DEMO_ACCOUNTS=${mode} — 시연 계정을 처리합니다.`);

  try {
    if (mode === "remove") await down();
    else await up(mode === "unhide");
  } catch (error) {
    console.error("[demo:accounts] 시연 계정 처리를 건너뜁니다:", error);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isBoot = args.includes("--boot");

  // .env는 로컬에서만 필요하다. dotenv는 이 저장소가 직접 의존하는 패키지가
  // 아니라 prisma를 타고 따라 들어온 것뿐이라 언젠가 없을 수 있는데, 그걸
  // 못 읽었다고 서비스 기동이 통째로 멈추면 안 된다.
  try {
    await import("dotenv/config");
  } catch {
    console.warn("[demo:accounts] .env를 읽지 못했습니다 — 플랫폼 환경변수만 씁니다.");
  }

  if (!process.env.DATABASE_URL) {
    if (isBoot) {
      console.log("[demo:accounts] DATABASE_URL이 없어 건너뜁니다.");
      return;
    }
    throw new Error("DATABASE_URL이 설정되어 있지 않습니다.");
  }

  prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) });

  if (isBoot) await boot();
  else if (args.includes("--remove")) await down();
  else await up(args.includes("--unhide") || args.includes("--unhide-modules"));
}

main()
  .catch((error) => {
    console.error(error);
    // --boot은 서비스 기동 앞에 물려 있다. 여기서 0이 아닌 값을 내면 앱이
    // 아예 안 뜨므로, 기동 경로에서는 실패해도 조용히 넘긴다.
    if (!process.argv.includes("--boot")) process.exitCode = 1;
  })
  .finally(() => prisma?.$disconnect());
