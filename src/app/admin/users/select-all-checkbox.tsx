"use client";

export function SelectAllCheckbox() {
  return (
    <input
      type="checkbox"
      title="전체 선택"
      onChange={(e) => {
        const checked = e.target.checked;
        e.target
          .closest("form")
          ?.querySelectorAll<HTMLInputElement>('input[name="userIds"]')
          .forEach((el) => {
            el.checked = checked;
          });
      }}
    />
  );
}
