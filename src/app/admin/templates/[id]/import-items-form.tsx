"use client";

import { useActionState } from "react";
import { importTemplateItemsFromExcel } from "./import-items-actions";

const competencyColumns = "팀명 / 카테고리 / 항목명 / 설명 / 최대점수 / 유형(SCORE 또는 TEXT)";
const performanceColumns =
  "팀명 / 카테고리 / 항목명 / KPI / 현수준 / 목표치 / 가중치 / S기준 / A기준 / B기준 / C기준 / D기준 / 산출식";

export function ImportTemplateItemsForm({
  templateId,
  kind,
}: {
  templateId: string;
  kind: string;
}) {
  const action = importTemplateItemsFromExcel.bind(null, templateId);
  const [result, formAction, isPending] = useActionState(action, undefined);

  const columns = kind === "PERFORMANCE" ? performanceColumns : competencyColumns;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        엑셀 첫 행은 헤더로, 다음 열을 사용합니다: <strong>{columns}</strong>.
        팀명 칸이 비어있으면 공통 항목이 되고, 새 팀명이면 팀이 자동 생성됩니다.
        같은 팀+항목명이 이미 있으면 내용을 갱신합니다.
      </p>
      <input
        type="file"
        name="file"
        accept=".xlsx,.xls"
        required
        className="rounded border border-slate-300 px-3 py-2"
      />
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {isPending ? "업로드 중..." : "엑셀로 항목 일괄 업로드"}
      </button>
      {result && (
        <div className="rounded bg-slate-50 p-3 text-sm">
          <p>
            생성 {result.created}건 · 갱신 {result.updated}건
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-red-600">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
