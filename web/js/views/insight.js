/* 인사이트 — 참고자료 목록 + 리포트 생성/열람. */
App.register("insight", {
  title: "인사이트",
  async render(el, app) {
    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">인사이트</div>
        <div class="page-sub">버전 지향점 + 트렌드 정합성 — 참고자료 파일 기반, 주장마다 출처 표기</div></div>
        <div class="actions"><button class="btn primary" data-run="insight">⑦ 리포트 생성/재생성</button></div>
      </div>
      <div class="grid" style="grid-template-columns: 2fr 1fr; align-items:start">
        <div class="card"><div class="card-head">리포트</div><div class="card-body md" id="report"><div class="empty">불러오는 중…</div></div></div>
        <div class="card"><div class="card-head">참고자료 <span class="sub">data/${app.state.version}/references/</span></div>
          <div class="card-body">
            <p style="font-size:12px;color:var(--text-2);margin-bottom:10px">벤치마킹·동향조사 문서를 이 폴더에 넣으면 리포트 생성 시 근거로 사용됩니다 (웹 검색 없음). PDF/PPT/Word는 인입 시 텍스트 추출 — scripts/extract_doc_text.ps1.</p>
            <div id="refs"><div class="empty">—</div></div>
          </div>
        </div>
      </div>`;
    el.querySelectorAll("[data-run]").forEach(b => b.onclick = () => app.run(b.dataset.run));
    try {
      const r = await app.api("/api/insight/" + app.state.version);
      el.querySelector("#report").innerHTML = r.markdown ? app.md(r.markdown) : '<div class="empty">리포트가 아직 없습니다 — 생성 버튼을 누르세요</div>';
    } catch (e) { el.querySelector("#report").innerHTML = '<div class="empty">리포트 없음</div>'; }
    el.querySelector("#refs").innerHTML = `<div style="font-size:12.5px">📄 2026_UX_동향.md <span style="color:var(--text-3)">(데모 문서)</span></div>`;
  }
});
