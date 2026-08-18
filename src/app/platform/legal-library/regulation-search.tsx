"use client";

import { useState, useTransition } from "react";
import { searchArticles, getArticle, type ArticleSearchHit } from "./actions";

type ArticleDetail = Awaited<ReturnType<typeof getArticle>>;

export function RegulationSearch({ hasRegulations }: { hasRegulations: boolean }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ArticleSearchHit[] | null>(null);
  const [detail, setDetail] = useState<ArticleDetail>(null);
  const [isSearching, startSearch] = useTransition();
  const [isLoadingDetail, startDetail] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setDetail(null);
          startSearch(async () => setHits(await searchArticles(query)));
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="예: 연차, 경조사, 출장비, 제23조"
          className="flex-1 rounded border border-slate-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={isSearching || query.trim().length < 2}
          className="rounded bg-brand-green px-4 py-2 text-white disabled:opacity-50"
        >
          {isSearching ? "검색 중…" : "검색"}
        </button>
      </form>

      {!hasRegulations && (
        <p className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          아직 등록된 규정이 없습니다. 관리자가 규정 파일을 올리면 조문 단위로 검색할 수 있습니다.
        </p>
      )}

      {hits !== null && hits.length === 0 && (
        <p className="text-sm text-slate-500">검색 결과가 없습니다.</p>
      )}

      {hits !== null && hits.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-500">조문 {hits.length}건</p>
          {hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => startDetail(async () => setDetail(await getArticle(hit.id)))}
              className="rounded border border-slate-200 px-4 py-3 text-left hover:border-brand-green hover:bg-slate-50"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xs text-slate-500">{hit.regulationTitle}</span>
                <span className="font-medium">
                  {hit.label}
                  {hit.title ? `(${hit.title})` : ""}
                </span>
                {hit.chapter && (
                  <span className="text-xs text-slate-400">{hit.chapter}</span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{hit.snippet}</p>
            </button>
          ))}
        </div>
      )}

      {isLoadingDetail && <p className="text-sm text-slate-500">조문을 불러오는 중…</p>}

      {detail && (
        <div className="rounded border border-brand-green bg-white px-5 py-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm text-slate-500">{detail.regulation.title}</span>
            {detail.chapter && (
              <span className="text-xs text-slate-400">{detail.chapter}</span>
            )}
          </div>
          <h3 className="mt-1 text-lg font-semibold">
            {detail.label}
            {detail.title ? `(${detail.title})` : ""}
          </h3>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">
            {detail.body}
          </pre>
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="mt-4 text-sm text-slate-500 hover:underline"
          >
            닫기
          </button>
        </div>
      )}
    </div>
  );
}
