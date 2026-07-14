// =====================================================================
// ERP 무료 진단 백엔드 — 제출 저장 + Claude Sonnet 5 분석 프록시
//
// 프런트(/erpanalysis/)와의 계약:
//   POST  {answers, rule, aiPayload}          → {id}  (즉시 반환, 분석은 백그라운드)
//   GET   ?public_id=<id>                     → {ready, ai}
//   GET   ?public_id=<id>&full=1              → {ready, ai, answers}
//   GET   (x-admin-token)                     → 리드 목록
//   GET   ?id=<id> (x-admin-token)            → 리드 상세(answers·rule·ai 포함)
//
// 배포:   supabase functions deploy erp-analyze --no-verify-jwt
// 시크릿: supabase secrets set ANTHROPIC_API_KEY=... ERP_ADMIN_TOKEN=... [SLACK_WEBHOOK_URL=...]
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

// 진단 분석 모델 — 비용·속도 최적화를 위해 Sonnet 5로 고정한다.
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1800;
const TABLE = "erp_leads";

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

/* 응답을 이미 보낸 뒤에도 백그라운드 작업을 계속 실행한다 —
   모바일에서 고객이 화면을 꺼도 분석은 서버에서 끝까지 돈다. */
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

// ---------------------------------------------------------------------
// Claude Sonnet 5 호출 — 진단 리포트용 구조화 JSON 생성
// 가격은 절대 모델이 정하지 않는다: 프런트 규칙 엔진이 산정한 최적 제안가를
// 그대로 인용해 근거를 서술하게만 한다 (정찰제 일관성).
// ---------------------------------------------------------------------
const SYSTEM_PROMPT = `너는 '주식회사 바틀'의 수석 ERP 컨설턴트다. 한국 중소기업이 방금 제출한 ERP 진단 설문을 분석해 리포트 데이터를 만든다.
반드시 아래 스키마의 JSON 객체 하나만 출력한다. 코드펜스·설명·마크다운 금지.
{
 "firstLine": "고객 상황을 정확히 짚는 진단 첫 문장 (존댓말, 90자 이내)",
 "summary": "4~6문장. 회사 규모 → 현재 관리상태 → 필요한 기능 → 연동·커스텀 순서로 근거를 짚고, pricing.opt(만원 단위)가 왜 이 회사에 합리적인 최적 제안가인지 설명. 금액은 pricing 값을 그대로 인용",
 "customItems": [{"title":"항목명","desc":"한 줄 설명","module":"관련 모듈명"}],
 "extraMenus": [{"module":"모듈명","menu":"추천 메뉴명"}],
 "risks": ["실행 리스크·체크포인트, 최대 3개, 각 90자 이내"],
 "dashboard": {
   "kpis": [{"label":"지표명(12자 이내)","value":"예시값"}],
   "chartTitle": "차트 제목(16자 이내)",
   "chartLabels": ["라벨 5~6개"],
   "chartValues": [0],
   "alerts": ["업무 알림 예시 4~5개"]
 }
}
규칙:
- 가격을 새로 계산하거나 다른 금액을 제시하지 말 것. pricing의 opt·band·options만 인용한다.
- customItems는 customText가 있을 때 그 내용을 2~4개 실행 항목으로 분해한다. 없으면 [].
- extraMenus의 module은 modulesNow 또는 modulesLater에 있는 이름 중 하나만 쓴다. 2~4개.
- dashboard.kpis는 정확히 4개 — 이 업종 대표가 매일 아침 볼 지표. chartValues는 chartLabels와 같은 개수, 6~100 사이 숫자.
- alerts는 이 회사의 고민(pains)·연동 선택에 맞는 현실적 예시. 과장 금지.
- 전부 자연스러운 한국어 존댓말.`;

