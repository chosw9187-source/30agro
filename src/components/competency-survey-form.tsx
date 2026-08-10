import { COMPETENCIES, SURVEY_ITEMS, LIKERT_LABELS } from "@/lib/competency-survey";

export function CompetencySurveyQuestions() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        각 문항에 대해 본인의 모습과 가장 가까운 정도를 선택해주세요. (1: {LIKERT_LABELS[0]} · 3: {LIKERT_LABELS[2]} · 5: {LIKERT_LABELS[4]})
      </div>
      {COMPETENCIES.map((c) => (
        <div key={c.key} className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-brand-green-dark">{c.label}</h3>
          <div className="flex flex-col gap-3">
            {SURVEY_ITEMS.filter((i) => i.competency === c.key).map((item, idx) => (
              <div key={item.id} className="flex flex-col gap-1.5 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p className="text-sm text-slate-700">
                  {idx + 1}. {item.text}
                </p>
                <div className="flex shrink-0 gap-3 text-[11px] text-slate-500">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <label key={v} className="flex flex-col items-center gap-0.5">
                      <input type="radio" name={item.id} value={v} required className="h-4 w-4 text-brand-green" />
                      {v}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
