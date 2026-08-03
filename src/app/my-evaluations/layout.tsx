import { requireRole } from "@/lib/auth-helpers";
import { PlatformShell } from "@/components/platform-shell";

export default async function MyEvaluationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("EMPLOYEE");

  return <PlatformShell user={session.user}>{children}</PlatformShell>;
}
