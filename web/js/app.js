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
    if (qp.get("autoclick")) setTimeout(() => document.getElementById(qp.get("autoclick"))?.click(), 1800);
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
  // 리뷰 등급 5단계 — 리뷰의 유일한 산출물 (진행/중단 권고는 리뷰가 하지 않는다)
  GRADES: {
    P0: { label: "P0", full: "최우선 대면", cls: "b-p0" },
    P1: { label: "P1", full: "대면", cls: "b-p1" },
    P2: { label: "P2", full: "서면보고", cls: "b-p2" },
    SHARE: { label: "공유", full: "단순 공유", cls: "b-share" },
    DOC: { label: "보완", full: "문서 보완 필요", cls: "b-doc" }
  },
  gradeBadge(g) {
    const d = this.GRADES[g];
    return d ? `<span class="badge ${d.cls}" title="${d.full}">${d.label}</span>` : '<span class="badge b-outline">—</span>';
  },
  // 회의 결정 3가지 — 미지원은 이번 버전에서 빠지고(통계 제외) 다음 버전 이력 추적용으로만 남는다
  DECISIONS: {
    support: { label: "지원", cls: "b-go" },
    hold: { label: "보류", cls: "b-defer" },
    reject: { label: "미지원", cls: "b-nogo" }
  },
  recBadge(r) {
    const d = this.DECISIONS[r];
    return d ? `<span class="badge ${d.cls}">${d.label}</span>` : '<span class="badge b-outline">—</span>';
  },
  statusBadge(s) {
    const m = { ingested: ["b-p2", "인입"], reviewing: ["b-blue", "리뷰 중"], meeting_wait: ["b-violet", "회의 대기"], decided: ["b-go", "결정됨"] };
    return m[s] ? `<span class="badge ${m[s][0]}">${m[s][1]}</span>` : "";
  },

  // ── 개발 완료 판정 ──
  // 규칙은 config/excel_schema.json의 dev_done_rule (설정 화면에서 편집).
  // filled: 지정 열에 값이 있으면 완료 (예: CL 열의 CL 번호) · values: 지정 열의 값이 목록에 있으면 완료
  PLACEHOLDERS: ["-", "–", "—", "tbd", "n/a", "na", "미정", "추후", "없음", "예정"],

  hasValue(v) {
    const s = String(v == null ? "" : v).trim();
    return !!s && !this.PLACEHOLDERS.includes(s.toLowerCase());
  },

  devDoneRule() { return this.state.boot.dev_done_rule || {}; },

  isDevDone(f) {
    const r = this.devDoneRule();
    if (!r.column) return null;                       // 미설정
    const v = (f.row || {})[r.column];
    if (r.mode === "values") return (r.values || []).includes(String(v == null ? "" : v).trim());
    if (!this.hasValue(v)) return false;              // filled
    if (r.pattern) { try { return new RegExp(r.pattern).test(String(v).trim()); } catch { return true; } }
    return true;
  },

  // ── 일정 리스크 판정 (결정적 규칙 — AI 판단 아님) ──
  // 규칙: UX 일정이 있어야 개발 일정이 나온다 → 개발 일정이 DVR(과제 설정)을 넘으면 리스크.
  // 엑셀의 날짜 문자열 → Date(로컬 자정). ISO 문자열을 new Date()에 그대로 넘기면
  // UTC로 해석돼 하루 밀리므로 반드시 숫자를 뽑아 로컬로 만든다.
  parseDate(v) {
    const s = String(v == null ? "" : v).trim();
    if (!s || this.PLACEHOLDERS.includes(s.toLowerCase())) return null;
    const m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d) ? null : d;
  },

  // 리스크는 있음 / 없음 두 가지 (설정 전에는 미설정)
  scheduleRisk(f) {
    const dvr = this.parseDate((this.state.data.schedule || {}).dvr);
    const fields = (this.state.boot.schema_fields) || {};
    const uxCol = fields.ux_schedule, devCol = fields.dev_schedule;
    if (!dvr || !devCol) return { risk: null, reason: !dvr ? "DVR 미설정 — 회의 화면에서 과제 일정 지정" : "개발 일정 열 미지정 — 설정에서 연결" };
    const row = f.row || {};
    const dev = this.parseDate(row[devCol]);
    const ux = uxCol ? this.parseDate(row[uxCol]) : null;
    if (dev) {
      const over = Math.round((dev - dvr) / 86400000);
      return over > 0
        ? { risk: true, reason: `개발 일정(${row[devCol]})이 DVR을 ${over}일 초과` }
        : { risk: false, reason: `개발 일정(${row[devCol]}) DVR 이내 (${-over}일 여유)` };
    }
    if (uxCol && !ux) return { risk: true, reason: "UX 일정 미정 — 개발 일정을 산출할 수 없음" };
    return { risk: true, reason: "개발 일정 미정" + (ux ? ` (UX 일정 ${row[uxCol]})` : "") + " — DVR 준수를 확인할 수 없음" };
  },

  riskBadge2(f) {
    const r = this.scheduleRisk(f);
    if (r.risk === null) return `<span class="badge b-outline" title="${r.reason}">—</span>`;
    return r.risk
      ? `<span class="badge b-risk-high" title="${r.reason}">있음</span>`
      : `<span class="badge b-risk-normal" title="${r.reason}">없음</span>`;
  },

  // ── 관리 열 선택 창 (업로드 직후 · 설정에서 공용) ──
  // cols: 엑셀의 전체 열, managed: 현재 선택된 열, newCols: 이번에 새로 감지된 열
  columnPicker({ cols, managed, newCols = [], onSaved }) {
    const sel = new Set(managed && managed.length ? managed : cols);   // 최초엔 전체 선택
    const body = App.el(`
      <p style="font-size:12.5px;color:var(--text-2);margin-bottom:10px">
        엑셀의 <b>${cols.length}개 열</b> 중 <b>관리할 열</b>을 고르세요. 선택한 열만 AI 페르소나가 참고하고,
        리뷰 보드 상세와 스키마 매핑 표에 나타납니다. 나머지 열의 값은 저장되지만 사용되지 않습니다.
        ${newCols.length ? `<br><span style="color:var(--serious)">이번 업로드에서 새 열 ${newCols.length}개가 감지되었습니다 (아래 <b>NEW</b> 표시).</span>` : ""}
      </p>
      <div class="filterbar" style="margin-bottom:8px">
        <input type="search" id="cp-q" placeholder="열 이름 검색…" style="min-width:180px">
        <button class="btn small" id="cp-all">보이는 항목 전체</button>
        <button class="btn small" id="cp-none">보이는 항목 해제</button>
        ${newCols.length ? `<button class="btn small" id="cp-new">새 열만 선택</button>` : ""}
        <span class="count" id="cp-count"></span>
      </div>
      <div style="max-height:46vh;overflow-y:auto;border:1px solid var(--border);border-radius:10px;padding:8px 10px">
        ${cols.map(c => `
          <label data-cp-row="${c}" style="display:flex;align-items:center;gap:8px;padding:5px 4px;border-bottom:1px dashed var(--border);font-size:12.5px;cursor:pointer">
            <input type="checkbox" data-cp="${c}" ${sel.has(c) ? "checked" : ""} style="width:auto">
            <span style="flex:1">${c}</span>
            ${newCols.includes(c) ? '<span class="badge b-blue">NEW</span>' : ""}
          </label>`).join("")}
      </div>`);
    const count = () => {
      const n = body.querySelectorAll("[data-cp]:checked").length;
      body.querySelector("#cp-count").textContent = `${n} / ${cols.length}열 선택`;
    };
    const visible = () => [...body.querySelectorAll("[data-cp-row]")].filter(r => r.style.display !== "none");
    body.querySelector("#cp-q").oninput = e => {
      const q = e.target.value.toLowerCase();
      body.querySelectorAll("[data-cp-row]").forEach(r =>
        r.style.display = r.dataset.cpRow.toLowerCase().includes(q) ? "" : "none");
    };
    body.querySelector("#cp-all").onclick = () => { visible().forEach(r => r.querySelector("input").checked = true); count(); };
    body.querySelector("#cp-none").onclick = () => { visible().forEach(r => r.querySelector("input").checked = false); count(); };
    const nb = body.querySelector("#cp-new");
    if (nb) nb.onclick = () => {
      body.querySelectorAll("[data-cp]").forEach(c => c.checked = newCols.includes(c.dataset.cp));
      count();
    };
    body.querySelectorAll("[data-cp]").forEach(c => c.onchange = count);
    count();
    const ok = document.createElement("button");
    ok.className = "btn primary";
    ok.textContent = "관리 열 저장";
    ok.onclick = async () => {
      const picked = [...body.querySelectorAll("[data-cp]:checked")].map(c => c.dataset.cp);
      if (!picked.length) return this.toast("최소 1개 열을 선택하세요", true);
      try {
        const schema = await this.api("/api/config/excel_schema");
        await this.api("/api/config/excel_schema", {
          user: this.state.user.name, role: this.state.user.role,
          data: { ...schema, managed_columns: picked }
        });
        this.state.boot = await this.api("/api/bootstrap");
        this.toast(`관리 열 ${picked.length}개 저장됨`);
        back.remove();
        if (onSaved) onSaved(picked);
      } catch (e) { this.toast(e.message, true); }
    };
    const back = this.modal({ title: "관리 열 선택", body, foot: [ok], wide: true });
    return back;
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
