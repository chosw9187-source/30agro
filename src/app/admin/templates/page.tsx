import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createTemplate } from "./actions";

export default async function TemplatesPage() {
  const templates = await prisma.evaluationTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true, cycles: true } } },
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">평가 템플릿</h1>
        <p className="mt-1 text-slate-600">
          평가 항목을 구성하는 템플릿을 관리합니다.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">새 템플릿 만들기</h2>
        <form action={createTemplate} className="flex flex-col gap-3">
          <input
            name="title"
            required
            placeholder="템플릿 이름 (예: 2026년 상반기 평가)"
            className="rounded border border-slate-300 px-3 py-2"
          />
          <textarea
            name="description"
            placeholder="설명 (선택)"
            rows={2}
            className="rounded border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            className="self-start rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
          >
            만들기
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        {templates.length === 0 && (
          <p className="text-slate-500">아직 템플릿이 없습니다.</p>
        )}
        {templates.map((t) => (
          <Link
            key={t.id}
            href={`/admin/templates/${t.id}`}
            className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{t.title}</p>
                {t.description && (
                  <p className="text-sm text-slate-500">{t.description}</p>
                )}
              </div>
              <div className="text-sm text-slate-500">
                항목 {t._count.items}개 · 사이클 {t._count.cycles}개
              </div>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
