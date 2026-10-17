/* 行测刷题 SPA */
"use strict";
window.addEventListener("error", e => console.error("PAGEERR", e.message, e.filename, e.lineno));
window.addEventListener("unhandledrejection", e => console.error("PAGEREJ", e.reason && e.reason.message));

/* ================= 存储 ================= */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast("本地存储空间不足"); } },
};
const PROG = () => LS.get("xq_progress", {});
const WRONG = () => LS.get("xq_wrong", {});
const FAV = () => LS.get("xq_fav", {});

/* ================= 数据 ================= */
const examCache = {};   // "03/0001" -> exam json
const meta = { cats: [] };
let catIndexCache = {}; // catId -> index array

async function loadMeta() {
  if (meta.cats.length) return meta;
  Object.assign(meta, await fetch("data/meta.json").then(r => r.json()));
  return meta;
}
async function loadCatIndex(catId) {
  if (catIndexCache[catId]) return catIndexCache[catId];
  const idx = await fetch(`data/${catId}/index.json`).then(r => r.json());
  catIndexCache[catId] = idx;
  return idx;
}
async function loadExam(ref) {
  if (examCache[ref]) return examCache[ref];
  const ex = await fetch(`data/${ref}.json`).then(r => r.json());
  examCache[ref] = ex;
  return ex;
}
function matHtml(exam, mi) {
  if (mi == null) return null;
  const m = exam.ms.find(x => x.i === mi);
  return m ? m.h : null;
}

/* ================= 工具 ================= */
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isHtml = s => /^\s*</.test(s || "");
const fmtTime = s => { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60), h = Math.floor(m / 60); const ss = s % 60, mm = m % 60; return (h ? String(h).padStart(2, "0") + ":" : "") + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0"); };
function setBody(v) { const app = $("#app"); app.innerHTML = ""; app.appendChild(v); window.scrollTo(0, 0); }
let toastTimer;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1800); }

/* 站内确认弹窗：部分内嵌 webview / 移动端会屏蔽原生 confirm，改用自绘弹窗 */
let cfResolve = null;
function askConfirm(msg, opt) {
  opt = opt || {};
  return new Promise(resolve => {
    cfResolve = resolve;
    $("#cfTitle").textContent = opt.title || "提示";
    $("#cfMsg").textContent = msg;
    const yes = $("#cfYes");
    yes.textContent = opt.ok || "确定";
    yes.className = "btn " + (opt.danger ? "danger" : "primary");
    $("#cfNo").textContent = opt.cancel || "取消";
    $("#cfModal").classList.add("show");
  });
}
function settleConfirm(v) {
  $("#cfModal").classList.remove("show");
  const r = cfResolve; cfResolve = null;
  if (r) r(v);
}
/* 把源库里用连续空格（NBSP/全角空格）表示的「横线」渲染成可见下划线空位 */
function blankifyDom(root) {
  if (!root) return;
  const RX = /[\u00a0\u3000 ]{2,}/g;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const t = node.nodeValue;
    if (!t || t.indexOf("  ") < 0 && !/[\u00a0\u3000]{2,}/.test(t)) continue;
    RX.lastIndex = 0;
    let m = RX.exec(t);
    if (!m) continue;
    const frag = document.createDocumentFragment();
    let last = 0;
    while (m) {
      if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
      const sp = document.createElement("span");
      sp.className = "blank";
      sp.style.width = Math.min(3.6, Math.max(2, m[0].length * 0.3)) + "em";
      frag.appendChild(sp);
      last = m.index + m[0].length;
      m = RX.exec(t);
    }
    if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
}

const norm = s => (s || "").toUpperCase().split("").sort().join("");
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function isHtmlContent(s) { return isHtml(s); }

/* ================= 会话状态 ================= */
let session = null;   // {mode,title,refs,ans{},judged{},idx,timer,limit,startTs,done,examId,catId}
let tick = null;

/* 剩余秒数：按绝对截止时间算，不受 setInterval 被节流/重渲染影响 */
function mockRemain() {
  const s = session;
  if (!s) return 0;
  if (!s._deadline) {
    const base = s.remain != null ? s.remain : s.limit;
    s._deadline = Date.now() + base * 1000;
  }
  return Math.max(0, Math.round((s._deadline - Date.now()) / 1000));
}
function paintTimer() {
  const node = document.getElementById("timer");
  const s = session;
  if (!node || !s) return;
  const mock = s.mode === "mock";
  const txt = mock
    ? fmtTime(s.done ? (s.remain ?? s.limit) : mockRemain())
    : fmtTime((Date.now() - (s.startTs || Date.now())) / 1000);
  if (node.textContent !== txt) node.textContent = txt;
  node.classList.toggle("low", mock && !s.done && mockRemain() < 300);
}
/* 幂等启动：重复调用只会补一次 interval，不会重置已走的时间 */
function syncTimer() {
  const s = session;
  if (!s) { stopTimer(); return; }
  if (!s.startTs) s.startTs = Date.now();
  if (s.mode === "mock" && !s.done) mockRemain();
  paintTimer();
  if (tick || s.done) return;
  tick = setInterval(() => {
    const cur = session;
    if (!cur || cur.done) { stopTimer(); return; }
    if (cur.mode === "mock") {
      cur.remain = mockRemain();
      if (cur.remain <= 0) { stopTimer(); toast("时间到，自动交卷"); submitMock(); return; }
    }
    paintTimer();
  }, 250);
}
function stopTimer() { clearInterval(tick); tick = null; }

/* ================= 路由 ================= */
window.addEventListener("hashchange", route);

