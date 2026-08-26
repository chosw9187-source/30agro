"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function parseDateInputOrNull(value: FormDataEntryValue | null): Date | null {
  const str = String(value ?? "").trim();
  if (!str) return null;
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const POSITION_LABEL_FOR_APPOINTMENT: Record<string, string> = {
  CEO: "사장",
  OPERATIONS_HEAD: "운영책임",
  SENIOR_STAFF: "책임",
  TEAM_LEADER: "팀장",
  STAFF: "담당",
};

/**
 * 인사카드 기본이력 항목까지 한 번에 입력받아 직원을 등록한다. 입사일을
 * 넣으면 "입사(신입)" 발령사항을 자동으로 하나 만들어, 등록 직후 이동하는
 * 인사카드 화면에서 발령사항이 빈 채로 시작하지 않게 한다. 학력/경력/자격/
 * 상벌사항은 이 화면에서 다루지 않고 인사카드 화면의 기존 개별 입력 폼을
 * 그대로 이용한다 — 항목마다 여러 건이 될 수 있어 한 폼에 억지로 우겨넣지
 * 않는다.
 */
export async function createUser(formData: FormData) {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const employeeNumber = String(formData.get("employeeNumber") ?? "").trim();
  const role = String(formData.get("role") ?? "EMPLOYEE") as
    | "ADMIN"
    | "EVALUATOR"
    | "EMPLOYEE";
  const teamId = String(formData.get("teamId") ?? "").trim();
  const year = Number(formData.get("year") ?? new Date().getFullYear());

  const position = String(formData.get("position") ?? "").trim();
  const jobGrade = String(formData.get("jobGrade") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const employmentType = String(formData.get("employmentType") ?? "").trim();
  const jobFamily = String(formData.get("jobFamily") ?? "").trim();
  const birthDate = parseDateInputOrNull(formData.get("birthDate"));
  const hireDate = parseDateInputOrNull(formData.get("hireDate"));

  if (!name || !email || !employeeNumber) return;

  const passwordHash = await bcrypt.hash(employeeNumber, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      employeeNumber,
      passwordHash,
      role,
      teamId: teamId || null,
      position: (position || "STAFF") as
        | "CEO"
        | "OPERATIONS_HEAD"
        | "SENIOR_STAFF"
        | "TEAM_LEADER"
        | "STAFF",
      jobGrade: jobGrade || null,
      gender: gender || null,
      employmentType: employmentType || null,
      jobFamily: jobFamily || null,
      birthDate,
      hireDate,
    },
    include: { team: true },
  });

  await prisma.userTargetYear.upsert({
    where: { userId_year: { userId: user.id, year } },
    update: {},
    create: { userId: user.id, year },
  });

  if (hireDate) {
    await prisma.appointmentRecord.create({
      data: {
        userId: user.id,
        date: hireDate,
        type: "입사(신입)",
        title: "입사(신입)",
        department: user.team?.name ?? null,
        positionTitle: POSITION_LABEL_FOR_APPOINTMENT[user.position] ?? user.position,
        jobGrade: jobGrade || null,
      },
    });
  }

  revalidatePath("/admin/users");
  revalidatePath("/platform");
  revalidatePath("/platform/employees");
  redirect(`/platform/employees/${user.id}`);
}

export async function deleteUser(userId: string) {
  await requireRole("ADMIN");
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
  revalidatePath("/platform");
  revalidatePath("/platform/employees");
}

export async function bulkDeleteUsers(formData: FormData) {
  await requireRole("ADMIN");
  const ids = formData.getAll("userIds").map(String).filter(Boolean);
  const year = String(formData.get("year") ?? "");

  let ok = 0;
  let skipped = 0;
  for (const id of ids) {
    try {
      await prisma.user.delete({ where: { id } });
      ok++;
    } catch {
      skipped++;
    }
  }

  revalidatePath("/admin/users");
  revalidatePath("/platform");
  revalidatePath("/platform/employees");
  redirect(`/admin/users?year=${year}&deleted=${ok}&skipped=${skipped}`);
}

export async function updateUserName(userId: string, name: string) {
  await requireRole("ADMIN");
  const trimmed = name.trim();
  if (!trimmed) return;

  await prisma.user.update({ where: { id: userId }, data: { name: trimmed } });
  revalidatePath("/admin/users");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
  revalidatePath("/platform/org-chart");
}

export async function updateUserJobGrade(userId: string, jobGrade: string) {
  await requireRole("ADMIN");
  const trimmed = jobGrade.trim();

  await prisma.user.update({ where: { id: userId }, data: { jobGrade: trimmed || null } });
  revalidatePath("/admin/users");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
  revalidatePath("/platform/org-chart");
}

