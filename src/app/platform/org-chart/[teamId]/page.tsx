import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import {
  ageInYears,
  tenureInYears,
  isActive,
  activePrismaWhere,
  isBranchTeam,
  regularOrExceptionTeamWhere,
} from "@/lib/hr-analytics";
import { POSITION_LABEL, type Position } from "@/lib/permission-constants";
import { Avatar } from "@/components/avatar";
import { BackPill } from "@/components/back-pill";

export const dynamic = "force-dynamic";

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
      members: {
        where: { AND: [activePrismaWhere(), regularOrExceptionTeamWhere()] },
        orderBy: { hireDate: { sort: "asc", nulls: "last" } },
      },
    },
  });

  if (!team || !team.active) notFound();

  const leader = team.leader && isActive(team.leader) ? team.leader : null;
  const leaderTitle = isBranchTeam(team.name) ? "지점장" : "팀장";

  const params_ = new URLSearchParams();
  if (team.businessUnit) params_.set("unit", team.businessUnit);
  if (team.division) params_.set("division", team.division);
  const backHref = params_.toString()
    ? `/platform/org-chart?${params_.toString()}`
    : "/platform/org-chart";
  const backLabel = team.division ?? team.businessUnit ?? "조직도";

  return (
    <div className="flex flex-col gap-6">
      <BackPill href={backHref} label={backLabel} />

      <div className="rounded-lg border border-brand-green-dark bg-brand-green px-8 py-6 text-white">
        <p className="text-sm text-white/80">{team.name}</p>
        {leader ? (
          <div className="mt-3 flex items-center gap-4">
            <Avatar
              userId={leader.id}
              name={leader.name}
              hasPhoto={!!leader.photo}
              className="h-14 w-14 border-2 border-white/50 text-lg"
            />
            <div>
              <p className="text-2xl font-bold">{leader.name} {leaderTitle}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
                  {leader.position === "TEAM_LEADER" ? leaderTitle : POSITION_LABEL[leader.position as Position]}
                </span>
                {leader.birthDate && (
                  <span className="rounded-full bg-blue-400/20 px-2 py-0.5 text-xs font-medium text-blue-100">
                    만 {ageInYears(leader.birthDate)}세
                  </span>
                )}
                {leader.hireDate ? (
                  <>
                    <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-medium text-amber-100">
                      근속 {tenureInYears(leader.hireDate).toFixed(1)}년
                    </span>
                    <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium text-white/80">
                      입사 {leader.hireDate.toLocaleDateString("ko-KR")}
                    </span>
                  </>
                ) : (
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium text-white/70">
                    입사일 미입력
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-2xl font-bold">{leaderTitle} 미지정</p>
        )}
        <div className="mt-4 flex items-center gap-8 text-sm">
          <span>
            <strong className="text-lg">{team.members.length}</strong>명 재직
          </span>
          {leader && (
            <Link
              href={`/platform/employees/${leader.id}`}
              className="rounded border border-white/40 px-3 py-1.5 hover:bg-white/10"
            >
              상세보기 ›
            </Link>
          )}
        </div>
      </div>

      <div>
        {(() => {
          const memberList = team.members.filter((m) => m.id !== team.leaderId);
          return (
            <>
              <h2 className="mb-3 text-lg font-medium">구성원 ({memberList.length}명)</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {memberList.map((m) => (
                  <Link
                    key={m.id}
                    href={`/platform/employees/${m.id}`}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-green"
                  >
                    <Avatar userId={m.id} name={m.name} hasPhoto={!!m.photo} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-brand-green-dark">{m.name}</p>
                        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {roleLabel[m.role] ?? m.role}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-brand-green-light px-2 py-0.5 text-sm font-medium text-brand-green-dark">
                          {POSITION_LABEL[m.position as Position]}
                        </span>
                        {m.birthDate && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-sm font-medium text-blue-700">
                            만 {ageInYears(m.birthDate)}세
                          </span>
                        )}
                        {m.hireDate ? (
                          <>
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-sm font-medium text-amber-700">
                              근속 {tenureInYears(m.hireDate).toFixed(1)}년
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-600">
                              입사 {m.hireDate.toLocaleDateString("ko-KR")}
                            </span>
                          </>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-500">
                            입사일 미입력
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
                {memberList.length === 0 && (
                  <p className="text-slate-500">아직 구성원이 없습니다.</p>
                )}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
