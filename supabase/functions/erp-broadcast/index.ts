// =====================================================================
// 구독자 일반 발송 — 웹사이트에서 더블 옵트인으로 확정 구독한 사람에게만,
// 관리자가 직접 작성한 제목·본문을 보낸다. 자동 수집·자동 작성 없음 —
// 매번 사람이 내용을 확인하고 누른다. (광고) 라벨은 정보통신망법 제50조에
// 따라 항상 제목에 붙인다.
//
// 계약:
//   GET  (x-admin-token)                → {confirmed: 수}  — 발송 대상 수 미리보기
//   POST (x-admin-token) {subject, html} → {sent, failed, total}
//
// 배포: supabase functions deploy erp-broadcast --no-verify-jwt
// 시크릿: RESEND_API_KEY, ERP_ADMIN_TOKEN, (선택) MAIL_FROM
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const TABLE = "erp_subscribers";
const FN_URL = "https://joycuxdxlqhztyomnimh.supabase.co/functions/v1/erp-subscribe";
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, "content-type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY not set");
  const from = Deno.env.get("MAIL_FROM") || "주식회사 바틀 <hss@bottlecorp.kr>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const admin = Deno.env.get("ERP_ADMIN_TOKEN") ?? "";
  const token = req.headers.get("x-admin-token") ?? "";
  if (!admin || token !== admin) return json({ error: "unauthorized" }, 401);

  if (req.method === "GET") {
    const { count } = await db.from(TABLE).select("id", { count: "exact", head: true }).eq("status", "confirmed");
    return json({ confirmed: count ?? 0 });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: { subject?: string; html?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const subject = String(body.subject ?? "").trim().slice(0, 200);
  const contentHtml = String(body.html ?? "").trim();
  if (!subject || !contentHtml) return json({ error: "subject and html required" }, 400);

  const { data: subs, error } = await db.from(TABLE).select("email, confirm_token").eq("status", "confirmed").limit(2000);
  if (error) return json({ error: "query failed" }, 500);

  let sent = 0, failed = 0;
  for (const s of subs ?? []) {
    const unsubUrl = `${FN_URL}?unsubscribe=${s.confirm_token}`;
    const full = `<!doctype html><html lang="ko"><meta charset="utf-8"><body style="margin:0;background:#EFECE7;padding:32px 16px;font-family:'Pretendard',-apple-system,'Malgun Gothic',sans-serif;color:#26262A">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 26px">
        ${contentHtml}
        <hr style="border:none;border-top:1px solid #E4E0DA;margin:24px 0 14px">
        <p style="font-size:11.5px;color:#66666C;line-height:1.7">
          주식회사 바틀(Bottle Inc.) · 대표 한승수 · 사업자등록번호 376-87-01076<br>
          서울 강남구 테헤란로2길 27, 15층 · hss@bottlecorp.kr<br>
          더 이상 받고 싶지 않으시면 <a href="${unsubUrl}">수신거부</a>를 눌러주세요.
        </p>
      </div></body></html>`;
    try { await sendEmail(s.email, `(광고) ${subject}`, full); sent++; }
    catch (e) { console.error(`[erp-broadcast] 발송 실패 (${s.email}):`, e instanceof Error ? e.message : e); failed++; }
  }
  return json({ sent, failed, total: (subs ?? []).length });
});
