import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const evalStatusLabel: Record<string, string> = {
  PENDING: "대기",
  IN_PROGRESS: "작성중",
  SUBMITTED: "제출완료",
};

export default async function MyEvaluationsDashboard() {
  const session = await auth();
  const evaluations = await prisma.evaluation.findMany({
    where: { evaluateeId: session!.user.id },
    include: { cycle: true, evaluator: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">내 평가</h1>
        <p className="mt-1 text-slate-600">
          자기평가를 작성하고, 공개된 평가 결과를 확인하세요.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {evaluations.length === 0 && (
          <p className="text-slate-500">배정된 평가가 없습니다.</p>
        )}
        {evaluations.map((e) => (
          <Link
            key={e.id}
            href={`/my-evaluations/${e.id}`}
            className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{e.cycle.name}</p>
                <p className="text-sm text-slate-500">평가자: {e.evaluator.name}</p>
              </div>
              <div className="flex flex-col items-end gap-1 text-sm text-slate-500">
                <span>자기평가: {evalStatusLabel[e.selfStatus]}</span>
                <span>{e.cycle.resultsReleased ? "결과 공개됨" : "결과 비공개"}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
