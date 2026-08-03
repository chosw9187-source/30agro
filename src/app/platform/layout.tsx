import { requireRole } from "@/lib/auth-helpers";
import { PlatformShell } from "@/components/platform-shell";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("ADMIN", "EVALUATOR", "EMPLOYEE");

  return <PlatformShell user={session.user}>{children}</PlatformShell>;
}
