import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

type Role = "ADMIN" | "EVALUATOR" | "EMPLOYEE";

export async function requireRole(...roles: Role[]) {
  const session = await auth();
  const allowed = session?.user && (session.user.role === "ADMIN" || roles.includes(session.user.role));
  if (!allowed) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true },
  });
  if (user?.mustChangePassword) {
    redirect("/change-password");
  }

  return session;
}