async function callClaude(payload: unknown) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  for (let attempt = 0; ; attempt++) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 40_000);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ctl.signal,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          temperature: 0.3,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: "진단 응답 데이터:\n" + JSON.stringify(payload) }],
        }),
      });
      clearTimeout(to);
      if (res.status === 429 || res.status >= 500) throw new Error("retryable " + res.status);
      if (!res.ok) throw Object.assign(new Error("anthropic " + res.status), { fatal: true });
      const data = await res.json();
      const text: string = Array.isArray(data.content)
        ? data.content.map((b: { text?: string }) => b.text ?? "").join("")
        : "";
      const m = text.match(/\{[\s\S]*\}/); // 서두·코드펜스가 섞여도 JSON만 추출
      return m ? JSON.parse(m[0]) : null;
    } catch (e) {
      clearTimeout(to);
      if ((e as { fatal?: boolean }).fatal || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

async function analyze(publicId: string, payload: unknown) {
  try {
    const ai = await callClaude(payload);
    await db.from(TABLE).update({ ai, ai_used: !!ai, ai_ready: true }).eq("public_id", publicId);
  } catch (_e) {
    // 분석 실패 시에도 ready 처리 — 프런트는 규칙 기반 리포트로 자동 폴백한다.
    await db.from(TABLE).update({ ai_ready: true }).eq("public_id", publicId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);

  // ---------- 제출 ----------
  if (req.method === "POST") {
    let body: { answers?: Record<string, unknown>; rule?: Record<string, unknown>; aiPayload?: unknown };
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const a = body.answers ?? {};
    const rule = body.rule ?? null;
    const publicId = crypto.randomUUID().replace(/-/g, "");
    const opt = rule && typeof rule.opt === "number" ? rule.opt : null;
    const { error } = await db.from(TABLE).insert({
      public_id: publicId,
      company: String(a.company ?? "").slice(0, 80),
      contact: String(a.contact ?? "").slice(0, 40),
      email: String(a.email ?? "").slice(0, 120) || null,
      person: String(a.person ?? "").slice(0, 40) || null,
      answers: a,
      rule,
      tier: (rule?.tier as string) ?? null,
      price_lo: opt ?? (rule?.lo as number) ?? null,
      price_hi: opt ?? (rule?.hi as number) ?? null,
    });
    if (error) return json({ error: "db insert failed" }, 500);
    waitUntil(analyze(publicId, body.aiPayload ?? {}));
    slackNotify(
      `🆕 ERP 진단 신청 — ${a.company ?? "?"} (${a.contact ?? "-"})` +
      ` · ${rule?.tier ?? "-"} · 최적 제안가 ${opt != null ? opt + "만원" : "-"}` +
      `\n어드민: https://bottlecorp.kr/erpanalysis/admin/`,
    );
    return json({ id: publicId });
  }

  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  // ---------- 공개 조회 (리포트 폴링·공유 링크·대시보드) ----------
  const pid = url.searchParams.get("public_id");
  if (pid) {
    const { data } = await db.from(TABLE)
      .select("public_id, ai, ai_ready, answers").eq("public_id", pid).maybeSingle();
    if (!data) return json({ error: "not found" }, 404);
    const out: Record<string, unknown> = { id: data.public_id, ready: !!data.ai_ready, ai: data.ai ?? null };
    if (url.searchParams.get("full")) out.answers = data.answers;
    return json(out);
  }

  // ---------- 관리자 ----------
  const token = req.headers.get("x-admin-token") ?? "";
  const admin = Deno.env.get("ERP_ADMIN_TOKEN") ?? "";
  if (!admin || token !== admin) return json({ error: "unauthorized" }, 401);

  const id = url.searchParams.get("id");
  if (id) {
    const { data } = await db.from(TABLE).select("*").eq("public_id", id).maybeSingle();
    if (!data) return json({ error: "not found" }, 404);
    return json({ ...data, id: data.public_id });
  }
  const { data } = await db.from(TABLE)
    .select("public_id, created_at, company, contact, person, tier, price_lo, price_hi, ai_used")
    .order("created_at", { ascending: false })
    .limit(500);
  return json((data ?? []).map((r) => ({ ...r, id: r.public_id })));
});
