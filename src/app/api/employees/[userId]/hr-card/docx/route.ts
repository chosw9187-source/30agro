import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
  VerticalAlign,
  ShadingType,
} from "docx";
import { loadHrCardExportData, fmtDate, fmtYearMonth, positionLabel } from "@/lib/hr-card-export";

const HEADER_FILL = "E9F7EF";

function headerCell(text: string) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: HEADER_FILL },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: true, size: 18 })],
      }),
    ],
  });
}

function cell(text: string) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [new TextRun({ text: text || "-", size: 18 })] })],
  });
}

function dataTable(headers: string[], rows: string[][]) {
  const widthPct = Math.floor(100 / headers.length);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h) => headerCell(h)),
      }),
      ...(rows.length > 0
        ? rows.map((r) => new TableRow({ children: r.map((v) => cell(v)) }))
        : [
            new TableRow({
              children: [
                new TableCell({
                  columnSpan: headers.length,
                  children: [new Paragraph({ children: [new TextRun({ text: "등록된 내용이 없습니다.", size: 18, color: "999999" })] })],
                }),
              ],
            }),
          ]),
    ],
    columnWidths: headers.map(() => widthPct),
  });
}

function sectionHeading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, bold: true })],
  });
}

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

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [new TextRun({ text: "인 사 기 록 카 드", bold: true })],
          }),

          sectionHeading("기본이력"),
          dataTable(
            ["사번", "성명", "부서", "직책", "직급"],
            [[
              employee.employeeNumber,
              employee.name,
              employee.team?.name ?? "",
              positionLabel(employee.position),
              employee.jobGrade ?? "",
            ]]
          ),
          new Paragraph({ spacing: { before: 100 } }),
          dataTable(
            ["생년월일", "입사일", "퇴사일", "사원구분", "직군"],
            [[
              fmtDate(employee.birthDate),
              fmtDate(employee.hireDate),
              fmtDate(employee.terminationDate),
              employee.employmentType ?? "",
              employee.jobFamily ?? "",
            ]]
          ),

          sectionHeading("발령사항"),
          dataTable(
            ["발령일", "구분", "발령명", "부서", "직책", "직급", "비고"],
            employee.appointmentRecords.map((r) => [
              fmtDate(r.date),
              r.type ?? "",
              r.title ?? "",
              r.department ?? "",
              r.positionTitle ?? "",
              r.jobGrade ?? "",
              r.note ?? "",
            ])
          ),

          sectionHeading("학력사항"),
          dataTable(
            ["학력구분", "학교명", "전공", "학위", "입학년월", "졸업년월"],
            employee.educationRecords.map((r) => [
              r.level,
              r.school ?? "",
              r.major ?? "",
              r.degree ?? "",
              fmtYearMonth(r.admissionDate),
              fmtYearMonth(r.graduationDate),
            ])
          ),

          sectionHeading("외부경력사항"),
          dataTable(
            ["근무회사", "직위", "담당업무", "입사일", "퇴사일"],
            employee.careerHistory.map((r) => [
              r.company,
              r.title ?? "",
              r.duties ?? "",
              fmtDate(r.startDate),
              fmtDate(r.endDate),
            ])
          ),

          sectionHeading("자격사항"),
          dataTable(
            ["자격증", "발급기관", "자격번호", "취득일", "만료일"],
            employee.certifications.map((r) => [
              r.name,
              r.issuer ?? "",
              r.certNumber ?? "",
              fmtDate(r.acquiredDate),
              fmtDate(r.expiryDate),
            ])
          ),

          sectionHeading("상벌사항"),
          dataTable(
            ["구분", "종류", "사유", "기관", "시작일", "종료일"],
            employee.commendationDiscipline.map((r) => [
              r.type,
              r.category ?? "",
              r.reason ?? "",
              r.authority ?? "",
              fmtDate(r.startDate),
              fmtDate(r.endDate),
            ])
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        `인사카드_${employee.name}_${employee.employeeNumber}.docx`
      )}`,
    },
  });
}
