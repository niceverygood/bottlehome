// =====================================================================
// 웹사이트 옵트인 구독 — 방문자가 이메일을 직접 남기고, 확인 메일의 링크를
// 눌러야 실제로 구독이 확정된다(더블 옵트인 — 동의의 법적 증빙 확보).
// 확정(confirmed) 전에는 뉴스레터가 발송되지 않는다.
//
// 계약:
//   POST {email, company?}      → 확인 메일 발송, {ok:true}
//   GET  ?confirm=<token>       → 구독 확정 처리 + 안내 HTML
//   GET  ?unsubscribe=<token>   → 구독 해지 처리 + 안내 HTML
//
// 배포: supabase functions deploy erp-subscribe --no-verify-jwt
// 시크릿: RESEND_API_KEY, (선택) MAIL_FROM
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const TABLE = "erp_subscribers";
const FN_URL = "https://joycuxdxlqhztyomnimh.supabase.co/functions/v1/erp-subscribe";
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, "content-type": "application/json" } });
const page = (bodyHtml: string) =>
  new Response(
    `<!doctype html><html lang="ko"><meta charset="utf-8"><body style="margin:0;background:#EFECE7;padding:32px 16px;font-family:'Pretendard',-apple-system,'Malgun Gothic',sans-serif;color:#26262A">
      <div style="max-width:380px;margin:80px auto 0;background:#fff;border-radius:14px;padding:32px 28px;text-align:center">${bodyHtml}</div>
    </body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

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
  const url = new URL(req.url);

  const confirm = url.searchParams.get("confirm");
  if (confirm) {
    const { data } = await db.from(TABLE).select("id, status").eq("confirm_token", confirm).maybeSingle();
    if (!data) return page(`<p style="font-weight:800;font-size:16px">잘못되었거나 만료된 링크입니다</p>`);
    if (data.status !== "unsubscribed") {
      await db.from(TABLE).update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", data.id);
    }
    return page(`<p style="font-weight:800;font-size:16px">구독이 확정되었습니다</p>
      <p style="font-size:13px;color:#66666C;margin-top:8px">앞으로 유용한 소식을 이메일로 보내드립니다. 언제든 메일 하단 링크로 수신거부할 수 있습니다.</p>`);
  }

  const unsub = url.searchParams.get("unsubscribe");
  if (unsub) {
    await db.from(TABLE).update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() }).eq("confirm_token", unsub);
    return page(`<p style="font-weight:800;font-size:16px">수신거부가 처리되었습니다</p>`);
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: { email?: string; company?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 160);
  const company = String(body.company ?? "").trim().slice(0, 80) || null;
  if (!isEmail(email)) return json({ error: "invalid email" }, 400);

  const newToken = crypto.randomUUID().replace(/-/g, "");
  const { data: existing } = await db.from(TABLE).select("id, status, confirm_token").eq("email", email).maybeSingle();

  let useToken = newToken;
  if (existing) {
    if (existing.status === "confirmed") return json({ ok: true, already: true });
    useToken = existing.confirm_token;
    await db.from(TABLE).update({ company, status: "pending" }).eq("id", existing.id);
  } else {
    const { error: insErr } = await db.from(TABLE).insert({ email, company, source: "homepage", status: "pending", confirm_token: newToken });
    if (insErr) return json({ error: "signup failed" }, 500);
  }

  const confirmUrl = `${FN_URL}?confirm=${useToken}`;
  try {
    await sendEmail(email, "구독 확인을 완료해 주세요 — 주식회사 바틀",
      `<!doctype html><html lang="ko"><meta charset="utf-8"><body style="margin:0;background:#EFECE7;padding:32px 16px;font-family:'Pretendard',-apple-system,'Malgun Gothic',sans-serif;color:#26262A">
        <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 26px">
          <p>안녕하세요, 주식회사 바틀입니다.</p>
          <p>아래 버튼을 눌러야 구독이 확정됩니다 — 누르시기 전까지는 어떤 메일도 발송되지 않습니다.</p>
          <p style="margin:20px 0"><a href="${confirmUrl}" style="background:#141414;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">구독 확정하기</a></p>
          <p style="font-size:11.5px;color:#66666C">본인이 신청하지 않았다면 이 메일을 무시해 주세요 — 확정하지 않으면 자동으로 만료됩니다.</p>
        </div></body></html>`);
  } catch (_e) {
    return json({ error: "email send failed" }, 502);
  }
  return json({ ok: true });
});