async function route() {
  stopTimer();
  const h = location.hash.slice(2) || "";
  const [head, a, b] = h.split("/");
  await loadMeta();
  renderTabs();
  if (head === "") return viewHome();
  if (head === "cat") return viewCat(a);
  if (head === "p") return startPractice(a, b);
  if (head === "r") return startRandom(a);
  if (head === "s") return session ? renderSession() : viewHome();
  if (head === "score") return session ? renderScore() : viewHome();
  if (head === "wrong") return startWrongFav("wrong");
  if (head === "fav") return startWrongFav("fav");
  viewHome();
}

/* ================= 顶栏 ================= */
function navEntries() {
  const wc = Object.keys(WRONG()).length, fc = Object.keys(FAV()).length;
  return [
    { key: "", label: "📚 全部题库", hash: "#/", group: "题库分类" },
    ...meta.cats.map(c => ({ key: "cat/" + c.id, label: catIcon(c.id) + " " + c.name, hash: "#/cat/" + c.id, group: "题库分类" })),
    { key: "wrong", label: "❌ 错题集", badge: wc, hash: "#/wrong", group: "我的" },
    { key: "fav", label: "⭐ 收藏", badge: fc, hash: "#/fav", group: "我的" },
    { key: "mock", label: "⏱️ 模拟考试", action: "mock", group: "我的" },
  ];
}
function closeNav() {
  const p = $(".nav-panel"), b = $(".nav-cur");
  if (p) p.classList.remove("show");
  if (b) b.classList.remove("open");
}
/* 收起式导航：顶栏只留「当前位置」按钮，点开是分类面板，省掉三行胶囊 */
function renderTabs() {
  const tabs = $("#tabs");
  const cur = location.hash.slice(2);
  const entries = navEntries();
  const active = entries.find(e => e.key !== "mock" && (e.key === "" ? cur === "" : cur.startsWith(e.key))) || entries[0];

  tabs.innerHTML = "";
  const wrap = el("div", "nav-wrap");
  const curBtn = el("button", "nav-cur");
  curBtn.innerHTML = `<span>${active.label}</span><i>▾</i>`;
  curBtn.onclick = e => {
    e.stopPropagation();
    const panel = $(".nav-panel");
    const open = !panel.classList.contains("show");
    panel.classList.toggle("show", open);
    curBtn.classList.toggle("open", open);
  };

  const panel = el("div", "nav-panel");
  const groups = ["题库分类", "我的"];
  for (const g of groups) {
    panel.appendChild(el("div", "nav-sec", g));
    const grid = el("div", "nav-grid");
    entries.filter(e => e.group === g).forEach(e => {
      const on = e === active;
      const b = el("button", "nav-item" + (on ? " on" : ""),
        `<span>${e.label}</span>` + (e.badge != null ? `<span class="n">${e.badge}</span>` : ""));
      b.onclick = ev => {
        ev.stopPropagation();
        closeNav();
        if (e.action === "mock") { openMockModal(); return; }
        if (location.hash === e.hash) route(); // 已在该页：重新渲染一遍
        else location.hash = e.hash;
      };
      grid.appendChild(b);
    });
    panel.appendChild(grid);
  }
  wrap.append(curBtn, panel);
  tabs.appendChild(wrap);
}
function catIcon(id) { return ({ "01": "🚩", "02": "🧠", "03": "📖", "04": "🔢", "05": "🧩", "06": "📊" })[id] || "📘"; }
function catName(id) { const c = meta.cats.find(x => x.id === id); return c ? c.name : id; }

