import { auth } from "@/auth";
import { redirect } from "next/navigation";

type Role = "ADMIN" | "EVALUATOR" | "EMPLOYEE";

export async function requireRole(...roles: Role[]) {
  const session = await auth();
  if (!session?.user || !roles.includes(session.user.role)) {
    redirect("/login");
  }
  return session;
}
