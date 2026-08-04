"use client";

import { useActionState } from "react";
import { dedupeAppointmentRecords } from "./actions";

export function DedupeAppointmentForm() {
  const [result, formAction, isPending] = useActionState(
    dedupeAppointmentRecords,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        같은 사번+발령일의 발령 이력이 중복으로 쌓여 있다면, 아래 버튼으로
        가장 최근 기록만 남기고 나머지를 정리할 수 있습니다.
      </p>
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded border border-brand-green px-4 py-2 text-sm text-brand-green-dark hover:bg-brand-green-light disabled:opacity-50"
      >
        {isPending ? "정리 중..." : "중복 발령이력 정리"}
      </button>
      {result && (
        <p className="rounded bg-slate-50 p-3 text-sm">
          중복 {result.removed}건을 정리했습니다.
        </p>
      )}
    </form>
  );
}
