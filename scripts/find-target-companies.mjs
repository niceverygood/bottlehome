#!/usr/bin/env node
// =====================================================================
// 타겟 기업 리서치 리스트 — 카카오 로컬 검색(장소 검색) API로 업종·지역
// 키워드에 맞는 업체를 찾아 CSV로 정리한다.
//
// 이 스크립트가 "하지 않는" 것: 이메일 주소를 수집하거나 자동으로
// 메일을 보내지 않는다. 정보통신망법 제50조의2가 이메일 주소를 자동
// 수집하는 프로그램 자체를 금지하기 때문이다. 여기서 나오는 건 공개된
// 업체명·주소·대표 전화번호뿐이고, 그다음은 사람이 직접 연락해서 동의를
// 구한 뒤(전화·명함교환 등) 이메일을 받아 진단 폼(/erpanalysis/)이나
// 뉴스레터 구독을 안내하는 식으로 이어가야 한다.
//
// 준비물: 카카오 디벨로퍼스(https://developers.kakao.com)에서 무료로
//         발급받는 REST API 키 1개.
//
// 사용법:
//   KAKAO_REST_API_KEY=xxxx node scripts/find-target-companies.mjs \
//     --query "정밀부품 제조" --region "인천" --pages 3 --out leads.csv
//
// 옵션:
//   --query   업종·업태 키워드 (필수, 여러 개면 콤마로 구분)
//   --region  지역 키워드 (선택, query 뒤에 붙여서 검색)
//   --pages   페이지당 15건, 최대 3페이지(카카오 API 자체 상한 45건) (기본 3)
//   --out     CSV 파일 경로 (기본 out/target-companies.csv)
// =====================================================================
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const KAKAO_API = "https://dapi.kakao.com/v2/local/search/keyword.json";

function parseArgs(argv) {
  const out = { pages: 3, out: "out/target-companies.csv" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--query") out.query = argv[++i];
    else if (a === "--region") out.region = argv[++i];
    else if (a === "--pages") out.pages = Math.max(1, Math.min(3, Number(argv[++i]) || 3));
    else if (a === "--out") out.out = argv[++i];
  }
  return out;
}

function toCsvValue(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function searchKeyword(apiKey, keyword, page) {
  const url = new URL(KAKAO_API);
  url.searchParams.set("query", keyword);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", "15");
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${apiKey}` } });
  if (!res.ok) {
    throw new Error(`카카오 API 오류 (${res.status}) — API 키가 올바른지, 사용량 한도를 넘지 않았는지 확인하세요.\n${await res.text()}`);
  }
  return res.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.KAKAO_REST_API_KEY;

  if (!apiKey) {
    console.error("KAKAO_REST_API_KEY 환경변수가 필요합니다.");
    console.error("무료 발급: https://developers.kakao.com → 애플리케이션 추가 → REST API 키 복사");
    process.exit(1);
  }
  if (!args.query) {
    console.error("--query 가 필요합니다. 예: --query \"정밀부품 제조\" --region \"인천\"");
    process.exit(1);
  }

  const keyword = args.region ? `${args.region} ${args.query}` : args.query;
  console.log(`검색어: "${keyword}" · 최대 ${args.pages}페이지(최대 ${args.pages * 15}건, 카카오 API 자체 상한 45건)`);

  const seen = new Map();
  for (let page = 1; page <= args.pages; page++) {
    let data;
    try {
      data = await searchKeyword(apiKey, keyword, page);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    for (const d of data.documents ?? []) {
      if (!seen.has(d.id)) {
        seen.set(d.id, {
          name: d.place_name,
          category: d.category_name,
          phone: d.phone || "",
          address: d.road_address_name || d.address_name || "",
          url: d.place_url,
        });
      }
    }
    if (data.meta?.is_end) break;
  }

  const rows = [...seen.values()];
  if (!rows.length) {
    console.log("검색 결과가 없습니다. 검색어를 바꿔서 다시 시도해 보세요.");
    return;
  }

  const header = ["업체명", "업종 분류", "전화번호", "주소", "카카오맵 링크", "접촉 상태", "메모"];
  const csv = [header, ...rows.map((r) => [r.name, r.category, r.phone, r.address, r.url, "", ""])]
    .map((row) => row.map(toCsvValue).join(","))
    .join("\n");

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, "﻿" + csv, "utf8"); // BOM — 엑셀에서 한글 깨짐 방지

  console.log(`${rows.length}개 업체를 ${args.out} 에 저장했습니다.`);
  console.log("다음 단계: 전화·방문 등으로 직접 연락해 동의를 구한 뒤, 이메일을 받으면");
  console.log("  · /erpanalysis/ 진단 링크를 안내하거나");
  console.log("  · 홈페이지 뉴스레터 구독(더블 옵트인)을 권해 주세요.");
  console.log("여기서 자동으로 이메일을 보내지 않습니다 — 동의 없는 이메일은 여전히 불법입니다.");
}

main();
