import * as XLSX from "xlsx";
import { loadHrCardExportData, fmtDate, fmtYearMonth, positionLabel } from "@/lib/hr-card-export";

const COLS = 7;

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

  const aoa: (string | number)[][] = [];
  const merges: XLSX.Range[] = [];

  function pushRow(row: (string | number)[]) {
    aoa.push([...row, ...Array(Math.max(0, COLS - row.length)).fill("")]);
    return aoa.length - 1;
  }

  function mergeRow(r: number, c1: number, c2: number) {
    merges.push({ s: { r, c: c1 }, e: { r, c: c2 } });
  }

  function sectionLabel(text: string) {
    const r = pushRow([`[ ${text} ]`]);
    mergeRow(r, 0, COLS - 1);
  }

  function table(headers: string[], rows: string[][]) {
    pushRow(headers);
    if (rows.length === 0) {
      const r = pushRow(["등록된 내용이 없습니다."]);
      mergeRow(r, 0, headers.length - 1);
    } else {
      for (const row of rows) pushRow(row);
    }
    pushRow([]);
  }

  // 제목
  let r = pushRow(["인 사 기 록 카 드"]);
  mergeRow(r, 0, COLS - 1);
  pushRow([]);

  // 기본이력
  sectionLabel("기본이력");
  r = pushRow(["성명", employee.name, "사번", employee.employeeNumber, "부서", employee.team?.name ?? "", ""]);
  r = pushRow(["직위", positionLabel(employee.position), "직급", employee.jobGrade ?? "", "성별", employee.gender ?? "", ""]);
  r = pushRow(["생년월일", fmtDate(employee.birthDate), "입사일", fmtDate(employee.hireDate), "퇴사일", fmtDate(employee.terminationDate), ""]);
  r = pushRow(["사원구분", employee.employmentType ?? "", "직군", employee.jobFamily ?? "", "", "", ""]);
  pushRow([]);

  sectionLabel("발령사항");
  table(
    ["발령일", "구분", "발령명", "부서", "직책", "직급", "비고"],
    employee.appointmentRecords.map((r2) => [
      fmtDate(r2.date),
      r2.type ?? "",
      r2.title ?? "",
      r2.department ?? "",
      r2.positionTitle ?? "",
      r2.jobGrade ?? "",
      r2.note ?? "",
    ])
  );

  sectionLabel("학력사항");
  table(
    ["학력구분", "학교명", "전공", "학위", "입학년월", "졸업년월"],
    employee.educationRecords.map((r2) => [
      r2.level,
      r2.school ?? "",
      r2.major ?? "",
      r2.degree ?? "",
      fmtYearMonth(r2.admissionDate),
      fmtYearMonth(r2.graduationDate),
    ])
  );

  sectionLabel("외부경력사항");
  table(
    ["근무회사", "직위", "담당업무", "입사일", "퇴사일"],
    employee.careerHistory.map((r2) => [r2.company, r2.title ?? "", r2.duties ?? "", fmtDate(r2.startDate), fmtDate(r2.endDate)])
  );

  sectionLabel("자격사항");
  table(
    ["자격증", "발급기관", "자격번호", "취득일", "만료일"],
    employee.certifications.map((r2) => [r2.name, r2.issuer ?? "", r2.certNumber ?? "", fmtDate(r2.acquiredDate), fmtDate(r2.expiryDate)])
  );

  sectionLabel("상벌사항");
  table(
    ["구분", "종류", "사유", "기관", "시작일", "종료일"],
    employee.commendationDiscipline.map((r2) => [
      r2.type,
      r2.category ?? "",
      r2.reason ?? "",
      r2.authority ?? "",
      fmtDate(r2.startDate),
      fmtDate(r2.endDate),
    ])
  );

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!merges"] = merges;
  sheet["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "인사기록카드");

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
