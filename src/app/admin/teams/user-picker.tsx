"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * 팀 관리의 사람 고르개 — **명단은 화면에 한 번만 싣는다**.
 *
 * 팀마다 「팀장 지정」과 「구성원 추가」 고르개가 하나씩 있어서, 명단을 고르개마다
 * 그리면 팀 40개 × 사람 250명 = 두 만 줄짜리 HTML이 된다. 실제로 이 화면이
 * «눌러도 안 열린다»는 말을 들을 만큼 느렸다.
 *
 * 그래서 명단은 위에서 한 번만 내려 주고(`UserPickerProvider`), 고르개는 열 때
 * 그 명단으로 칸을 만든다. 처음 그릴 때는 지금 골라져 있는 사람 한 줄만 있으면
 * 되고, 나머지는 화면이 다 그려진 뒤(한가할 때) 조용히 채워 넣는다 — 눌렀는데
 * 아직 안 채워져 있으면 그 자리에서 채운다.
 */
export type PickUser = {
  id: string;
  name: string;
  /** 「팀장」 · 「관리자」처럼 이름 뒤에 붙는 말. */
  role: string;
  teamId: string | null;
  teamName: string | null;
};

const UserListContext = createContext<PickUser[]>([]);

export function UserPickerProvider({
  users,
  children,
}: {
  users: PickUser[];
  children: ReactNode;
}) {
  return (
    <UserListContext.Provider value={users}>
      {children}
    </UserListContext.Provider>
  );
}

const SELECT_CLASS = "rounded border border-slate-300 px-3 py-2 text-sm";

export function UserPicker({
  name,
  defaultValue,
  emptyLabel,
  /** 이 팀에 이미 있는 사람은 「구성원 추가」 목록에서 뺀다. */
  excludeTeamId,
  /** 「(현재: 인사팀)」을 이름 뒤에 붙일지. */
  showTeam = false,
  required = false,
}: {
  name: string;
  defaultValue?: string;
  emptyLabel: string;
  excludeTeamId?: string;
  showTeam?: boolean;
  required?: boolean;
}) {
  const users = useContext(UserListContext);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (filled) return;
    // 화면이 다 그려진 뒤 한가할 때 채운다 — 첫 그림을 늦추지 않는다.
    const id = window.setTimeout(() => setFilled(true), 300);
    return () => window.clearTimeout(id);
  }, [filled]);

  const shown = filled
    ? users.filter((u) => !excludeTeamId || u.teamId !== excludeTeamId)
    : users.filter((u) => u.id === defaultValue);

  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      required={required}
      // 아직 안 채워진 채로 눌렀으면 그 자리에서 채운다.
      onPointerDown={() => setFilled(true)}
      onFocus={() => setFilled(true)}
      className={SELECT_CLASS}
    >
      <option value="">{emptyLabel}</option>
      {shown.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
          {showTeam
            ? u.teamName
              ? ` (현재: ${u.teamName})`
              : ""
            : ` (${u.role})`}
        </option>
      ))}
    </select>
  );
}
