"use client";

import { useState, useTransition } from "react";
import {
  extractHrCardPdfs,
  saveHrCardData,
  type HrCardExtractResult,
} from "./actions";

export function HrCardUploadReviewForm() {
  const [isExtracting, startExtract] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [results, setResults] = useState<HrCardExtractResult[]>([]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [saveSummary, setSaveSummary] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <form
        action={(formData) => {
          setSaveSummary(null);
          startExtract(async () => {
            const r = await extractHrCardPdfs(formData);
            setResults(r);
            const initial: Record<number, boolean> = {};
            r.forEach((res, i) => {
              if (res.matchedUserId) initial[i] = true;
            });
            setChecked(initial);
          });
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-sm text-slate-500">
          인사기록카드 PDF를 한 번에 여러 개 선택할 수 있습니다. 업로드하면 바로 저장되지 않고, AI가 읽은 내용을
          먼저 보여드립니다 — 확인 후 저장 버튼을 눌러야 실제 반영됩니다.
        </p>
        <input
          type="file"
          name="files"
          accept=".pdf"
          multiple
          required
          className="rounded border border-slate-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={isExtracting}
          className="self-start rounded bg-brand-green px-4 py-2 text-sm text-white hover:bg-brand-green-dark disabled:opacity-50"
        >
          {isExtracting ? "읽는 중..." : "업로드하고 내용 확인"}
        </button>
      </form>

      {results.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-medium">추출 결과 ({results.length}건)</h3>
          {results.map((r, i) => (
            <div key={i} className="rounded border border-slate-100 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{r.fileName}</p>
                {r.matchedUserId ? (
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={!!checked[i]}
                      onChange={(e) => setChecked((prev) => ({ ...prev, [i]: e.target.checked }))}
                    />
                    저장 대상 포함
                  </label>
                ) : null}
              </div>

              {r.error && <p className="mt-1 text-red-600">{r.error}</p>}

              {r.data && (
                <div className="mt-1 text-slate-600">
                  {r.matchedUserId ? (
                    <p>
                      매칭됨: <span className="font-medium text-brand-green-dark">{r.matchedUserName}</span> (
                      {r.data.employeeNumber})
                    </p>
                  ) : (
                    <p className="text-amber-700">
                      사번 {r.data.employeeNumber}({r.data.name})에 해당하는 직원을 찾지 못했습니다 — 저장에서
                      제외됩니다.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    경력사항 {r.data.careerHistory.length}건 · 발령사항 {r.data.appointmentHistory.length}건 · 학력사항{" "}
                    {r.data.education.length}건
                  </p>
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            disabled={isSaving || !Object.values(checked).some(Boolean)}
            onClick={() => {
              const inputs = results
                .map((r, i) => ({ r, i }))
                .filter(({ r, i }) => checked[i] && r.matchedUserId && r.data)
                .map(({ r }) => ({ userId: r.matchedUserId!, data: r.data! }));
              startSave(async () => {
                const summary = await saveHrCardData(inputs);
                setSaveSummary(
                  `${summary.saved}명 저장 완료` + (summary.errors.length > 0 ? ` · 오류 ${summary.errors.length}건: ${summary.errors.join(", ")}` : "")
                );
              });
            }}
            className="self-start rounded bg-brand-green px-4 py-2 text-sm text-white hover:bg-brand-green-dark disabled:opacity-50"
          >
            {isSaving ? "저장 중..." : "선택 항목 저장"}
          </button>

          {saveSummary && <p className="text-sm text-slate-600">{saveSummary}</p>}
        </div>
      )}
    </div>
  );
}
