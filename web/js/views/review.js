/* 리뷰 보드 — 500건 스케일 테이블: 필터/검색, 등급(종합 1개), 판정 근거, 예상 결정, 슬라이드 뷰어.
   제목은 엑셀에 없어 AI가 변경점을 요약해 만든다(job_title). */
App.register("review", {
  title: "리뷰 보드",
  render(el, app) {
    const d = app.state.data, feats = d.features.features;
    const rv = d.reviews.items, pl = d.pl_checks.items;
    const predMap = {};
    (d.schedule.slots || []).forEach(s => s.items.forEach(i => { if (i.predicted) predMap[i.feature_index] = i.predicted; }));
    const readonly = d.features.readonly;
    const preset = (location.hash.split("?f=")[1] || "");

    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">리뷰 보드</div>
        <div class="page-sub">종합 에이전트가 부문 의견을 보고 등급 1개 결정 (오버라이드 가능) · 규칙: 자료 보완 / P2 중 단순 공유 · 결정은 회의에서</div></div>
        <div class="actions">
          <button class="btn" id="map-btn"></button>
          <button class="btn" data-run="review">리뷰 실행 (등급 분류)</button><button class="btn" data-run="synthesis">종합만 재실행</button>
        </div>
      </div>
      <div id="map-banner"></div>
      <div class="filterbar">
        <input type="search" id="f-q" placeholder="검색: 제목, 인덱스, 기능명…">
        <select id="f-grade"><option value="">등급 전체</option>
          ${Object.entries(App.GRADES).map(([k, v]) => `<option value="${k}">${v.label} · ${v.full}</option>`).join("")}</select>
        <select id="f-dept"><option value="">기능명 전체</option>${[...new Set(feats.map(f => f.function_name))].sort().map(x => `<option>${x}</option>`).join("")}</select>
        <select id="f-cat"><option value="">AI카테고리 전체</option>${[...new Set(feats.map(f => f.ai_category))].filter(Boolean).sort().map(x => `<option>${x}</option>`).join("")}</select>
        <select id="f-stage" title="파이프라인 진행 단계 — 한 건은 항상 하나에만 속한다">
          <option value="">단계 전체</option><option value="ingested">인입</option>
          <option value="reviewing">리뷰 중</option><option value="meeting_wait">회의 대기</option>
          <option value="decided">결정됨</option>
        </select>
        <select id="f-cond" title="골라보기 조건 — 단계와 무관하게 겹칠 수 있다">
          <option value="">조건 전체</option><option value="needs_human">사람 확인 필요</option>
          <option value="notready">PL 미준비</option><option value="risk">일정 리스크 있음</option>
          <option value="divergent">부문 인식 충돌</option><option value="rereg">재등록</option>
          <option value="devdone">개발 완료</option>
          <option value="rejected">미지원 목록 (평소 숨김)</option>
        </select>
        <span class="count" id="f-count"></span>
      </div>
      <div class="card"><div class="tbl-wrap" style="max-height:calc(100vh - 250px);overflow-y:auto">
        <table class="tbl"><thead><tr>
          <th>인덱스</th><th>기능명</th><th>제목 <span style="font-weight:400;text-transform:none;color:var(--text-3)">(AI 요약)</span></th><th>등급</th><th>판정 근거</th><th>결정</th><th>예상 결정</th><th>PL</th><th>리스크</th><th>상태</th><th></th>
        </tr></thead><tbody id="rows"></tbody>
      </table></div></div>`;

    // 현황판 드릴다운(?f=) — 값에 대상 필터가 접두사로 담겨 온다: "stage:decided" / "cond:risk"
    const [pKind, pVal] = preset.split(":");
    const pSel = { stage: "#f-stage", cond: "#f-cond" }[pKind];
    if (pSel && pVal) el.querySelector(pSel).value = pVal;
    const gPreset = (location.hash.split("?g=")[1] || "");     // 현황판 등급 범례에서 넘어온 경우
    if (gPreset && App.GRADES[gPreset]) el.querySelector("#f-grade").value = gPreset;

    const rows = el.querySelector("#rows");
    const draw = () => {
      const q = el.querySelector("#f-q").value.toLowerCase();
      const fg = el.querySelector("#f-grade").value, fd = el.querySelector("#f-dept").value;
      const fc = el.querySelector("#f-cat").value;
      const fst = el.querySelector("#f-stage").value, fcd = el.querySelector("#f-cond").value;
      const list = feats.filter(f => {
        const it = rv[f.feature_index] || {}, syn = it.synthesis || {}, plc = pl[f.feature_index] || {};
        // 미지원은 통계 모수 밖 — 평소 목록에서 빠지고 '미지원 목록' 조건에서만 보인다
        if (fcd === "rejected") { if (f.decision !== "reject") return false; }
        else if (f.decision === "reject") return false;
        if (q && !((f.name || "").toLowerCase().includes(q) || f.feature_index.toLowerCase().includes(q) || (f.function_name || "").includes(q))) return false;
        if (fg && syn.final_grade !== fg) return false;
        if (fd && f.function_name !== fd) return false;
        if (fc && f.ai_category !== fc) return false;
        if (fst && f.status !== fst) return false;                 // 단계 = f.status 하나
        if (fcd === "needs_human" && syn.status !== "needs_human") return false;
        if (fcd === "notready" && plc.ready !== false) return false;
        if (fcd === "risk" && app.scheduleRisk(f).risk !== true) return false;
        if (fcd === "divergent" && !syn.divergent) return false;
        if (fcd === "rereg" && !f.reregistered_from) return false;
        if (fcd === "devdone" && !app.isDevDone(f)) return false;
        return true;
      });
      el.querySelector("#f-count").textContent = list.length + "건";
      rows.innerHTML = list.map(f => {
        const it = rv[f.feature_index] || {}, syn = it.synthesis || {}, plc = pl[f.feature_index] || {};
        const per = it.personas || {};
        // 등급을 어떻게 정했는지 — 규칙 확정 / 종합 AI가 부문 의견을 보고. 확인·충돌 표시도 여기에
        const nPer = Object.keys(per).length;
        const flags = [
          it.override ? `<span class="badge b-outline" title="사람이 수정함 (${it.override.by}: ${it.override.reason || ""})">✍ 수정</span>` : "",
          syn.status === "needs_human" ? '<span class="badge b-blue" title="AI가 판단을 보류함 — 사람 확인 필요">확인</span>' : "",
          syn.divergent ? `<span class="badge b-cgo" title="${syn.divergent_summary || ""}">충돌</span>` : ""
        ].filter(Boolean).join(" ");
        const base = it.hard_rule ? `<span class="badge b-doc" title="${it.hard_rule.reason}">⚙ 규칙</span>`
          : it.share_rule ? `<span class="badge b-share" title="${it.share_rule.reason} (AI 판정 P2)">⚙ 규칙</span>`
          : syn.final_grade ? `<span style="font-size:11.5px;color:var(--text-2)" title="${syn.rationale || ""}">부문 ${nPer}개 의견 종합</span>`
          : `<span class="badge b-outline">미실행</span>`;
        const why = base + (flags ? " " + flags : "");
        const pred = predMap[f.feature_index];
        return `<tr class="clickable" data-idx="${f.feature_index}">
          <td class="idx">${f.feature_index}${f.reregistered_from ? ` <span class="badge b-violet" title="이전 버전 ${f.reregistered_from}에서 미지원/보류된 건의 재등록">재등록</span>` : ""}${f.input_changed ? ` <span class="badge b-blue" title="리뷰 후 입력이 변경됨 — 재확인 필요">입력변경</span>` : ""}</td>
          <td class="dept">${f.function_name}</td>
          <td class="name" title="${f.name}">${f.name}</td>
          <td>${app.gradeBadge(syn.final_grade)}</td>
          <td>${why}</td>
          <td>${f.decision ? app.recBadge(f.decision) : '<span class="badge b-outline">회의 전</span>'}</td>
          <td>${f.decision ? '<span class="badge b-outline" title="실제 결정 확정됨">확정</span>' : pred ? app.recBadge(pred.predicted_decision) + `<span style="font-size:10px;color:var(--text-3)"> ${pred.confidence}</span>` : '<span class="badge b-outline">—</span>'}</td>
          <td>${plc.ready === true ? '<span class="badge b-go">준비</span>' : plc.ready === false ? '<span class="badge b-nogo" title="' + [(plc.doc_issues || []).join(", "), (plc.slide_issues || []).map(x => "슬라이드" + x.slide + ": " + x.issue).join(", ")].filter(Boolean).join(" · ") + '">미준비</span>' : '<span class="badge b-outline">—</span>'}</td>
          <td>${app.riskBadge2(f)}</td>
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
      // 엑셀 열은 관리 열 목록으로만 한 번 보여준다 (기능명·AI카테고리도 그 안에 있으므로 따로 쓰지 않는다)
      const cols = (app.state.boot.managed_columns && app.state.boot.managed_columns.length
        ? app.state.boot.managed_columns : Object.keys(f.row)).filter(c => f.row[c] !== undefined);
      const body = App.el(`
        <div class="kv">
          ${cols.map(c => `<dt title="관리 열">${c}</dt><dd style="font-size:12px">${f.row[c] || '<span style="color:var(--text-3)">미기재</span>'}</dd>`).join("")}
          <dt>일정 리스크</dt><dd>${app.riskBadge2(f)}
            <span style="font-size:11.5px;color:var(--text-2)"> ${app.scheduleRisk(f).reason}</span></dd>
          ${f.reregistered_from ? `<dt>재등록</dt><dd><span class="badge b-violet">${f.reregistered_from}에서 미지원/보류 → 재등록</span></dd>` : ""}
          ${f.decision ? `<dt>회의 결정</dt><dd>${app.recBadge(f.decision)}${f.decision === "reject" ? ' <span style="font-size:11.5px;color:var(--text-2)">이번 버전 제외 · 다음 버전 이력 추적용</span>' : ""}</dd>` : ""}
        </div>
        <div class="section-label">등급</div>
        ${syn.final_grade ? `
          <div class="pscore"><div class="ph"><span>${app.gradeBadge(syn.final_grade)}
            <span style="font-weight:400;color:var(--text-2);font-size:11.5px">${(App.GRADES[syn.final_grade] || {}).full || ""}</span></span>
            ${syn.status === "needs_human" ? '<span class="badge b-blue">사람 확인 필요</span>' : ""}</div>
          <div class="rat">${syn.rationale || ""}</div>
          ${syn.ai_grade ? `<div class="rat" style="color:var(--text-3)">AI 종합 판정: ${syn.ai_grade} → 규칙으로 조정됨</div>` : ""}
          ${syn.divergent ? `<div class="rat" style="color:var(--serious)">⚡ ${syn.divergent_summary}</div>` : ""}
          ${(syn.meeting_questions || []).map(q => `<div class="rat" style="color:var(--accent)">회의 질문: ${q}</div>`).join("")}</div>` :
          '<div class="empty" style="padding:14px 0">등급 없음 — ② 리뷰 실행 필요</div>'}
        ${it.hard_rule ? `<div class="info-banner" style="margin-top:8px">⚙ 규칙으로 확정 — AI를 호출하지 않았습니다 (config/grade_rules.json)</div>` : ""}
        ${Object.keys(per).length ? `
          <div class="section-label">부문 검토 의견 <span style="font-weight:400;text-transform:none">— 종합 페르소나가 이 의견들을 보고 등급을 정합니다</span></div>
          <div class="persona-scores">
            ${Object.entries({ experience_planning: "경험기획", ux: "UX", dev: "개발", cxi: "CXI" }).map(([k, lbl]) => per[k] ? `
              <div class="pscore"><div class="ph"><span>${lbl}</span></div>
              <div class="rat">${per[k].opinion || ""}</div>
              ${per[k].key_question ? `<div class="rat" style="color:var(--accent)">Q. ${per[k].key_question}</div>` : ""}</div>` :
              `<div class="pscore"><div class="ph"><span>${lbl}</span><span class="badge b-outline">미실행</span></div></div>`).join("")}
          </div>` : ""}
        ${(it.history || []).length ? `<div class="section-label">수정 이력</div>` +
          it.history.map(h => `<div style="font-size:11.5px;color:var(--text-2);padding:2px 0">· ${App.fmtDate(h.at)} <b>${h.by}</b>: ${h.field} ${h.from || "—"} → ${h.to} (${h.reason || "사유 없음"})</div>`).join("") : ""}
      `);
      const foot = [];
      if (!readonly && syn.final_grade && !f.decision) {
        const btn = document.createElement("button");
        btn.className = "btn primary"; btn.textContent = "등급 수정 (오버라이드)";
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
        <p style="color:var(--text-2);font-size:12.5px;margin-bottom:12px">AI 등급: ${app.gradeBadge(syn.final_grade)}
          ${(App.GRADES[syn.final_grade] || {}).full || ""} — 수정하면 원값과 수정자가 이력에 남습니다.</p>
        <div class="kv" style="grid-template-columns:90px 1fr">
          <dt>등급</dt><dd><select id="ov-grade"><option value="">유지</option>
            ${Object.entries(App.GRADES).map(([k, v]) => `<option value="${k}">${v.label} · ${v.full}</option>`).join("")}</select></dd>
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
            reason, user: app.state.user.name, base_rev: d.reviews.rev, resolve: true
          });
          app.toast("판정이 수정되었습니다");
          back.remove(); await app.reload(); app.route();
        } catch (e) { app.toast(e.message === "conflict" ? "다른 사용자가 먼저 수정했습니다 — 새로고침 후 다시 시도하세요" : e.message, true); }
      };
      const back = app.modal({ title: `등급 수정 — ${f.feature_index}`, body, foot: [ok] });
    };

    el.querySelectorAll("[data-run]").forEach(b => b.onclick = () => app.run(b.dataset.run));
    ["#f-q", "#f-grade", "#f-dept", "#f-cat", "#f-stage", "#f-cond"].forEach(s => el.querySelector(s).oninput = draw);
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
