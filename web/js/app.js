/* One UI Agent — 셸: 상태, 라우터, 공통 컴포넌트. 화면은 js/views/*.js (위젯=파일 1개). */
"use strict";

const App = {
  state: { user: null, version: null, boot: null, data: null, queue: null, notifs: { items: [] }, usage: null },
  views: {},   // route -> {title, icon, render}
  register(route, def) { this.views[route] = def; },

  async start() {
    document.documentElement.dataset.theme = localStorage.getItem("theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.getElementById("theme-toggle").onclick = () => {
      const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = t; localStorage.setItem("theme", t);
    };
    this.state.boot = await this.api("/api/bootstrap");
    const qp = new URLSearchParams(location.search);
    if (qp.get("theme")) { document.documentElement.dataset.theme = qp.get("theme"); }
    if (qp.get("as")) {   // 테스트/헤드리스 캡처용 자동 로그인
      this.state.user = await this.api("/api/login", { name: qp.get("as") });
      localStorage.setItem("user", JSON.stringify(this.state.user));
      return this.enter();
    }
    const saved = localStorage.getItem("user");
    if (saved) { this.state.user = JSON.parse(saved); this.enter(); }
    else this.showLogin();
  },

  showLogin() {
    const ov = document.getElementById("login");
    ov.classList.remove("hidden");
    const go = async () => {
      try {
        const u = await this.api("/api/login", { name: document.getElementById("login-name").value });
        this.state.user = u; localStorage.setItem("user", JSON.stringify(u));
        ov.classList.add("hidden"); this.enter();
      } catch (e) { this.toast(e.message, true); }
    };
    document.getElementById("login-btn").onclick = go;
    document.getElementById("login-name").onkeydown = e => { if (e.key === "Enter") go(); };
  },

  async enter() {
    document.getElementById("shell").classList.remove("hidden");
    const vs = document.getElementById("version-select");
    vs.innerHTML = this.state.boot.versions.map(v => `<option value="${v}">One UI ${v}</option>`).join("");
    const savedVer = localStorage.getItem("version");
    this.state.version = this.state.boot.versions.includes(savedVer) ? savedVer : this.state.boot.versions[0];
    localStorage.setItem("version", this.state.version);
    vs.value = this.state.version;
    vs.onchange = async () => { this.state.version = vs.value; localStorage.setItem("version", vs.value); await this.reload(); this.route(); };
    const u = this.state.user;
    document.getElementById("user-chip").innerHTML =
      `<div class="avatar">${u.name[0]}</div><div>${u.name}<div class="role">${u.role === "admin" ? "관리자" : "일반"}</div></div>`;
    document.getElementById("bell").onclick = () => { location.hash = "#/notifications"; };
    document.getElementById("engine-chip").innerHTML = `엔진: <b>${this.state.boot.engine.default}</b>`;
    this.buildNav();
    await this.reload();
    window.onhashchange = () => this.route();
    this.route();
    this.poll(); setInterval(() => this.poll(), 2500);
  },

  buildNav() {
    const icons = {
      dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
      review: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
      meetings: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
      tracking: '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v3a3 3 0 0 0 3 3h6"/>',
      insight: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.7 1 1.5 1 2.5h6c0-1 .2-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
      query: '<path d="M21 11a8 8 0 1 0-3.3 6.5L21 20z"/>',
      personas: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M17 4l1 2 2 .3-1.5 1.5.4 2.2-1.9-1-1.9 1 .4-2.2L14 6.3 16 6z"/>',
      notifications: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.06-.4.1-.8.1-1.2z"/>',
      logs: '<path d="M4 17l6-5-6-5"/><path d="M12 19h8"/>'
    };
    const nav = document.getElementById("nav");
    nav.innerHTML = Object.entries(this.views).map(([r, v]) =>
      `<a class="nav-item" data-route="${r}" href="#/${r}">
         <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[r] || ""}</svg>
         ${v.title}<span class="count hidden" data-count="${r}"></span></a>`).join("");
  },

  async reload() { this.state.data = await this.api("/api/version/" + this.state.version); },

  route() {
    const r = (location.hash.replace("#/", "") || "dashboard").split("?")[0];
    const def = this.views[r] || this.views.dashboard;
    document.querySelectorAll(".nav-item").forEach(a => a.classList.toggle("active", a.dataset.route === r));
    const el = document.getElementById("view");
    el.innerHTML = "";
    def.render(el, this);
  },

  async poll() {
    try {
      const [q, n, boot] = await Promise.all([this.api("/api/queue"), this.api("/api/notifications"), this.api("/api/bootstrap")]);
      const wasRunning = this.state.queue && this.state.queue.current;
      this.state.queue = q; this.state.notifs = n; this.state.boot = boot;
      // 상단 바 갱신
      const pill = document.getElementById("queue-pill");
      if (q.current) { pill.className = "queue-pill running"; pill.innerHTML = `<span class="dot"></span>${q.current}${q.pending.length ? " · 대기 " + q.pending.length : ""}`; }
      else if (q.pending.length) { pill.className = "queue-pill running"; pill.innerHTML = `<span class="dot"></span>대기 ${q.pending.length}건`; }
      else { pill.className = "queue-pill"; pill.innerHTML = `<span class="dot"></span>큐 비어 있음`; }
      const unread = n.items.filter(x => !x.read_by.includes(this.state.user.name)).length;
      const bb = document.getElementById("bell-badge");
      bb.classList.toggle("hidden", !unread); bb.textContent = unread;
      const nc = document.querySelector('[data-count="notifications"]');
      if (nc) { nc.classList.toggle("hidden", !unread); nc.textContent = unread; }
      if (wasRunning && !q.current && !q.pending.length) { await this.reload(); this.route(); }
    } catch (e) { /* 서버 순단 무시 */ }
  },

  async api(url, body) {
    const res = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.detail || j.error || res.statusText);
    return j;
  },

  async run(kind, params) {
    try {
      const r = await this.api("/api/run", { kind, version: this.state.version, user: this.state.user.name, role: this.state.user.role, params });
      this.toast("큐에 등록됨: " + r.queued);
      this.poll();
    } catch (e) { this.toast(e.message, true); }
  },

  toast(msg, err) {
    const t = document.createElement("div");
    t.className = "toast" + (err ? " err" : ""); t.textContent = msg;
    document.getElementById("toast-root").appendChild(t);
    setTimeout(() => t.remove(), err ? 5200 : 3200);
  },

  modal({ title, body, foot, wide }) {
    const root = document.getElementById("modal-root");
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `<div class="modal${wide ? " wide" : ""}"><div class="modal-head">${title}<button class="btn ghost small x">✕</button></div><div class="modal-body"></div><div class="modal-foot"></div></div>`;
    back.querySelector(".modal-body").append(body);
    if (foot) back.querySelector(".modal-foot").append(...foot);
    back.onclick = e => { if (e.target === back) back.remove(); };
    back.querySelector(".x").onclick = () => back.remove();
    root.append(back);
    return back;
  },

  el(html) { const d = document.createElement("div"); d.innerHTML = html; return d; },

  // ── 도메인 배지 ──
  gradeBadge(g) { return g ? `<span class="badge b-${g.toLowerCase()}">${g}</span>` : '<span class="badge b-outline">—</span>'; },
  recBadge(r) {
    const m = { go: ["b-go", "진행"], conditional_go: ["b-cgo", "조건부"], defer: ["b-defer", "보류"], no_go: ["b-nogo", "반대"], rejected: ["b-rejected", "거절"] };
    return r && m[r] ? `<span class="badge ${m[r][0]}">${m[r][1]}</span>` : '<span class="badge b-outline">—</span>';
  },
  riskBadge(r) {
    const m = { high: "높음", caution: "주의", normal: "정상", unknown: "미확인" };
    return r ? `<span class="badge b-risk-${r}">${m[r] || r}</span>` : '<span class="badge b-outline">—</span>';
  },
  statusBadge(s) {
    const m = { ingested: ["b-p2", "인입"], reviewing: ["b-blue", "리뷰 중"], meeting_wait: ["b-violet", "회의 대기"], decided: ["b-go", "결정됨"] };
    return m[s] ? `<span class="badge ${m[s][0]}">${m[s][1]}</span>` : "";
  },

  // ── 슬라이드 뷰어 ──
  slideViewer(feature, plCheck) {
    if (!feature.slides || !feature.slides.length) { this.toast("등록된 슬라이드가 없습니다", true); return; }
    let i = 0;
    const back = document.createElement("div");
    back.className = "viewer-back";
    const issues = (plCheck && plCheck.slide_issues) || [];
    const draw = () => {
      const issue = issues.find(x => x.slide === i + 1);
      back.innerHTML = `
        <img class="viewer-img" src="/slides/${this.state.version}/${feature.slides[i]}">
        ${issue ? `<div class="viewer-issue">⚠ PL 지적 — 슬라이드 ${issue.slide}: ${issue.issue}</div>` : ""}
        <div class="viewer-nav">
          <button class="btn small" data-nav="-1">◀ 이전</button>
          <span>[${feature.feature_index}] ${feature.name} — ${i + 1} / ${feature.slides.length}</span>
          <button class="btn small" data-nav="1">다음 ▶</button>
          <button class="btn small" data-close>닫기 ✕</button>
        </div>`;
      back.querySelectorAll("[data-nav]").forEach(b => b.onclick = e => { e.stopPropagation(); i = (i + +b.dataset.nav + feature.slides.length) % feature.slides.length; draw(); });
      back.querySelector("[data-close]").onclick = () => back.remove();
    };
    back.onclick = e => { if (e.target === back) back.remove(); };
    draw();
    document.body.append(back);
  },

  // ── 마크다운 미니 렌더러 ──
  md(text) {
    let h = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    h = h.replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>");
    h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    h = h.replace(/^> (.*)$/gm, "<blockquote>$1</blockquote>");
    h = h.replace(/^(\|.+\|)$/gm, m => "\x01" + m);
    h = h.replace(/(\x01\|.+\|\n?)+/g, block => {
      const rows = block.split("\x01").filter(Boolean).map(r => r.trim()).filter(r => !/^\|[\s\-|]+\|$/.test(r));
      return "<table>" + rows.map((r, ri) => "<tr>" + r.split("|").slice(1, -1).map(c => `<t${ri ? "d" : "h"}>${c.trim()}</t${ri ? "d" : "h"}>`).join("") + "</tr>").join("") + "</table>";
    });
    h = h.replace(/^\d+\. (.*)$/gm, "<li>$1</li>").replace(/^- (.*)$/gm, "<li>$1</li>");
    h = h.replace(/(<li>.*<\/li>\n?)+/g, m => "<ul>" + m + "</ul>");
    return h.split(/\n{2,}/).map(p => /^<(h|u|t|b)/.test(p.trim()) ? p : `<p>${p}</p>`).join("");
  },

  fmtDate(s) { return (s || "").replace("T", " ").slice(0, 16); }
};
