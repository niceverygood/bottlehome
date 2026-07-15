// =====================================================================
// 리드 자동 육성 메일 — 이미 ERP 진단을 신청하며 상담 목적으로 연락처를
// 남긴 고객에게만 보낸다. 새로 이메일 주소를 수집하지 않는다 — 그건
// 정보통신망법 제50조의2 위반이다.
//
// 단계: 1) 진단 1일 후 리포트 다시보기 안내 → 2) 4일 후 확인 리마인드 →
//       3) 7일 후 마지막 안내. 채팅으로 이미 응답한 리드는 2·3단계를 건너뛴다.
//
// 계약:
//   GET (x-cron-secret 헤더 일치) → 대상 리드 조회 → 단계별 메일 발송 → 상태 갱신
//   GET ?unsubscribe=<public_id>  → 공개, 수신거부 처리 + 안내 HTML 반환
//
// 배포: supabase functions deploy erp-nurture --no-verify-jwt
// 시크릿: RESEND_API_KEY, CRON_SECRET, (선택) MAIL_FROM
// 스케줄: .github/workflows/erp-nurture-cron.yml 이 매일 자동 호출한다.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const LEADS = "erp_leads";
const MSGS = "erp_chat_messages";
const FN_URL = "https://joycuxdxlqhztyomnimh.supabase.co/functions/v1/erp-nurture";
const FOOTER_ADDR =
  "주식회사 바틀(Bottle Inc.) · 대표 한승수 · 사업자등록번호 376-87-01076<br>서울 강남구 테헤란로2길 27, 15층 · hss@bottlecorp.kr";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Lead = {
  public_id: string; email: string; company: string | null; person: string | null;
  tier: string | null; price_lo: number | null; followup_stage: number;
  followup_sent_at: string | null; created_at: string;
};

function wrap(bodyHtml: string) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><body style="margin:0;background:#EFECE7;padding:32px 16px;font-family:'Pretendard',-apple-system,'Malgun Gothic',sans-serif;color:#26262A">${bodyHtml}</body></html>`;
}

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

function fmtWon(n: number | null) {
  if (n == null) return "-";
  return n >= 10000 ? (n % 10000 ? (n / 10000).toFixed(1) : String(n / 10000)) + "억" : n.toLocaleString() + "만";
}

function template(stage: number, lead: Lead, unsubUrl: string) {
  const reportUrl = `https://bottlecorp.kr/erpanalysis/?lead=${lead.public_id}`;
  const greet = lead.person ? `${lead.person}님, ` : "";
  const company = lead.company || "고객";
  const priceLine = lead.tier
    ? `<p>지난번 진단 결과 <b>${lead.tier}</b> 구성 · 최적 제안가 <b>${fmtWon(lead.price_lo)}원</b> 대(VAT 별도)로 안내드렸습니다.</p>`
    : "";
  const footer = `<hr style="border:none;border-top:1px solid #E4E0DA;margin:24px 0 14px">
    <p style="font-size:11.5px;color:#66666C;line-height:1.7">
      이 메일은 ${company}님께서 ERP 진단을 신청하며 남겨주신 연락처로, 상담 안내 목적에 한해 발송됩니다.<br>
      ${FOOTER_ADDR}<br>
      더 이상 안내를 원하지 않으시면 <a href="${unsubUrl}">수신거부</a>를 눌러주세요.
    </p>`;
  const shell = (inner: string) =>
    wrap(`<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 26px">${inner}${footer}</div>`);

  if (stage === 1) return {
    subject: `${company} ERP 진단 리포트 다시 보기 + 상담 안내`,
    html: shell(`
      <p>${greet}안녕하세요, 주식회사 바틀입니다.</p>
      <p>지난번 신청하신 ERP 진단 리포트를 다시 보실 수 있도록 링크를 안내드립니다.</p>
      ${priceLine}
      <p style="margin:20px 0"><a href="${reportUrl}" style="background:#141414;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">리포트 다시 보기</a></p>
      <p>궁금하신 점 있으시면 이 메일에 바로 회신 주세요 — 담당자가 확인 후 30분 무료 상담을 도와드립니다.</p>`),
  };
  if (stage === 2) return {
    subject: `아직 도입 결정 전이신가요? — ${company} ERP 상담`,
    html: shell(`
      <p>${greet}안녕하세요, 주식회사 바틀입니다.</p>
      <p>ERP 도입을 검토하시면서 데이터 이관, 비용, 일정 중 걸리는 부분이 있으실 텐데 — 어떤 것이든 이 메일에 회신 주시면 담당자가 바로 답변드립니다.</p>
      <p style="margin:20px 0"><a href="${reportUrl}" style="background:#141414;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">진단 리포트 다시 보기</a></p>`),
  };
  return {
    subject: `${company}님, 마지막으로 안내드립니다`,
    html: shell(`
      <p>${greet}안녕하세요, 주식회사 바틀입니다.</p>
      <p>ERP 진단 관련 안내는 이번이 마지막입니다. 이후에도 필요하실 때 언제든 이 메일에 회신 주시면 다시 상담 도와드립니다.</p>`),
  };
}

