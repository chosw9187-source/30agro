import { requireRole } from "@/lib/auth-helpers";
import { PlatformShell } from "@/components/platform-shell";

export default async function EvaluateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("EVALUATOR");

  return <PlatformShell user={session.user}>{children}</PlatformShell>;
}
