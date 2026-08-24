"use client";

import { useEffect, useState } from "react";

/**
 * 목록을 스크롤하면 안에 든 것을 접고, 맨 위로 올리면 다시 편다.
 *
 * 전사 목표 표는 어느 탭에서든 위에 붙어 있어야 하는데, 펼친 채로 고정해 두면
 * 세로 850px 화면에서 400px 가까이 먹는다. 그러면 정작 보려던 목록이 잘려서
 * "스크롤을 내려도 아래가 안 보인다"가 된다.
 *
 * 스크롤을 내리는 순간은 아래를 보겠다는 뜻이므로 그때 표를 접어 자리를
 * 내주고, 다시 맨 위로 올리면 표를 되돌려 준다. 카드 머리글(연도 · 전사 종합
 * 달성률)은 이 바깥에 있어서 접힌 동안에도 계속 보인다.
 */
export function ScrollCollapse({
  targetId,
  children,
}: {
  /** 감시할 스크롤 컨테이너의 id. */
  targetId: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;

    let frame = 0;
    const onScroll = () => {
      // 스크롤 이벤트는 한 번 굴릴 때 수십 번 들어온다. 프레임당 한 번만 본다.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // 24px은 손가락이 살짝 스친 정도를 무시하려는 여유. 이게 없으면 표가
        // 아주 작은 흔들림에도 접혔다 펴졌다 한다.
        setCollapsed(el.scrollTop > 24);
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [targetId]);

  return (
    <div
      className={`overflow-hidden transition-all duration-200 ease-out ${
        collapsed ? "max-h-0 opacity-0" : "max-h-[70vh] opacity-100"
      }`}
      aria-hidden={collapsed}
    >
      {children}
    </div>
  );
}
