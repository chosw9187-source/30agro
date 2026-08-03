import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { seedJobDescriptionsFromDraft } from "./actions";

export const dynamic = "force-dynamic";

export default async function JobManagementPage() {
  if (!(await checkModuleAccess("JOB_MANAGEMENT"))) {
    return <NoModuleAccess title="직무관리" />;
  }

  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      leader: true,
      jobDescription: { select: { fileName: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">직무관리</h1>
          <p className="mt-1 text-slate-600">
            팀별 직무기술서(첨부파일 및 담당업무·직무목적·자격요건 등)를 확인하세요.
            작성/수정은 관리자만 가능합니다.
          </p>
        </div>
        {isAdmin && (
          <form action={seedJobDescriptionsFromDraft}>
            <button
              type="submit"
              className="whitespace-nowrap rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
            >
              초안 PDF로 기본값 불러오기
            </button>
          </form>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {teams.map((t) => (
          <Link
            key={t.id}
            href={`/platform/job-management/${t.id}`}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-green"
          >
            <div>
              <p className="font-medium">{t.name}</p>
              <p className="text-sm text-slate-500">
                {t.leader ? `${t.leader.name} 팀장` : "팀장 미지정"}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                t.jobDescription?.fileName
                  ? "bg-brand-green-light text-brand-green-dark"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {t.jobDescription?.fileName ? "첨부됨" : "미첨부"}
            </span>
          </Link>
        ))}
        {teams.length === 0 && (
          <p className="text-slate-500">아직 등록된 팀이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
