"use client";

import { useState, useTransition } from "react";
import {
  uploadRegulations,
  deleteRegulation,
  reparseRegulation,
  setRegulationActive,
  type RegulationUploadResult,
} from "./actions";

export type RegulationRow = {
  id: string;
  title: string;
  category: string | null;
  articleCount: number;
  isActive: boolean;
  fileName: string | null;
};

export function RegulationManager({ regulations }: { regulations: RegulationRow[] }) {
  const [results, setResults] = useState<RegulationUploadResult[]>([]);
  const [isUploading, startUpload] = useTransition();
  const [isMutating, startMutate] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6 rounded border border-slate-200 bg-slate-50 px-5 py-4">
      <div>
        <h2 className="font-semibold">규정 파일 등록 (관리자)</h2>
        <p className="mt-1 text-sm text-slate-600">
          PDF·Word(.docx)·텍스트 파일을 한 번에 여러 개 올릴 수 있습니다. 올리면 제N조 단위로 자동
          분리돼 검색에 반영됩니다. 스캔한 이미지 PDF는 글자를 읽을 수 없으니 원본 문서 파일이 있으면
          그쪽을 권합니다.
        </p>
      </div>

      <form
        action={(formData) => {
          setNotice(null);
          startUpload(async () => setResults(await uploadRegulations(formData)));
        }}
        className="flex flex-col gap-3"
      >
        <input
          type="text"
          name="category"
          placeholder="분류 (선택) — 예: 인사, 총무, 재무"
          className="rounded border border-slate-300 px-3 py-2"
        />
        <input
          type="file"
          name="files"
          accept=".pdf,.docx,.txt,.md"
          multiple
          required
          className="rounded border border-slate-300 bg-white px-3 py-2"
        />
        <button
          type="submit"
          disabled={isUploading}
          className="self-start rounded bg-brand-green px-4 py-2 text-white disabled:opacity-50"
        >
          {isUploading ? "분석 중…" : "업로드 및 조문 분리"}
        </button>
      </form>

      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">분석 결과</h3>
          {results.map((result) => (
            <div
              key={result.fileName}
              className={`rounded border px-4 py-3 text-sm ${
                result.error
                  ? "border-red-300 bg-red-50"
                  : "border-emerald-300 bg-emerald-50"
              }`}
            >
              <p className="font-medium">{result.fileName}</p>
              {result.error ? (
                <p className="mt-1 text-red-700">{result.error}</p>
              ) : (
                <>
                  <p className="mt-1 text-emerald-800">
                    조문 {result.articleCount}건 인식
                  </p>
                  {result.samples && result.samples.length > 0 && (
                    <p className="mt-1 text-slate-600">
                      {result.samples
                        .map((s) => `${s.label}${s.title ? `(${s.title})` : ""}`)
                        .join(" · ")}
                      {" …"}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
          <p className="text-xs text-slate-500">
            조문 번호와 제목이 실제 문서와 다르게 보이면 파서 조정이 필요합니다 — 그대로 알려주세요.
          </p>
        </div>
      )}

      {notice && <p className="text-sm text-slate-600">{notice}</p>}

      {regulations.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">등록된 규정 {regulations.length}건</h3>
          {regulations.map((regulation) => (
            <div
              key={regulation.id}
              className="flex flex-wrap items-center gap-3 rounded border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <span className="font-medium">{regulation.title}</span>
              {regulation.category && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {regulation.category}
                </span>
              )}
              <span className="text-slate-500">조문 {regulation.articleCount}건</span>
              {!regulation.isActive && (
                <span className="text-xs text-amber-700">검색 제외됨</span>
              )}
              <div className="ml-auto flex gap-3">
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() =>
                    startMutate(async () => {
                      const { articleCount } = await reparseRegulation(regulation.id);
                      setNotice(`${regulation.title}: 조문 ${articleCount}건으로 재분리했습니다.`);
                    })
                  }
                  className="text-slate-500 hover:underline disabled:opacity-50"
                >
                  재분리
                </button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() =>
                    startMutate(() => setRegulationActive(regulation.id, !regulation.isActive))
                  }
                  className="text-slate-500 hover:underline disabled:opacity-50"
                >
                  {regulation.isActive ? "검색 제외" : "검색 포함"}
                </button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => {
                    if (!confirm(`'${regulation.title}'을 삭제할까요? 조문도 함께 지워집니다.`)) return;
                    startMutate(() => deleteRegulation(regulation.id));
                  }}
                  className="text-red-600 hover:underline disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