/* ================= 首页 ================= */
function viewHome() {
  const wrap = el("div");
  const totalQs = meta.cats.reduce((s, c) => s + c.qs, 0);
  const totalExams = meta.cats.reduce((s, c) => s + c.exams, 0);
  const wrongN = Object.keys(WRONG()).length;
  const favN = Object.keys(FAV()).length;
  wrap.appendChild(el("div", "hero", `<h1>行测真题 · 刷题练习</h1><p>2016–2026 年国考 / 省考 / 联考 / 选调真题</p>`));

  // 一行统计，取代原来 7 张卡片（省掉约 4 行高度）
  wrap.appendChild(el("div", "home-meta",
    `<span><b>${totalQs.toLocaleString()}</b> 题</span><i>/</i><span><b>${totalExams}</b> 套卷</span><i>/</i><span><b>${meta.cats.length}</b> 大模块</span>`));

  // 错题集 / 收藏：带数量，点一下直接进入练习
  const quick = el("div", "quick-row");
  [
    { cls: "wrong", ic: "❌", name: "错题集", n: wrongN, sub: wrongN ? "点此重刷错题" : "暂无错题", hash: "#/wrong" },
    { cls: "fav", ic: "⭐", name: "收藏", n: favN, sub: favN ? "点此刷收藏题" : "暂无收藏", hash: "#/fav" },
  ].forEach(q => {
    const c = el("div", `quick-card ${q.cls}` + (q.n ? "" : " zero"),
      `<span class="ic">${q.ic}</span><span class="tt"><b>${q.name}</b><span>${q.sub}</span></span><span class="num">${q.n}</span>`);
    c.onclick = () => location.hash = q.hash;
    quick.appendChild(c);
  });
  wrap.appendChild(quick);

  // 继续练习
  const prog = PROG();
  const conts = Object.entries(prog).filter(([k, v]) => v.i >= 0).sort((a, b) => b[1].t - a[1].t).slice(0, 3);
  if (conts.length) {
    const sec = el("div", "home-sec");
    sec.appendChild(el("div", "sec-title", "<h2>🚀 继续练习</h2>"));
    const list = el("div", "exam-list");
    conts.forEach(([ref, v]) => {
      const item = el("div", "exam-item", `<div class="meta"><div class="t">${esc(v.t2 || ref)}</div><div class="d">上次做到第 ${v.i + 1} 题</div></div><span class="badge">继续</span>`);
      item.onclick = () => location.hash = `#/p/${ref}`;
      list.appendChild(item);
    });
    sec.appendChild(list);
    wrap.appendChild(sec);
  }

  const grid = el("div", "cat-grid");
  for (const c of meta.cats) {
    const card = el("div", "cat-card", `<span class="ico">${catIcon(c.id)}</span><h3>${c.name}</h3><p>${c.exams} 套卷 · ${c.qs} 题</p><span class="go">开始刷题 →</span>`);
    card.onclick = () => location.hash = `#/cat/${c.id}`;
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  setBody(wrap);
}

/* ================= 分类试卷列表 ================= */
async function viewCat(catId) {
  const cat = meta.cats.find(c => c.id === catId);
  const wrap = el("div");
  const idx = await loadCatIndex(catId);
  const years = [...new Set(idx.map(x => x.y).filter(Boolean))].sort().reverse();
  const prog = PROG();

  wrap.appendChild(el("div", "hero", `<h1>${catIcon(catId)} ${cat.name}</h1><p>${cat.exams} 套卷 · ${cat.qs} 题 · 点击试卷开始按顺序练习</p>`));

  const tools = el("div", "list-tools");
  const search = el("input", "search-box"); search.placeholder = "🔍 搜索试卷名称 / 地区…";
  const yearSel = el("select", "sel");
  yearSel.innerHTML = `<option value="">全部年份</option>` + years.map(y => `<option>${y}</option>`).join("");
  const randomBtn = el("button", "btn primary", "🎲 随机练习 20 题");
  randomBtn.onclick = () => location.hash = `#/r/${catId}`;
  tools.append(search, yearSel, randomBtn);
  wrap.appendChild(tools);

  const list = el("div", "exam-list");
  const foot = el("div", "list-foot");
  wrap.append(list, foot);
  setBody(wrap);

  let shown = 0;
  function renderList() {
    const kw = search.value.trim().toLowerCase();
    const yr = yearSel.value;
    const items = idx.filter(x => (!kw || (x.t + x.r).toLowerCase().includes(kw)) && (!yr || x.y === yr));
    list.innerHTML = "";
    shown = items.length;
    for (const x of items) {
      const p = prog[x.id];
      const pr = p ? Math.min(100, Math.round((p.i + 1) / x.n * 100)) : 0;
      const item = el("div", "exam-item",
        `<div class="meta"><div class="t">${esc(x.t)}</div><div class="d">${x.y || ""}${x.r ? " · " + x.r : ""} · ${x.n} 题</div>
         ${pr ? `<div class="progress-mini"><i style="width:${pr}%"></i></div>` : ""}</div>
         <span class="badge ${pr >= 100 ? "green" : "gray"}">${pr >= 100 ? "已完成" : pr > 0 ? pr + "%" : x.n + " 题"}</span>`);
      item.onclick = () => location.hash = `#/p/${x.id}`;
      list.appendChild(item);
    }
    foot.textContent = shown ? `共 ${shown} 套卷` : "没有匹配的试卷";
  }
  search.oninput = renderList; yearSel.onchange = renderList;
  renderList();
}

/* ================= 题目渲染 ================= */
function qrefKey(ref) { return ref; }

function renderQuestion(container, q, exam, opts) {
  // opts: {selected:Set, judged:bool, onToggle, onFav, fav, showAnswer, srcTitle}
  const card = el("div", "q-card");
  const metaRow = el("div", "q-meta");
  metaRow.appendChild(el("span", "tag type", q.tp || "题目"));
  metaRow.appendChild(el("span", "tag no", "第 " + q.i + " 题 · qid " + q.qid));
  if (opts.srcTitle) metaRow.appendChild(el("span", "tag no", esc(opts.srcTitle)));
  const fav = el("button", "fav-btn" + (opts.fav ? " on" : ""), opts.fav ? "★" : "☆");
  fav.title = "收藏本题";
  fav.onclick = () => opts.onFav && opts.onFav(fav);
  metaRow.appendChild(fav);
  card.appendChild(metaRow);

  const mh = matHtml(exam, q.m);
  if (mh) {
    const mat = el("div", "material");
    const head = el("div", "m-head", `<span>📄 材料 ${q.m}</span><em class="m-tip"></em>`);
    const body = el("div", "m-body");
    body.innerHTML = mh;
    blankifyDom(body);
    // 折叠状态由调用方保存，重绘时还原（避免点选/判分后又被展开）
    const syncHead = () => {
      const folded = mat.classList.contains("folded");
      head.querySelector(".m-tip").textContent = folded ? "已折叠 · 点击展开" : "点击折叠";
    };
    if (opts.folded) mat.classList.add("folded");
    syncHead();
    head.onclick = () => {
      const folded = mat.classList.toggle("folded");
      syncHead();
      if (opts.onFold) opts.onFold(folded);
    };
    mat.append(head, body);
    card.appendChild(mat);
  }

  const stem = el("div", "q-stem");
  if (isHtml(q.s)) { stem.classList.add("html"); stem.innerHTML = q.s; }
  else stem.textContent = q.s;
  blankifyDom(stem);
  card.appendChild(stem);

  const optsBox = el("div", "opts");
  const keys = Object.keys(q.o).sort();
  const ansKeys = (q.a || "").toUpperCase().split("").filter(c => /[A-Z]/.test(c));
  for (const k of keys) {
    const o = el("div", "opt");
    o.appendChild(el("span", "k", k));
    const txt = el("span");
    if (isHtml(q.o[k])) { txt.classList.add("html"); txt.innerHTML = q.o[k]; }
    else txt.textContent = q.o[k];
    o.appendChild(txt);
    if (opts.selected.has(k)) o.classList.add("sel");
    if (opts.judged || opts.showAnswer) {
      o.classList.add("disabled");
      if (ansKeys.includes(k)) o.classList.add("right");
      else if (opts.selected.has(k)) o.classList.add("wrong");
    }
    o.onclick = () => {
      if (opts.judged || opts.showAnswer) return;
      opts.onToggle(k, o);
    };
    optsBox.appendChild(o);
  }
  card.appendChild(optsBox);

  if (opts.judged || opts.showAnswer) {
    const box = el("div", "answer-box");
    const correct = q.a && norm([...opts.selected].join("")) === norm(q.a);
    if (q.a) {
      const line = el("div", "ans-line");
      const selStr = [...opts.selected].sort().join("") || "未作答";
      if (correct) line.innerHTML = `✅ 回答正确，答案：<b class="good">${q.a}</b>`;
      else line.innerHTML = `❌ 回答错误。你的答案：<b class="you">${selStr}</b>，正确答案：<b class="good">${q.a}</b>`;
      box.appendChild(line);
    } else {
      box.appendChild(el("div", "ans-line", "⚠️ 该题答案缺失，可参考下方解析。"));
    }
    if (q.e) {
      const ex = el("div", "expl");
      ex.appendChild(el("span", "ex-title", "📖 官方解析"));
      const bodyEl = el("div");
      if (isHtml(q.e)) { ex.classList.add("html"); bodyEl.innerHTML = q.e; }
      else bodyEl.textContent = q.e;
      blankifyDom(bodyEl);
      ex.appendChild(bodyEl);
      box.appendChild(ex);
    }
    card.appendChild(box);
  }
  container.appendChild(card);
  return card;
}

/* ================= 练习模式（单套卷 / 随机） ================= */
async function startPractice(catId, examId) {
  const ref = `${catId}/${examId}`;
  const exam = await loadExam(ref);
  const prog = PROG();
  const saved = prog[ref];
  session = {
    mode: "practice", catId, examId, ref, exam,
    title: exam.t, refs: exam.qs.map((_, i) => i), idx: 0,
    ans: {}, judged: {}, limit: 0,
  };
  if (saved && saved.i > 0 && saved.i < exam.qs.length) {
    session.idx = saved.i;
    toast(`已回到上次进度：第 ${saved.i + 1} 题`);
  }
  location.hash = "#/s";
}
async function startRandom(catId) {
  toast("正在随机抽题…");
  const refs = await pickRandomRefs(catId === "all" ? null : catId, 20, true);
  if (!refs.length) { toast("抽题失败"); return; }
  session = { mode: "random", catId, title: `随机练习 · ${catId === "all" ? "全部题库" : catName(catId)}`, refs, idx: 0, ans: {}, judged: {}, limit: 0 };
  location.hash = "#/s";
}

/* 从分类（或全部）随机抽 n 题，返回 qref 列表 */
async function pickRandomRefs(catId, n) {
  const cats = catId ? [meta.cats.find(c => c.id === catId)] : meta.cats;
  const allRefs = [];
  for (const c of cats) {
    const idx = await loadCatIndex(c.id);
    for (const x of idx) allRefs.push({ c: c.id, e: x.id.split("/")[1], n: x.n });
  }
  const picked = [];
  let loaded = 0;
  for (const r of shuffle(allRefs)) {
    if (picked.length >= n || loaded >= 260) break;
    loaded++;
    const ex = await loadExam(`${r.c}/${r.e}`);
    // 过滤掉无选项的残缺题（源库中极少）
    const valid = ex.qs.map((q, i) => i).filter(i => Object.keys(ex.qs[i].o).length > 0);
    const need = Math.max(2, Math.ceil((n - picked.length) / Math.max(1, allRefs.length - loaded + 1)) + 1);
    for (const qi of shuffle(valid).slice(0, need)) picked.push({ c: r.c, e: r.e, q: qi });
  }
  return shuffle(picked).slice(0, n);
}

/* ================= 会话渲染 ================= */
async function renderSession() {
  const s = session;
  if (!s) return viewHome();
  // 同一题重绘（点选/判分）时保持滚动位置，避免页面弹回顶部
  const prevKey = s.curKey, prevIdx = s.idx, prevScroll = window.scrollY;
  const wrap = el("div");

  // 头部
  const head = el("div", "p-header");
  const back = el("button", "btn", "← 退出");
  back.onclick = async () => {
    const isMockLive = s.mode === "mock" && !s.done;
    if (isMockLive) {
      const ok = await askConfirm("考试尚未交卷，退出后本次作答将不会保存。确定要退出吗？", { title: "退出考试", ok: "确定退出", danger: true });
      if (!ok) return;
      stopTimer();
    }
    // 练习/随机：退出前先问是否把「已答未判」的题补判进错题本（会话一关，作答就没了）
    if (!isMockLive && s.mode !== "wrong" && s.mode !== "fav") await flushPending();
    if (s._save) s._save();
    // 错题/收藏没有独立列表页，退出直接回首页（原来跳 #/wrong 会立刻重新进入同一轮练习，看起来像"退不出"）
    if (s.mode === "wrong" || s.mode === "fav") {
      session = null;
      location.hash = "#/";
      renderTabs();
      return;
    }
    location.hash = s.mode === "practice" ? `#/cat/${s.catId}` : "#/";
    if (isMockLive) { session = null; renderTabs(); }
  };
  const src = el("span", "src", esc(s.title));
  const timer = el("span", "timer", "00:00");
  timer.id = "timer";
  const cardBtn = el("button", "btn", "☰ 答题卡");
  cardBtn.onclick = openCard;
  head.append(back, src, timer, cardBtn);
  wrap.appendChild(head);

  const barRow = el("div", "progress-row");
  const bar = el("div", "progress-bar");
  const barFill = el("i");
  bar.appendChild(barFill);
  const countLabel = el("span", "count-label", "");
  barRow.append(bar, countLabel);
  wrap.appendChild(barRow);

  const body = el("div");
  wrap.appendChild(body);

  const btns = el("div", "p-btns");
  const prev = el("button", "btn", "← 上一题");
  const submit = el("button", "btn primary", s.mode === "mock" ? "确认作答" : "提交答案");
  const seeAns = el("button", "btn", "查看答案");
  const next = el("button", "btn", "下一题 →");
  const finish = el("button", "btn danger", s.mode === "mock" ? "交卷" : "结束练习");
  btns.append(prev, submit, seeAns, next, finish);
  wrap.appendChild(btns);
  setBody(wrap);

  syncTimer();

  async function show() {
    const s = session;
    const i = s.idx;
    barFill.style.width = ((i + 1) / s.refs.length * 100) + "%";
    const answeredCount = Object.keys(s.ans).filter(k => s.ans[k] && s.ans[k].size).length;
    countLabel.textContent = s.mode === "mock"
      ? `已答 ${answeredCount}/${s.refs.length} · 第 ${i + 1} 题`
      : `第 ${i + 1}/${s.refs.length} 题`;
    body.innerHTML = "";
    prev.disabled = i === 0;
    next.disabled = i === s.refs.length - 1;
    submit.disabled = false;
    seeAns.disabled = false;

    let q, exam, key, favKey, matKey;
    if (s.mode === "wrong" || s.mode === "fav") {
      const snap = s.refs[i];
      q = snap.q; exam = { ms: snap.ms ? snap.ms.map((h, j) => ({ i: j + 1, h })) : [] };
      key = snap.key; favKey = snap.key; matKey = snap.key;
    } else {
      let ref, qi;
      if (s.mode === "practice") { ref = s.ref; qi = i; }
      else { const r = s.refs[i]; ref = `${r.c}/${r.e}`; qi = r.q; }
      exam = await loadExam(ref);
      q = exam.qs[qi];
      key = i; favKey = q.qid || `${ref}#${qi}`; matKey = ref;
    }
    s.curKey = key; s.curFavKey = favKey; s.curQ = q; s.curExam = exam;

    // 材料折叠状态按「试卷/快照 + 材料编号」记忆：重绘（点选、提交、判分）不丢失，
    // 同一材料下的多道资料分析题之间也保持一致
    if (!s.fold) s.fold = {};
    const foldKey = `${matKey}#m${q.m}`;

    const selected = new Set(s.ans[key] || []);
    const judged = !!s.judged[key];
    const fav = !!FAV()[favKey];
    renderQuestion(body, q, exam, {
      selected, judged, fav,
      folded: !!s.fold[foldKey],
      onFold(v) { s.fold[foldKey] = v; },
      srcTitle: s.mode === "random" || s.mode === "mock" ? exam.t : null,
      showAnswer: s.done === true,
      onToggle(k) {
        const set = s.ans[key] || (s.ans[key] = new Set());
        // 多选题可多选；单选替换
        const multi = (q.a || "").length > 1;
        if (multi) { set.has(k) ? set.delete(k) : set.add(k); }
        else { set.clear(); set.add(k); }
        s.ans[key] = set;
        renderSession();
        // 模拟考试：单选/判断类题目点选后自动进入下一题
        if (s.mode === "mock" && !s.done && !multi) {
          setTimeout(() => {
            if (session !== s || s.done) return;
            if (s.idx < s.refs.length - 1) s.idx++;
            else {
              const done = Object.keys(s.ans).filter(x => s.ans[x] && s.ans[x].size).length;
              toast(done >= s.refs.length ? "已全部作答，可以交卷了 🎉" : "已是最后一题，可检查答题卡后交卷");
            }
            renderSession();
          }, 260);
        }
      },
      onFav(btn) {
        const f = FAV();
        if (f[favKey]) { delete f[favKey]; toast("已取消收藏"); }
        else { f[favKey] = makeSnapshot(exam, q); toast("已收藏 ⭐"); }
        LS.set("xq_fav", f);
        btn.classList.toggle("on", !!f[favKey]);
        btn.textContent = f[favKey] ? "★" : "☆";
        renderTabs();
      },
    });

    // 按钮状态
    const answered = (s.ans[key] || new Set()).size > 0;
    const mockLive = s.mode === "mock" && !s.done;
    const multiQ = (q.a || "").length > 1;
    // 模拟考试单选类：点选即自动跳题，无需提交按钮；多选题保留「确认作答」
    submit.style.display = mockLive && !multiQ ? "none" : "";
    seeAns.style.display = mockLive || s.done ? "none" : "";
    submit.disabled = mockLive ? !answered : (judged || s.done || !answered);
    seeAns.disabled = judged || s.done;
    if (s.done) { submit.disabled = true; finish.textContent = "返回成绩"; }

    // 还是同一题（仅是判分/选中状态变化）：恢复原滚动位置
    if (key === prevKey && i === prevIdx && prevScroll > 0) window.scrollTo(0, prevScroll);
  }

  prev.onclick = () => { saveProgress(); session.idx--; renderSession(); };
  next.onclick = () => { saveProgress(); session.idx++; renderSession(); };
  submit.onclick = async () => {
    const s = session;
    // 模拟考试模式：确认作答后直接跳下一题，不判分
    if (s.mode === "mock" && !s.done) {
      if (s.idx < s.refs.length - 1) { s.idx++; renderSession(); }
      else finish.onclick();
      return;
    }
    const r = await gradeOne(s.idx, { explicit: true });
    if (!r) { toast("请先选择答案"); return; }
    if (r.changed === "add") toast("答错了，已加入错题集 ❌");
    else if (r.changed === "remove") toast("答对了，已移出错题本 🎉");
    renderSession();
  };
  // 查看答案等同判分：看到答案后必须计入错题本，否则「看了答案但没点提交」就成了漏记
  seeAns.onclick = async () => {
    const s = session;
    await gradeOne(s.idx, { explicit: true });
    s.judged[ansKeyOf(s, s.idx)] = true;   // 未作答也可以查看答案/解析
    renderSession();
  };
  finish.onclick = async () => {
    const s = session;
    if (s.mode === "mock" && !s.done) {
      const un = s.refs.length - Object.keys(s.ans).filter(k => s.ans[k] && s.ans[k].size).length;
      const msg = un ? `还有 ${un} 题未作答，确定交卷吗？` : "全部题目已作答，确定交卷吗？";
      if (!await askConfirm(msg, { title: "交卷", ok: "交卷", danger: true })) return;
      return submitMock();
    }
    await flushPending();   // 结束练习前补判未提交的作答
    saveProgress();
    if (s.mode === "practice") location.hash = `#/cat/${s.catId}`;
    else if (s.mode === "mock") location.hash = "#/score";
    else location.hash = "#/";
  };

  function saveProgress() {
    const s = session;
    if (s.mode !== "practice") return;
    const p = PROG();
    p[s.ref] = { i: s.idx, t: Date.now(), t2: s.title };
    LS.set("xq_progress", p);
  }
  session._save = saveProgress;
  await show();
}

/* 快照：存入错题本/收藏 */
function makeSnapshot(exam, q, srcTitle) {
  const snap = { q: JSON.parse(JSON.stringify(q)), key: q.qid || (exam.id + "#" + q.i), src: srcTitle || exam.t || "", ts: Date.now() };
  const mh = matHtml(exam, q.m);
  if (mh) { snap.ms = [mh]; snap.q.m = 1; }
  return snap;
}

/* ================= 判分 & 错题同步 =================
 * 统一入口：凡是「等同于已经看过答案」的动作（提交答案 / 查看答案 / 离开前补判）都走这里，
 * 保证错题本和实际作答一致。点选答案本身不判分（可能只是暂选、多选未选完）。
 */
async function resolveItem(s, i) {
  if (s.mode === "practice") return { q: s.exam.qs[i], exam: s.exam, ref: s.ref, qi: i };
  if (s.mode === "random" || s.mode === "mock") {
    const r = s.refs[i];
    const ref = `${r.c}/${r.e}`;
    const exam = await loadExam(ref);
    return { q: exam.qs[r.q], exam, ref, qi: r.q };
  }
  const snap = s.refs[i];
  return { q: snap.q, exam: { ms: [] }, ref: snap.key, qi: i };
}
/* 作答状态（ans/judged）的键：练习/随机用题序号，错题/收藏用快照 key（qid） */
function ansKeyOf(s, i) {
  return (s.mode === "wrong" || s.mode === "fav") ? s.refs[i].key : i;
}
/* 判分第 i 题（跳过已判分 / 未作答），返回 {ok, changed:"add"|"remove"|null} */
async function gradeOne(i, opt) {
  opt = opt || {};
  const s = session;
  if (!s || s.mode === "mock") return null;        // 模拟考试交卷后统一处理
  const key = ansKeyOf(s, i);
  if (s.judged[key]) return null;
  const sel = s.ans[key] instanceof Set ? [...s.ans[key]] : [];
  if (!sel.length) return null;
  const it = await resolveItem(s, i);
  const q = it.q;
  if (!q) return null;
  s.judged[key] = true;
  const ok = !!q.a && norm(sel.sort().join("")) === norm(q.a);
  const snapMode = s.mode === "wrong" || s.mode === "fav";
  const fk = snapMode ? s.refs[i].key : (q.qid || `${it.ref}#${it.qi}`);
  const w = WRONG();
  let changed = null;
  if (!ok && s.mode !== "wrong") {
    // 答错 → 入错题本（已在则跳过）
    if (!w[fk]) { w[fk] = makeSnapshot(it.exam, q, s.title); LS.set("xq_wrong", w); changed = "add"; }
  } else if (ok && w[fk]) {
    // 答对 → 若该题在错题本里则移出（错题重刷、或之前错过又做对了，都算已掌握）
    delete w[fk]; LS.set("xq_wrong", w); changed = "remove";
  }
  if (changed) renderTabs();
  return { ok, changed };
}
/* 已选答案但还没判分的题数 */
function pendingCount(s) {
  s = s || session;
  if (!s || s.mode === "mock" || s.mode === "wrong" || s.mode === "fav") return 0;
  return Object.keys(s.ans).filter(k => s.ans[k] && s.ans[k].size && !s.judged[k]).length;
}
async function gradePending() {
  const s = session;
  const out = { n: 0, add: 0, remove: 0 };
  if (!s) return out;
  const keys = Object.keys(s.ans).filter(k => s.ans[k] && s.ans[k].size && !s.judged[k]);
  for (const k of keys) {
    const r = await gradeOne(+k, { batch: true });
    if (!r) continue;
    out.n++;
    if (r.changed) out[r.changed]++;
  }
  return out;
}
/* 离开练习前补判：让「选了就跳下一题」的作答也能进错题本，但要先问一句，别偷偷改数据 */
async function flushPending() {
  const n = pendingCount(session);
  if (!n) return;
  const ok = await askConfirm(
    `还有 ${n} 道题已作答但没提交、也没看答案。现在判分会同步错题集：答错的加入，答对且原来在错题集里的移出。`,
    { title: "同步错题集", ok: "判分并同步", cancel: "直接离开" }
  );
  if (!ok) return;
  const r = await gradePending();
  toast(`已判分 ${r.n} 道${r.add ? `，新增 ${r.add} 道错题` : ""}${r.remove ? `，移出 ${r.remove} 道` : ""}`);
}

/* ================= 错题 / 收藏 ================= */
function startWrongFav(mode) {
  const data = mode === "wrong" ? WRONG() : FAV();
  const snaps = Object.values(data).sort((a, b) => b.ts - a.ts);
  if (!snaps.length) {
    const wrap = el("div");
    wrap.appendChild(el("div", "empty", `<div class="big">${mode === "wrong" ? "🎉" : "⭐"}</div><p>${mode === "wrong" ? "暂无错题，答错的题会自动收进错题本" : "暂无收藏，答题页点击 ☆ 收藏题目"}</p>`));
    const b = el("div", "", '<div style="text-align:center"><button class="btn primary">返回全部题库</button></div>');
    b.querySelector("button").onclick = () => location.hash = "#/";
    wrap.appendChild(b);
    setBody(wrap);
    return;
  }
  session = {
    mode, title: mode === "wrong" ? `错题集 · ${snaps.length} 题` : `收藏题集 · ${snaps.length} 题`,
    refs: snaps, idx: 0, ans: {}, judged: {}, limit: 0,
  };
  location.hash = "#/s";
  renderSession();
}

/* ================= 模拟考试 ================= */
function openMockModal() {
  const sel = $("#mockScope");
  sel.innerHTML = `<option value="all">全部题库</option>` + meta.cats.map(c => `<option value="${c.id}">${catIcon(c.id)} ${c.name}</option>`).join("");
  $("#mockModal").classList.add("show");
}
$("#mockCancel").onclick = () => $("#mockModal").classList.remove("show");
$("#mockStart").onclick = async () => {
  $("#mockModal").classList.remove("show");
  const scope = $("#mockScope").value;
  const count = +$("#mockCount").value;
  const mins = +$("#mockTime").value;
  toast("正在组卷，随机抽题…");
  const refs = await pickRandomRefs(scope === "all" ? null : scope, count, true);
  if (!count || !refs.length || refs.length < count * 0.6) { toast("抽题不足，请重试"); return; }
  session = {
    mode: "mock", catId: scope, title: `模拟考试 · ${scope === "all" ? "全部题库" : catName(scope)} · ${refs.length} 题`,
    refs, idx: 0, ans: {}, judged: {}, limit: mins * 60, remain: mins * 60, done: false,
  };
  location.hash = "#/s";
  renderSession();
};
async function submitMock() {
  const s = session;
  if (!s || s.mode !== "mock" || s.done) return;
  stopTimer();
  s.remain = mockRemain();
  s.usedTime = Math.min(s.limit, (Date.now() - (s.startTs || Date.now())) / 1000);
  s.done = true;
  // 交卷前把整卷试题都加载进缓存，保证判分 / 错题统计覆盖全部题目（含跳题未加载的）
  const refs = [...new Set(s.refs.map(r => `${r.c}/${r.e}`))];
  await Promise.all(refs.map(r => loadExam(r).catch(() => null)));
  location.hash = "#/score";
  renderScore();
}

/* ================= 成绩 ================= */
/* 整卷逐题统计：ok=答对 / blank=未作答 / 其余为答错 */
function scoreItems() {
  const s = session;
  const items = [];
  if (!s) return items;
  s.refs.forEach((r, i) => {
    const sel = [...(s.ans[i] || [])].sort().join("");
    let q, ex;
    if (s.mode === "mock") { ex = examCache[`${r.c}/${r.e}`]; q = ex && ex.qs[r.q]; }
    else { q = r.q; ex = r; }
    if (!q || !ex) return;
    const ok = !!sel && !!q.a && norm(sel) === norm(q.a);
    items.push({ i, q, ex, sel, ok, blank: !sel, fk: q.qid || `${r.c}/${r.e}#${r.q}` });
  });
  return items;
}

function renderScore() {
  const s = session;
  if (!s) return viewHome();
  const items = scoreItems();
  if (!items.length) { viewHome(); return; }
  const right = items.filter(x => x.ok).length;
  const wrong = items.filter(x => !x.ok && !x.blank).length;
  const blank = items.filter(x => x.blank).length;
  const total = s.refs.length;
  const score = right;
  const wrap = el("div");
  wrap.appendChild(el("div", "score-card", `
    <div class="trophy">${score / total >= 0.8 ? "🏆" : score / total >= 0.6 ? "🎯" : "💪"}</div>
    <div class="num">${score}<small> / ${total} 分</small></div>
    <div class="score-sub">
      <span>用时 <b>${fmtTime(s.usedTime || 0)}</b></span>
      <span>答对 <b class="ok">${right}</b></span>
      <span>答错 <b class="bad">${wrong}</b></span>
      <span>未答 ${blank}</span>
      <span>正确率 <b>${Math.round(right / total * 100)}%</b></span>
    </div>`));
  const btns = el("div", "p-btns");
  const review = el("button", "btn primary", "📖 回顾整卷");
  review.onclick = () => { session.idx = 0; location.hash = "#/s"; renderSession(); };
  const addWrong = el("button", "btn", "❌ 加入错题集");
  addWrong.onclick = () => openAddWrong(addWrong);
  const exit = el("button", "btn", "退出考试");
  exit.onclick = () => { session = null; location.hash = "#/"; renderTabs(); };
  btns.append(review, addWrong, exit);
  wrap.appendChild(btns);
  setBody(wrap);
}

/* 加入错题集：先确认，默认只收答错的题，可选是否连未作答一起收 */
function openAddWrong(btn) {
  const s = session;
  if (!s) return;
  const items = scoreItems();
  const w = WRONG();
  const wrongItems = items.filter(x => !x.ok && !x.blank);
  const blankItems = items.filter(x => x.blank);
  if (!wrongItems.length && !blankItems.length) { toast("本卷没有答错的题，无需加入 🎉"); return; }

  const box = $("#awIncludeBlank"), row = $("#awBlankRow");
  box.checked = false;
  row.classList.toggle("hide", blankItems.length === 0);
  $("#awBlankN").textContent = blankItems.length;

  const paint = () => {
    const incBlank = box.checked && blankItems.length > 0;
    const picked = incBlank ? wrongItems.concat(blankItems) : wrongItems;
    const fresh = picked.filter(x => !w[x.fk]).length;
    const dup = picked.length - fresh;
    $("#awSummary").innerHTML = `本卷共 <b>${s.refs.length}</b> 题：答错 <b class="bad">${wrongItems.length}</b> 道`
      + (blankItems.length ? ` · 未作答 <b class="mut">${blankItems.length}</b> 道` : "")
      + `<br>本次将加入 <b>${fresh}</b> 道` + (dup ? `（${dup} 道已在错题本中，自动跳过）` : "");
    const ok = $("#awOk");
    ok.textContent = fresh ? `加入 ${fresh} 道` : "已全部在错题本中";
    ok.disabled = fresh === 0;
  };
  box.onchange = paint;
  paint();

  $("#awOk").onclick = () => {
    const list = (box.checked && blankItems.length) ? wrongItems.concat(blankItems) : wrongItems;
    let n = 0;
    for (const it of list) {
      if (w[it.fk]) continue;
      w[it.fk] = makeSnapshot(it.ex, it.q, s.title);
      n++;
    }
    if (n) LS.set("xq_wrong", w);
    renderTabs();
    $("#awModal").classList.remove("show");
    btn.textContent = "✅ 已加入错题集";
    toast(n ? `已加入 ${n} 道错题，去错题集练起来吧` : "这些题已在错题本中了");
  };
  $("#awCancel").onclick = () => $("#awModal").classList.remove("show");
  $("#awModal").classList.add("show");
}

/* ================= 答题卡 ================= */
function openCard() {
  const s = session;
  if (!s) return;
  const grid = $("#cardGrid");
  grid.innerHTML = "";
  const states = [];
  for (let i = 0; i < s.refs.length; i++) {
    const sel = (s.ans[i] || new Set()).size > 0;
    const judged = s.judged[i] || s.done;
    let cls = "";
    if (judged && sel) {
      let q;
      if (s.mode === "wrong" || s.mode === "fav") q = s.refs[i].q;
      else if (s.mode === "practice") q = s.exam.qs[i];
      else { const r = s.refs[i]; const ex = examCache[`${r.c}/${r.e}`]; q = ex && ex.qs[r.q]; }
      const ok = q && q.a && norm([...(s.ans[i] || [])].join("")) === norm(q.a);
      cls = ok ? "right" : "wrong";
    } else if (sel) cls = "ans";
    if (i === s.idx) cls += " cur";
    states.push({ i, cls });
  }
  for (const { i, cls } of states) {
    const c = el("button", "cell " + cls, String(i + 1));
    c.onclick = () => {
      $("#cardDrawer").classList.remove("show");
      $("#cardMask").classList.remove("show");
      session.idx = i;
      renderSession();
    };
    grid.appendChild(c);
  }
  $("#cardDrawer").classList.add("show");
  $("#cardMask").classList.add("show");
}
$("#cardClose").onclick = () => { $("#cardDrawer").classList.remove("show"); $("#cardMask").classList.remove("show"); };
$("#cardMask").onclick = () => { $("#cardDrawer").classList.remove("show"); $("#cardMask").classList.remove("show"); };
$("#brand").onclick = () => location.hash = "#/";
$("#awModal").onclick = e => { if (e.target.id === "awModal") $("#awModal").classList.remove("show"); };
$("#cfYes").onclick = () => settleConfirm(true);
$("#cfNo").onclick = () => settleConfirm(false);
$("#cfModal").onclick = e => { if (e.target.id === "cfModal") settleConfirm(false); };
document.addEventListener("keydown", e => { if (e.key === "Escape" && cfResolve) settleConfirm(false); });

/* 顶部收起式导航：点空白处或按 Esc 收起 */
document.addEventListener("click", e => {
  const w = document.querySelector(".nav-wrap");
  if (w && !w.contains(e.target)) closeNav();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeNav(); });

/* ================= 启动 ================= */
route();
