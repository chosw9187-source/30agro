import { prisma } from "@/lib/prisma";
import { CompanyLogo } from "@/components/company-logo";
import { CompetencySurveyQuestions } from "@/components/competency-survey-form";
import { submitApplicantResponse } from "./actions";

export const dynamic = "force-dynamic";

export default async function ApplySurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.surveyInviteLink.findUnique({ where: { token }, include: { response: true } });

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex justify-center">
          <CompanyLogo className="h-10" />
        </div>

        {!invite && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-600">유효하지 않은 링크입니다. 담당자에게 문의해주세요.</p>
          </div>
        )}

        {invite && invite.response && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
            <p className="text-lg font-semibold text-slate-800">이미 제출이 완료되었습니다.</p>
            <p className="mt-2 text-sm text-slate-500">응답해주셔서 감사합니다.</p>
          </div>
        )}

        {invite && !invite.response && (
          <form action={submitApplicantResponse.bind(null, token)} className="flex flex-col gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h1 className="text-lg font-semibold text-slate-800">SG 인적성검사</h1>
              <p className="mt-1 text-sm text-slate-600">
                한국삼공 채용 절차의 일환으로 진행되는 역량 자가진단입니다. 각 문항에 솔직하게 응답해주세요.
              </p>
              <div className="mt-4">
                <label className="mb-1 block text-xs text-slate-500">이름 *</label>
                <input
                  name="respondentName"
                  required
                  defaultValue={invite.applicantName ?? ""}
                  className="w-full max-w-xs rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <CompetencySurveyQuestions />

            <button
              type="submit"
              className="self-start rounded bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark"
            >
              제출하기
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
