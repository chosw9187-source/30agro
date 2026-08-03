import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";

const roleLabel: Record<string, string> = {
  ADMIN: "관리자",
  EVALUATOR: "평가자",
  EMPLOYEE: "직원",
};

export default async function TeamOrgDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  if (!(await checkModuleAccess("ORG_CHART"))) {
    return <NoModuleAccess title="조직도" />;
  }

  const { teamId } = await params;
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      leader: true,
      members: { orderBy: { name: "asc" } },
    },
  });

  if (!team) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/platform/org-chart" className="text-sm text-slate-500 hover:underline">
        ← 조직도
      </Link>

      <div className="rounded-lg border border-brand-green-dark bg-brand-green px-8 py-6 text-white">
        <p className="text-sm text-white/80">{team.name}</p>
        <p className="mt-1 text-2xl font-bold">
          {team.leader ? `${team.leader.name} 팀장` : "팀장 미지정"}
        </p>
        <div className="mt-4 flex gap-8 text-sm">
          <span>
            <strong className="text-lg">{team.members.length}</strong>명 재직
          </span>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">구성원 ({team.members.length}명)</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {team.members.map((m) => (
            <div key={m.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{m.name}</p>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {roleLabel[m.role] ?? m.role}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {m.id === team.leaderId ? "팀장" : "팀원"} · 사번 {m.employeeNumber}
              </p>
            </div>
          ))}
          {team.members.length === 0 && (
            <p className="text-slate-500">아직 구성원이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
