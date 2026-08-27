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
      const result = await action(formData);

      // 서버 액션이 { error } 를 돌려주면 그 문구를 그대로 띄운다. 프로덕션에서
      // Next는 던져진 오류의 메시지를 감추고 영어 안내로 바꿔 버리므로,
      // 사용자에게 보여줄 말은 던지지 말고 돌려줘야 한다.
      if (result && typeof result === "object" && "error" in result) {
        const message = (result as { error?: unknown }).error;
        if (typeof message === "string" && message) {
          showToast(message, false);
          return null;
        }
      }

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
      // 프로덕션에서 던져진 오류의 message는 "An error occurred in the Server
      // Components render..." 같은 영어 안내로 바뀌어 있다. 그대로 띄우면
      // 사용자는 무슨 일인지 알 수 없으므로, 그런 경우는 우리 문구로 바꾼다.
      const raw = error instanceof Error ? error.message : "";
      const masked = raw.startsWith("An error occurred in the Server");
      showToast(!raw || masked ? "처리하지 못했습니다. 입력값을 확인해 주세요." : raw, false);
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
