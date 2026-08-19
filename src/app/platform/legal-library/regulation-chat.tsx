"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Samgongi } from "@/components/samgongi";
import { searchArticles, getArticle, type ArticleSearchHit } from "./actions";

type ArticleDetail = Awaited<ReturnType<typeof getArticle>>;

type ChatMessage =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "bot"; text: string; hits: ArticleSearchHit[] };

/**
 * 첫 화면에서 뭘 물어봐야 할지 막막하지 않도록 대표 질문을 깔아둔다.
 * query는 실제로 조문 검색에 들어가는 키워드 — 질문 문장을 그대로 넣으면
 * 부분일치 검색이 아무것도 못 찾으므로 핵심어만 따로 들고 있는다.
 */
const SUGGESTIONS = [
  {
    emoji: "🌴",
    query: "연차",
    title: "연차휴가는 며칠인가요?",
    desc: "연차 발생 기준과 사용·정산 방법을 규정에서 찾아드려요.",
  },
  {
    emoji: "🎗️",
    query: "경조",
    title: "경조사 휴가와 경조금 기준",
    desc: "결혼·조사 등 경조사별 휴가일수와 지급 기준입니다.",
  },
  {
    emoji: "🧾",
    query: "출장",
    title: "출장비는 어떻게 정산하나요?",
    desc: "출장 신청 절차와 여비 지급 기준 조문을 모아 봅니다.",
  },
  {
    emoji: "🍼",
    query: "육아휴직",
    title: "육아휴직 조건이 궁금해요",
    desc: "신청 자격과 기간, 복직 관련 조항을 확인합니다.",
  },
  {
    emoji: "⏰",
    query: "시간외",
    title: "시간외근무 수당 계산",
    desc: "연장·야간·휴일근로의 가산 기준을 찾아드려요.",
  },
  {
    emoji: "⚖️",
    query: "징계",
    title: "징계 절차가 궁금해요",
    desc: "징계 사유와 종류, 절차 규정을 조문으로 보여드립니다.",
  },
];

/**
 * 조문 본문 렌더러.
 *
 * 규정에는 경조금 기준처럼 표로 된 조항이 많다. 추출 단계에서 표 한 행을
 * "| 칸 | 칸 |" 한 줄로 적어두므로, 여기서 그 줄들을 다시 표로 세운다.
 * 줄글로 흘리면 "본인결혼 6일 50만원 100만원"이 어느 열의 값인지 알 수 없다.
 */
