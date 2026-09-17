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
if (FAST) code = code.replace(/simRuns:\s*\d+/, "simRuns: 1000");

const ctx = {
  document, sessionStorage, fetch, console, setTimeout, clearTimeout,
  Math, Date, JSON, Promise, Number, String, Object, Array, Error,
  Float64Array, Int32Array, parseInt, parseFloat, isNaN,
  window: { scrollTo: () => {} },
  location: { reload: () => {} }
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code + "\n;globalThis.__x = {gauss,poisson,liveAlreadyCounted,renderFixtures,recalcAll,renderForecast,openTeam,openFixtures,renderTable,renderLeaderboard,evState,compScore,getJSON,API,teamPoints,scoreOne,rankPlayers,matchProbs,expectedGoals,simulate,buildModel,histBySeason,headToHead,parseEvents,parseOdds,americanToDecimal,resolveTeamId,resolvePredictions,fetchStandings,fetchAllFixtures,rankMapFrom,S,CFG,PREDICTIONS,TEAM_KO};", ctx);
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

console.log("\n[4] 배당 · 난수 · 내장 과거 데이터 (단위)");
T("미국식 +135 → 소수 2.35", Math.abs(X.americanToDecimal("+135") - 2.35) < 1e-9);
T("미국식 -330 → 소수 1.303", Math.abs(X.americanToDecimal(-330) - (1 + 100/330)) < 1e-9);
T("잘못된 배당은 null", X.americanToDecimal(null) === null && X.americanToDecimal("abc") === null && X.americanToDecimal(0) === null);
const synthOdds = X.parseOdds({odds:[{provider:{name:"TestBook"},
  moneyline:{home:{open:{odds:"+145"}, close:{odds:"+135"}}, away:{open:{odds:"+195"}}},
  drawOdds:{moneyLine:255, link:{href:"https://example.invalid"}}}]});
T("배당 파싱 — close 우선, 없으면 open",
  !!synthOdds && Math.abs(synthOdds.h-2.35) < 1e-9 && Math.abs(synthOdds.a-2.95) < 1e-9 && Math.abs(synthOdds.d-3.55) < 1e-9,
  JSON.stringify(synthOdds));
T("배당 확률은 마진을 걷어내 합 1", !!synthOdds && Math.abs(synthOdds.pH+synthOdds.pD+synthOdds.pA-1) < 1e-9);
T("세 배당 중 하나라도 없으면 쓰지 않음",
  X.parseOdds({odds:[{moneyline:{home:{close:{odds:"+135"}}}, drawOdds:{moneyLine:255}}]}) === null && X.parseOdds({}) === null);
T("배당 파싱이 베팅 링크를 들고 오지 않음", !!synthOdds && !JSON.stringify(synthOdds).includes("http"));
// 유효슈팅 0:0 은 기록 누락으로 본다 (실제로 23-24·24-25 에 골이 난 경기 22건이 0:0 으로 찍혀 있다)
const synthEv = (hs, as) => ({id:"1", date:"2026-09-14T19:00Z", status:{type:{state:"post"}}, competitions:[{competitors:[
  {homeAway:"home", team:{id:1}, score:"3", statistics:[{name:"shotsOnTarget", displayValue:String(hs)}]},
  {homeAway:"away", team:{id:2}, score:"1", statistics:[{name:"shotsOnTarget", displayValue:String(as)}]}]}]});
