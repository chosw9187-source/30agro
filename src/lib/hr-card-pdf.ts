import PDFDocument from "pdfkit";
import path from "path";

const FONT_PATH = path.join(process.cwd(), "src/assets/fonts/NotoSansKR-VF.ttf");
const MARGIN = 36;
const PAGE_WIDTH = 595.28; // A4 pt
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ROW_H = 20;
const HEADER_FILL = "#E9F7EF";
const BORDER = "#CBD5E1";

type Row = string[];

function ensureRoom(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > PAGE_HEIGHT - MARGIN) {
    doc.addPage({ size: "A4", margin: MARGIN });
    doc.font(FONT_PATH);
  }
}

function sectionTitle(doc: PDFKit.PDFDocument, text: string) {
  ensureRoom(doc, ROW_H + 14);
  doc.moveDown(0.6);
  doc.fontSize(11).fillColor("#111827").text(`[ ${text} ]`, MARGIN, doc.y);
  doc.moveDown(0.2);
}

function drawTable(doc: PDFKit.PDFDocument, headers: string[], widths: number[], rows: Row[]) {
  const totalW = widths.reduce((a, b) => a + b, 0);
  function drawHeaderRow() {
    const y = doc.y;
    ensureRoom(doc, ROW_H);
    const yy = doc.y;
    doc.rect(MARGIN, yy, totalW, ROW_H).fillAndStroke(HEADER_FILL, BORDER);
    let x = MARGIN;
    doc.fontSize(9).fillColor("#111827");
    headers.forEach((h, i) => {
      doc.text(h, x + 4, yy + 5, { width: widths[i] - 8, height: ROW_H - 8, ellipsis: true });
      x += widths[i];
    });
    doc.y = yy + ROW_H;
    void y;
  }

  drawHeaderRow();

  if (rows.length === 0) {
    ensureRoom(doc, ROW_H);
    const yy = doc.y;
    doc.rect(MARGIN, yy, totalW, ROW_H).stroke(BORDER);
    doc.fontSize(9).fillColor("#94A3B8").text("등록된 내용이 없습니다.", MARGIN + 4, yy + 5, {
      width: totalW - 8,
    });
    doc.y = yy + ROW_H;
    return;
  }

  for (const row of rows) {
    ensureRoom(doc, ROW_H);
    const yy = doc.y;
    if (yy === MARGIN) {
      // just paged — redraw header on the new page
      drawHeaderRow();
    }
    const rowY = doc.y;
    doc.rect(MARGIN, rowY, totalW, ROW_H).stroke(BORDER);
    let x = MARGIN;
    doc.fontSize(9).fillColor("#334155");
    row.forEach((cell, i) => {
      if (i > 0) doc.moveTo(x, rowY).lineTo(x, rowY + ROW_H).strokeColor(BORDER).stroke();
      doc.text(cell || "-", x + 4, rowY + 5, { width: widths[i] - 8, height: ROW_H - 8, ellipsis: true });
      x += widths[i];
    });
    doc.y = rowY + ROW_H;
  }
}

export type HrCardPdfData = {
  name: string;
  employeeNumber: string;
  teamName: string;
  position: string;
  jobGrade: string;
  employmentType: string;
  jobFamily: string;
  gender: string;
  birthDate: string;
  hireDate: string;
  terminationDate: string;
  photo: Buffer | null;
  appointments: Row[];
  education: Row[];
  career: Row[];
  certifications: Row[];
  commendationDiscipline: Row[];
};

export function buildHrCardPdf(data: HrCardPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("noto", FONT_PATH);
    doc.font("noto");

    doc.fontSize(20).fillColor("#111827").text("인 사 기 록 카 드", { align: "center" });
    doc.moveDown(1);

    // 기본이력 box
    const boxTop = doc.y;
    const photoW = 90;
    const infoW = CONTENT_WIDTH - photoW - 10;
    const basicRows: [string, string][] = [
      ["성명", data.name],
      ["사번", data.employeeNumber],
      ["부서", data.teamName],
      ["직위", data.position],
      ["직급", data.jobGrade],
      ["성별", data.gender],
      ["생년월일", data.birthDate],
      ["입사일", data.hireDate],
      ["퇴사일", data.terminationDate],
      ["사원구분", data.employmentType],
      ["직군", data.jobFamily],
    ];
    const colW = infoW / 2;
    const rowH = 18;
    let ry = boxTop;
    for (let i = 0; i < basicRows.length; i += 2) {
      const pair = basicRows.slice(i, i + 2);
      let rx = MARGIN;
      for (const [label, value] of pair) {
        doc.rect(rx, ry, colW, rowH).stroke(BORDER);
        doc.fontSize(8).fillColor("#64748B").text(label, rx + 4, ry + 5, { width: 40 });
        doc.fontSize(9).fillColor("#111827").text(value || "-", rx + 48, ry + 5, { width: colW - 52, ellipsis: true });
        rx += colW;
      }
      ry += rowH;
    }
    if (data.photo) {
      try {
        doc.rect(MARGIN + infoW + 10, boxTop, photoW, rowH * 5).stroke(BORDER);
        doc.image(data.photo, MARGIN + infoW + 15, boxTop + 5, { fit: [photoW - 10, rowH * 5 - 10] });
      } catch {
        // corrupt/unsupported image data — skip silently, rest of the card still renders
      }
    } else {
      doc.rect(MARGIN + infoW + 10, boxTop, photoW, rowH * 5).stroke(BORDER);
      doc.fontSize(8).fillColor("#94A3B8").text("사진 미등록", MARGIN + infoW + 10, boxTop + rowH * 2.2, {
        width: photoW,
        align: "center",
      });
    }
    doc.y = ry;

    sectionTitle(doc, "발령사항");
    drawTable(
      doc,
      ["발령일", "구분", "발령명", "부서", "직책", "직급", "비고"],
      [55, 55, 70, 70, 55, 45, CONTENT_WIDTH - (55 + 55 + 70 + 70 + 55 + 45)],
      data.appointments
    );

    sectionTitle(doc, "학력사항");
    drawTable(
      doc,
      ["학력구분", "학교명", "전공", "학위", "입학년월", "졸업년월"],
      [60, 110, 90, 60, 65, CONTENT_WIDTH - (60 + 110 + 90 + 60 + 65)],
      data.education
    );

    sectionTitle(doc, "외부경력사항");
    drawTable(
      doc,
      ["근무회사", "직위", "담당업무", "입사일", "퇴사일"],
      [110, 70, 130, 65, CONTENT_WIDTH - (110 + 70 + 130 + 65)],
      data.career
    );

    sectionTitle(doc, "자격사항");
    drawTable(
      doc,
      ["자격증", "발급기관", "자격번호", "취득일", "만료일"],
      [110, 100, 90, 65, CONTENT_WIDTH - (110 + 100 + 90 + 65)],
      data.certifications
    );

    sectionTitle(doc, "상벌사항");
    drawTable(
      doc,
      ["구분", "종류", "사유", "기관", "시작일", "종료일"],
      [40, 90, 100, 80, 65, CONTENT_WIDTH - (40 + 90 + 100 + 80 + 65)],
      data.commendationDiscipline
    );

    doc.end();
  });
}
