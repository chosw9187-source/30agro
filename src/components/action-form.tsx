"use client";

import { useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/toast";

/**
 * 서버 액션을 쓰는 폼에 처리 결과 알림을 붙여주는 껍데기.
 *
 * 지금까지는 `<form action={서버액션}>`으로 바로 제출해서, 눌러도 화면이
 * 조용히 갱신되기만 하고 "됐다/안 됐다"가 보이지 않았다. 권한 오류처럼
 * 액션이 예외를 던지는 경우엔 아무 일도 안 일어난 것처럼 보였다.
 *
 * children은 서버 컴포넌트에서 그대로 넘겨받으므로, 기존 폼은 <form>만
 * 이 컴포넌트로 바꾸면 된다.
 *
 * `confirmMessage`를 주면 제출 전에 한 번 되묻는다 — 되돌릴 수 없는 삭제에
 * 쓴다. 취소하면 서버 액션은 호출되지 않는다.
 *
 * 저장이 끝나면 폼은 스스로 물러나야 한다. 다 고치고 «저장»을 눌렀는데 그
 * 긴 폼이 그대로 펼쳐져 있으면 저장이 된 것인지 아닌지도 헷갈리고, 목록을
 * 다시 보려면 «수정 닫기»를 또 찾아 눌러야 한다.
 *  - `successHref` — 성공하면 그 주소로 옮겨 간다. 펼침 여부가 주소에 담긴
 *    폼(«수정»)을 닫는 데 쓴다.
 *  - `collapseOnSuccess` — 성공하면 폼을 비우고, 폼을 감싼 «펼치기» 칸을
 *    접는다. 주소를 쓰지 않는 등록 폼에 쓴다.
 *
 * 둘 다 알림을 띄운 **뒤에** 움직인다 — 서버에서 바로 옮겨 가 버리면
 * «저장되었습니다»가 뜰 자리가 없다.
 */
export function ActionForm({
  action,
  children,
  className,
  id,
  successMessage = "정상 등록되었습니다.",
  confirmMessage,
  successHref,
  collapseOnSuccess,
}: {
  action: (formData: FormData) => Promise<unknown>;
  children: React.ReactNode;
  className?: string;
  id?: string;
  successMessage?: string;
  confirmMessage?: string;
  successHref?: string;
  collapseOnSuccess?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [, formAction] = useActionState(async (_prev: null, formData: FormData) => {
    try {
      await action(formData);
      showToast(successMessage, true);
      if (collapseOnSuccess) {
        formRef.current?.reset();
        const box = formRef.current?.closest("details");
        if (box) box.open = false;
      }
      if (successHref) router.replace(successHref);
    } catch (error) {
      // redirect()/notFound() 같은 Next 내부 제어 신호는 잡아채면 안 된다.
      if (
        error &&
        typeof error === "object" &&
        "digest" in error &&
        String((error as { digest?: unknown }).digest).startsWith("NEXT_")
      ) {
        throw error;
      }
      showToast(
        error instanceof Error ? error.message : "처리하지 못했습니다.",
        false
      );
    }
    return null;
  }, null);

  return (
    <form
      ref={formRef}
      id={id}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
