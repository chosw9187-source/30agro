"use client";

/**
 * 체크박스 묶음을 한 번에 켜고 끄는 버튼. 교육생이 스무 명쯤 되면 "이 교육은
 * 전원 빼고 두 명만"을 손으로 누르는 게 고역이라, 전체 선택 후 몇 개만 빼는
 * 식으로 쓰게 한다.
 *
 * 서버 컴포넌트 안의 체크박스를 상태로 끌어올리지 않고 DOM에서 직접 건드린다
 * — 체크 상태의 주인은 폼이고, 저장은 폼 제출로만 일어나기 때문.
 */
export function SelectAllToggle({ groupId }: { groupId: string }) {
  const setAll = (checked: boolean) => {
    const group = document.getElementById(groupId);
    if (!group) return;
    group
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((box) => {
        box.checked = checked;
      });
  };

  return (
    <div className="mt-2 flex gap-3 text-xs">
      <button type="button" onClick={() => setAll(true)} className="text-brand-green-dark hover:underline">
        전체 선택
      </button>
      <button type="button" onClick={() => setAll(false)} className="text-slate-500 hover:underline">
        전체 해제
      </button>
    </div>
  );
}