function unsubscribePage(ok: boolean) {
  return new Response(
    wrap(`<div style="max-width:380px;margin:80px auto 0;background:#fff;border-radius:14px;padding:32px 28px;text-align:center">
      <p style="font-size:16px;font-weight:800;color:#141414">${ok ? "수신거부가 처리되었습니다" : "이미 처리되었거나 잘못된 링크입니다"}</p>
      <p style="font-size:13px;color:#66666C;margin-top:8px">${ok ? "앞으로 안내 메일이 발송되지 않습니다." : ""}</p>
    </div>`),
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  const unsub = url.searchParams.get("unsubscribe");
  if (unsub) {
    const { error } = await db.from(LEADS).update({ unsubscribed: true }).eq("public_id", unsub);
    return unsubscribePage(!error);
  }

  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }

  const day = 24 * 60 * 60 * 1000;
  const cutoff1 = new Date(Date.now() - 1 * day).toISOString();
  const cutoff2 = new Date(Date.now() - 4 * day).toISOString();
  const cutoff3 = new Date(Date.now() - 7 * day).toISOString();
  const nowIso = new Date().toISOString();

  const { data: candidates, error } = await db.from(LEADS)
    .select("public_id, email, company, person, tier, price_lo, followup_stage, followup_sent_at, created_at")
    .not("email", "is", null)
    .eq("unsubscribed", false)
    .eq("ai_ready", true)
    .lt("followup_stage", 3)
    .limit(200);
  if (error) {
    return new Response(JSON.stringify({ error: "query failed" }), { status: 500, headers: { "content-type": "application/json" } });
  }

  let sent = 0, skipped = 0, failed = 0;
  for (const lead of (candidates ?? []) as Lead[]) {
    if (!lead.email) { skipped++; continue; }
    const stage = lead.followup_stage;
    const due =
      (stage === 0 && lead.created_at < cutoff1) ||
      (stage === 1 && !!lead.followup_sent_at && lead.followup_sent_at < cutoff2) ||
      (stage === 2 && !!lead.followup_sent_at && lead.followup_sent_at < cutoff3);
    if (!due) { skipped++; continue; }

    if (stage >= 1) {
      const { count } = await db.from(MSGS).select("id", { count: "exact", head: true })
        .eq("lead_id", lead.public_id).eq("sender", "customer");
      if ((count ?? 0) > 0) { skipped++; continue; } // 이미 채팅으로 응답 — 더 재촉하지 않는다
    }

    const nextStage = stage + 1;
    const unsubUrl = `${FN_URL}?unsubscribe=${lead.public_id}`;
    const t = template(nextStage, lead, unsubUrl);
    try {
      await sendEmail(lead.email, t.subject, t.html);
      await db.from(LEADS).update({ followup_stage: nextStage, followup_sent_at: nowIso }).eq("public_id", lead.public_id);
      sent++;
    } catch (e) {
      console.error(`[erp-nurture] 발송 실패 (${lead.public_id}, stage ${nextStage}):`, e instanceof Error ? e.message : e);
      failed++;
    }
  }

  return new Response(JSON.stringify({ sent, skipped, failed }), { headers: { "content-type": "application/json" } });
});
