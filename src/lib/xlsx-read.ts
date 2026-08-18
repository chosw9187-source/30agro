import * as XLSX from "xlsx";
import AdmZip from "adm-zip";

/** 스타일 정보 없이도 값 추출에는 문제없으므로, 최소한의 빈 스타일시트로 대체한다. */
const EMPTY_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`;

/**
 * 일부 사내/ERP 내보내기 파일은 스타일 정보(xl/styles.xml)가 xlsx 파서가
 * 기대하는 구조와 달라서 읽다가 예외가 난다 — 우리는 셀 값만 필요하고
 * 서식은 전혀 안 쓰므로, 스타일시트를 빈 걸로 바꿔치기해서 다시 읽는다.
 */
function sanitizeXlsxStyles(buffer: Buffer): Buffer {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("xl/styles.xml");
  if (entry) {
    zip.updateFile(entry, Buffer.from(EMPTY_STYLES_XML, "utf8"));
  }
  return zip.toBuffer();
}

export function readWorkbook(buffer: Buffer): XLSX.WorkBook {
  try {
    return XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return XLSX.read(sanitizeXlsxStyles(buffer), { type: "buffer", cellDates: true });
  }
}