function ArticleBody({ text }: { text: string }) {
  const blocks: ({ kind: "text"; lines: string[] } | { kind: "table"; rows: string[][] })[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const isRow = trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 1;
    const last = blocks[blocks.length - 1];

    if (isRow) {
      const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
      if (last?.kind === "table") last.rows.push(cells);
      else blocks.push({ kind: "table", rows: [cells] });
    } else {
      if (last?.kind === "text") last.lines.push(line);
      else blocks.push({ kind: "text", lines: [line] });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) =>
        block.kind === "text" ? (
          <p
            key={i}
            className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800"
          >
            {block.lines.join("\n").trim()}
          </p>
        ) : (
          // 열이 많은 기준표는 좁은 화면에서 넘친다 — 표만 가로로 스크롤시킨다.
          <div key={i} className="-mx-1 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r} className={r === 0 ? "bg-brand-green-light" : undefined}>
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className={`border border-slate-300 px-2.5 py-1.5 align-top leading-relaxed ${
                          r === 0 ? "font-semibold text-slate-900" : "text-slate-800"
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  );
}

export function RegulationChat({ hasRegulations }: { hasRegulations: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [isSending, startSend] = useTransition();

  // 펼쳐본 조문은 다시 서버를 부르지 않도록 들고 있는다.
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ArticleDetail>>({});
  const [isLoadingDetail, startDetail] = useTransition();

  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  // 답변이 길면 새 말풍선이 화면 밖에 생긴다 — 보낸 직후 끝으로 따라간다.
  useEffect(() => {
    if (messages.length > 0) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages]);

  function ask(rawQuery: string) {
    const query = rawQuery.trim();
    if (query.length < 2 || isSending) return;

    setInput("");
    setOpenId(null);
    setMessages((prev) => [
      ...prev,
      { id: nextId.current++, role: "user", text: query },
    ]);

    startSend(async () => {
      const hits = await searchArticles(query);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role: "bot",
          text:
            hits.length > 0
              ? `'${query}'과(와) 관련된 조문 ${hits.length}건을 찾았어요. 조문을 누르면 전문을 볼 수 있어요.`
              : `'${query}'에 해당하는 조문을 찾지 못했어요. 규정에 쓰인 낱말로 바꿔서 다시 물어봐 주세요. (예: '휴가' → '연차', '반차' → '연차')`,
          hits,
        },
      ]);
    });
  }

  function toggleArticle(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (details[id] !== undefined) return;
    startDetail(async () => {
      const detail = await getArticle(id);
      setDetails((prev) => ({ ...prev, [id]: detail }));
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {/* ── 히어로: 마스코트 ───────────────────────────────── */}
      <div className="flex justify-center rounded-3xl bg-gradient-to-b from-[#eaf7dd] to-[#f6fbf1] px-6 pt-6 pb-4">
        <Samgongi className="h-32 w-32 drop-shadow-sm" />
      </div>

      {/* ── 인사 말풍선 ────────────────────────────────────── */}
      <div className="rounded-2xl rounded-tl-sm border border-[#e6dfc4] bg-[#fdf7e3] px-5 py-4">
        <p className="text-xs font-semibold tracking-wide text-[#8a7a45]">
          AI 규정 도우미 · 삼공이
        </p>
        <p className="mt-2 flex gap-2 text-sm leading-relaxed text-slate-800">
          <span aria-hidden>🌱</span>
          <span>
            안녕하세요, 삼공이입니다. 사내 규정에서 궁금한 걸 물어보시면 관련
            조문을 근거 그대로 찾아드릴게요.
          </span>
        </p>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          삼공이의 답변에는 잘못된 정보나 누락이 있을 수 있습니다.{" "}
          {showDisclaimer ? (
            <>
              지금은 낱말이 실제로 들어 있는 조문을 찾아주는 방식이라, 규정에
              쓰인 표현과 다른 낱말로 물으면 못 찾을 수 있어요. 자연어로 묻고
              답하는 기능은 준비 중입니다. 최종 판단은 반드시 조문 원문과 인사팀
              확인을 거쳐 주세요.{" "}
              <button
                type="button"
                onClick={() => setShowDisclaimer(false)}
                className="font-medium text-slate-600 underline"
              >
                접기
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowDisclaimer(true)}
              className="font-medium text-slate-600 underline"
            >
              더보기
            </button>
          )}
        </p>
      </div>

      {/* ── 대화 ───────────────────────────────────────────── */}
      {messages.map((message) =>
        message.role === "user" ? (
          <div key={message.id} className="flex justify-end">
            <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-green px-4 py-2.5 text-sm leading-relaxed text-white">
              {message.text}
            </p>
          </div>
        ) : (
          <div key={message.id} className="flex gap-2.5">
            <Samgongi title="" className="mt-0.5 h-8 w-8 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 text-sm leading-relaxed text-slate-800 ring-1 ring-slate-200">
                {message.text}
              </p>

              {message.hits.map((hit) => (
                <div
                  key={hit.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <button
                    type="button"
                    onClick={() => toggleArticle(hit.id)}
                    aria-expanded={openId === hit.id}
                    className="w-full px-4 py-3 text-left hover:bg-brand-green-light"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-xs text-slate-500">
                        {hit.regulationTitle}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {hit.label}
                        {hit.title ? `(${hit.title})` : ""}
                      </span>
                      {hit.chapter && (
                        <span className="text-xs text-slate-400">{hit.chapter}</span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
                      {hit.snippet}
                    </p>
                  </button>

                  {openId === hit.id && (
                    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
                      {details[hit.id] === undefined ? (
                        <p className="text-xs text-slate-500">
                          {isLoadingDetail ? "조문을 불러오는 중…" : ""}
                        </p>
                      ) : details[hit.id] === null ? (
                        <p className="text-xs text-slate-500">
                          조문을 불러오지 못했습니다.
                        </p>
                      ) : (
                        <ArticleBody text={details[hit.id]!.body} />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ),
      )}

      {isSending && (
        <div className="flex items-center gap-2.5">
          <Samgongi title="" className="h-8 w-8 shrink-0" />
          <p className="rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 text-sm text-slate-500 ring-1 ring-slate-200">
            규정을 찾아보는 중이에요…
          </p>
        </div>
      )}

      <div ref={endRef} />

      {/* ── 입력 ───────────────────────────────────────────── */}
      {!hasRegulations ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          아직 등록된 규정이 없어요. 관리자가 규정 파일을 올리면 삼공이가 조문을
          찾아드릴 수 있습니다.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex items-center gap-2 rounded-full bg-white px-2 py-1.5 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-green"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="내용을 입력해주세요 : )"
            aria-label="규정에 대해 궁금한 내용"
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={isSending || input.trim().length < 2}
            aria-label="보내기"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-green text-white transition hover:bg-brand-green-dark disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path
                d="M3.5 11.6 20 4l-7.6 16.5-2.2-6.7-6.7-2.2Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </form>
      )}

      {/* ── 추천 질문 ──────────────────────────────────────── */}
      <div className="mt-2 border-t border-slate-200 pt-5">
        <h2 className="text-lg font-bold text-slate-900">
          혹시 이런 내용을 찾으시나요?
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.query}
              type="button"
              disabled={!hasRegulations || isSending}
              onClick={() => ask(suggestion.query)}
              className="flex gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-brand-green hover:bg-brand-green-light disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white"
            >
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-green-light text-base"
              >
                {suggestion.emoji}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">
                  {suggestion.title}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                  {suggestion.desc}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
