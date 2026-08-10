import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkModuleAccess } from "@/lib/permissions";
import { NoModuleAccess } from "@/components/no-module-access";
import { activePrismaWhere } from "@/lib/hr-analytics";
import {
  COMPETENCIES,
  type CompetencyScores,
  averageScores,
  fitScore,
  topBottomCompetencies,
  computeReliability,
  STRENGTH_COMMENT,
  WEAKNESS_COMMENT,
} from "@/lib/competency-survey";
import { CompetencySurveyQuestions } from "@/components/competency-survey-form";
import { KeyTalentToggle } from "./key-talent-toggle";
import { createInviteLink, deleteInviteLink, submitSelfAssessment } from "./actions";

export const dynamic = "force-dynamic";

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 text-slate-600">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-brand-green" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-slate-500">{score}</span>
    </div>
  );
}

function ReliabilityBadge({ answers }: { answers: Record<string, number> }) {
  const r = computeReliability(answers);
  if (r.reliable) {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">응답 신뢰도 양호</span>
    );
  }
  return (
    <span
      className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600"
      title={`불일치 문항 ${r.mismatchCount}개 · 자기고양 응답 평균 ${r.socialDesirabilityAvg}점`}
    >
      응답 신뢰도 낮음
    </span>
  );
}

function StrengthWeaknessList({ scores }: { scores: CompetencyScores }) {
  const { strengths, weaknesses } = topBottomCompetencies(scores);
  const labelOf = (key: (typeof COMPETENCIES)[number]["key"]) => COMPETENCIES.find((c) => c.key === key)!.label;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <p className="mb-1.5 text-xs font-semibold text-emerald-700">강점</p>
        {strengths.map((key) => (
          <p key={key} className="mb-1 text-xs text-emerald-800">
            <strong>{labelOf(key)}</strong> — {STRENGTH_COMMENT[key]}
          </p>
        ))}
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="mb-1.5 text-xs font-semibold text-amber-700">보완 필요</p>
        {weaknesses.map((key) => (
          <p key={key} className="mb-1 text-xs text-amber-800">
            <strong>{labelOf(key)}</strong> — {WEAKNESS_COMMENT[key]}
          </p>
        ))}
      </div>
    </div>
  );
}

async function SelfAssessmentSection({ userId, retake }: { userId: string; retake: boolean }) {
  const existing = await prisma.competencyAssessmentResponse.findUnique({ where: { userId } });

  if (existing && !retake) {
    const scores = existing.scores as CompetencyScores;
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-800">내 검사 결과</h2>
          <div className="flex items-center gap-2">
            <ReliabilityBadge answers={existing.answers as Record<string, number>} />
            <span className="rounded-full bg-brand-green-light px-3 py-1 text-sm font-semibold text-brand-green-dark">
              종합 {existing.overallScore}점
            </span>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {COMPETENCIES.map((c) => (
            <ScoreBar key={c.key} label={c.label} score={scores[c.key]} />
          ))}
        </div>
        <div className="mt-4">
          <StrengthWeaknessList scores={scores} />
        </div>
        <div className="mt-4">
          <Link href="/platform/talent-assessment?retake=1" className="text-xs text-brand-green-dark hover:underline">
            다시 응시하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={submitSelfAssessment} className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-800">자가진단 응시</h2>
        <p className="mt-1 text-sm text-slate-600">
          핵심인재로 지정된 경우 이 응답이 채용 적합도 비교의 기준 프로파일에 반영됩니다.
          {existing ? " 제출하면 기존 결과가 이번 응답으로 교체됩니다." : ""}
        </p>
      </div>
      <CompetencySurveyQuestions />
      <button
        type="submit"
        className="self-start rounded bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark"
      >
        제출하기
      </button>
    </form>
  );
}

