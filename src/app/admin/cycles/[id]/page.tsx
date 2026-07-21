import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  setCycleStatus,
  toggleResultsReleased,
  assignPair,
  assignTeam,
  unassignPair,
  deleteCycle,
} from "../actions";

const statusLabel: Record<string, string> = {
  DRAFT: "준비중",
  OPEN: "진행중",
  CLOSED: "종료",
};

const evalStatusLabel: Record<string, string> = {
  PENDING: "대기",
  IN_PROGRESS: "작성중",
  SUBMITTED: "제출완료",
};

export default async function CycleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cycle = await prisma.evaluationCycle.findUnique({
    where: { id },
    include: {
      template: true,
      evaluations: {
        include: { evaluator: true, evaluatee: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!cycle) notFound();

  const [evaluators, employees, teams] = await Promise.all([
    prisma.user.findMany({
      where: { role: "EVALUATOR" },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "EMPLOYEE" },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: { leader: true, members: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{cycle.name}</h1>
          <p className="mt-1 text-slate-600">{cycle.template.title}</p>
        </div>
        <form action={deleteCycle.bind(null, cycle.id)}>
          <button
            type="submit"
            className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            사이클 삭제
          </button>
        </form>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">사이클 상태</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-500">
            현재 상태: <strong>{statusLabel[cycle.status]}</strong>
          </span>
          {(["DRAFT", "OPEN", "CLOSED"] as const).map((s) => (
            <form key={s} action={setCycleStatus.bind(null, cycle.id, s)}>
              <button
                type="submit"
                disabled={cycle.status === s}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {statusLabel[s]}(으)로 변경
              </button>
            </form>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 border-t border-slate-200 pt-4">
          <span className="text-sm text-slate-500">
            결과 공개: <strong>{cycle.resultsReleased ? "공개됨" : "비공개"}</strong>
          </span>
          <form action={toggleResultsReleased.bind(null, cycle.id)}>
            <button
              type="submit"
              className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              {cycle.resultsReleased ? "결과 비공개로 전환" : "직원에게 결과 공개"}
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">팀으로 자동 배정</h2>
        <p className="mb-4 text-sm text-slate-500">
          팀장이 지정된 팀을 선택하면, 그 팀 소속 직원 전체가 팀장을 평가자로
          하여 한 번에 배정됩니다.
        </p>
        <div className="flex flex-col gap-2">
          {teams.length === 0 && (
            <p className="text-slate-500">등록된 팀이 없습니다.</p>
          )}
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center justify-between rounded border border-slate-200 px-4 py-2"
            >
              <div className="text-sm">
                <span className="font-medium">{team.name}</span>
                <span className="ml-2 text-slate-500">
                  팀장: {team.leader ? team.leader.name : "미지정"} · 구성원{" "}
                  {team.members.length}명
                </span>
              </div>
              <form action={assignTeam.bind(null, cycle.id, team.id)}>
                <button
                  type="submit"
                  disabled={!team.leaderId}
                  className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  이 팀 전체 배정
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">평가자-피평가자 배정 현황</h2>
        <div className="flex flex-col gap-2">
          {cycle.evaluations.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between rounded border border-slate-200 px-4 py-2"
            >
              <div className="text-sm">
                <span className="font-medium">{e.evaluator.name}</span>
                <span className="mx-2 text-slate-400">→</span>
                <span className="font-medium">{e.evaluatee.name}</span>
                <span className="ml-2 text-slate-500">
                  ({evalStatusLabel[e.status]})
                </span>
              </div>
              <form action={unassignPair.bind(null, cycle.id, e.id)}>
                <button
                  type="submit"
                  className="text-sm text-red-600 hover:underline"
                >
                  배정 해제
                </button>
              </form>
            </div>
          ))}
          {cycle.evaluations.length === 0 && (
            <p className="text-slate-500">아직 배정된 평가가 없습니다.</p>
          )}
        </div>

        <p className="mt-6 border-t border-slate-200 pt-6 text-sm font-medium text-slate-700">
          개별 수동 배정 (팀에 속하지 않았거나 예외적인 경우)
        </p>
        <form
          action={assignPair.bind(null, cycle.id)}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600">평가자</label>
            <select
              name="evaluatorId"
              required
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="">선택</option>
              {evaluators.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600">피평가자</label>
            <select
              name="evaluateeId"
              required
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="">선택</option>
              {employees.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
          >
            배정 추가
          </button>
        </form>
      </section>
    </div>
  );
}
