"use client";

import { useActionState } from "react";
import { deleteAllEducationRecords } from "./actions";

export function EducationBulkDeleteForm() {
  const [result, formAction, isPending] = useActionState(
    deleteAllEducationRecords,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        전 직원의 학력 정보를 한 번에 모두 지웁니다. 잘못 올라간 데이터가
        많아 처음부터 다시 올리고 싶을 때 사용하세요. 되돌릴 수 없습니다.
      </p>
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {isPending ? "삭제 중..." : "학력 정보 전체 삭제"}
      </button>
      {result && (
        <p className="rounded bg-slate-50 p-3 text-sm">
          {result.deleted}건을 삭제했습니다.
        </p>
      )}
    </form>
  );
}
