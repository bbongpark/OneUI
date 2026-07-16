/* 추적 — 액션 아이템·PLM(mock)·보고 필요 판단·후속 배정·거절 목록. */
App.register("tracking", {
  title: "추적",
  render(el, app) {
    const d = app.state.data, acts = d.actions.items;
    const feats = d.features.features;
    const rejected = feats.filter(f => f.decision === "rejected");
    const readonly = d.features.readonly;
    const PLM_LBL = { pending: ["b-outline", "대기"], sent: ["b-blue", "전송됨"], in_progress: ["b-cgo", "처리 중"], done: ["b-go", "완료"] };

    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">추적</div>
        <div class="page-sub">액션 아이템 → PLM(mock) → 보고 필요 판단 → 후속 보고 배정 순환</div></div>
        <div class="actions">
          <button class="btn" id="plm-adv" title="mock: 상태를 한 단계씩 진행 (회사에서 실제 PLM API 폴링으로 교체)">PLM 상태 수신 (mock)</button>
          <button class="btn" data-run="plm_judge">⑥ 보고 필요 판단</button>
        </div>
      </div>
      <div class="info-banner">PLM 연동은 mock입니다 — 회사에서 <b>server/api.py의 api_plm_advance</b>를 실제 PLM API 어댑터로 교체하세요.</div>

      <div class="card" style="margin-bottom:16px"><div class="tbl-wrap">
        <table class="tbl"><thead><tr>
          <th>ID</th><th>Feature</th><th>액션</th><th>담당 부서</th><th>기한</th><th>PLM</th><th>보고 필요</th><th></th>
        </tr></thead><tbody>
          ${acts.map(a => `<tr>
            <td class="idx">${a.id}</td>
            <td class="idx">${a.feature_index}</td>
            <td style="max-width:300px">${a.action}</td>
            <td>${a.owner_dept || "—"}</td>
            <td style="font-family:var(--mono);font-size:11.5px">${a.due || "—"}</td>
            <td><span class="badge ${PLM_LBL[a.plm_status][0]}">${PLM_LBL[a.plm_status][1]}</span>${a.plm_id ? `<div style="font-size:10px;color:var(--text-3)">${a.plm_id}</div>` : ""}</td>
            <td>${a.report_needed === true ? `<span class="badge b-blue" title="${a.report_rationale || ""}">보고 필요</span>` : a.report_needed === false ? '<span class="badge b-p2">불필요</span>' : '<span class="badge b-outline">미판단</span>'}</td>
            <td>${a.report_needed === true && !a.followup_scheduled && !readonly ? `<button class="btn small primary" data-fu="${a.id}">★ 최우선 배정</button>` : a.followup_scheduled ? '<span class="badge b-violet">배정됨</span>' : ""}</td>
          </tr>`).join("") || `<tr><td colspan="8"><div class="empty">액션 아이템이 없습니다 — 회의록 확정 시 등록됩니다</div></td></tr>`}
        </tbody></table>
      </div></div>

      <div class="card"><div class="card-head">거절 목록 <span class="sub">통계 모수에서 제외 · 차기 버전 재등록 감지용</span></div>
        <div class="card-body">
          ${rejected.length ? `<table class="tbl"><thead><tr><th>인덱스</th><th>Feature</th><th>부서</th><th>비고</th></tr></thead><tbody>
            ${rejected.map(f => `<tr><td class="idx">${f.feature_index}</td><td>${f.name}</td><td>${f.department}</td>
              <td style="font-size:11.5px;color:var(--text-3)">차기 버전 인입 시 자동 매칭되어 "재등록" 표시됨</td></tr>`).join("")}</tbody></table>`
            : '<div class="empty">거절된 항목 없음</div>'}
        </div>
      </div>`;

    el.querySelector("#plm-adv").onclick = async () => {
      if (readonly) return app.toast("읽기 전용 버전입니다", true);
      await app.api("/api/plm/advance", { version: app.state.version });
      app.toast("PLM 상태 갱신됨 (mock)");
      await app.reload(); app.route();
    };
    el.querySelectorAll("[data-fu]").forEach(b => b.onclick = async () => {
      const r = await app.api("/api/followup", { version: app.state.version, action_id: b.dataset.fu });
      app.toast(r.warning ? "⚠ " + r.warning : "가장 빠른 슬롯에 배정되었습니다");
      await app.reload(); app.route();
    });
    el.querySelectorAll("[data-run]").forEach(b => b.onclick = () => app.run(b.dataset.run));
  }
});