async function AdminSection() {
  const [activeUsers, employeeResponses, inviteLinks, host] = await Promise.all([
    prisma.user.findMany({
      where: activePrismaWhere(),
      orderBy: { name: "asc" },
      select: { id: true, name: true, employeeNumber: true, isKeyTalent: true, team: { select: { name: true } } },
    }),
    prisma.competencyAssessmentResponse.findMany({
      where: { userId: { not: null } },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, isKeyTalent: true, team: { select: { name: true } } } } },
    }),
    prisma.surveyInviteLink.findMany({
      orderBy: { createdAt: "desc" },
      include: { response: true },
    }),
    headers(),
  ]);

  const keyTalentResponses = employeeResponses.filter((r) => r.user?.isKeyTalent);
  const benchmark = averageScores(keyTalentResponses.map((r) => r.scores as CompetencyScores));
  const hasBenchmark = keyTalentResponses.length > 0;
  const hostHeader = host.get("host");
  const protocol = hostHeader?.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${hostHeader}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-800">핵심인재 지정</h2>
        <p className="mt-1 text-sm text-slate-600">체크된 직원의 자가진단 응답이 기준 프로파일(벤치마크) 계산에 사용됩니다.</p>
        <div className="mt-3 max-h-72 overflow-y-auto rounded border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">이름</th>
                <th className="px-3 py-2 text-left">팀</th>
                <th className="px-3 py-2 text-center">핵심인재</th>
              </tr>
            </thead>
            <tbody>
              {activeUsers.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">{u.name}</td>
                  <td className="px-3 py-1.5 text-slate-500">{u.team?.name ?? "-"}</td>
                  <td className="px-3 py-1.5 text-center">
                    <KeyTalentToggle userId={u.id} isKeyTalent={u.isKeyTalent} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-800">직원 응시 결과</h2>
        <p className="mt-1 text-sm text-slate-600">자가진단을 제출한 직원 {employeeResponses.length}명의 결과입니다.</p>
        <div className="mt-3 flex flex-col gap-3">
          {employeeResponses.map((r) => {
            const scores = r.scores as CompetencyScores;
            const fit = hasBenchmark ? fitScore(scores, benchmark) : null;
            return (
              <details key={r.id} className="rounded border border-slate-200 p-3">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {r.user?.name}
                    {r.user?.isKeyTalent && (
                      <span className="ml-2 rounded-full bg-brand-green-light px-2 py-0.5 text-xs font-normal text-brand-green-dark">
                        핵심인재
                      </span>
                    )}
                    <span className="ml-2 text-xs font-normal text-slate-400">{r.user?.team?.name ?? "-"}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <ReliabilityBadge answers={r.answers as Record<string, number>} />
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">종합 {r.overallScore}점</span>
                  </span>
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  {fit !== null && (
                    <span className="self-start rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                      핵심인재 적합도 {fit}점
                    </span>
                  )}
                  <div className="flex flex-col gap-2">
                    {COMPETENCIES.map((c) => (
                      <ScoreBar key={c.key} label={c.label} score={scores[c.key]} />
                    ))}
                  </div>
                  <StrengthWeaknessList scores={scores} />
                </div>
              </details>
            );
          })}
          {employeeResponses.length === 0 && <p className="text-sm text-slate-500">아직 응시한 직원이 없습니다.</p>}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-800">기준 프로파일 (벤치마크)</h2>
        <p className="mt-1 text-sm text-slate-600">핵심인재 응시자 {keyTalentResponses.length}명의 평균 역량 점수입니다.</p>
        {hasBenchmark ? (
          <div className="mt-3 flex flex-col gap-2">
            {COMPETENCIES.map((c) => (
              <ScoreBar key={c.key} label={c.label} score={benchmark[c.key]} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">핵심인재로 지정된 직원 중 아직 응시한 사람이 없어 기준 프로파일을 계산할 수 없습니다.</p>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-800">지원자 응시 링크</h2>
        <form action={createInviteLink} className="mt-3 flex flex-wrap gap-2">
          <input
            name="applicantName"
            placeholder="지원자 이름(선택)"
            className="min-w-[160px] flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="note"
            placeholder="메모(선택, 예: 마케팅팀 지원)"
            className="min-w-[160px] flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-brand-green px-3 py-2 text-sm font-medium text-white hover:bg-brand-green-dark"
          >
            링크 발급
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-3">
          {inviteLinks.map((link) => {
            const responseScores = link.response ? (link.response.scores as CompetencyScores) : null;
            const fit = responseScores && hasBenchmark ? fitScore(responseScores, benchmark) : null;
            return (
              <div key={link.id} className="rounded border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{link.applicantName || "이름 미지정"}</p>
                    {link.note && <p className="text-xs text-slate-500">{link.note}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {link.response ? (
                      <span className="rounded-full bg-brand-green-light px-2 py-0.5 text-xs font-medium text-brand-green-dark">
                        제출됨
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">미제출</span>
                    )}
                    <form action={deleteInviteLink.bind(null, link.id)}>
                      <button type="submit" className="text-xs text-red-500 hover:underline">
                        삭제
                      </button>
                    </form>
                  </div>
                </div>

                {!link.response && (
                  <p className="mt-2 truncate rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-500">
                    {baseUrl}/apply/{link.token}
                  </p>
                )}

                {link.response && responseScores && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-brand-green-dark">결과 보기</summary>
                    <div className="mt-3 flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <ReliabilityBadge answers={link.response.answers as Record<string, number>} />
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                          종합 {link.response.overallScore}점
                        </span>
                        {fit !== null ? (
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                            핵심인재 적합도 {fit}점
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">기준 프로파일이 없어 적합도 계산 불가</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        {COMPETENCIES.map((c) => (
                          <ScoreBar key={c.key} label={c.label} score={responseScores[c.key]} />
                        ))}
                      </div>
                      <StrengthWeaknessList scores={responseScores} />
                    </div>
                  </details>
                )}
              </div>
            );
          })}
          {inviteLinks.length === 0 && <p className="text-sm text-slate-500">발급된 링크가 없습니다.</p>}
        </div>
      </div>
    </div>
  );
}

export default async function TalentAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ retake?: string }>;
}) {
  if (!(await checkModuleAccess("TALENT_ASSESSMENT"))) {
    return <NoModuleAccess title="SG 인적성검사" />;
  }

  const session = await auth();
  const isAdmin = session!.user.role === "ADMIN";
  const { retake } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">SG 인적성검사</h1>
        <p className="mt-1 text-slate-600">
          핵심인재의 역량 프로파일을 기준으로 삼아, 채용 지원자의 역량이 얼마나 가까운지 비교합니다.
        </p>
      </div>

      <SelfAssessmentSection userId={session!.user.id} retake={retake === "1"} />
      {isAdmin && <AdminSection />}
    </div>
  );
}
