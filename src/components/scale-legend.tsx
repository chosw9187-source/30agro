import { SCALE_LABELS } from "@/lib/scale";

export function ScaleLegend() {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <summary className="cursor-pointer font-medium text-slate-700">
        평가 스케일 안내 (1~5점)
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        {SCALE_LABELS.map((s) => (
          <div key={s.score} className="flex gap-3">
            <span className="w-16 shrink-0 font-medium text-slate-700">
              {s.score} ({s.label})
            </span>
            <span className="text-slate-500">{s.description}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
