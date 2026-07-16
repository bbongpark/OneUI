/* 페르소나 — 프롬프트 편집(스키마 보호 경고), 이력, 골든셋 실행·일치율. */
App.register("personas", {
  title: "페르소나",
  async render(el, app) {
    const [plist, golden] = await Promise.all([app.api("/api/prompts"), app.api("/api/golden")]);
    const LBL = {
      "_common": "공통 규칙", "persona-experience-planning": "경험기획", "persona-ux": "UX",
      "persona-dev": "개발", "persona-cxi": "CXI", "persona-synthesis": "종합 판정",
      "persona-pl": "PL 검사", "persona-sw-director": "SW담당 임원 (예상 판정)",
      "aux-minutes-extract": "보조: 회의록 추출", "aux-plm-report-judge": "보조: 보고 필요 판단",
      "aux-duration-estimate": "보조: 소요시간 추정", "aux-insight-report": "보조: 인사이트",
      "aux-slide-mapping": "보조: 슬라이드 매핑", "aux-query": "보조: 질의 응답"
    };
    const lastRun = golden.runs?.[0];

    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">페르소나 관리</div>
        <div class="page-sub">prompts/ 파일 편집 — 저장 시 버전 백업 + 수정자 이력. 스키마(JSON 필드명)는 파서와의 계약</div></div>
      </div>
      <div class="grid" style="grid-template-columns: 260px 1fr; align-items:start">
        <div>
          <div class="card" style="margin-bottom:14px"><div class="card-body" style="padding:8px" id="plist"></div></div>
        </div>
        <div class="card"><div class="card-head" id="ed-title">프롬프트를 선택하세요</div>
          <div class="card-body" id="ed-body"><div class="empty">좌측 목록에서 페르소나를 선택하면 편집기가 열립니다</div></div>
        </div>
      </div>

      <div class="card" style="margin-top:14px"><div class="card-head">골든셋 — 페르소나 품질 측정
        <span class="sub">사람이 정답을 매긴 세트로 일치율을 재고, 엔진(Gemini/Claude) 비교에도 사용</span></div>
        <div class="card-body">
          <div class="grid" style="grid-template-columns:1fr 1.2fr 1.3fr; align-items:stretch">
            <div>
              <div style="font-weight:700;font-size:12.5px;margin-bottom:8px"><span class="step-num">1</span>양식 받아 정답 채우기</div>
              <a class="btn wide" href="/templates/golden_template.xlsx" style="justify-content:center">📥 골든셋 엑셀 양식 받기</a>
              <p style="font-size:11.5px;color:var(--text-3);margin-top:8px;line-height:1.6">
                데이터 열은 취합 엑셀과 동일하게, 마지막에<br>
                <b>정답등급</b> = P0 / P1 / P2<br>
                <b>정답권고</b> = 진행 / 조건부 / 보류 / 거절<br>
                <b>메모</b> = 판정 이유 (선택)</p>
            </div>
            <div>
              <div style="font-weight:700;font-size:12.5px;margin-bottom:8px"><span class="step-num">2</span>파일 업로드</div>
              ${app.state.user.role === "admin" ? `
              <div class="dropzone" id="g-drop">
                <span class="big">⬆</span>
                <b>엑셀(.xlsx) 또는 PPT(.pptx)를<br>끌어다 놓거나 클릭</b>
                <div class="hint">엑셀 → 정답 항목 등록 (같은 인덱스는 갱신)<br>PPT → 슬라이드를 인덱스로 찾아 항목에 연결</div>
              </div>
              <input type="file" id="g-file" accept=".xlsx,.pptx" class="hidden" multiple>`
              : '<div class="empty" style="padding:24px 0">업로드는 관리자만 가능합니다</div>'}
            </div>
            <div>
              <div style="font-weight:700;font-size:12.5px;margin-bottom:8px;display:flex;align-items:center"><span class="step-num">3</span>등록 확인·측정
                <button class="btn small primary" data-run="golden" style="margin-left:auto">▶ 골든셋 실행</button></div>
              ${lastRun ? `<div class="mini-stat" style="margin-bottom:8px">
                  <div class="ms"><b>${lastRun.grade_acc}%</b>등급 일치</div>
                  <div class="ms"><b>${lastRun.rec_acc}%</b>권고 일치</div>
                  <div class="ms"><b>${golden.items.length}건</b>등록 항목</div></div>` :
                `<p style="font-size:11.5px;color:var(--text-3);margin-bottom:8px">등록 ${golden.items.length}건 · 아직 실행 이력 없음</p>`}
              <div id="g-items" style="max-height:150px;overflow-y:auto;border-top:1px solid var(--border)">
                ${golden.items.map(g => `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px dashed var(--border);font-size:12px">
                  <span style="font-family:var(--mono);font-size:10.5px;color:var(--text-3)">${g.feature_index}</span>
                  <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${g.note || ""}">${(g.row || {})["Feature명"] || g.feature_index}</span>
                  ${App.gradeBadge(g.truth.final_grade)} ${App.recBadge(g.truth.final_recommendation)}
                  ${g.slides_text ? '<span title="PPT 슬라이드 연결됨">🖼</span>' : ""}
                  ${app.state.user.role === "admin" ? `<button class="btn ghost small" data-gdel="${g.feature_index}" style="padding:0 5px">✕</button>` : ""}
                </div>`).join("") || '<div class="empty" style="padding:14px 0">등록된 항목 없음 — 왼쪽 순서대로 진행하세요</div>'}
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const ORDER = ["_common", "persona-experience-planning", "persona-ux", "persona-dev", "persona-cxi",
                   "persona-synthesis", "persona-pl", "persona-sw-director"];
    plist.prompts.sort((a, b) =>
      (ORDER.indexOf(a.name) + 1 || 99) - (ORDER.indexOf(b.name) + 1 || 99) || a.name.localeCompare(b.name));
    const pl = el.querySelector("#plist");
    pl.innerHTML = plist.prompts.map(p => `
      <div class="nav-item" data-p="${p.name}" style="cursor:pointer">
        <span style="flex:1">${LBL[p.name] || p.name}</span>
        ${p.history ? `<span style="font-size:10px;color:var(--text-3)">이력 ${p.history}</span>` : ""}
      </div>`).join("");

    pl.querySelectorAll("[data-p]").forEach(item => item.onclick = async () => {
      pl.querySelectorAll("[data-p]").forEach(x => x.classList.remove("active"));
      item.classList.add("active");
      const name = item.dataset.p;
      const p = await app.api("/api/prompts/" + name);
      el.querySelector("#ed-title").innerHTML = `${LBL[name] || name} <span class="sub">prompts/${name}.md${name === "persona-sw-director" ? " · 판단 성향은 회사에서 회의록 기반 교체" : ""}</span>`;
      const body = el.querySelector("#ed-body");
      body.innerHTML = `
        ${name.startsWith("persona-") ? '<div class="info-banner">출력 스키마(JSON 필드명)를 바꾸면 서버 파서와 어긋납니다 — 관점·기준·어조는 자유롭게 수정하세요. 수정 후에는 해당 페르소나+종합만 자동 재실행 대상이 됩니다.</div>' : ""}
        <textarea class="editor" id="ed-text"></textarea>
        <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
          <button class="btn primary" id="ed-save">저장 (백업 자동 생성)</button>
          <span style="font-size:11px;color:var(--text-3)">${p.history.length ? "최근 백업: " + p.history[0] : "백업 없음"}</span>
        </div>`;
      body.querySelector("#ed-text").value = p.text;
      body.querySelector("#ed-save").onclick = async () => {
        try {
          const r = await app.api("/api/prompts/" + name, { text: body.querySelector("#ed-text").value, user: app.state.user.name });
          app.toast(r.warning || "저장되었습니다 — 이전 버전 백업됨");
          if (r.warning) app.toast(r.warning, true);
        } catch (e) { app.toast(e.message, true); }
      };
    });

    el.querySelectorAll("[data-run]").forEach(b => b.onclick = () => app.run(b.dataset.run));

    // ── 골든셋 업로드/삭제 (관리자) ──
    const upload = async (file, kindLabel) => {
      const b64 = await new Promise((res, rej) => {
        const rd = new FileReader();
        rd.onload = () => res(rd.result.split(",")[1]);
        rd.onerror = rej;
        rd.readAsDataURL(file);
      });
      try {
        const r = await app.api("/api/golden/upload", { filename: file.name, b64,
          user: app.state.user.name, role: app.state.user.role });
        if (r.kind === "xlsx") {
          app.toast(`엑셀 등록: 추가 ${r.added} · 갱신 ${r.updated}` + (r.skipped ? ` · 제외 ${r.skipped}건(정답 미기입)` : ""));
          if (r.skipped) app.toast("제외됨: " + r.problems.join(", "), true);
        } else {
          app.toast(`PPT 연결: ${r.mapped}건 매핑` + (r.unmapped_slides ? ` · 미매핑 슬라이드 ${r.unmapped_slides}` : ""));
        }
        app.route();
      } catch (e) { app.toast(e.message, true); }
    };
    const drop = el.querySelector("#g-drop"), finp = el.querySelector("#g-file");
    if (drop) {
      const accept = f => /\.(xlsx|pptx)$/i.test(f.name) ? upload(f) : app.toast(`지원하지 않는 형식: ${f.name} (.xlsx / .pptx만)`, true);
      drop.onclick = () => finp.click();
      finp.onchange = () => { [...finp.files].forEach(accept); finp.value = ""; };
      drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
      drop.ondragleave = () => drop.classList.remove("over");
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); [...e.dataTransfer.files].forEach(accept); };
    }
    el.querySelectorAll("[data-gdel]").forEach(b => b.onclick = async () => {
      try {
        await app.api("/api/golden/delete", { feature_index: b.dataset.gdel, role: app.state.user.role });
        app.toast("삭제됨: " + b.dataset.gdel);
        app.route();
      } catch (e) { app.toast(e.message, true); }
    });
  }
});
