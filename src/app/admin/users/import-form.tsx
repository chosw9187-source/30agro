"use client";

import { useActionState } from "react";
import { importUsersFromExcel } from "./import-actions";

export function ImportUsersForm({ defaultYear }: { defaultYear: number }) {
  const [result, formAction, isPending] = useActionState(
    importUsersFromExcel,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        엑셀 파일의 첫 행은 헤더로, <strong>이름 / 사번</strong> 열만
        필수입니다. <strong>이메일주소</strong>는 없어도 되며, 이미 퇴사한
        인원의 이력만 등록할 때는 이메일 없이 데이터만 넣으면 로그인 계정
        없이(어차피 퇴직 계정은 로그인이 막혀 있습니다) 저장됩니다.{" "}
        <strong>팀명</strong>이 있으면 해당 팀명에 사업단위/본부가 함께
        반영됩니다. <strong>팀명 없이 사업단위/본부만</strong> 입력하면(임원
        등 특정 팀에 속하지 않는 경우) 조직도에 해당 사업단위/본부의 리더로
        표시됩니다. <strong>직책</strong>은 회장/부회장/사장/대표→CEO,
        운영책임/부사장→운영책임, 책임/이사/상무/전무→책임, 팀장→팀장, 그
        외(부장~사원 등)→담당으로 자동 매핑됩니다. 실제 직급명(부사장, 이사,
        부장 등)은 <strong>직급</strong> 열에 그대로 적어주세요.{" "}
        <strong>성별</strong>(남/여),{" "}
        <strong>생년월일 / 입사일 / 퇴사일</strong>(YYYY-MM-DD 형식 권장),{" "}
        <strong>사원구분 / 직군</strong> 열도 있으면 함께 반영됩니다.
        학력(고등학교/대학교/대학원 등)은 이 양식이 아니라 아래{" "}
        <strong>학력 업로드</strong>로 별도 등록합니다. 같은 사번이 이미
        존재하면 정보를 갱신하고, 새 사번이면 새로 등록합니다. 비밀번호는
        사번으로 자동 설정됩니다. 아래 연도의 대상자로도 함께 등록됩니다.
      </p>
      <div className="flex gap-4">
        <a
          href="/api/admin/users/template"
          className="self-start text-sm text-brand-green hover:underline"
        >
          업로드 양식 다운로드 (.xlsx)
        </a>
        <a
          href="/api/admin/users/export"
          className="self-start text-sm text-brand-green hover:underline"
        >
          현재 등록된 목록 내보내기 (.xlsx)
        </a>
      </div>
      <p className="text-xs text-slate-400">
        많은 인원의 성별·직급 등을 한 번에 채우려면, 위 &quot;현재 등록된
        목록 내보내기&quot;로 받은 파일에 값을 채운 뒤 그대로 다시
        업로드하세요. 이메일 기준으로 매칭되어 기존 정보가 갱신됩니다.
      </p>
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-600">대상 연도</label>
        <input
          type="number"
          name="year"
          defaultValue={defaultYear}
          className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
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
        className="self-start rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark disabled:opacity-50"
      >
        {isPending ? "업로드 중..." : "엑셀로 일괄 등록"}
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
