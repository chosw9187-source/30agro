import { prisma } from "@/lib/prisma";

const kindLabel: Record<string, string> = {
  COMPETENCY: "역량평가",
  PERFORMANCE: "성과평가",
};

const statusLabel: Record<string, string> = {
  DRAFT: "준비중",
  OPEN: "진행중",
  CLOSED: "종료",
};

export default async function ReportsPage() {
  const cycles = await prisma.evaluationCycle.findMany({
    orderBy: { createdAt: "desc" },
    include: { template: true, _count: { select: { evaluations: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">결과 다운로드</h1>
        <p className="mt-1 text-slate-600">
          취합할 사이클을 선택하면 팀명·이름·사번·성과평가점수·역량평가점수·합계를
          엑셀로 받을 수 있습니다. 합계는 성과평가 60% + 역량평가 40%로
          계산됩니다.
        </p>
      </div>

      <form
        action="/api/admin/export"
        method="GET"
        className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6"
      >
        {cycles.length === 0 && (
          <p className="text-slate-500">아직 사이클이 없습니다.</p>
        )}
        <div className="flex flex-col gap-2">
          {cycles.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-3 rounded border border-slate-200 px-3 py-2 hover:bg-slate-50"
            >
              <input type="checkbox" name="cycleIds" value={c.id} />
              <span className="flex-1">
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-sm text-slate-500">
                  {c.template.title} · {kindLabel[c.template.kind]} ·{" "}
                  {statusLabel[c.status]} · 배정 {c._count.evaluations}건
                </span>
              </span>
            </label>
          ))}
        </div>
        {cycles.length > 0 && (
          <button
            type="submit"
            className="self-start rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark"
          >
            엑셀 다운로드
          </button>
        )}
      </form>
    </div>
  );
}
