import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

async function upsertUser(data: {
  name: string;
  email: string;
  employeeNumber: string;
  role: "ADMIN" | "EVALUATOR" | "EMPLOYEE";
  teamId?: string | null;
}) {
  const passwordHash = await bcrypt.hash(data.employeeNumber, 10);
  return prisma.user.upsert({
    where: { email: data.email },
    update: {
      name: data.name,
      employeeNumber: data.employeeNumber,
      role: data.role,
      teamId: data.teamId ?? null,
    },
    create: {
      name: data.name,
      email: data.email,
      employeeNumber: data.employeeNumber,
      passwordHash,
      role: data.role,
      teamId: data.teamId ?? null,
    },
  });
}

async function main() {
  const admin = await upsertUser({
    name: "인사팀 관리자",
    email: "admin@demo.com",
    employeeNumber: "2024001",
    role: "ADMIN",
  });

  const devTeam = await prisma.team.upsert({
    where: { name: "개발팀" },
    update: {},
    create: { name: "개발팀" },
  });
  const hrTeam = await prisma.team.upsert({
    where: { name: "인사팀" },
    update: {},
    create: { name: "인사팀" },
  });

  const devLeader = await upsertUser({
    name: "김팀장",
    email: "evaluator@demo.com",
    employeeNumber: "2024002",
    role: "EVALUATOR",
    teamId: devTeam.id,
  });
  const hrLeader = await upsertUser({
    name: "박팀장",
    email: "evaluator2@demo.com",
    employeeNumber: "2024003",
    role: "EVALUATOR",
    teamId: hrTeam.id,
  });

  await prisma.team.update({
    where: { id: devTeam.id },
    data: { leaderId: devLeader.id },
  });
  await prisma.team.update({
    where: { id: hrTeam.id },
    data: { leaderId: hrLeader.id },
  });

  const employee = await upsertUser({
    name: "이사원",
    email: "employee@demo.com",
    employeeNumber: "2024004",
    role: "EMPLOYEE",
    teamId: devTeam.id,
  });
  const employee2 = await upsertUser({
    name: "박신입",
    email: "employee2@demo.com",
    employeeNumber: "2024005",
    role: "EMPLOYEE",
    teamId: devTeam.id,
  });
  const hrEmployee = await upsertUser({
    name: "최인사",
    email: "employee3@demo.com",
    employeeNumber: "2024006",
    role: "EMPLOYEE",
    teamId: hrTeam.id,
  });

  console.log("계정 목록 (이메일 / 비밀번호=사번):");
  for (const u of [admin, devLeader, hrLeader, employee, employee2, hrEmployee]) {
    console.log(`  ${u.email} / ${u.employeeNumber}`);
  }

  const templateTitle = "2025년 한국삼공 역량평가";
  const existingTemplate = await prisma.evaluationTemplate.findFirst({
    where: { title: templateTitle },
  });

  if (!existingTemplate) {
    const commonItems: { category: string; label: string; description: string }[] = [
      {
        category: "핵심가치",
        label: "상생",
        description:
          "협업 과정에서 이해관계가 달라 갈등이 발생했을 때, 신뢰를 회복하거나 유지한 경험이 있는가?",
      },
      {
        category: "핵심가치",
        label: "혁신",
        description: "최근 업무와 관련해 새롭게 배운 지식이나 기술을 적용해 보았는가?",
      },
      {
        category: "핵심가치",
        label: "실행",
        description:
          "여러 업무가 동시에 주어졌을 때, 본인 스스로 우선순위를 결정하고 실행할 수 있는가?",
      },
      {
        category: "핵심가치",
        label: "역량",
        description:
          "6개월~1년 동안 업무 관련 지식이나 기술을 향상시키기 위해 어떤 학습이나 자기계발 활동을 했는가?",
      },
      {
        category: "핵심가치",
        label: "윤리의식",
        description:
          "사내 내규와 조직 가치를 알고 있으며, 타 구성원에게 예의와 매너를 지키고, 조직분위기를 흐리는 등 업무 환경에 차질이 없도록 행동하는가?",
      },
    ];

    const hrItems: { category: string; label: string; description: string }[] = [
      {
        category: "직무역량",
        label: "인사정보 보안 및 개인정보보호",
        description:
          "인사 정보의 보안 및 개인정보 보호 정책과 절차를 엄격하게 준수하고 유지하는가?",
      },
      {
        category: "직무역량",
        label: "다양성 및 포용성",
        description:
          "조직 내 다양성을 존중하고 포용하여 다양한 배경을 가진 직원들을 지원하는가?",
      },
      {
        category: "직무역량",
        label: "업무 윤리 및 규정 준수",
        description:
          "직무 수행 시 윤리와 관련 규정을 엄격하게 준수하고 조직 내에서 준수를 촉진하는가?",
      },
      {
        category: "직무역량",
        label: "변화 관리",
        description:
          "조직 내 변화를 관리하고 관련 프로세스를 지원하여 조직의 변화를 원활하게 진행하는가?",
      },
      {
        category: "직무역량",
        label: "인사 전략 개발",
        description:
          "인사 전략을 수립하고 조직의 비즈니스 목표와 일치시켜 인사 프로그램을 개발하는가?",
      },
    ];

    const devItems: { category: string; label: string; description: string }[] = [
      {
        category: "직무역량",
        label: "코드 품질 관리",
        description: "가독성과 유지보수성을 고려한 코드를 작성하고, 테스트를 통해 품질을 검증하는가?",
      },
      {
        category: "직무역량",
        label: "기술 문서화",
        description: "설계와 구현 내용을 다른 구성원이 이해할 수 있도록 문서로 남기는가?",
      },
      {
        category: "직무역량",
        label: "장애 대응 및 복구",
        description: "서비스 장애 발생 시 신속하게 원인을 파악하고 대응하는가?",
      },
      {
        category: "직무역량",
        label: "아키텍처 설계 역량",
        description: "확장성과 안정성을 고려하여 시스템 구조를 설계하는가?",
      },
      {
        category: "직무역량",
        label: "코드 리뷰 참여도",
        description: "동료의 코드 리뷰에 적극적으로 참여하고 건설적인 피드백을 제공하는가?",
      },
    ];

    await prisma.evaluationTemplate.create({
      data: {
        title: templateTitle,
        description:
          "한국삼공 구성원의 역량을 평가하고 피드백을 제공하여 각자의 강점은 강화하고 약점은 보완하는 것을 목표로 합니다.",
        createdById: admin.id,
        items: {
          create: [
            ...commonItems.map((item, index) => ({
              category: item.category,
              label: item.label,
              description: item.description,
              type: "SCORE" as const,
              maxScore: 5,
              order: index,
              teamId: null,
            })),
            ...hrItems.map((item, index) => ({
              category: item.category,
              label: item.label,
              description: item.description,
              type: "SCORE" as const,
              maxScore: 5,
              order: commonItems.length + index,
              teamId: hrTeam.id,
            })),
            ...devItems.map((item, index) => ({
              category: item.category,
              label: item.label,
              description: item.description,
              type: "SCORE" as const,
              maxScore: 5,
              order: commonItems.length + hrItems.length + index,
              teamId: devTeam.id,
            })),
          ],
        },
      },
    });

    console.log(
      `템플릿 생성됨: ${templateTitle} (공통 ${commonItems.length}개 + 인사팀 ${hrItems.length}개 + 개발팀 ${devItems.length}개)`
    );
  } else {
    console.log(`템플릿 이미 존재함: ${templateTitle}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
