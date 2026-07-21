import { prisma } from "@/lib/prisma";
import { createTeam, setTeamLeader, deleteTeam } from "./actions";

export default async function TeamsPage() {
  const [teams, evaluators] = await Promise.all([
    prisma.team.findMany({
      orderBy: { createdAt: "asc" },
      include: { leader: true, members: true },
    }),
    prisma.user.findMany({
      where: { role: "EVALUATOR" },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">팀 관리</h1>
        <p className="mt-1 text-slate-600">
          팀별 팀장을 지정하면, 사이클 배정 시 팀 소속 직원의 평가자로 자동 지정됩니다.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">새 팀 만들기</h2>
        <form action={createTeam} className="flex gap-3">
          <input
            name="name"
            required
            placeholder="팀 이름 (예: 개발팀)"
            className="flex-1 rounded border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
          >
            만들기
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        {teams.length === 0 && <p className="text-slate-500">아직 팀이 없습니다.</p>}
        {teams.map((team) => (
          <div
            key={team.id}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{team.name}</p>
                <p className="text-sm text-slate-500">
                  구성원 {team.members.length}명 · 팀장:{" "}
                  {team.leader ? team.leader.name : "미지정"}
                </p>
              </div>
              <form action={deleteTeam.bind(null, team.id)}>
                <button
                  type="submit"
                  className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  팀 삭제
                </button>
              </form>
            </div>
            <form
              action={setTeamLeader.bind(null, team.id)}
              className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3"
            >
              <label className="text-sm text-slate-600">팀장(평가자) 지정</label>
              <select
                name="leaderId"
                defaultValue={team.leaderId ?? ""}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">미지정</option>
                {evaluators.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
              >
                저장
              </button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
