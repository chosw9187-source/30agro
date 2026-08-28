import { loadHrCardExportData, fmtDate, fmtYearMonth, positionLabel } from "@/lib/hr-card-export";
import { buildHrCardPdf } from "@/lib/hr-card-pdf";

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

  const pdfBuffer = await buildHrCardPdf({
    name: employee.name,
    employeeNumber: employee.employeeNumber,
    teamName: employee.team?.name ?? "",
    position: positionLabel(employee.position),
    jobGrade: employee.jobGrade ?? "",
    employmentType: employee.employmentType ?? "",
    jobFamily: employee.jobFamily ?? "",
    gender: employee.gender ?? "",
    birthDate: fmtDate(employee.birthDate),
    hireDate: fmtDate(employee.hireDate),
    terminationDate: fmtDate(employee.terminationDate),
    photo: employee.photo ? Buffer.from(employee.photo) : null,
    appointments: employee.appointmentRecords.map((r) => [
      fmtDate(r.date),
      r.type ?? "",
      r.title ?? "",
      r.department ?? "",
      r.positionTitle ?? "",
      r.jobGrade ?? "",
      r.note ?? "",
    ]),
    education: employee.educationRecords.map((r) => [
      r.level,
      r.school ?? "",
      r.major ?? "",
      r.degree ?? "",
      fmtYearMonth(r.admissionDate),
      fmtYearMonth(r.graduationDate),
    ]),
    career: employee.careerHistory.map((r) => [
      r.company,
      r.title ?? "",
      r.duties ?? "",
      fmtDate(r.startDate),
      fmtDate(r.endDate),
    ]),
    certifications: employee.certifications.map((r) => [
      r.name,
      r.issuer ?? "",
      r.certNumber ?? "",
      fmtDate(r.acquiredDate),
      fmtDate(r.expiryDate),
    ]),
    commendationDiscipline: employee.commendationDiscipline.map((r) => [
      r.type,
      r.category ?? "",
      r.reason ?? "",
      r.authority ?? "",
      fmtDate(r.startDate),
      fmtDate(r.endDate),
    ]),
  });

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        `인사카드_${employee.name}_${employee.employeeNumber}.pdf`
      )}`,
    },
  });
}