const evZero = X.parseEvents([synthEv(0,0)])[0], evOk = X.parseEvents([synthEv(6,2)])[0];
T("유효슈팅 0:0 은 결측(-1) 처리", evZero.homeSot === -1 && evZero.awaySot === -1);
T("정상 유효슈팅은 그대로", evOk.homeSot === 6 && evOk.awaySot === 2);
T("날짜 번호는 UTC 기준", evOk.day === Math.floor(Date.UTC(2026,8,14)/86400000), String(evOk.day));
// 포아송 난수
{
  const lamT = 1.4, NP = 40000;
  let s1 = 0, s2 = 0;
  for (let i = 0; i < NP; i++){ const k = X.poisson(lamT); s1 += k; s2 += k*k; }
  const pm = s1/NP, pv = s2/NP - pm*pm;
  T("포아송 난수 평균·분산 = λ", Math.abs(pm-lamT) < 0.04 && Math.abs(pv-lamT) < 0.08,
    "평균 " + pm.toFixed(3) + ", 분산 " + pv.toFixed(3));
}
// 내장 과거 3시즌
{
  const hist = X.histBySeason();
  const seasons = Object.keys(hist);
  T("내장 과거 데이터 = 23-24·24-25·25-26", seasons.join(",") === "2023,2024,2025", seasons.join(","));
  T("시즌마다 380경기", seasons.every(y => hist[y].length === 380), seasons.map(y => hist[y].length).join(","));
  T("시즌마다 20팀 · 팀당 38경기", seasons.every(y => {
    const c = {};
    hist[y].forEach(r => { c[r.h] = (c[r.h]||0) + 1; c[r.a] = (c[r.a]||0) + 1; });
    const v = Object.values(c);
    return v.length === 20 && v.every(x => x === 38);
  }));
  T("값이 전부 정수 · 득점 0 이상", seasons.every(y => hist[y].every(r =>
    [r.day, r.hg, r.ag, r.hs, r.as].every(Number.isInteger) && r.hg >= 0 && r.ag >= 0)));
  T("시즌 순서대로 날짜가 이어짐",
    hist["2023"][379].day < hist["2024"][0].day && hist["2024"][379].day < hist["2025"][0].day);
}
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

console.log("\n[7] 전력 모델 구성");
let model;
// 기대득점 = exp(c + 공격[나] − 수비[상대]) 이므로 수비 값이 클수록 덜 먹힌다 → 전력 = 공격 + 수비
const rating = id => model.strength[id].att + model.strength[id].def;
const koOf = id => (X.TEAM_KO[id] ? X.TEAM_KO[id].ko : id);
if (cur && fixtures){
  const tm = Date.now();
  model = X.buildModel(cur, fixtures);
  const fitMs = Date.now() - tm;
  T("모델 적합 1초 이내", fitMs < 1000, fitMs + "ms");
  if (prev){
    // 내장한 25-26 경기로 승점을 다시 세면 ESPN 최종 순위표와 원단위로 같아야 한다
    const pts = {};
    X.histBySeason()[X.CFG.prevSeason].forEach(r => {
      pts[r.h] = (pts[r.h]||0) + (r.hg > r.ag ? 3 : r.hg === r.ag ? 1 : 0);
      pts[r.a] = (pts[r.a]||0) + (r.ag > r.hg ? 3 : r.hg === r.ag ? 1 : 0);
    });
    const bad = prev.filter(t => pts[t.id] !== t.pts);
    T("내장 25-26 경기로 센 승점 = ESPN 최종 순위표 (20팀)", bad.length === 0,
      bad.map(t => t.short + " " + pts[t.id] + "≠" + t.pts).join(", "));
    const releg = prev.filter(p => !cur.some(c => c.id === p.id)).map(p => p.id).sort();
    T("강등팀 = 전시즌 순위표에만 있는 팀", model.relegated.slice().sort().join() === releg.join(),
      model.relegated.map(koOf).join(", "));
  }
  T("승격팀 3팀 식별", model.promoted.length === 3, model.promoted.map(koOf).join(", "));
  T("치른 경기가 전부 학습에 들어감",
    model.played === fixtures.filter(f => f.state === "post").length, model.played + "경기");
  T("학습 기준일 = 마지막으로 치른 경기 날짜",
    model.refDay === Math.max.apply(null, fixtures.filter(f => f.state === "post").map(f => f.day)));
  T("20팀 모두 공격·수비력이 유한값",
    cur.every(t => model.strength[t.id] && Number.isFinite(model.strength[t.id].att) && Number.isFinite(model.strength[t.id].def)));
  T("홈 이점이 양수이고 과하지 않음", model.h > 0 && model.h < 0.5, model.h.toFixed(3));
  let gsum = 0, gn = 0;
  cur.forEach(a => cur.forEach(b => {
    if (a.id === b.id) return;
    const g = X.expectedGoals(model, a.id, b.id);
    gsum += g[0] + g[1]; gn++;
  }));
  T("경기당 평균 기대득점이 현실 범위(2.3~3.3골)", gsum/gn > 2.3 && gsum/gn < 3.3, (gsum/gn).toFixed(2));

  const byR = cur.slice().sort((a,b) => rating(b.id) - rating(a.id));
  const pe = X.matchProbs(model, byR[10].id, byR[10].id);
  T("승무패 확률 합 = 1", Math.abs(pe.pW + pe.pD + pe.pL - 1) < 1e-9);
  T("같은 전력이면 홈 우세", pe.pW > pe.pL);
  T("같은 전력 무승부율 20~32%", pe.pD > 0.20 && pe.pD < 0.32, (pe.pD*100).toFixed(1) + "%");
  const strongHome = X.matchProbs(model, byR[0].id, byR[19].id);
  const weakHome = X.matchProbs(model, byR[19].id, byR[0].id);
  T("최강 홈 vs 최약 원정 → 홈승 60% 이상", strongHome.pW > 0.6, (strongHome.pW*100).toFixed(1) + "%");
  T("최약 홈 vs 최강 원정 → 홈승 25% 이하", weakHome.pW < 0.25, (weakHome.pW*100).toFixed(1) + "%");
  console.log("        전력 상위: " + byR.slice(0,5).map(t => koOf(t.id) + " " + rating(t.id).toFixed(2)).join("  "));
}

