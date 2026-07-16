/* 리뷰 보드 — 500건 스케일 테이블: 필터/검색, 부문 점수, 종합(오버라이드), 예상 결정, 슬라이드 뷰어. */
App.register("review", {
  title: "리뷰 보드",
  render(el, app) {
    const d = app.state.data, feats = d.features.features;
    const rv = d.reviews.items, pl = d.pl_checks.items;
    const predMap = {};
    (d.schedule.slots || []).forEach(s => s.items.forEach(i => { if (i.predicted) predMap[i.feature_index] = i.predicted; }));
    const readonly = d.features.readonly;
    const preset = (location.hash.split("?f=")[1] || "");
    const P_LBL = { experience_planning: "기획", ux: "UX", dev: "개발", cxi: "CXI" };

    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">리뷰 보드</div>
        <div class="page-sub">부문별 권고 · 종합 판정(오버라이드 가능) · SW담당 예상 결정</div></div>
        <div class="actions">
          <button class="btn" id="map-btn"></button>
          <button class="btn" data-run="review">리뷰 실행</button><button class="btn" data-run="synthesis">종합만 재실행</button>
        </div>
      </div>
      <div id="map-banner"></div>
      <div class="filterbar">
        <input type="search" id="f-q" placeholder="검색: 이름, 인덱스, 부서…">
        <select id="f-grade"><option value="">등급 전체</option><option>P0</option><option>P1</option><option>P2</option></select>
        <select id="f-dept"><option value="">부서 전체</option>${[...new Set(feats.map(f => f.department))].map(x => `<option>${x}</option>`).join("")}</select>
        <select id="f-state">
          <option value="">상태 전체</option><option value="needs_human">사람 확인 필요</option>
          <option value="notready">PL 미준비</option><option value="risk">일정 리스크 high</option>
          <option value="divergent">부문 권고 충돌</option><option value="rereg">재등록</option>
          <option value="decided">결정됨</option><option value="devdone">개발 완료</option>
          <option value="rejected">거절 목록</option>
        </select>
        <span class="count" id="f-count"></span>
      </div>
      <div class="card"><div class="tbl-wrap" style="max-height:calc(100vh - 250px);overflow-y:auto">
        <table class="tbl"><thead><tr>
          <th>인덱스</th><th>Feature</th><th>부서</th><th>부문 권고</th><th>종합</th><th>권고</th><th>예상 결정</th><th>PL</th><th>리스크</th><th>상태</th><th></th>
        </tr></thead><tbody id="rows"></tbody>
      </table></div></div>`;

    if (preset && preset !== "all") el.querySelector("#f-state").value = preset === "notready" ? "notready" : preset;

    const rows = el.querySelector("#rows");
    const draw = () => {
      const q = el.querySelector("#f-q").value.toLowerCase();
      const fg = el.querySelector("#f-grade").value, fd = el.querySelector("#f-dept").value, fs = el.querySelector("#f-state").value;
      const list = feats.filter(f => {
        const it = rv[f.feature_index] || {}, syn = it.synthesis || {}, plc = pl[f.feature_index] || {};
        if (fs !== "rejected" && f.decision === "rejected") return false;
        if (fs === "rejected") return f.decision === "rejected";
        if (q && !(f.name.toLowerCase().includes(q) || f.feature_index.toLowerCase().includes(q) || f.department.includes(q))) return false;
        if (fg && syn.final_grade !== fg) return false;
        if (fd && f.department !== fd) return false;
        if (fs === "needs_human" && syn.status !== "needs_human") return false;
        if (fs === "notready" && (plc.ready !== false)) return false;
        if (fs === "risk" && plc.schedule_risk !== "high") return false;
        if (fs === "divergent" && !syn.divergent) return false;
        if (fs === "rereg" && !f.reregistered_from) return false;
        if (fs === "decided" && f.status !== "decided") return false;
        if (fs === "devdone" && !app.isDevDone(f)) return false;
        return true;
      });
      el.querySelector("#f-count").textContent = list.length + "건";
      rows.innerHTML = list.map(f => {
        const it = rv[f.feature_index] || {}, syn = it.synthesis || {}, plc = pl[f.feature_index] || {};
        const per = it.personas || {};
        const perHtml = Object.keys(P_LBL).map(k => per[k]
          ? `<span class="badge ${{ go: "b-go", conditional_go: "b-cgo", defer: "b-defer", no_go: "b-nogo" }[per[k].recommendation]}" title="${P_LBL[k]}: ${per[k].rationale}">${P_LBL[k]}</span>`
          : `<span class="badge b-outline">${P_LBL[k]}</span>`).join(" ");
        const pred = predMap[f.feature_index];
        return `<tr class="clickable" data-idx="${f.feature_index}">
          <td class="idx">${f.feature_index}${f.reregistered_from ? ` <span class="badge b-violet" title="이전 버전 ${f.reregistered_from}에서 거절/보류된 건의 재등록">재등록</span>` : ""}${f.input_changed ? ` <span class="badge b-blue" title="리뷰 후 입력이 변경됨 — 재확인 필요">입력변경</span>` : ""}</td>
          <td class="name" title="${f.name}">${f.name}</td>
          <td>${f.department}</td>
          <td><div class="tag-row">${perHtml}</div></td>
          <td>${app.gradeBadge(syn.final_grade)}${it.override ? ' <span title="사람이 수정함 (' + it.override.by + ')">✍</span>' : ""}${syn.status === "needs_human" ? ' <span class="badge b-blue">확인</span>' : ""}${syn.divergent ? ' <span class="badge b-cgo" title="' + (syn.divergent_summary || "") + '">충돌</span>' : ""}</td>
          <td>${app.recBadge(f.decision === "rejected" ? "rejected" : (f.decision || syn.final_recommendation))}</td>
          <td>${f.decision ? '<span class="badge b-outline" title="실제 결정 확정됨">확정</span>' : pred ? app.recBadge(pred.predicted_decision) + `<span style="font-size:10px;color:var(--text-3)"> ${pred.confidence}</span>` : '<span class="badge b-outline">—</span>'}</td>
          <td>${plc.ready === true ? '<span class="badge b-go">준비</span>' : plc.ready === false ? '<span class="badge b-nogo" title="' + [(plc.doc_issues || []).join(", "), (plc.slide_issues || []).map(x => "슬라이드" + x.slide + ": " + x.issue).join(", ")].filter(Boolean).join(" · ") + '">미준비</span>' : '<span class="badge b-outline">—</span>'}</td>
          <td>${app.riskBadge(plc.schedule_risk)}</td>
          <td>${app.statusBadge(f.status)}</td>
          <td>${f.slides.length ? `<button class="btn ghost small" data-slides="${f.feature_index}" title="발표 자료 보기">🖼 ${f.slides.length}</button>` : ""}</td>
        </tr>`;
      }).join("") || `<tr><td colspan="11"><div class="empty">조건에 맞는 항목이 없습니다</div></td></tr>`;

      rows.querySelectorAll("[data-slides]").forEach(b => b.onclick = e => {
        e.stopPropagation();
        const f = feats.find(x => x.feature_index === b.dataset.slides);
        app.slideViewer(f, pl[f.feature_index]);
      });
      rows.querySelectorAll("tr[data-idx]").forEach(tr => tr.onclick = () => openDetail(tr.dataset.idx));
    };

    const openDetail = idx => {
      const f = feats.find(x => x.feature_index === idx);
      const it = rv[idx] || {}, syn = it.synthesis || {}, plc = pl[idx] || {};
      const per = it.personas || {};
      const body = App.el(`
        <div class="kv">
          <dt>부서</dt><dd>${f.department}</dd>
          <dt>개발 상태</dt><dd>${f.dev_status}</dd>
          ${(app.state.boot.managed_columns && app.state.boot.managed_columns.length
             ? app.state.boot.managed_columns : Object.keys(f.row))
            .filter(c => f.row[c] !== undefined)
            .map(c => `<dt title="관리 열">${c}</dt><dd style="font-size:12px">${f.row[c] || '<span style="color:var(--text-3)">미기재</span>'}</dd>`).join("")}
          ${f.reregistered_from ? `<dt>재등록</dt><dd><span class="badge b-violet">${f.reregistered_from}에서 거절/보류 → 재등록</span></dd>` : ""}
          ${f.decision ? `<dt>임원 결정</dt><dd>${app.recBadge(f.decision === "rejected" ? "rejected" : f.decision)} ${(f.decision_conditions || []).join(", ")}</dd>` : ""}
        </div>
        <div class="section-label">부문별 리뷰</div>
        <div class="persona-scores">
          ${Object.entries({ experience_planning: "경험기획", ux: "UX", dev: "개발", cxi: "CXI" }).map(([k, lbl]) => per[k] ? `
            <div class="pscore"><div class="ph"><span>${lbl}</span><span>${app.gradeBadge(per[k].grade)} ${app.recBadge(per[k].recommendation)}</span></div>
            <div class="rat">${per[k].rationale}</div>
            ${per[k].key_question ? `<div class="rat" style="color:var(--accent)">Q. ${per[k].key_question}</div>` : ""}</div>` :
            `<div class="pscore"><div class="ph"><span>${lbl}</span><span class="badge b-outline">미실행</span></div></div>`).join("")}
        </div>
        <div class="section-label">종합 판정</div>
        ${syn.final_grade ? `
          <div class="pscore"><div class="ph"><span>${app.gradeBadge(syn.final_grade)} ${app.recBadge(syn.final_recommendation)}</span>
            ${syn.status === "needs_human" ? '<span class="badge b-blue">사람 확인 필요</span>' : ""}</div>
          <div class="rat">${syn.rationale || ""}</div>
          ${syn.divergent ? `<div class="rat" style="color:var(--serious)">⚡ ${syn.divergent_summary}</div>` : ""}
          ${(syn.meeting_questions || []).map(q => `<div class="rat" style="color:var(--accent)">회의 질문: ${q}</div>`).join("")}
          ${(syn.merged_conditions || []).length ? `<div class="rat">조건: ${syn.merged_conditions.join(" · ")}</div>` : ""}</div>` :
          '<div class="empty" style="padding:14px 0">종합 판정 없음</div>'}
        ${(it.history || []).length ? `<div class="section-label">수정 이력</div>` +
          it.history.map(h => `<div style="font-size:11.5px;color:var(--text-2);padding:2px 0">· ${App.fmtDate(h.at)} <b>${h.by}</b>: ${h.field} ${h.from || "—"} → ${h.to} (${h.reason || "사유 없음"})</div>`).join("") : ""}
      `);
      const foot = [];
      if (!readonly && syn.final_grade && !f.decision) {
        const btn = document.createElement("button");
        btn.className = "btn primary"; btn.textContent = "판정 수정 (오버라이드)";
        btn.onclick = () => { back.remove(); openOverride(f, it, syn); };
        foot.push(btn);
      }
      if (f.slides.length) {
        const sb = document.createElement("button");
        sb.className = "btn"; sb.textContent = "🖼 자료 보기";
        sb.onclick = () => app.slideViewer(f, plc);
        foot.push(sb);
      }
      const back = app.modal({ title: `[${f.feature_index}] ${f.name}`, body, foot, wide: true });
    };

    const openOverride = (f, it, syn) => {
      const body = App.el(`
        <p style="color:var(--text-2);font-size:12.5px;margin-bottom:12px">AI 판정: ${app.gradeBadge(syn.final_grade)} ${app.recBadge(syn.final_recommendation)} — 수정하면 원값과 수정자가 이력에 남습니다.</p>
        <div class="kv" style="grid-template-columns:90px 1fr">
          <dt>등급</dt><dd><select id="ov-grade"><option value="">유지</option><option>P0</option><option>P1</option><option>P2</option></select></dd>
          <dt>권고</dt><dd><select id="ov-rec"><option value="">유지</option><option value="go">진행</option><option value="conditional_go">조건부</option><option value="defer">보류</option><option value="no_go">반대</option></select></dd>
          <dt>사유</dt><dd><input id="ov-reason" placeholder="수정 사유 (필수)" style="width:100%"></dd>
        </div>`);
      const ok = document.createElement("button");
      ok.className = "btn primary"; ok.textContent = "수정 저장";
      ok.onclick = async () => {
        const reason = body.querySelector("#ov-reason").value.trim();
        if (!reason) return app.toast("사유를 입력하세요", true);
        try {
          await app.api("/api/override", {
            version: app.state.version, feature_index: f.feature_index,
            final_grade: body.querySelector("#ov-grade").value || null,
            final_recommendation: body.querySelector("#ov-rec").value || null,
            reason, user: app.state.user.name, base_rev: d.reviews.rev, resolve: true
          });
          app.toast("판정이 수정되었습니다");
          back.remove(); await app.reload(); app.route();
        } catch (e) { app.toast(e.message === "conflict" ? "다른 사용자가 먼저 수정했습니다 — 새로고침 후 다시 시도하세요" : e.message, true); }
      };
      const back = app.modal({ title: `판정 수정 — ${f.feature_index}`, body, foot: [ok] });
    };

    el.querySelectorAll("[data-run]").forEach(b => b.onclick = () => app.run(b.dataset.run));
    ["#f-q", "#f-grade", "#f-dept", "#f-state"].forEach(s => el.querySelector(s).oninput = draw);
    draw();

    // ── PPT 매핑 확인 (사람 확정 절차) ──
    const mapping = d.features.mapping;              // 없으면 PPT 미인입 버전
    const unmapped = d.features.unmapped_slides || [];
    const mapBtn = el.querySelector("#map-btn");
    if (!mapping) mapBtn.classList.add("hidden");
    else {
      mapBtn.innerHTML = mapping.confirmed
        ? "PPT 매핑 확인 ✓"
        : `PPT 매핑 확인 <span class="badge b-blue">미확정${unmapped.length ? " · 미매핑 " + unmapped.length : ""}</span>`;
      if (!mapping.confirmed)
        el.querySelector("#map-banner").innerHTML =
          `<div class="info-banner">✋ PPT 매핑이 아직 사람 확인을 거치지 않았습니다 — 매핑을 검토·확정해야 PL 검사를 실행할 수 있습니다.</div>`;
      mapBtn.onclick = openMapping;
    }

    function openMapping() {
      const mappedRows = feats.flatMap(f => (f.slides_text || []).map(s => ({ f, s })));
      const featOpts = sel => `<option value="">— 미매핑으로 —</option>` +
        feats.map(x => `<option value="${x.feature_index}" ${x.feature_index === sel ? "selected" : ""}>${x.feature_index} ${x.name.slice(0, 18)}</option>`).join("");
      const body = App.el(`
        <p style="font-size:12px;color:var(--text-2);margin-bottom:10px">
        슬라이드 제목의 인덱스로 자동 매핑된 결과입니다. 잘못 연결된 슬라이드는 대상 Feature를 바꾸고,
        미매핑 슬라이드는 텍스트를 보고 배정하세요. 확정하면 PL 검사가 열립니다.</p>
        ${unmapped.length ? `<div class="section-label" style="color:var(--serious)">미매핑 슬라이드 ${unmapped.length}장 — 확인 필요</div>` +
          unmapped.map(u => `
            <div class="pscore" style="margin-bottom:6px"><div class="ph">
              <span>📄 ${u.file} · 슬라이드 ${u.slide}</span>
              <select data-um="${u.file}|${u.slide}" style="max-width:220px">${featOpts("")}</select></div>
            <div class="rat">${(u.text || "(텍스트 없음)").slice(0, 150)}</div></div>`).join("") : ""}
        <div class="section-label">매핑된 슬라이드 ${mappedRows.length}장</div>
        ${mappedRows.map(({ f, s }) => `
          <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px dashed var(--border);font-size:12px">
            <span class="idx" style="font-family:var(--mono);font-size:10.5px;color:var(--text-3);flex:none">${s.file} · #${s.slide}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(s.text || "").slice(0, 300)}">${(s.text || "").slice(0, 60)}</span>
            <select data-mv="${s.file}|${s.slide}" style="max-width:200px;flex:none">${featOpts(f.feature_index)}</select>
          </div>`).join("") || '<div class="empty">매핑된 슬라이드 없음</div>'}`);
      const move = async (file, slide, to) => {
        try {
          await app.api("/api/mapping/assign", { version: app.state.version, file, slide: +slide, to_feature: to || null });
          app.toast(to ? `슬라이드 → ${to} 이동됨` : "미매핑으로 이동됨");
        } catch (e) { app.toast(e.message, true); }
      };
      body.querySelectorAll("[data-um]").forEach(s => s.onchange = () => { const [f, n] = s.dataset.um.split("|"); move(f, n, s.value); });
      body.querySelectorAll("[data-mv]").forEach(s => s.onchange = () => { const [f, n] = s.dataset.mv.split("|"); move(f, n, s.value); });
      const ok = document.createElement("button");
      ok.className = "btn primary";
      ok.textContent = "매핑 확정 — PL 검사 허용";
      ok.onclick = async () => {
        try {
          const r = await app.api("/api/mapping/confirm", { version: app.state.version, user: app.state.user.name });
          app.toast("매핑이 확정되었습니다" + (r.unmapped_left ? ` — 미매핑 ${r.unmapped_left}장은 검사 제외` : ""));
          back.remove(); await app.reload(); app.route();
        } catch (e) { app.toast(e.message, true); }
      };
      const back = app.modal({ title: "PPT 매핑 확인", body, foot: [ok], wide: true });
    }
  }
});
