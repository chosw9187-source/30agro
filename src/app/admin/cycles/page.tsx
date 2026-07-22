import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createCycle } from "./actions";

const statusLabel: Record<string, string> = {
  DRAFT: "준비중",
  OPEN: "진행중",
  CLOSED: "종료",
};

export default async function CyclesPage() {
  const [cycles, templates] = await Promise.all([
    prisma.evaluationCycle.findMany({
      orderBy: { createdAt: "desc" },
      include: { template: true, _count: { select: { evaluations: true } } },
    }),
    prisma.evaluationTemplate.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">평가 사이클</h1>
        <p className="mt-1 text-slate-600">
          평가 기간을 만들고 평가자-피평가자를 배정합니다.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">새 사이클 만들기</h2>
        {templates.length === 0 ? (
          <p className="text-slate-500">먼저 평가 템플릿을 만들어주세요.</p>
        ) : (
          <form
            action={createCycle}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <input
              name="name"
              required
              placeholder="사이클 이름 (예: 2026년 상반기)"
              className="rounded border border-slate-300 px-3 py-2 sm:col-span-2"
            />
            <select
              name="templateId"
              required
              className="rounded border border-slate-300 px-3 py-2 sm:col-span-2"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600">시작일</label>
              <input
                name="startDate"
                type="date"
                required
                className="rounded border border-slate-300 px-3 py-2"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600">종료일</label>
              <input
                name="endDate"
                type="date"
                required
                className="rounded border border-slate-300 px-3 py-2"
              />
            </div>
            <button
              type="submit"
              className="rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark sm:col-span-2 sm:self-start"
            >
              만들기
            </button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-3">
        {cycles.length === 0 && (
          <p className="text-slate-500">아직 사이클이 없습니다.</p>
        )}
        {cycles.map((c) => (
          <Link
            key={c.id}
            href={`/admin/cycles/${c.id}`}
            className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-slate-500">
                  {c.template.title} · {statusLabel[c.status]}
                  {c.resultsReleased ? " · 결과 공개됨" : ""}
                </p>
              </div>
              <div className="text-sm text-slate-500">
                배정 {c._count.evaluations}건
              </div>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
