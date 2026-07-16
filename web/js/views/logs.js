/* 로그/산출물 — CLI 작업 로그(폴링) + 보고 PPT 생성/다운로드 + 엔진 상태. */
App.register("logs", {
  title: "로그·산출물",
  async render(el, app) {
    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">로그 · 산출물</div>
        <div class="page-sub">작업 실행 로그(실시간) · 보고 산출물 생성 · 엔진 자가진단 결과</div></div>
        <div class="actions">
          <button class="btn" data-kind="aggregate">취합완료 보고 생성</button>
          <button class="btn" data-kind="progress">진행보고 생성</button>
        </div>
      </div>
      <div class="grid" style="grid-template-columns: 1.4fr 1fr; align-items:start">
        <div class="card"><div class="card-head">작업 로그</div><div class="card-body" id="logbox" style="max-height:56vh;overflow-y:auto"></div></div>
        <div>
          <div class="card" style="margin-bottom:14px"><div class="card-head">산출물 <span class="sub">data/${app.state.version}/output/</span></div>
            <div class="card-body" id="outbox"></div></div>
          <div class="card"><div class="card-head">엔진 자가진단</div><div class="card-body" id="engbox"></div></div>
        </div>
      </div>`;

    const drawLog = () => {
      const log = (app.state.queue || {}).log || [];
      el.querySelector("#logbox").innerHTML = log.slice().reverse().map(l =>
        `<div class="log-line"><span class="at">${l.at.slice(11)}</span><span>${l.msg}</span></div>`).join("") ||
        '<div class="empty">로그 없음</div>';
    };
    drawLog();
    const iv = setInterval(() => { if (!document.contains(el)) return clearInterval(iv); drawLog(); }, 2500);

    const drawOut = async () => {
      const o = await app.api("/api/output/" + app.state.version);
      el.querySelector("#outbox").innerHTML = o.files.map(f =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px dashed var(--border);font-size:12.5px">
          <span>📄 ${f}</span><a class="btn ghost small" href="/api/output/${app.state.version}/${f}">다운로드</a></div>`).join("") ||
        '<div class="empty">산출물 없음 — 생성 버튼을 누르세요<br><small>실제 PPT 생성은 회사에서 템플릿 등록 후</small></div>';
    };
    drawOut();

    try {
      const es = await app.api("/api/engine_status");
      const st = es.selftest;
      el.querySelector("#engbox").innerHTML = st ? `
        <p style="font-size:12px;margin-bottom:8px">엔진 <b>${st.engine}</b> · ${App.fmtDate(es.selftest_at)} ${st.all_passed ? '<span class="badge b-go">전체 통과</span>' : '<span class="badge b-nogo">실패 있음</span>'}</p>
        ${st.checks.map(c => `<div style="font-size:12px;padding:3px 0">${c.passed ? "✅" : "❌"} ${c.check} <span style="color:var(--text-3)">${c.note}</span></div>`).join("")}`
        : '<div class="empty">진단 이력 없음 — 현황판에서 "엔진 자가진단" 실행<br><small>회사에서 Gemini CLI 연결 후 반드시 실행할 것</small></div>';
    } catch (e) { /* 무시 */ }

    el.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => app.run("report_ppt", { kind: b.dataset.kind }));
  }
});
