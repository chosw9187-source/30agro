"use client";

import { useActionState } from "react";
import { uploadEmployeePhotos } from "./actions";

export function PhotoUploadForm() {
  const [result, formAction, isPending] = useActionState(
    uploadEmployeePhotos,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        여러 장을 한 번에 선택할 수 있습니다. <strong>파일 이름을 사번으로</strong>{" "}
        지정해주세요 (예: 사번이 20260001이면 파일명은{" "}
        <code className="rounded bg-slate-100 px-1">20260001.jpg</code>). 사번과
        일치하는 직원이 있으면 사진이 반영됩니다.
      </p>
      <input
        type="file"
        name="photos"
        accept="image/*"
        multiple
        required
        className="rounded border border-slate-300 px-3 py-2"
      />
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark disabled:opacity-50"
      >
        {isPending ? "업로드 중..." : "사진 일괄 업로드"}
      </button>
      {result && (
        <div className="rounded bg-slate-50 p-3 text-sm">
          <p>반영 {result.matched}건</p>
          {result.unmatched.length > 0 && (
            <>
              <p className="mt-2 text-red-600">
                사번과 일치하는 직원을 찾지 못한 파일:
              </p>
              <ul className="mt-1 list-inside list-disc text-red-600">
                {result.unmatched.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </form>
  );
}
