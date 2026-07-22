"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
    },
  });

  await prisma.userTargetYear.upsert({
    where: { userId_year: { userId: user.id, year } },
    update: {},
    create: { userId: user.id, year },
  });

  revalidatePath("/admin/users");
}

export async function deleteUser(userId: string) {
  await requireRole("ADMIN");
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
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
  redirect(`/admin/users?year=${year}&deleted=${ok}&skipped=${skipped}`);
}

export async function updateUserRole(
  userId: string,
  role: "ADMIN" | "EVALUATOR" | "EMPLOYEE"
) {
  const session = await requireRole("ADMIN");
  if (userId === session.user.id) return;

  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/users");
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
