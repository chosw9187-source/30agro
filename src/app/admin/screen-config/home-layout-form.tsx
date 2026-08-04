"use client";

import { useActionState } from "react";
import { saveHomeLayout } from "./actions";
import { HOME_BLOCKS, HOME_BLOCK_LABEL, POSITION_LABEL, type Position } from "@/lib/permission-constants";

export function HomeLayoutForm({
  position,
  hidden,
}: {
  position: Position;
  hidden: Set<string>;
}) {
  const [result, formAction, isPending] = useActionState(
    saveHomeLayout.bind(null, position),
    undefined
  );

  return (
    <form action={formAction} className="rounded-lg border border-slate-200 bg-white p-6">
      <p className="mb-4 text-sm font-medium text-slate-700">
        {POSITION_LABEL[position]}의 홈 화면 블록
      </p>
      <div className="flex flex-col gap-2">
        {HOME_BLOCKS.map((b) => (
          <label key={b} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="block" value={b} defaultChecked={!hidden.has(b)} />
            {HOME_BLOCK_LABEL[b]}
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
        {result && <p className="text-sm text-brand-green-dark">저장되었습니다.</p>}
      </div>
    </form>
  );
}
