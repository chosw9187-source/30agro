"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

const roleHome: Record<string, string> = {
  ADMIN: "/admin",
  EVALUATOR: "/evaluate",
  EMPLOYEE: "/my-evaluations",
};

export async function changePassword(
  _prevState: string | undefined,
  formData: FormData
) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < 8) {
    return "비밀번호는 8자 이상이어야 합니다.";
  }
  if (newPassword !== confirmPassword) {
    return "새 비밀번호가 서로 일치하지 않습니다.";
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  redirect(roleHome[session.user.role] ?? "/login");
}
