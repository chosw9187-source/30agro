"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

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

  if (!name || !email || !employeeNumber) return;

  const passwordHash = await bcrypt.hash(employeeNumber, 10);

  await prisma.user.create({
    data: {
      name,
      email,
      employeeNumber,
      passwordHash,
      role,
      teamId: teamId || null,
    },
  });

  revalidatePath("/admin/users");
}

export async function deleteUser(userId: string) {
  await requireRole("ADMIN");
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
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
