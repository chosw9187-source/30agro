import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  addTemplateItem,
  deleteTemplateItem,
  deleteTemplate,
} from "../actions";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [template, teams] = await Promise.all([
    prisma.evaluationTemplate.findUnique({
      where: { id },
      include: { items: { orderBy: { order: "asc" }, include: { team: true } } },
    }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!template) notFound();

  const groups = new Map<string, typeof template.items>();
  for (const item of template.items) {
    const key = item.category || "미분류";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{template.title}</h1>
          {template.description && (
            <p className="mt-1 text-slate-600">{template.description}</p>
          )}
        </div>
        <form action={deleteTemplate.bind(null, template.id)}>
          <button
            type="submit"
            className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            템플릿 삭제
          </button>
        </form>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">평가 항목</h2>
        <p className="mb-4 text-sm text-slate-500">
          팀을 지정하지 않으면 모든 팀 공통 항목이 되고, 팀을 지정하면 해당 팀
          소속 직원의 평가에만 표시됩니다.
        </p>
        <div className="flex flex-col gap-6">
          {[...groups.entries()].map(([category, items]) => (
            <div key={category}>
              <h3 className="mb-2 text-sm font-semibold text-slate-500">
                {category}
              </h3>
              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded border border-slate-200 px-4 py-2"
                  >
                    <div>
                      <span className="font-medium">{item.label}</span>
                      <span className="ml-2 text-sm text-slate-500">
                        {item.type === "SCORE"
                          ? `점수 (최대 ${item.maxScore}점)`
                          : "서술형"}
                      </span>
                      <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {item.team ? item.team.name : "공통"}
                      </span>
                      {item.description && (
                        <p className="mt-1 text-sm text-slate-500">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <form
                      action={deleteTemplateItem.bind(null, template.id, item.id)}
                    >
                      <button
                        type="submit"
                        className="shrink-0 text-sm text-red-600 hover:underline"
                      >
                        삭제
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {template.items.length === 0 && (
            <p className="text-slate-500">아직 항목이 없습니다.</p>
          )}
        </div>

        <form
          action={addTemplateItem.bind(null, template.id)}
          className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-6"
        >
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600">영역 (카테고리)</label>
              <input
                name="category"
                placeholder="예: 핵심가치"
                className="rounded border border-slate-300 px-3 py-2"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600">항목 이름</label>
              <input
                name="label"
                required
                placeholder="예: 상생"
                className="rounded border border-slate-300 px-3 py-2"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600">적용 팀</label>
              <select
                name="teamId"
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="">공통 (모든 팀)</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600">유형</label>
              <select
                name="type"
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="SCORE">점수</option>
                <option value="TEXT">서술형</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600">최대 점수</label>
              <input
                name="maxScore"
                type="number"
                defaultValue={5}
                min={1}
                max={100}
                className="w-20 rounded border border-slate-300 px-3 py-2"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600">
              질문 / 설명 (선택)
            </label>
            <textarea
              name="description"
              rows={2}
              placeholder="예: 협업 과정에서 이해관계가 달라 갈등이 발생했을 때, 신뢰를 회복하거나 유지한 경험이 있는가?"
              className="rounded border border-slate-300 px-3 py-2"
            />
          </div>
          <button
            type="submit"
            className="self-start rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
          >
            항목 추가
          </button>
        </form>
      </section>
    </div>
  );
}
