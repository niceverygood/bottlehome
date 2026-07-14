// =====================================================================
// 채팅 상담 백엔드 — 고객(리드 링크가 곧 접근 키) ↔ 관리자(토큰) + Slack 알림
//
// 프런트와의 계약:
//   고객 (/erpanalysis/  — 토큰 없음):
//     GET  ?leadId=<public_id>&after=<msgId>  → {messages:[{id,sender,body,created_at}]}
//     POST {leadId, sender:"customer", body}  → {ok, id}
//   관리자 (/erpanalysis/admin/chat/ — x-admin-token):
//     GET  ?threads=1                         → {threads:[{leadId,company,contact,tier,lastMessage,lastSender,lastAt,unread}]}
//     GET  ?leadId=&after=                    → 위와 동일 + 읽음 처리
//     POST {leadId, sender:"admin", body}     → {ok, id}
//
// 배포:   supabase functions deploy erp-chat --no-verify-jwt
// 시크릿: supabase secrets set ERP_ADMIN_TOKEN=... [SLACK_WEBHOOK_URL=...]
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const MSGS = "erp_chat_messages";
const READS = "erp_chat_reads";
const LEADS = "erp_leads";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, "content-type": "application/json" } });

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const waitUntil = (p: Promise<unknown>) => {
  const er = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(p);
  else p.catch(() => {});
};

function slackNotify(text: string) {
  const hook = Deno.env.get("SLACK_WEBHOOK_URL");
  if (!hook) return;
  waitUntil(fetch(hook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => {}));
}

const isAdmin = (req: Request) => {
  const admin = Deno.env.get("ERP_ADMIN_TOKEN") ?? "";
  return !!admin && (req.headers.get("x-admin-token") ?? "") === admin;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);

  // ---------- 메시지 전송 ----------
  if (req.method === "POST") {
    let body: { leadId?: string; sender?: string; body?: string };
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const leadId = String(body.leadId ?? "").slice(0, 64);
    const sender = body.sender === "admin" ? "admin" : "customer";
    const text = String(body.body ?? "").trim().slice(0, 2000);
    if (!leadId || !text) return json({ error: "leadId and body required" }, 400);
    if (sender === "admin" && !isAdmin(req)) return json({ error: "unauthorized" }, 401);

    const { data: lead } = await db.from(LEADS)
      .select("public_id, company, contact").eq("public_id", leadId).maybeSingle();
    if (!lead) return json({ error: "lead not found" }, 404);

    const { data: inserted, error } = await db.from(MSGS)
      .insert({ lead_id: leadId, sender, body: text }).select("id").single();
    if (error) return json({ error: "db insert failed" }, 500);

    if (sender === "customer") {
      slackNotify(
        `💬 ERP 채팅 — ${lead.company || leadId}${lead.contact ? " (" + lead.contact + ")" : ""}\n` +
        `“${text.slice(0, 180)}”\n답변하기: https://bottlecorp.kr/erpanalysis/admin/chat/`,
      );
    } else {
      // 관리자가 답장하면 해당 스레드는 읽음 처리
      await db.from(READS).upsert({ lead_id: leadId, admin_last_read_id: inserted.id });
    }
    return json({ ok: true, id: inserted.id });
  }

  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  // ---------- 스레드 목록 (관리자) ----------
  if (url.searchParams.get("threads")) {
    if (!isAdmin(req)) return json({ error: "unauthorized" }, 401);
    const { data: msgs } = await db.from(MSGS)
      .select("id, lead_id, sender, body, created_at")
      .order("id", { ascending: false }).limit(2000);
    const { data: reads } = await db.from(READS).select("lead_id, admin_last_read_id");
    const readMap = new Map((reads ?? []).map((r) => [r.lead_id, r.admin_last_read_id as number]));

    type Msg = { id: number; lead_id: string; sender: string; body: string; created_at: string };
    const byLead = new Map<string, { last: Msg; unread: number }>();
    for (const m of (msgs ?? []) as Msg[]) {
      let t = byLead.get(m.lead_id);
      if (!t) { t = { last: m, unread: 0 }; byLead.set(m.lead_id, t); }
      if (m.sender === "customer" && m.id > (readMap.get(m.lead_id) ?? 0)) t.unread++;
    }
    const leadIds = [...byLead.keys()];
    const { data: leads } = leadIds.length
      ? await db.from(LEADS).select("public_id, company, contact, tier").in("public_id", leadIds)
      : { data: [] };
    const leadMap = new Map((leads ?? []).map((l) => [l.public_id, l]));

    const threads = leadIds.map((id) => {
      const t = byLead.get(id)!;
      const l = leadMap.get(id) ?? {} as { company?: string; contact?: string; tier?: string };
      return {
        leadId: id, company: l.company ?? null, contact: l.contact ?? null, tier: l.tier ?? null,
        lastMessage: t.last.body, lastSender: t.last.sender, lastAt: t.last.created_at,
        unread: t.unread,
      };
    }).sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
    return json({ threads });
  }

  // ---------- 대화 조회 (고객·관리자 공용) ----------
  const leadId = url.searchParams.get("leadId");
  if (leadId) {
    const after = Number(url.searchParams.get("after") ?? 0) || 0;
    const { data: msgs } = await db.from(MSGS)
      .select("id, sender, body, created_at")
      .eq("lead_id", leadId).gt("id", after)
      .order("id", { ascending: true }).limit(200);
    // 관리자가 조회하면 읽음 커서를 전진시킨다 (뱃지·알림의 기준)
    if (isAdmin(req) && msgs && msgs.length) {
      const maxId = msgs[msgs.length - 1].id;
      await db.from(READS).upsert({ lead_id: leadId, admin_last_read_id: maxId });
    }
    return json({ messages: msgs ?? [] });
  }

  return json({ error: "bad request" }, 400);
});
