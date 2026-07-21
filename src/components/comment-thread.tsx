"use client";

import { useState } from "react";
import useSWR from "swr";

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorId: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function CommentThread({
  evaluationId,
  currentUserId,
}: {
  evaluationId: string;
  currentUserId: string;
}) {
  const { data, mutate } = useSWR<{ comments: Comment[] }>(
    `/api/evaluations/${evaluationId}/comments`,
    fetcher,
    { refreshInterval: 3000 }
  );
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    await fetch(`/api/evaluations/${evaluationId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    setText("");
    setSending(false);
    mutate();
  }

  const comments = data?.comments ?? [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-medium">코멘트</h2>
      <div className="mb-4 flex max-h-80 flex-col gap-3 overflow-y-auto">
        {comments.length === 0 && (
          <p className="text-sm text-slate-500">아직 코멘트가 없습니다.</p>
        )}
        {comments.map((c) => {
          const mine = c.authorId === currentUserId;
          return (
            <div
              key={c.id}
              className={`max-w-[80%] rounded px-3 py-2 text-sm ${
                mine ? "self-end bg-slate-900 text-white" : "self-start bg-slate-100"
              }`}
            >
              <p className="mb-1 text-xs opacity-70">{c.authorName}</p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지를 입력하세요"
          className="flex-1 rounded border border-slate-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
        >
          보내기
        </button>
      </form>
    </section>
  );
}
