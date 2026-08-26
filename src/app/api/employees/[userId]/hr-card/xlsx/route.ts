import * as XLSX from "xlsx";
import { loadHrCardExportData, fmtDate, fmtYearMonth, positionLabel } from "@/lib/hr-card-export";

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const data = await loadHrCardExportData(userId);
  if (data.forbidden) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const { employee } = data;
  if (!employee) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const workbook = XLSX.utils.book_new();

  const basicSheet = XLSX.utils.aoa_to_sheet([
    ["사번", "성명", "부서", "직책", "직급"],
    [
      employee.employeeNumber,
      employee.name,
      employee.team?.name ?? "",
      positionLabel(employee.position),
      employee.jobGrade ?? "",
    ],
    [],
    ["생년월일", "입사일", "퇴사일", "사원구분", "직군"],
    [
      fmtDate(employee.birthDate),
      fmtDate(employee.hireDate),
      fmtDate(employee.terminationDate),
      employee.employmentType ?? "",
      employee.jobFamily ?? "",
    ],
  ]);
  XLSX.utils.book_append_sheet(workbook, basicSheet, "기본정보");

  const appointmentSheet = XLSX.utils.aoa_to_sheet([
    ["발령일", "구분", "발령명", "부서", "직책", "직급", "비고"],
    ...employee.appointmentRecords.map((r) => [
      fmtDate(r.date),
      r.type ?? "",
      r.title ?? "",
      r.department ?? "",
      r.positionTitle ?? "",
      r.jobGrade ?? "",
      r.note ?? "",
    ]),
  ]);
  XLSX.utils.book_append_sheet(workbook, appointmentSheet, "발령사항");

  const educationSheet = XLSX.utils.aoa_to_sheet([
    ["학력구분", "학교명", "전공", "학위", "입학년월", "졸업년월"],
    ...employee.educationRecords.map((r) => [
      r.level,
      r.school ?? "",
      r.major ?? "",
      r.degree ?? "",
      fmtYearMonth(r.admissionDate),
      fmtYearMonth(r.graduationDate),
    ]),
  ]);
  XLSX.utils.book_append_sheet(workbook, educationSheet, "학력사항");

  const careerSheet = XLSX.utils.aoa_to_sheet([
    ["근무회사", "직위", "담당업무", "입사일", "퇴사일"],
    ...employee.careerHistory.map((r) => [
      r.company,
      r.title ?? "",
      r.duties ?? "",
      fmtDate(r.startDate),
      fmtDate(r.endDate),
    ]),
  ]);
  XLSX.utils.book_append_sheet(workbook, careerSheet, "경력사항");

  const certSheet = XLSX.utils.aoa_to_sheet([
    ["자격증", "발급기관", "자격번호", "취득일", "만료일"],
    ...employee.certifications.map((r) => [
      r.name,
      r.issuer ?? "",
      r.certNumber ?? "",
      fmtDate(r.acquiredDate),
      fmtDate(r.expiryDate),
    ]),
  ]);
  XLSX.utils.book_append_sheet(workbook, certSheet, "자격사항");

  const cdSheet = XLSX.utils.aoa_to_sheet([
    ["구분", "종류", "사유", "기관", "시작일", "종료일"],
    ...employee.commendationDiscipline.map((r) => [
      r.type,
      r.category ?? "",
      r.reason ?? "",
      r.authority ?? "",
      fmtDate(r.startDate),
      fmtDate(r.endDate),
    ]),
  ]);
  XLSX.utils.book_append_sheet(workbook, cdSheet, "상벌사항");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        `인사카드_${employee.name}_${employee.employeeNumber}.xlsx`
      )}`,
    },
  });
}
