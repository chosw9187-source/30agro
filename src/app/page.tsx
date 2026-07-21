import { redirect } from "next/navigation";
import { auth } from "@/auth";

const roleHome: Record<string, string> = {
  ADMIN: "/admin",
  EVALUATOR: "/evaluate",
  EMPLOYEE: "/my-evaluations",
};

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  redirect(roleHome[session.user.role]);
}
