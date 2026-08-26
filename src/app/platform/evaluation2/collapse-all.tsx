"use client";

import { useRef, useState } from "react";

/**
 * 그 탭의 목표 카드를 한꺼번에 접고 펴는 단추.
 *
 * 카드는 저마다 `<details>`라 하나씩 눌러 접을 수 있지만, 목표가 스무 건쯤
 * 되면 그걸 스무 번 누르게 된다. «무엇이 몇 %인지»만 훑고 싶을 때가 실제로는
 * 더 잦아서, 한 번에 접는 자리를 목록 머리에 둔다.
 *
 * 카드는 서버에서 그리므로 상태를 주고받지 않는다 — 이 단추는 자기 목록 안의
 * `<details>`를 직접 여닫는다. 그래서 카드 하나를 따로 펴 두어도 그 상태가
 * 그대로 남는다.
 */
export function CollapseAllButton() {
  const ref = useRef<HTMLButtonElement>(null);
  // 카드는 접힌 채로 열린다 — 그래서 이 단추도 «모두 펼치기»에서 시작한다.
  const [collapsed, setCollapsed] = useState(true);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        const root = ref.current?.closest("[data-goal-list]") ?? document;
        const next = !collapsed;
        root.querySelectorAll<HTMLDetailsElement>("details[data-goal-card]").forEach((card) => {
          card.open = !next;
        });
        setCollapsed(next);
      }}
      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
    >
      {collapsed ? "모두 펼치기" : "모두 접기"}
    </button>
  );
}
