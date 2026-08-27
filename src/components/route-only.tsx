"use client";

import { usePathname } from "next/navigation";

/**
 * 특정 메뉴에서만 보이는 셸 부품을 감싼다.
 *
 * 화면 껍데기(`PlatformShell`)는 모든 메뉴가 함께 쓰는 서버 컴포넌트라 «지금 어느
 * 주소인가»를 모른다. 그래서 주소를 아는 쪽 — 브라우저 — 에서 한 번 걸러 준다.
 * App Router에서는 서버 렌더 때도 `usePathname`이 실제 주소를 주므로, 처음 그려질
 * 때부터 맞는 화면에만 나온다(붙었다 사라지는 깜빡임이 없다).
 *
 * `prefix` 아래 하위 주소까지 함께 친다 — /platform/evaluation2 와
 * /platform/evaluation2/settings 는 같은 메뉴다.
 *
 * `invert`를 주면 반대로 «그 메뉴에서만 감춘다»가 된다. 한 화면이 자기만의
 * 머리글을 갖는 경우(평가2의 초록 띠)에 공용 머리글을 접는 데 쓴다.
 */
export function RouteOnly({
  prefix,
  invert = false,
  children,
}: {
  prefix: string;
  invert?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const match = pathname === prefix || pathname.startsWith(`${prefix}/`);
  return match !== invert ? <>{children}</> : null;
}
