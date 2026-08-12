/**
 * Resend REST API로 메일을 보낸다. RESEND_API_KEY가 설정 안 돼있으면
 * 조용히 건너뛴다(로컬 개발 등에서 메일 인프라 없이도 앱이 동작하도록).
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY가 설정되어 있지 않습니다." };
  }
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { sent: false, error: `Resend 응답 오류(${res.status}): ${body}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "메일 발송 중 알 수 없는 오류" };
  }
}
