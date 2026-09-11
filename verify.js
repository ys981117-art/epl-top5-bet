/* index.html 의 실제 <script> 를 그대로 실행해 검증한다.
   로직을 복사하지 않으므로 앱과 검증이 어긋날 수 없다.
   실행: node verify.js            (실제 ESPN API 호출)
        node verify.js --fast     (시뮬 1000회로 축소) */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FAST = process.argv.includes("--fast");
let pass = 0, fail = 0;
const T = (name, cond, detail) => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (detail ? "\n        " + detail : "")); }
};

/* ---------- 최소 DOM 스텁 ---------- */
function mkEl(id){
  const el = {
    id, innerHTML:"", textContent:"", dataset:{}, style:{}, disabled:false,
    classList:{ _s:new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)},
                toggle(c,f){ f===undefined ? (this._s.has(c)?this._s.delete(c):this._s.add(c)) : (f?this._s.add(c):this._s.delete(c)) },
                contains(c){return this._s.has(c)} },
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return mkEl("stub") }, querySelectorAll(){ return [] },
    insertAdjacentHTML(pos, html){ this.innerHTML += html },
    closest(){ return null }, appendChild(){}, remove(){}
  };
  return el;
}
const els = {};
const getEl = id => (els[id] = els[id] || mkEl(id));
const document = {
  getElementById: getEl,
  querySelectorAll: () => [],
  querySelector: () => mkEl("stub"),
  addEventListener: () => {},
  body: mkEl("body")
};
const store = {};
const sessionStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k,v) => { store[k] = v; },
  removeItem: k => { delete store[k]; }
};

/* ---------- <script> 추출 ---------- */
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("index.html 에서 script 블록을 찾지 못했습니다"); process.exit(1); }
let code = m[1];
if (FAST) code = code.replace(/simRuns:\s*10000/, "simRuns: 1000");

const ctx = {
  document, sessionStorage, fetch, console, setTimeout, clearTimeout,
  Math, Date, JSON, Promise, Number, String, Object, Array, Error,
  Float64Array, Int32Array, parseInt, parseFloat, isNaN,
  window: { scrollTo: () => {} },
  location: { reload: () => {} }
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code + "\n;globalThis.__x = {TBL_W,TBL_WD,gauss,evState,compScore,getJSON,API,teamPoints,scoreOne,rankPlayers,matchProbs,simulate,buildElo,applyPlayedMatches,resolveTeamId,resolvePredictions,fetchStandings,fetchAllFixtures,rankMapFrom,S,CFG,PREDICTIONS,TEAM_KO};", ctx);
const X = ctx.__x;

