import { prisma } from "@/lib/prisma";
import {
  createTeam,
  updateTeamHierarchy,
  setTeamLeader,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  toggleTeamActive,
} from "./actions";
import {
  isActive,
  activePrismaWhere,
  regularOrExceptionTeamWhere,
} from "@/lib/hr-analytics";
import { UserPicker, UserPickerProvider, type PickUser } from "./user-picker";

export const dynamic = "force-dynamic";

const roleLabel: Record<string, string> = {
  ADMIN: "관리자",
  EVALUATOR: "평가자",
  EMPLOYEE: "직원",
};

export default async function TeamsPage() {
  const [teams, users] = await Promise.all([
    prisma.team.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        leader: true,
        members: { where: activePrismaWhere(), orderBy: { name: "asc" } },
      },
    }),
    /*
      고르개에 실을 명단 — **정규직과 영업관리팀 계약직**뿐이다(조직도·평가
      대상과 같은 규칙, `regularOrExceptionTeamWhere`). 기능직·계약직까지 다
      실으면 조직도에 세우지도 않을 사람들 사이에서 팀장을 찾게 된다.

      **관리자도 넣는다** — 인사팀 팀장처럼 관리자 권한을 가진 사람이 실제로
      팀을 맡고 있는데, 예전에는 role이 ADMIN이면 목록에서 빠져 「팀장 지정」에
      그 이름이 아예 나오지 않았다.

      쓰는 칸만 읽는다 — 이 명단이 고르개 수십 개에 실리므로 한 줄이라도 가볍게.
    */
    prisma.user.findMany({
      where: { AND: [activePrismaWhere(), regularOrExceptionTeamWhere()] },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        role: true,
        teamId: true,
        team: { select: { name: true } },
      },
    }),
  ]);

  /*
    이미 팀장으로 앉아 있는 사람은 모수 밖이어도 명단에 남긴다 — 고르개에 그
    사람이 없으면 화면에 「미지정」으로 보이고, 그 상태로 저장을 누르면 멀쩡한
    팀장이 지워진다.
  */
  const pickable = new Set(users.map((u) => u.id));
  const strayLeaders = teams
    .map((t) => t.leader)
    .filter(
      (l): l is NonNullable<typeof l> =>
        !!l && isActive(l) && !pickable.has(l.id)
    );
  const pickUsers: PickUser[] = [...users, ...strayLeaders]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: roleLabel[u.role] ?? u.role,
      teamId: u.teamId,
      teamName: "team" in u ? (u.team?.name ?? null) : null,
    }));

  const businessUnits = Array.from(
    new Set(teams.map((t) => t.businessUnit).filter((v): v is string => !!v))
  ).sort();
  const divisions = Array.from(
    new Set(teams.map((t) => t.division).filter((v): v is string => !!v))
  ).sort();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">팀 관리</h1>
        <p className="mt-1 text-slate-600">
          팀별 팀장을 지정하면, 사이클 배정 시 팀 소속 직원의 평가자로 자동 지정됩니다.
          직원을 팀장으로 지정하면 평가자 권한이 자동으로 부여됩니다. 조직도는
          사명 → 사업단위 → 본부 → 팀 순으로 표시되며, 사업단위·본부를
          지정하지 않으면 그 단계를 건너뛰고 바로 상위(또는 사명)에 표시됩니다.
          팀을 비활성화하면 팀 자체와 소속 인원 정보는 그대로 남아있지만
          조직도에는 나타나지 않습니다.
        </p>
      </div>

      <datalist id="business-unit-options">
        {businessUnits.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="division-options">
        {divisions.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">새 팀 만들기</h2>
        <form action={createTeam} className="flex flex-wrap gap-3">
          <input
            name="name"
            required
            placeholder="팀 이름 (예: 개발팀)"
            className="flex-1 rounded border border-slate-300 px-3 py-2"
          />
          <input
            name="businessUnit"
            list="business-unit-options"
            placeholder="사업단위 (예: 작물보호제사업)"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="division"
            list="division-options"
            placeholder="본부 (예: 제품기획마케팅)"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark"
          >
            만들기
          </button>
        </form>
      </section>

      <UserPickerProvider users={pickUsers}>
      <section className="flex flex-col gap-3">
        {teams.length === 0 && <p className="text-slate-500">아직 팀이 없습니다.</p>}
        {teams.map((team) => {
          const leader = team.leader && isActive(team.leader) ? team.leader : null;
          return (
          <div
            key={team.id}
            className={`rounded-lg border bg-white p-4 ${
              team.active ? "border-slate-200" : "border-slate-200 opacity-60"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {team.name}
                  {team.active ? (
                    <span className="ml-2 rounded-full bg-brand-green-light px-2 py-0.5 text-xs font-normal text-brand-green-dark">
                      활성화
                    </span>
                  ) : (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                      비활성화 · 조직도 미표시
                    </span>
                  )}
                  {team.businessUnit && (
                    <span className="ml-2 rounded bg-brand-green-light px-2 py-0.5 text-xs font-normal text-brand-green-dark">
                      {team.businessUnit}
                    </span>
                  )}
                  {team.division && (
                    <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                      {team.division}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-500">
                  구성원 {team.members.length}명 · 팀장:{" "}
                  {leader ? leader.name : "미지정"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <form action={toggleTeamActive.bind(null, team.id, !team.active)}>
                  <button
                    type="submit"
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
                  >
                    {team.active ? "비활성화" : "활성화"}
                  </button>
                </form>
                <form action={deleteTeam.bind(null, team.id)}>
                  <button
                    type="submit"
                    className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  >
                    팀 삭제
                  </button>
                </form>
              </div>
            </div>
            <form
              action={updateTeamHierarchy.bind(null, team.id)}
              className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"
            >
              <label className="text-sm text-slate-600">조직 위치</label>
              <input
                name="businessUnit"
                list="business-unit-options"
                defaultValue={team.businessUnit ?? ""}
                placeholder="사업단위"
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                name="division"
                list="division-options"
                defaultValue={team.division ?? ""}
                placeholder="본부"
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
              >
                저장
              </button>
            </form>
            <form
              action={setTeamLeader.bind(null, team.id)}
              className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3"
            >
              <label className="text-sm text-slate-600">팀장 지정</label>
              <UserPicker
                name="leaderId"
                defaultValue={team.leaderId ?? ""}
                emptyLabel="미지정"
              />
              <button
                type="submit"
                className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
              >
                저장
              </button>
            </form>

            <details className="mt-3 border-t border-slate-100 pt-3">
              <summary className="cursor-pointer text-sm text-slate-600 hover:text-brand-green-dark">
                구성원 {team.members.length}명 보기
              </summary>
              <div className="mt-2">
                {team.members.length === 0 ? (
                  <p className="text-sm text-slate-400">아직 구성원이 없습니다.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {team.members.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>{m.name}</span>
                        <form action={removeTeamMember.bind(null, team.id, m.id)}>
                          <button
                            type="submit"
                            className="text-red-600 hover:underline"
                          >
                            제외
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  action={addTeamMember.bind(null, team.id)}
                  className="mt-3 flex items-center gap-2"
                >
                  <UserPicker
                    name="userId"
                    required
                    emptyLabel="구성원 추가..."
                    excludeTeamId={team.id}
                    showTeam
                  />
                  <button
                    type="submit"
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
                  >
                    추가
                  </button>
                </form>
              </div>
            </details>
          </div>
          );
        })}
      </section>
      </UserPickerProvider>
    </div>
  );
}
