import Link from "next/link";
import { auth } from "@/auth";
import { NoModuleAccess } from "@/components/no-module-access";
import { HrCardUploadReviewForm } from "./upload-review-form";

export const dynamic = "force-dynamic";

export default async function HrCardImportPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    return <NoModuleAccess title="인사카드 PDF 업로드" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/platform/data-upload" className="text-sm text-brand-green hover:underline">
          ← 데이터 업로드로 돌아가기
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">인사카드 PDF 업로드</h1>
        <p className="mt-1 text-slate-600">
          인사기록카드 PDF에서 경력사항·발령사항·학력사항만 추출합니다. 주소·연락처·가족정보 같은
          민감정보는 AI에 보내기 전에 자동으로 가려집니다.
        </p>
      </div>

      <HrCardUploadReviewForm />
    </div>
  );
}
