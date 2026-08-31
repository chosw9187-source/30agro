"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * 사이클 한 줄의 이름·기간 칸과 저장 단추를 함께 감싼다.
 *
 * 날짜만 고쳐 놓고 저장을 누르지 않아 «고쳤는데 안 바뀐다»가 되는 일이 잦았다.
 * 칸을 건드리는 순간 단추가 초록으로 서고 옆에 «저장 안 됨»이 붙어서, 아직 눌러야
 * 할 것이 남았다는 게 눈에 걸리게 한다. 저장이 끝나면(폼 제출이 끝나면) 다시
 * 조용한 상태로 돌아간다.
 *
 * 표시만 바꿀 뿐 제출은 그대로 폼이 한다 — 이 안에 있는 단추가 그 폼의 제출
 * 단추다.
 */
export function CycleFields({ children }: { children: React.ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const { pending } = useFormStatus();
  const [wasPending, setWasPending] = useState(false);

  useEffect(() => {
    if (pending) {
      setWasPending(true);
      return;
    }
    if (wasPending) {
      setWasPending(false);
      setDirty(false);
    }
  }, [pending, wasPending]);

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      onInput={() => setDirty(true)}
      onChange={() => setDirty(true)}
    >
      {children}
      <button
        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
          dirty
            ? "bg-brand-green text-white hover:bg-brand-green-dark"
            : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        {pending ? "저장 중…" : "저장"}
      </button>
      {dirty && !pending && (
        <span className="text-[11px] font-medium text-status-critical">
          저장 안 됨 — 「저장」을 눌러 주세요
        </span>
      )}
    </div>
  );
}