console.log("\n[8] 몬테카를로 시뮬레이션 (" + X.CFG.simRuns + "회)");
if (cur && fixtures && model){
  X.S.cur = cur; cur.forEach(t => { X.S.byId[t.id] = t; });
  const players = X.resolvePredictions();
  T("예측 팀 이름이 전부 해석됨", X.S.unresolved.length === 0, X.S.unresolved.join(", "));
  X.PREDICTIONS.forEach((p,i) => { p.picks = players[i].picks; });

  const s0 = Date.now();
  const sim = await new Promise(res =>
    X.simulate(cur, fixtures, model, X.CFG.simRuns, null, res));
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
  const strongest = cur.slice().sort((a,b) => rating(b.id) - rating(a.id))[0].id;
  const st = sim.teams.find(t => t.id === strongest);
  T("전력 최강팀의 top5 확률이 50% 이상", st.top5 > 0.5, koOf(strongest) + " " + (st.top5*100).toFixed(1)+"%");
  T("배당 사용 경기 = 배당이 나온 예정 경기 전부",
    sim.oddsUsed === fixtures.filter(f => f.state === "pre" && f.odds).length, sim.oddsUsed + "경기");
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
  const sb = await X.getJSON(X.API + "/site/v2/sports/soccer/eng.1/scoreboard?dates=202609");
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

console.log("\n[11] 탭 진입 회귀 — 예측을 먼저 봐도 일정이 그려지는가");
if (cur && fixtures){
  X.S.cur = cur; cur.forEach(t => { X.S.byId[t.id] = t; });
  const fxBox = getEl("fx-body");

  // 1) 아직 일정이 없을 때 — 받아와서 그린다
  X.S.fixtures = null;
  fxBox.innerHTML = "(초기 상태)";
  await X.openFixtures();
  T("일정이 없으면 받아와서 그린다",
    fxBox.innerHTML.indexOf("다가올 경기") >= 0 && X.S.fixtures && X.S.fixtures.length === 380,
    "본문 길이 " + fxBox.innerHTML.length);

  // 2) 마감 예측 시뮬레이션이 이미 일정을 채워둔 경우 — 실제로 났던 버그.
  //    "아직 없을 때만" 그리도록 되어 있어 탭이 빈 채로 남았다.
  X.S.fixtures = fixtures;
  fxBox.innerHTML = "(초기 상태)";
  await X.openFixtures();
  T("이미 일정을 갖고 있어도 그린다 (빈 탭 회귀 방지)",
    fxBox.innerHTML.indexOf("다가올 경기") >= 0 && fxBox.innerHTML.indexOf("최근 결과") >= 0,
    "실제 본문: " + fxBox.innerHTML.slice(0, 90));
  T("경기 카드가 실제로 만들어짐",
    (fxBox.innerHTML.match(/class="fx"/g) || []).length > 10,
    (fxBox.innerHTML.match(/class="fx"/g) || []).length + "개");
  T("일정에도 팀 로고가 들어감", fxBox.innerHTML.indexOf("teamlogos/soccer") >= 0);

  // 배당 · 출처 · 맞대결
  const fxHtml = fxBox.innerHTML;
  const shown = fixtures.filter(f => f.state === "pre").slice(0, 20);
  const shownOdds = shown.filter(f => f.odds).length;
  T("다가올 경기에 배당 3개(홈·무·원정)씩 붙음",
    (fxHtml.match(/class="od(?: fav)?"/g) || []).length === shownOdds * 3,
    (fxHtml.match(/class="od(?: fav)?"/g) || []).length + " / 기대 " + shownOdds * 3);
  T("배당이 아직 없는 경기는 '배당 -'",
    (fxHtml.match(/배당 -/g) || []).length === shown.length - shownOdds,
    (fxHtml.match(/배당 -/g) || []).length + " / 기대 " + (shown.length - shownOdds));
  T("경기마다 유력 결과(가장 낮은 배당)가 강조됨",
    (fxHtml.match(/class="od fav"/g) || []).length >= shownOdds);
  T("배당 출처가 탭 맨 위에 표기",
    shownOdds === 0 || fxHtml.indexOf('<div class="fx-src">배당 DraftKings · ESPN 경유') === 0, fxHtml.slice(0, 90));
  T("베팅 사이트 링크를 노출하지 않음", !/draftkings\.com|sportsbook|href=/i.test(fxHtml));
  T("다가올 경기에 최근 맞대결 전적이 붙음", /class="h2h">맞대결 /.test(fxHtml));
  const cssFx = html.slice(html.indexOf("<style>"), html.indexOf("</style>")).replace(/\s+/g, "");
  T("배당 출처 스타일 — 오른쪽 정렬 · 작은 글씨", /\.fx-src\{text-align:right;font-size:10\.5px/.test(cssFx));
  {
    // 맞대결 집계 교차검증: 승+무+패 = 경기 수, 홈·원정을 바꾸면 승패가 뒤집힌다
    const f = shown[0];
    const a = X.headToHead(f.homeId, f.awayId, 5), b = X.headToHead(f.awayId, f.homeId, 5);
    T("맞대결 승+무+패 = 경기 수, 최대 5", a.w + a.d + a.l === a.n && a.n <= 5, JSON.stringify(a));
    T("맞대결을 반대편에서 보면 승패가 뒤집힘", a.w === b.l && a.l === b.w && a.d === b.d,
      JSON.stringify(a) + " vs " + JSON.stringify(b));
  }
}

console.log("\n[12] 팀 시트 — 예정 경기가 나오는가");
if (cur){
  // 팀 일정 API 는 기본 호출이 치른 경기만 준다. 예정 경기는 fixture=true 가 따로 있다.
  const base = X.API + "/site/v2/sports/soccer/eng.1/teams/382/schedule";
  const past = await X.getJSON(base);
  const next = await X.getJSON(base + "?fixture=true");
  const stateOf = ev => X.evState(ev, (ev.competitions || [])[0]);
  T("기본 호출은 치른 경기만 준다 (그래서 폴백이 필요하다)",
    (past.events || []).length > 0 && (past.events || []).every(e => stateOf(e) === "post"),
    (past.events || []).length + "경기");
  T("fixture=true 는 예정 경기를 준다",
    (next.events || []).length > 0 && (next.events || []).every(e => stateOf(e) !== "post"),
    (next.events || []).length + "경기");

  // 시즌 전체 일정을 아직 안 받은 상태에서 팀 시트를 열어도 예정 경기가 보여야 한다
  X.S.fixtures = null;
  await X.openTeam("382");
  const sheet = getEl("sheet-in").innerHTML;
  T("전체 일정이 없어도 팀 시트에 예정 경기가 나온다 (빈 예정 회귀 방지)",
    sheet.indexOf("fx-s sched") >= 0,
    "예정 경기 표시 없음");
  T("팀 시트에 지난 결과도 함께 나온다", /fx-s num/.test(sheet));
  T("팀 시트에 선수단이 나온다", sheet.indexOf("선수단") >= 0);

  // 전체 일정을 이미 갖고 있으면 그쪽을 쓴다
  if (fixtures){
    X.S.fixtures = fixtures;
    await X.openTeam("382");
    const sheet2 = getEl("sheet-in").innerHTML;
    T("전체 일정을 갖고 있을 때도 예정 경기가 나온다", sheet2.indexOf("fx-s sched") >= 0);
  }
  X.S.fixtures = null;
}

console.log("\n[13] 경기 진행 중일 때 (합성 데이터로 검증)");
if (cur && fixtures){
  // 지금은 A매치 휴식기라 진행 중인 경기가 실제로 없다.
  // 순위표가 라이브로 반영하는 경우와 아닌 경우를 모두 만들어 확인한다.
  const LIVE_N = 3;
  const played = fixtures.filter(f => f.state === "post").length;
  const synth = fixtures.map(f => Object.assign({}, f));
  let turned = 0;
  for (const f of synth){
    if (f.state === "pre" && turned < LIVE_N){
      f.state = "in"; f.homeScore = 1; f.awayScore = 0; turned++;
    }
  }
  T("합성: 진행 중 경기 " + LIVE_N + "건을 만들었다",
    synth.filter(f => f.state === "in").length === LIVE_N);

  const gpNow = cur.reduce((a,t) => a + t.gp, 0);
  T("진행 중 경기가 없으면 판별은 항상 '미반영'",
    X.liveAlreadyCounted(cur, fixtures) === false);

  // (가) 순위표가 아직 진행 중 경기를 안 셌다 — 지금 실제 데이터가 이 상태
  T("순위표가 진행 중 경기를 안 셌으면 미반영으로 판정",
    X.liveAlreadyCounted(cur, synth) === false, "gp합 " + gpNow);

  // (나) 순위표가 진행 중 경기까지 셌다고 가정
  const curLive = cur.map(t => Object.assign({}, t));
  let bumped = 0;
  for (const f of synth){
    if (f.state !== "in") continue;
    for (const t of curLive) if (t.id === f.homeId || t.id === f.awayId){ t.gp += 1; bumped++; }
  }
  T("합성: 순위표 경기수를 " + bumped + "회 올렸다", bumped === LIVE_N * 2);
  T("순위표가 진행 중 경기를 셌으면 반영으로 판정",
    X.liveAlreadyCounted(curLive, synth) === true,
    "gp합 " + curLive.reduce((a,t)=>a+t.gp,0) + " vs 기대 " + (played + LIVE_N) * 2);

  // 시뮬레이션이 실제로 그 경기를 빼는지 — 이중 계산 방지의 핵심
  const model2 = X.buildModel(cur, fixtures);
  const runA = await new Promise(res => X.simulate(cur, synth, model2, 200, null, res));
  const runB = await new Promise(res => X.simulate(curLive, synth, model2, 200, null, res));
  T("미반영이면 진행 중 경기도 시뮬레이션한다",
    runA.skippedLive === false && runA.remaining === 380 - played,
    "남은 " + runA.remaining + " / 기대 " + (380 - played));
  T("반영이면 진행 중 경기를 빼고 시뮬레이션한다 (이중 계산 방지)",
    runB.skippedLive === true && runB.remaining === 380 - played - LIVE_N,
    "남은 " + runB.remaining + " / 기대 " + (380 - played - LIVE_N));
  T("두 경우의 잔여 경기 수 차이가 정확히 진행 중 경기 수",
    runA.remaining - runB.remaining === LIVE_N);

  // 화면: 진행 중 경기는 시작 시각이 아니라 현재 스코어로 나와야 한다
  X.S.cur = cur; X.S.fixtures = synth;
  X.renderFixtures();
  const fx = getEl("fx-body").innerHTML;
  T("일정 탭에 '지금 진행 중' 구역이 생긴다", fx.indexOf("지금 진행 중") >= 0);
  T("진행 중 경기는 현재 스코어로 표시된다", fx.indexOf("fx-s now") >= 0);
  T("진행 중 경기가 '다가올 경기'에 중복되지 않는다",
    (fx.match(/fx-s now/g) || []).length === LIVE_N,
    (fx.match(/fx-s now/g) || []).length + "건");
  T("헤더가 진행 중 경기 수를 알린다",
    getEl("meta").innerHTML.indexOf("경기 진행 중") >= 0,
    getEl("meta").innerHTML);
  // 진행 중 경기가 없는 평상시에는 시각 기준으로 돌아간다
  X.S.fixtures = fixtures;
  X.renderFixtures();
  T("진행 중이 없으면 헤더는 시각 기준으로 돌아간다",
    getEl("meta").innerHTML.indexOf("기준") >= 0 &&
    getEl("meta").innerHTML.indexOf("경기 진행 중") < 0);
  X.S.fixtures = fixtures;
}

console.log("\n[14] 다시 계산 — 앱을 닫지 않고 최신 결과 반영");
if (cur && fixtures){
  X.S.cur = cur; cur.forEach(t => { X.S.byId[t.id] = t; });
  X.S.fixtures = fixtures;

  const prevSim = X.S.sim;
  X.S.simAt = null;
  let sawProgress = false;
  await X.recalcAll(f => { if (f > 0 && f <= 1) sawProgress = true; });

  T("다시 계산하면 시뮬레이션 결과가 새로 나온다", !!X.S.sim && X.S.sim !== prevSim);
  T("현재 순위를 다시 받아온다", X.S.cur.length === 20);
  T("시즌 일정도 다시 받아온다", X.S.fixtures && X.S.fixtures.length === 380,
    X.S.fixtures ? X.S.fixtures.length + "경기" : "없음");
  T("계산 시각이 기록된다", !!X.S.simAt);
  T("진행률이 보고된다", sawProgress);
  T("다시 계산한 결과도 확률 합이 맞다",
    Math.abs(X.S.sim.players.reduce((a,p)=>a+p.winPct,0) - 1) < 1e-6);
  T("다시 계산한 결과도 top5 확률 합이 5",
    Math.abs(X.S.sim.teams.reduce((a,t)=>a+t.top5,0) - 5) < 0.01);

  // 결과가 준비된 뒤의 예측 탭 화면
  X.renderForecast();
  const fcHtml = getEl("fc-body").innerHTML;
  T("예측 탭에 다시 계산 버튼이 있다", fcHtml.indexOf('id="recalc"') >= 0);
  T("마지막 계산 시각을 보여준다", fcHtml.indexOf("마지막 계산") >= 0);
  T("우승 확률과 팀 확률이 함께 나온다",
    fcHtml.indexOf("1위 할 확률") >= 0 && fcHtml.indexOf("5위 안 진입 확률") >= 0);
}

console.log("\n[15] 로고 가독성 (어두운 화면에서 묻히지 않는가)");
{
  // 토트넘(남색)·리버풀(진빨강)·노팅엄은 어두운 바탕에 그대로 두면 형체가 사라진다.
  // 로고가 놓이는 모든 자리는 흰 원 위에 있어야 한다.
  const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  T("픽 칩이 흰 배경",
    /\.chip-i\{[^}]*background:#fff/.test(css.replace(/\s+/g, "")) ||
    css.replace(/\s+/g,"").indexOf("background:#fff;border:2px") >= 0);
  T("순위표·일정·팝업 로고도 흰 원 위",
    css.indexOf(".tlogo,.fx-lg,.bd-lg,.pr-lg") >= 0 &&
    /\.tlogo,\.fx-lg,\.bd-lg,\.pr-lg\{background:#fff/.test(css.replace(/\s+/g, "")));
  T("팀 시트 헤더 로고도 흰 원 위", /\.sheet-hdimg\{background:#fff/.test(css.replace(/\s+/g, "")));
  // 칩 전체에 opacity 를 걸면 흰 원까지 배경에 섞여 팀을 알아볼 수 없게 된다 (실제로 겪은 문제)
  T("놓친 팀 처리에 칩 전체 opacity 를 쓰지 않음",
    !/\.chip\.miss\{[^}]*opacity/.test(css.replace(/\s+/g, "")),
    "칩 전체를 투명하게 만들면 흰 원이 사라져 로고가 회색 덩어리가 된다");
  T("놓친 팀은 채도만 낮춤", css.indexOf("grayscale(") >= 0);
  // 클래스만 붙고 스타일이 없으면 브라우저 기본 흰 버튼이 튀어나온다 (실제로 겪음)
  T("다시 계산 버튼에 스타일이 정의돼 있다",
    /\.run\{[^}]*background:var\(--surface\)/.test(css.replace(/\s+/g, "")),
    "'.run' 스타일 누락");
  // 20팀 전부 색이 정의되어 있어야 링이 회색으로 떨어지지 않는다
  const noColor = Object.keys(X.TEAM_KO).filter(k => !X.TEAM_KO[k].c);
  T("20팀 모두 브랜드 컬러 보유", noColor.length === 0, noColor.join(", "));
  T("팀 수가 20팀", Object.keys(X.TEAM_KO).length === 20);
}

console.log("\n[16] 홈 화면 앱(PWA) 구성");
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

console.log("\n[17] 사내 정보 누출 검사 (AC-13)");
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

console.log("\n[18] 배당 반영 스위치");
if (cur && fixtures && model){
  const preOdds = fixtures.filter(f => f.state === "pre" && f.odds).length;
  X.CFG.useOdds = false;
  const off = await new Promise(res => X.simulate(cur, fixtures, model, 300, null, res));
  X.CFG.useOdds = true;
  const on = await new Promise(res => X.simulate(cur, fixtures, model, 300, null, res));
  T("useOdds 끄면 배당 경기 0", off.oddsUsed === 0);
  T("useOdds 켜면 배당 있는 예정 경기 전부 사용", on.oddsUsed === preOdds, on.oddsUsed + " / " + preOdds);
  // 배당 확률이 실제로 결과를 좌우하는지: 한 경기의 배당만 홈 98% ↔ 원정 98% 로 바꾸면
  // 그 홈팀 기대 승점 차이가 이론값 (0.98×3+0.01) − (0.01×3+0.01) = 2.91 근처여야 한다
  const f0 = fixtures.find(f => f.state === "pre" && f.odds);
  if (f0){
    const withOdds = (pH, pD, pA) => fixtures.map(f =>
      f === f0 ? Object.assign({}, f, { odds: Object.assign({}, f.odds, { pH, pD, pA }) }) : f);
    const RUNS = 4000;
    const a = await new Promise(res => X.simulate(cur, withOdds(0.98, 0.01, 0.01), model, RUNS, null, res));
    const b = await new Promise(res => X.simulate(cur, withOdds(0.01, 0.01, 0.98), model, RUNS, null, res));
    const diff = a.teams.find(t => t.id === f0.homeId).expPts - b.teams.find(t => t.id === f0.homeId).expPts;
    T("배당 확률이 시뮬레이션에 실제로 반영됨 (기대승점 차 ≈ 2.91)", Math.abs(diff - 2.91) < 0.6, diff.toFixed(2));
  }
}

console.log("\n[19] 일정 수신 실패가 조용히 빈 화면이 되지 않는가");
{
  // 실제 호출 URL 을 가로채 기록·조작한다. 끝나면 원래 fetch 로 되돌린다.
  const realFetch = ctx.fetch;
  const called = [];
  const stub = (status, onlyMonth) => {
    ctx.fetch = async (url) => {
      called.push(url);
      const hit = !onlyMonth || url.includes("dates=" + onlyMonth);
      if (hit && status !== 200) return { ok:false, status, json: async () => ({}) };
      return realFetch(url);
    };
  };
  const clearCache = () => Object.keys(store).forEach(k => delete store[k]);
  const threw = async fn => { try { await fn(); return null; } catch(e){ return e; } };

  // (a) dates 파라미터가 월 형식이어야 한다 — 범위 형식은 ESPN 이 400 으로 거절한다
  clearCache(); called.length = 0;
  stub(200);
  await X.fetchAllFixtures().catch(() => {});
  const dates = called.filter(u => u.includes("scoreboard?dates="))
                      .map(u => u.split("dates=")[1]);
  T("일정 요청이 월 형식(YYYYMM) — 범위 형식 회귀 방지",
    dates.length > 0 && dates.every(d => /^[0-9]{6}$/.test(d)), dates.slice(0,3).join(", "));

  // (b) 전부 실패하면 빈 배열이 아니라 에러여야 한다
  clearCache();
  stub(400);
  const eAll = await threw(() => X.fetchAllFixtures());
  T("모든 달이 실패하면 에러를 던진다 (빈 일정으로 넘어가지 않음)",
    !!eAll, eAll ? eAll.message : "에러 없이 통과함");

  // (c) 한 달만 실패해도 일정에 구멍이 나므로 에러여야 한다
  clearCache();
  stub(400, "202610");
  const eOne = await threw(() => X.fetchAllFixtures());
  T("한 달만 실패해도 에러를 던진다 (구멍 난 일정으로 예측하지 않음)",
    !!eOne, eOne ? eOne.message : "에러 없이 통과함");

  // (d) 정상일 때는 당연히 그대로 동작해야 한다
  ctx.fetch = realFetch;
  clearCache();
  const ok = await X.fetchAllFixtures();
  T("정상 응답일 때는 시즌 일정을 그대로 돌려준다",
    Array.isArray(ok) && ok.length === 380, (ok || []).length + "경기");
}

console.log("\n" + "=".repeat(52));
console.log("  통과 " + pass + " / 실패 " + fail);
console.log("=".repeat(52) + "\n");
process.exit(fail ? 1 : 0);

})().catch(e => { console.error("\n검증 중 오류:", e); process.exit(1); });