export async function updateUserGender(userId: string, gender: string) {
  await requireRole("ADMIN");
  await prisma.user.update({ where: { id: userId }, data: { gender: gender || null } });
  revalidatePath("/admin/users");
  revalidatePath("/platform");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
}

function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function updateUserBirthDate(userId: string, value: string) {
  await requireRole("ADMIN");
  await prisma.user.update({ where: { id: userId }, data: { birthDate: parseDateInput(value) } });
  revalidatePath("/admin/users");
  revalidatePath("/platform");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
}

export async function updateUserHireDate(userId: string, value: string) {
  await requireRole("ADMIN");
  await prisma.user.update({ where: { id: userId }, data: { hireDate: parseDateInput(value) } });
  revalidatePath("/admin/users");
  revalidatePath("/platform");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
  revalidatePath("/platform/org-chart");
  revalidatePath("/platform/org-chart/[teamId]", "page");
}

export async function updateUserTerminationDate(userId: string, value: string) {
  await requireRole("ADMIN");
  await prisma.user.update({ where: { id: userId }, data: { terminationDate: parseDateInput(value) } });
  revalidatePath("/admin/users");
  revalidatePath("/platform");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
  revalidatePath("/platform/org-chart");
  revalidatePath("/platform/org-chart/[teamId]", "page");
}

export async function updateUserEmploymentType(userId: string, value: string) {
  await requireRole("ADMIN");
  await prisma.user.update({ where: { id: userId }, data: { employmentType: value.trim() || null } });
  revalidatePath("/admin/users");
  revalidatePath("/platform");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
}

export async function updateUserJobFamily(userId: string, value: string) {
  await requireRole("ADMIN");
  await prisma.user.update({ where: { id: userId }, data: { jobFamily: value.trim() || null } });
  revalidatePath("/admin/users");
  revalidatePath("/platform");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
}

export async function updateUserBusinessUnit(userId: string, value: string) {
  await requireRole("ADMIN");
  await prisma.user.update({ where: { id: userId }, data: { businessUnit: value.trim() || null } });
  revalidatePath("/admin/users");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
  revalidatePath("/platform/org-chart");
}

export async function updateUserDivision(userId: string, value: string) {
  await requireRole("ADMIN");
  await prisma.user.update({ where: { id: userId }, data: { division: value.trim() || null } });
  revalidatePath("/admin/users");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
  revalidatePath("/platform/org-chart");
}

export async function updateUserRole(
  userId: string,
  role: "ADMIN" | "EVALUATOR" | "EMPLOYEE"
) {
  const session = await requireRole("ADMIN");
  if (userId === session.user.id) return;

  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/users");
  revalidatePath("/platform/employees");
}

export async function updateUserPosition(
  userId: string,
  position: "CEO" | "OPERATIONS_HEAD" | "SENIOR_STAFF" | "TEAM_LEADER" | "STAFF"
) {
  await requireRole("ADMIN");
  const user = await prisma.user.update({ where: { id: userId }, data: { position } });

  if (position === "TEAM_LEADER" && user.teamId) {
    await prisma.team.update({
      where: { id: user.teamId },
      data: { leaderId: userId },
    });
    await prisma.user.updateMany({
      where: { id: userId, role: "EMPLOYEE" },
      data: { role: "EVALUATOR" },
    });
    revalidatePath("/admin/teams");
    revalidatePath("/platform/org-chart");
    revalidatePath("/platform/org-chart/[teamId]", "page");
  }

  revalidatePath("/admin/users");
  revalidatePath("/platform/employees");
  revalidatePath("/platform/employees/[userId]", "page");
}

export async function resetUserPassword(userId: string) {
  await requireRole("ADMIN");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const passwordHash = await bcrypt.hash(user.employeeNumber, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: true },
  });

  revalidatePath("/admin/users");
}

/**
 * 본인 계정은 제외하고 전체 직원의 비밀번호를 각자의 사번으로 초기화한다 —
 * 관리자가 작업 도중 자기 세션의 비밀번호 변경 요구를 갑자기 마주치지
 * 않도록 하기 위함.
 */
export async function resetAllPasswords() {
  const session = await requireRole("ADMIN");

  const users = await prisma.user.findMany({
    where: { id: { not: session.user.id } },
    select: { id: true, employeeNumber: true },
  });

  await Promise.all(
    users.map(async (u) => {
      const passwordHash = await bcrypt.hash(u.employeeNumber, 10);
      await prisma.user.update({
        where: { id: u.id },
        data: { passwordHash, mustChangePassword: true },
      });
    })
  );

  revalidatePath("/admin/users");
}
