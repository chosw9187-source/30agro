import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function OrgChartPage() {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: { leader: true, _count: { select: { members: true } } },
  });

  const totalEmployees = await prisma.user.count();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">조직도</h1>
        <p className="mt-1 text-slate-600">한국삼공의 팀 구성을 확인하세요.</p>
      </div>

      <div className="rounded-lg border border-brand-green-dark bg-brand-green px-8 py-6 text-white">
        <p className="text-sm text-white/80">한국삼공</p>
        <p className="mt-1 text-2xl font-bold">전체 조직</p>
        <div className="mt-4 flex gap-8 text-sm">
          <span>
            <strong className="text-lg">{totalEmployees}</strong>명 재직
          </span>
          <span>
            <strong className="text-lg">{teams.length}</strong>개 팀
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => (
          <div
            key={t.id}
            className="flex flex-col rounded-lg border border-slate-200 bg-white p-5"
          >
            <p className="text-lg font-semibold">{t.name}</p>
            <p className="mt-1 text-sm text-slate-500">
              {t.leader ? `${t.leader.name} 팀장` : "팀장 미지정"}
            </p>
            <p className="mt-3 text-sm text-slate-500">{t._count.members}명</p>
            <Link
              href={`/platform/org-chart/${t.id}`}
              className="mt-4 text-sm text-brand-green hover:underline"
            >
              구성원 보기 ›
            </Link>
          </div>
        ))}
        {teams.length === 0 && (
          <p className="text-slate-500">아직 등록된 팀이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
