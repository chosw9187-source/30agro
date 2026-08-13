import * as XLSX from "xlsx";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const workbook = XLSX.utils.book_new();

  const appointmentSheet = XLSX.utils.aoa_to_sheet([
    ["사번", "발령일", "발령구분", "발령명", "근무부서", "직책", "직급", "발령내역"],
    ["20260001", "2025-01-01", "공식", "승급발령", "인사팀", "팀장", "G4", ""],
  ]);
  XLSX.utils.book_append_sheet(workbook, appointmentSheet, "발령사항");

  const educationSheet = XLSX.utils.aoa_to_sheet([
    ["사번", "학력구분", "학교명", "전공", "학위", "입학년월", "졸업년월"],
    ["20260001", "대학교", "한국대학교", "경영학과", "", "2010-03", "2014-02"],
  ]);
  XLSX.utils.book_append_sheet(workbook, educationSheet, "학력사항");

  const careerSheet = XLSX.utils.aoa_to_sheet([
    ["사번", "근무회사", "직위", "담당업무", "입사일", "퇴사일"],
    ["20260001", "이전회사(주)", "대리", "영업관리", "2018-03-01", "2021-12-31"],
  ]);
  XLSX.utils.book_append_sheet(workbook, careerSheet, "경력사항");

  const certSheet = XLSX.utils.aoa_to_sheet([
    ["사번", "자격증", "발급기관", "자격번호", "취득일", "만료일"],
    ["20260001", "지게차운전기능사", "", "", "2024-01-01", ""],
  ]);
  XLSX.utils.book_append_sheet(workbook, certSheet, "자격사항");

  const cdSheet = XLSX.utils.aoa_to_sheet([
    ["사번", "구분", "종류", "사유", "기관", "시작일", "종료일"],
    ["20260001", "상", "제안제도 우수상", "제안제도 우수상", "", "2024-01-02", ""],
  ]);
  XLSX.utils.book_append_sheet(workbook, cdSheet, "상벌사항");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("인사카드_일괄업로드양식.xlsx")}`,
    },
  });
}
