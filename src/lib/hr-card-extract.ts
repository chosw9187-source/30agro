const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

export type ExtractedCareer = {
  company: string;
  title?: string;
  duties?: string;
  startDate?: string;
  endDate?: string;
};

export type ExtractedAppointment = {
  date: string;
  type?: string;
  department?: string;
  position?: string;
  role?: string;
  jobGrade?: string;
  note?: string;
};

export type ExtractedEducation = {
  level: string;
  school?: string;
  major?: string;
  degree?: string;
  admissionDate?: string;
  graduationDate?: string;
};

export type ExtractedHrCard = {
  employeeNumber: string;
  name: string;
  careerHistory: ExtractedCareer[];
  appointmentHistory: ExtractedAppointment[];
  education: ExtractedEducation[];
};

const TOOL_SCHEMA = {
  name: "extract_hr_card",
  description: "인사기록카드 이미지에서 사번, 경력사항, 발령사항, 학력사항을 추출한다.",
  input_schema: {
    type: "object",
    properties: {
      employeeNumber: { type: "string", description: "사번" },
      name: { type: "string", description: "성명(한글)" },
      careerHistory: {
        type: "array",
        description: "[외부경력사항] 표의 행들. 표가 비어있으면 빈 배열.",
        items: {
          type: "object",
          properties: {
            company: { type: "string", description: "근무회사" },
            title: { type: "string", description: "직위" },
            duties: { type: "string", description: "담당업무" },
            startDate: { type: "string", description: "입사일, YYYY-MM-DD" },
            endDate: { type: "string", description: "퇴사일, YYYY-MM-DD" },
          },
          required: ["company"],
        },
      },
      appointmentHistory: {
        type: "array",
        description: "[발령사항] 표의 행들. 표가 비어있으면 빈 배열.",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "발령일, YYYY-MM-DD" },
            type: { type: "string", description: "발령명" },
            department: { type: "string", description: "부서" },
            position: { type: "string", description: "직위" },
            role: { type: "string", description: "직책" },
            jobGrade: { type: "string", description: "직급" },
            note: { type: "string", description: "발령내역" },
          },
          required: ["date"],
        },
      },
      education: {
        type: "array",
        description: "[학력사항] 표의 행들. 표가 비어있으면 빈 배열.",
        items: {
          type: "object",
          properties: {
            level: { type: "string", description: "학력(예: 대졸, 고졸)" },
            school: { type: "string", description: "학교" },
            major: { type: "string", description: "전공학과" },
            degree: { type: "string", description: "학위" },
            admissionDate: { type: "string", description: "입학년월, YYYY-MM" },
            graduationDate: { type: "string", description: "졸업년월, YYYY-MM" },
          },
          required: ["level"],
        },
      },
    },
    required: ["employeeNumber", "name", "careerHistory", "appointmentHistory", "education"],
  },
};

/**
 * 인사기록카드에서 [개인사항]을 가리고 [가족사항] 이후를 잘라낸 이미지
 * (renderMaskedHrCardImage 결과물)를 Claude에게 읽혀서 사번/발령사항/
 * 학력사항만 구조화된 데이터로 뽑아낸다. 원본 PDF나 민감정보가 포함된
 * 부분은 여기로 전달되지 않는다.
 */
export async function extractHrCardFromImage(imageBuffer: Buffer): Promise<ExtractedHrCard> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY가 설정되어 있지 않습니다.");
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      tools: [TOOL_SCHEMA],
      tool_choice: { type: "tool", name: "extract_hr_card" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: imageBuffer.toString("base64"),
              },
            },
            {
              type: "text",
              text: "이 인사기록카드 이미지에서 사번, 성명, 발령사항, 학력사항을 정확히 추출해줘. 빈 표는 빈 배열로, 값이 없는 셀은 필드를 생략해줘.",
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API 오류(${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const toolUse = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  if (!toolUse) {
    throw new Error("이미지에서 데이터를 추출하지 못했습니다.");
  }
  return toolUse.input as ExtractedHrCard;
}
