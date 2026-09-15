"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import {
  DEFAULT_QUOTA_TABLE,
  ORG_GRADES,
  PERSON_GRADES,
  isOrgGrade,
  isPersonGrade,
  stringifyRatios,
  type GradeRatios,
  type OrgGrade,
} from "@/lib/final-grade";

const PATH = "/admin/grade";
const VIEW_PATH = "/platform/evaluation2";

function str(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function year(formData: FormData): number {
  const n = Number(str(formData.get("year")));
  if (!Number.isInteger(n) || n < 2000 || n > 2100) {
    throw new Error("연도가 올바르지 않습니다.");
  }
  return n;
}

function done() {
  revalidatePath(PATH);
  revalidatePath(VIEW_PATH);
}

/**
 * 그 해 분포표에 **빠진 줄만** 채운다.
 *
 * 이미 있는 줄은 건드리지 않는다. 인사팀이 손으로 고친 배분율을 「기본값 채우기」
 * 한 번으로 되돌려 버리면, 그 단추를 다시 누를 수 없다.
 */
export async function seedQuotaTable(formData: FormData) {
  await requireRole("ADMIN");
  const y = year(formData);
  const have = new Set(
    (
      await prisma.gradeQuota.findMany({
        where: { year: y },
        select: { orgGrade: true },
      })
    ).map((r) => r.orgGrade),
  );
  const missing = ORG_GRADES.filter((g) => !have.has(g));
  if (missing.length === 0) {
    done();
    return { added: 0 };
  }
  await prisma.gradeQuota.createMany({
    data: missing.map((g) => ({
      year: y,
      orgGrade: g,
      ratios: stringifyRatios(DEFAULT_QUOTA_TABLE[g as OrgGrade]),
    })),
  });
  done();
  return { added: missing.length };
}

/**
 * 분포표 다섯 줄을 한 번에 저장한다.
 *
 * 줄마다 저장 단추를 두려다 말았다. 표 한 줄을 폼 하나로 만들려면 `<tr>` 안에
 * `<form>`을 넣어야 하는데, 그건 올바른 HTML이 아니라서 브라우저가 폼을 표
 * 밖으로 밀어낼 수 있다. 그리고 다섯 줄은 보통 같이 정하는 값이라, 한 번에
 * 저장하는 쪽이 누르는 수도 적다.
 *
 * 합이 100이 아닌 줄도 저장한다 — 다섯 칸을 채우는 도중에는 반드시 어긋난다.
 * 대신 화면이 합을 늘 적어 주고, 합이 100이 아닌 줄은 등급 배분에 쓰이지 않는다.
 */
export async function saveQuotaTable(formData: FormData) {
  await requireRole("ADMIN");
  const y = year(formData);

  const rows: { orgGrade: OrgGrade; ratios: GradeRatios }[] = [];
  for (const org of ORG_GRADES) {
    const ratios = {} as GradeRatios;
    for (const g of PERSON_GRADES) {
      const raw = str(formData.get(`r_${org}_${g}`));
      const v = raw === "" ? 0 : Number(raw);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        throw new Error(`조직 ${org}의 ${g} 배분율이 0~100이 아닙니다.`);
      }
      ratios[g] = Math.round(v * 10) / 10;
    }
    rows.push({ orgGrade: org, ratios });
  }

  await prisma.$transaction(
    rows.map((r) =>
      prisma.gradeQuota.upsert({
        where: { year_orgGrade: { year: y, orgGrade: r.orgGrade } },
        create: {
          year: y,
          orgGrade: r.orgGrade,
          ratios: stringifyRatios(r.ratios),
        },
        update: { ratios: stringifyRatios(r.ratios) },
      }),
    ),
  );
  done();
}

/** 업무단위 하나의 조직등급. 빈 값은 «아직 안 정함»이라 줄을 지운다. */
export async function setUnitOrgGrade(formData: FormData) {
  await requireRole("ADMIN");
  const y = year(formData);
  const unit = str(formData.get("businessUnit"));
  if (!unit) throw new Error("업무단위가 비어 있습니다.");
  const grade = str(formData.get("orgGrade"));
  if (grade && !isOrgGrade(grade)) {
    throw new Error("조직등급이 올바르지 않습니다.");
  }

  if (!grade) {
    await prisma.gradeUnitPlan.deleteMany({
      where: { year: y, businessUnit: unit },
    });
    done();
    return;
  }
  await prisma.gradeUnitPlan.upsert({
    where: { year_businessUnit: { year: y, businessUnit: unit } },
    create: { year: y, businessUnit: unit, orgGrade: grade },
    update: { orgGrade: grade },
  });
  done();
}

/**
 * 사람 하나의 등급을 인사팀이 직접 확정한다. 빈 값은 확정을 거두고 계산값으로
 * 되돌린다.
 */
export async function setFinalGrade(formData: FormData) {
  const session = await requireRole("ADMIN");
  const y = year(formData);
  const userId = str(formData.get("userId"));
  if (!userId) throw new Error("사람이 비어 있습니다.");
  const grade = str(formData.get("grade"));
  const note = str(formData.get("note")) || null;

  if (!grade) {
    await prisma.finalGrade.deleteMany({ where: { year: y, userId } });
    done();
    return;
  }
  if (!isPersonGrade(grade)) throw new Error("등급이 올바르지 않습니다.");

  await prisma.finalGrade.upsert({
    where: { year_userId: { year: y, userId } },
    create: { year: y, userId, grade, note, fixedById: session.user.id },
    update: { grade, note, fixedById: session.user.id },
  });
  done();
}