/* ============================================================ */
(async () => {

console.log("\n[1] 채점 규칙 단위 검증표  (AC-4)");
console.log("    예측순위 x 실제순위 -> 기대점수");
const grid = [
  // pred, actual, expected
  [1,1,6],[1,2,5],[1,3,4],[1,4,3],[1,5,3],[1,6,0],[1,20,0],[1,null,0],
  [2,1,5],[2,2,6],[2,3,5],[2,4,4],[2,5,3],[2,6,0],
  [3,1,4],[3,2,5],[3,3,6],[3,4,5],[3,5,4],[3,6,0],
  [4,1,3],[4,2,4],[4,3,5],[4,4,6],[4,5,5],[4,6,0],
  [5,1,3],[5,2,3],[5,3,4],[5,4,5],[5,5,6],[5,6,0]
];
let gridBad = [];
for (const [p,a,e] of grid){
  const got = X.teamPoints(p,a);
  if (got !== e) gridBad.push(`pred${p} actual${a}: ${got} != ${e}`);
}
T("32개 조합 전부 기대값 일치", gridBad.length === 0, gridBad.join(" | "));
T("팀당 최대 6점", Math.max(...grid.map(g => X.teamPoints(g[0], g[1]))) === 6);
T("5위권 밖은 0점", [6,7,10,20].every(r => X.teamPoints(1,r) === 0));
T("3칸 이상 차이는 3점 (적중 보너스만)", X.teamPoints(1,4) === 3 && X.teamPoints(1,5) === 3 && X.teamPoints(5,1) === 3);

console.log("\n[2] 만점/합계 정합성  (AC-12)");
const perfectRank = {a:1,b:2,c:3,d:4,e:5};
const perfect = X.scoreOne({picks:["a","b","c","d","e"]}, perfectRank);
T("완전 적중 = 30점 만점", perfect.total === 30, "실제 " + perfect.total);
T("총점 = 팀별 점수 합", perfect.total === perfect.rows.reduce((s,r)=>s+r.pts,0));
const worst = X.scoreOne({picks:["x","y","z","w","v"]}, perfectRank);
T("전부 5위권 밖 = 0점", worst.total === 0);
const reversed = X.scoreOne({picks:["e","d","c","b","a"]}, perfectRank);
T("완전 역순 = 20점 (3+4+6+4+3)", reversed.total === 20, "실제 " + reversed.total);
let over = false;
for (let i=0;i<3000;i++){
  const ids=["a","b","c","d","e","f","g"];
  const picks=[]; while(picks.length<5){ const t=ids[Math.floor(Math.random()*7)]; if(!picks.includes(t)) picks.push(t); }
  const s=X.scoreOne({picks}, perfectRank);
  if (s.total>30 || s.total<0 || s.total!==s.rows.reduce((x,r)=>x+r.pts,0)) over=true;
}
T("무작위 3000회 — 0~30 범위 이탈 없음, 합계 일치", !over);

console.log("\n[3] 동점 처리");
const tie = X.rankPlayers([
  {name:"가", total:20, exact:1, inTop5:5},
  {name:"나", total:20, exact:3, inTop5:5},
  {name:"다", total:20, exact:1, inTop5:4},
  {name:"라", total:25, exact:2, inTop5:5}
]);
T("총점 우선", tie[0].name === "라" && tie[0].rank === 1);
T("총점 같으면 정확 개수", tie[1].name === "나" && tie[1].rank === 2);
T("그다음 5위권 적중 개수", tie[2].name === "가" && tie[3].name === "다");

console.log("\n[4] 경기 확률 모델");
const even = X.matchProbs(1500,1500);
const sum = even.pW + even.pD + even.pL;
T("확률 합 = 1", Math.abs(sum-1) < 1e-9, "합 " + sum);
T("실력 동일 + 홈이점 -> 홈 우세", even.pW > even.pL);
T("무승부율이 현실 범위(20~30%)", even.pD > 0.20 && even.pD < 0.30, (even.pD*100).toFixed(1) + "%");
const gap = X.matchProbs(1800,1300);
T("강팀 승률 > 80%", gap.pW > 0.80, (gap.pW*100).toFixed(1) + "%");
T("실력차 크면 무승부 감소", gap.pD < even.pD);
const away = X.matchProbs(1300,1800);
T("원정 약팀 승률 < 10%", away.pW < 0.10, (away.pW*100).toFixed(1) + "%");
// 시뮬이 쓰는 룩업표가 원래 수식과 일치하는지 (파리티)
let tblErr = 0;
for (let dr = -700; dr <= 700; dr += 7){
  const exact = X.matchProbs(1500 + dr - X.CFG.homeAdv, 1500);
  const i = ((dr + 800) / 2) | 0;
  tblErr = Math.max(tblErr, Math.abs(X.TBL_W[i] - exact.pW), Math.abs(X.TBL_WD[i] - (exact.pW+exact.pD)));
}
T("확률 룩업표가 수식과 일치 (오차 < 0.005)", tblErr < 0.005, "최대오차 " + tblErr.toFixed(5));
// 정규분포 샘플러
const gs = []; for (let i=0;i<20000;i++) gs.push(X.gauss());
const gm = gs.reduce((a,b)=>a+b,0)/gs.length;
const gsd = Math.sqrt(gs.reduce((a,b)=>a+(b-gm)*(b-gm),0)/gs.length);
T("정규분포 샘플러 평균 0 / 표준편차 1", Math.abs(gm) < 0.04 && Math.abs(gsd-1) < 0.04,
  "평균 " + gm.toFixed(4) + ", sd " + gsd.toFixed(4));

console.log("\n[5] 실제 ESPN 데이터 연결");
let cur, prev, fixtures;
try{
  cur = await X.fetchStandings(X.CFG.season);
  T("현재 순위 20팀 수신", cur.length === 20, "받은 팀 수 " + cur.length);
  T("1위부터 20위까지 순위가 빠짐없음",
    JSON.stringify(cur.map(t=>t.rank)) === JSON.stringify([...Array(20)].map((_,i)=>i+1)));
  T("승점이 숫자로 들어옴", cur.every(t => Number.isFinite(t.pts)));
  console.log("        현재 1~5위: " + cur.slice(0,5).map(t=>t.rank+"."+t.short+"("+t.pts+")").join("  "));
}catch(e){ T("현재 순위 수신", false, e.message); }

try{
  prev = await X.fetchStandings(X.CFG.prevSeason);
  T("전시즌 최종 순위 20팀 수신", prev.length === 20);
  T("전시즌은 38경기 완주", prev.every(t => t.gp === 38), "gp " + [...new Set(prev.map(t=>t.gp))].join(","));
}catch(e){ T("전시즌 순위 수신", false, e.message); }

const t0 = Date.now();
try{
  fixtures = await X.fetchAllFixtures();
  const dt = Date.now() - t0;
  T("시즌 전체 일정 380경기", fixtures.length === 380, "받은 경기 수 " + fixtures.length);
  T("일정 수신 10초 이내", dt < 10000, dt + "ms");
  const played = fixtures.filter(f => f.state === "post");
  const sumGp = cur.reduce((s,t)=>s+t.gp, 0);
  T("치른 경기 x2 = 팀별 경기수 합", played.length*2 === sumGp,
    played.length + "*2=" + played.length*2 + " vs " + sumGp);
  const ids = new Set(cur.map(t=>t.id));
  T("일정의 모든 팀이 순위표에 존재",
    fixtures.every(f => ids.has(f.homeId) && ids.has(f.awayId)));
  T("중복 경기 없음", new Set(fixtures.map(f=>f.id)).size === fixtures.length);
  console.log("        치른 경기 " + played.length + " / 남은 경기 " + (fixtures.length-played.length));
}catch(e){ T("일정 수신", false, e.message); }

console.log("\n[6] 순위표 자체 정합성 (교차검증)");
if (cur){
  T("승+무+패 = 경기수", cur.every(t => t.w+t.d+t.l === t.gp));
  T("승점 = 승*3 + 무", cur.every(t => t.pts === t.w*3 + t.d));
  T("득실차 = 득점 - 실점", cur.every(t => t.gd === t.gf - t.ga));
  const totGf = cur.reduce((s,t)=>s+t.gf,0), totGa = cur.reduce((s,t)=>s+t.ga,0);
  T("리그 전체 득점 = 실점", totGf === totGa, totGf + " vs " + totGa);
}

console.log("\n[7] Elo 구성");
let elo;
if (cur && prev && fixtures){
  elo = X.buildElo(prev, cur);
  const promoted = cur.filter(t => !prev.some(p => p.id === t.id));
  T("승격팀이 식별됨", promoted.length > 0, promoted.map(t=>t.short).join(", "));
  T("승격팀은 기본 Elo", promoted.every(t => elo[t.id] === X.CFG.promotedElo));
  // 강등팀은 26-27 Elo 맵에 없는 것이 정상 -> 잔류팀끼리만 비교
  const stayed = prev.filter(p => cur.some(c => c.id === p.id));
  const best = stayed[0], worst = stayed[stayed.length-1];
  T("전시즌 성적 순서가 Elo 순서와 일치 (잔류팀)", elo[best.id] > elo[worst.id],
    best.short+" "+Math.round(elo[best.id])+" vs "+worst.short+" "+Math.round(elo[worst.id]));
  T("강등팀은 Elo 맵에 없음",
    prev.filter(p => !cur.some(c => c.id === p.id)).every(p => elo[p.id] === undefined),
    prev.filter(p => !cur.some(c => c.id === p.id)).map(p=>p.short).join(", "));
  const before = {...elo};
  elo = X.applyPlayedMatches(elo, fixtures);
  const moved = Object.keys(elo).filter(k => Math.abs(elo[k]-before[k]) > 0.01).length;
  T("치른 경기로 Elo가 갱신됨", moved === 20, moved + "팀 이동");
  const tot0 = Object.values(before).reduce((a,b)=>a+b,0);
  const tot1 = Object.values(elo).reduce((a,b)=>a+b,0);
  T("Elo 총합 보존 (제로섬)", Math.abs(tot0-tot1) < 1, Math.abs(tot0-tot1).toFixed(3));
  T("모든 Elo가 유한값", Object.values(elo).every(Number.isFinite));
  const top = Object.entries(elo).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([id,v]) => (X.TEAM_KO[id]?X.TEAM_KO[id].ko:id)+" "+Math.round(v));
  console.log("        Elo 상위: " + top.join("  "));
}

console.log("\n[8] 몬테카를로 시뮬레이션" + (FAST ? " (1000회)" : " (10000회)"));
if (cur && fixtures && elo){
  X.S.cur = cur; cur.forEach(t => { X.S.byId[t.id] = t; });
  const players = X.resolvePredictions();
  T("예측 팀 이름이 전부 해석됨", X.S.unresolved.length === 0, X.S.unresolved.join(", "));
  X.PREDICTIONS.forEach((p,i) => { p.picks = players[i].picks; });

  const s0 = Date.now();
  const sim = await new Promise(res =>
    X.simulate(cur, fixtures, elo, X.CFG.simRuns, null, res));
  const ms = Date.now() - s0;
  T("시뮬 3초 이내 완료 (AC-6)", ms < 3000, ms + "ms");
  const p5 = sim.teams.reduce((s,t)=>s+t.top5, 0);
  T("top5 확률 합 = 5.0 (AC-12)", Math.abs(p5-5) < 0.01, p5.toFixed(4));
  const rk = sim.teams.reduce((s,t)=>s+t.expRank, 0);
  T("기대순위 합 = 210 (1+..+20)", Math.abs(rk-210) < 0.01, rk.toFixed(3));
  const wp = sim.players.reduce((s,p)=>s+p.winPct, 0);
  T("참가자 우승확률 합 = 1.0", Math.abs(wp-1) < 1e-6, wp.toFixed(6));
  T("모든 확률이 0~1", sim.teams.every(t => t.top5>=0 && t.top5<=1));
  T("기대 점수가 0~30", sim.players.every(p => p.avg>=0 && p.avg<=30));
  T("대표 시나리오가 1~20위 완전순열",
    JSON.stringify(Object.values(sim.projRank).sort((a,b)=>a-b)) === JSON.stringify([...Array(20)].map((_,i)=>i+1)));
  const strongest = Object.entries(elo).sort((a,b)=>b[1]-a[1])[0][0];
  const st = sim.teams.find(t => t.id === strongest);
  T("Elo 최강팀의 top5 확률이 50% 이상", st.top5 > 0.5, (st.top5*100).toFixed(1)+"%");
  T("어떤 팀도 확률 100%가 아님 — 실력 불확실성이 반영됨",
    sim.teams.every(t => t.top5 < 0.995),
    sim.teams.filter(t=>t.top5>=0.995).map(t=>(X.TEAM_KO[t.id]?X.TEAM_KO[t.id].ko:t.id)+" "+(t.top5*100).toFixed(1)+"%").join(", "));
  T("어떤 참가자도 우승확률 100%가 아님",
    sim.players.every(p => p.winPct < 0.99));
  const spread = Math.max(...sim.teams.map(t=>t.top5)) - Math.min(...sim.teams.map(t=>t.top5));
  T("강팀과 약팀의 확률이 실제로 갈림", spread > 0.5, spread.toFixed(3));
  console.log("        top5 확률 상위: " + sim.teams.slice().sort((a,b)=>b.top5-a.top5).slice(0,5)
    .map(t => (X.TEAM_KO[t.id]?X.TEAM_KO[t.id].ko:t.id)+" "+(t.top5*100).toFixed(0)+"%").join("  "));
  console.log("        참가자 우승확률: " + sim.players.map(p => p.name+" "+(p.winPct*100).toFixed(1)+"%").join("  "));

  console.log("\n[9] 현재 순위 기준 채점 결과");
  const liveRank = X.rankMapFrom(cur);
  const scored = X.rankPlayers(players.map(p => Object.assign({name:p.name}, X.scoreOne(p, liveRank))));
  let allOk = true;
  scored.forEach(p => {
    const s = p.rows.reduce((x,r)=>x+r.pts,0);
    if (s !== p.total || p.total > 30) allOk = false;
    console.log("        " + p.rank + "위 " + p.name + "  " + p.total + "점  " +
      "(정확 " + p.exact + " / 5위권 " + p.inTop5 + ")  " +
      p.rows.map(r => (X.TEAM_KO[r.teamId]?X.TEAM_KO[r.teamId].ko:r.teamId)+":"+r.pts).join(" "));
  });
  T("모든 참가자 총점 = 팀별 합, 30 이하", allOk);
}

console.log("\n[10] 엔드포인트별 응답 구조 차이 (회귀 방지)");
try{
  // scoreboard: status 가 event 레벨, score 는 문자열
  const sb = await X.getJSON(X.API + "/site/v2/sports/soccer/eng.1/scoreboard?dates=20260901-20260930");
  const e1 = sb.events[0], c1 = e1.competitions[0];
  T("scoreboard — status 는 event 레벨", !!(e1.status && e1.status.type));
  T("scoreboard — state 를 읽어냄", ["pre","in","post"].includes(X.evState(e1, c1)), X.evState(e1,c1));
  T("scoreboard — 점수가 숫자로 나옴", Number.isFinite(X.compScore(c1.competitors[0])));

  // team/schedule: status 가 competition 레벨, score 는 객체
  const sc = await X.getJSON(X.API + "/site/v2/sports/soccer/eng.1/teams/382/schedule");
  const e2 = sc.events[0], c2 = e2.competitions[0];
  T("team/schedule — status 가 event 에 없음 (구조가 다름)", !e2.status);
  T("team/schedule — competition 에서 state 를 읽어냄",
    ["pre","in","post"].includes(X.evState(e2, c2)), X.evState(e2, c2));
  T("team/schedule — score 가 객체", typeof c2.competitors[0].score === "object");
  T("team/schedule — 객체 점수를 숫자로 풀어냄",
    Number.isFinite(X.compScore(c2.competitors[0])), String(X.compScore(c2.competitors[0])));
  T("두 엔드포인트가 같은 경기에 같은 결과를 준다", (() => {
    const mine = fixtures.filter(f => f.homeId === "382" || f.awayId === "382")
      .filter(f => f.state === "post");
    return sc.events.every(ev => {
      const c = ev.competitions[0];
      const h = c.competitors.find(x => x.homeAway === "home");
      const a = c.competitors.find(x => x.homeAway === "away");
      const f = mine.find(x => x.id === ev.id);
      if (!f) return true;
      return f.homeScore === X.compScore(h) && f.awayScore === X.compScore(a);
    });
  })());
}catch(e){ T("응답 구조 검사", false, e.message); }

console.log("\n[11] 홈 화면 앱(PWA) 구성");
try{
  const mfRaw = fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8");
  const mf = JSON.parse(mfRaw);
  T("manifest.json 이 유효한 JSON", true);
  T("전체화면으로 열림 (display: standalone)", mf.display === "standalone", mf.display);
  T("시작 주소가 실제 파일", fs.existsSync(path.join(__dirname, mf.start_url.replace("./",""))));
  T("스플래시=EPL 퍼플, 테마색=앱 배경",
    mf.background_color === "#37003C" && mf.theme_color === "#0B1420");
  const missing = mf.icons.filter(i => !fs.existsSync(path.join(__dirname, i.src.replace("./",""))));
  T("manifest 가 가리키는 아이콘이 전부 존재", missing.length === 0, missing.map(i=>i.src).join(", "));
  T("마스커블 아이콘 있음 (안드로이드 원형 크롭 대비)",
    mf.icons.some(i => (i.purpose||"").includes("maskable")));
  // PNG 헤더에서 실제 크기를 읽어 선언과 대조
  const dimOk = mf.icons.every(i => {
    const b = fs.readFileSync(path.join(__dirname, i.src.replace("./","")));
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    return i.sizes === w + "x" + h;
  });
  T("아이콘 실제 픽셀 크기가 선언과 일치", dimOk);
  T("index.html 이 manifest 를 연결", /<link[^>]+rel="manifest"[^>]+manifest\.json/.test(html));
  T("iOS 홈 화면 아이콘 연결", /apple-touch-icon/.test(html));
  T("iOS 전체화면 메타 있음", /apple-mobile-web-app-capable/.test(html));
  T("노치 영역 대응 (safe-area-inset-top)", /env\(safe-area-inset-top\)/.test(html));
  T("하단 탭도 safe-area 대응", /env\(safe-area-inset-bottom\)/.test(html));
}catch(e){ T("PWA 구성", false, e.message); }

console.log("\n[12] 사내 정보 누출 검사 (AC-13)");
const banned = ["fnf","dcs","dcsai","kg/","snowflake","mlb","discovery","duvetica","sergio",
  "internal","사내","dcs_sk","x-access-token","weekly dashboard"];
const lower = html.toLowerCase();
const hits = banned.filter(w => lower.includes(w));
T("산출물에 사내 관련 문자열 없음", hits.length === 0, hits.join(", "));
T("외부 스크립트/스타일 참조 없음",
  !/<script[^>]+src=/i.test(html) && !/<link[^>]+stylesheet/i.test(html));
T("API 키/시크릿 문자열 없음", !/(api[_-]?key|secret|token|bearer)\s*[:=]\s*["'][^"']+/i.test(html));
T("호출 도메인이 ESPN 뿐 (데이터 + 로고 CDN)",
  [...html.matchAll(/https?:\/\/([a-z0-9.\-]+)/gi)].map(x=>x[1])
    .every(h => h.endsWith("espn.com") || h.endsWith("espncdn.com")),
  [...new Set([...html.matchAll(/https?:\/\/([a-z0-9.\-]+)/gi)].map(x=>x[1]))].join(", "));

console.log("\n" + "=".repeat(52));
console.log("  통과 " + pass + " / 실패 " + fail);
console.log("=".repeat(52) + "\n");
process.exit(fail ? 1 : 0);

})().catch(e => { console.error("\n검증 중 오류:", e); process.exit(1); });
