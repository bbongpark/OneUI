/* 현황판 — KPI + 파이프라인 + 분포 + 작업 큐. KPI 클릭 → 리뷰 보드 드릴다운. */
App.register("dashboard", {
  title: "현황판",
  render(el, app) {
    const d = app.state.data, feats = d.features.features;
    const alive = feats.filter(f => f.decision !== "rejected");          // rejected = 모수 제외
    const rv = d.reviews.items, pl = d.pl_checks.items;
    const reviewed = alive.filter(f => rv[f.feature_index] && rv[f.feature_index].synthesis);
    // 개발 완료 = 설정의 판정 규칙 (예: CL 열에 CL 번호가 있으면 완료). 열 이름·값 하드코딩 금지
    const dvRule = app.devDoneRule();
    const devDone = dvRule.column ? alive.filter(f => app.isDevDone(f)) : [];
    const plChecked = alive.filter(f => pl[f.feature_index]);
    const plReady = plChecked.filter(f => pl[f.feature_index].ready);
    const riskHigh = alive.filter(f => (pl[f.feature_index] || {}).schedule_risk === "high");
    const needsHuman = alive.filter(f => (rv[f.feature_index]?.synthesis || {}).status === "needs_human");
    const decided = alive.filter(f => f.status === "decided");
    const rejectedN = feats.length - alive.length;
    const dist = g => reviewed.filter(f => rv[f.feature_index].synthesis.final_grade === g).length;
    const p0 = dist("P0"), p1 = dist("P1"), p2 = dist("P2");
    const decDist = k => decided.filter(f => f.decision === k).length;
    const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
    const readonly = d.features.readonly;

    const kpi = (label, num, denom, opts = {}) => `
      <div class="kpi ${opts.cls || ""}" data-drill="${opts.drill || ""}" title="클릭하여 목록 보기">
        <div class="lbl"><span>${label}</span></div>
        <div class="num">${denom != null ? pct(num, denom) + "<small>%</small>" : num}</div>
        ${denom != null ? `<div class="meter"><i style="width:${pct(num, denom)}%;${opts.color ? "background:" + opts.color : ""}"></i></div>` : ""}
        <div class="foot">${opts.foot || ""}</div>
      </div>`;

    const stageCls = (done, active) => done ? "done" : active ? "active" : "";
    const ing = alive.length > 0, revDone = reviewed.length === alive.length && alive.length > 0;
    const plDone = plChecked.length >= reviewed.length && reviewed.length > 0;
    const schedDone = d.schedule.slots && d.schedule.slots.some(s => s.items.length);

    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">현황판</div>
        <div class="page-sub">One UI ${app.state.version} · 전체 ${feats.length}건 · 통계 모수 ${alive.length}건 (거절 ${rejectedN}건 제외)${readonly ? " · 읽기 전용" : ""}</div></div>
        <div class="actions">
          <button class="btn primary" id="ingest-btn">① 인입 (엑셀·PPT 업로드)</button>
          <button class="btn" data-run="review">② 리뷰 실행</button>
          <button class="btn" data-run="pl">③ PL 검사</button>
          <button class="btn" data-run="insight">⑦ 인사이트</button>
          <button class="btn" data-run="selftest">엔진 자가진단</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px"><div class="card-body">
        <div class="pipeline">
          <div class="pipe-step ${stageCls(ing, !ing)}"><div class="t">① 인입</div><div class="d">${alive.length}건 · 슬라이드 매핑</div></div>
          <div class="pipe-step ${stageCls(revDone, ing && !revDone)}"><div class="t">② 리뷰</div><div class="d">${reviewed.length}/${alive.length} 종합 완료</div></div>
          <div class="pipe-step ${stageCls(plDone && reviewed.length > 0, revDone && !plDone)}"><div class="t">③ PL 검사</div><div class="d">${plChecked.length}건 · 준비 ${plReady.length}</div></div>
          <div class="pipe-step ${stageCls(!!schedDone, plDone && !schedDone)}"><div class="t">④ 일정·예상</div><div class="d">${schedDone ? "배정됨" : "대기"}</div></div>
          <div class="pipe-step ${stageCls(decided.length > 0, !!schedDone && !decided.length)}"><div class="t">⑤ 회의</div><div class="d">결정 ${decided.length}건</div></div>
          <div class="pipe-step ${stageCls(false, decided.length > 0)}"><div class="t">⑥ PLM·추적</div><div class="d">액션 ${d.actions.items.length}건</div></div>
        </div>
      </div></div>

      <div class="grid kpi-grid" style="margin-bottom:14px">
        ${kpi("리뷰 진행률", reviewed.length, alive.length, { foot: `${reviewed.length} / ${alive.length}건`, drill: "all" })}
        ${dvRule.column
          ? kpi("개발 완료 진행률", devDone.length, alive.length, {
              foot: `${devDone.length}건 · 기준: ${dvRule.mode === "values"
                ? `'${dvRule.column}' = ${(dvRule.values || []).join(", ")}`
                : `'${dvRule.column}' 값 있음`}`,
              color: "var(--good)", drill: "devdone" })
          : `<div class="kpi" data-drill="settings" title="설정에서 완료 판정 규칙을 지정하세요">
               <div class="lbl"><span>개발 완료 진행률</span></div>
               <div class="num" style="font-size:15px;color:var(--accent)">설정 필요</div>
               <div class="foot">설정 → 개발 완료 판정 규칙 지정</div></div>`}
        ${kpi("PL 통과율", plReady.length, plChecked.length || 1, { foot: `미준비 ${plChecked.length - plReady.length}건`, color: "var(--serious)", drill: "notready" })}
        ${kpi("일정 리스크", riskHigh.length, null, { cls: riskHigh.length ? "alert" : "", foot: "high 등급 건수", drill: "risk" })}
        ${kpi("사람 확인 필요", needsHuman.length, null, { cls: needsHuman.length ? "blue" : "", foot: "AI 판단 보류", drill: "needs_human" })}
        ${kpi("결정 완료", decided.length, alive.length, { foot: `go ${decDist("go")} · 조건부 ${decDist("conditional_go")} · 보류 ${decDist("defer")}`, drill: "decided" })}
      </div>

      <div class="grid" style="grid-template-columns: 1.2fr 1fr; align-items:start">
        <div class="card"><div class="card-head">종합 판정 분포 <span class="sub">리뷰 완료 ${reviewed.length}건 기준</span></div>
          <div class="card-body">
            ${reviewed.length ? `
            <div class="stackbar">
              ${p0 ? `<i style="flex:${p0};background:var(--crit)" title="P0 ${p0}건"></i>` : ""}
              ${p1 ? `<i style="flex:${p1};background:var(--warn)" title="P1 ${p1}건"></i>` : ""}
              ${p2 ? `<i style="flex:${p2};background:var(--p2)" title="P2 ${p2}건"></i>` : ""}
            </div>
            <div class="legend">
              <span><span class="sw" style="background:var(--crit)"></span>P0 임원 최우선 <b>${p0}</b></span>
              <span><span class="sw" style="background:var(--warn)"></span>P1 대면 결정 <b>${p1}</b></span>
              <span><span class="sw" style="background:var(--p2)"></span>P2 서면보고 <b>${p2}</b></span>
            </div>
            <div class="section-label">부서별 리뷰 현황</div>
            <div id="dept-bars"></div>` : `<div class="empty">아직 종합 판정이 없습니다 — 리뷰를 실행하세요</div>`}
          </div>
        </div>
        <div class="card"><div class="card-head">작업 큐 <span class="sub">직렬 실행 · 요청자 기록</span></div>
          <div class="card-body" id="queue-box"></div>
        </div>
      </div>`;

    // 부서별 막대
    const depts = [...new Set(alive.map(f => f.department))];
    const db = el.querySelector("#dept-bars");
    if (db) db.innerHTML = depts.map(dept => {
      const tot = alive.filter(f => f.department === dept).length;
      const done = reviewed.filter(f => f.department === dept).length;
      return `<div style="display:flex;align-items:center;gap:10px;margin:5px 0;font-size:12px">
        <span style="width:86px;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${dept}</span>
        <div style="flex:1;height:8px;border-radius:4px;background:var(--surface-2);overflow:hidden"><i style="display:block;height:100%;width:${pct(done, tot)}%;background:var(--accent);border-radius:4px"></i></div>
        <span style="width:52px;text-align:right;color:var(--text-3)">${done}/${tot}</span></div>`;
    }).join("");

    // 큐 박스
    const q = app.state.queue || { current: null, pending: [], done: [], log: [] };
    el.querySelector("#queue-box").innerHTML = `
      ${q.current ? `<div class="info-banner">⏳ ${q.current}</div>` : `<div style="color:var(--text-3);font-size:12px;margin-bottom:8px">실행 중인 작업 없음</div>`}
      ${q.pending.length ? `<div class="section-label">대기 ${q.pending.length}건</div>` + q.pending.map(p => `<div style="font-size:12px;padding:3px 0;color:var(--text-2)">· ${p}</div>`).join("") : ""}
      <div class="section-label">최근 완료</div>
      ${(q.done || []).slice(0, 6).map(x => `<div style="font-size:12px;padding:3px 0;color:var(--text-2)">${x.ok ? "✅" : "❌"} ${x.label} <span style="color:var(--text-3)">${x.at.slice(11, 16)}</span></div>`).join("") || '<div style="color:var(--text-3);font-size:12px">기록 없음</div>'}`;

    el.querySelectorAll("[data-run]").forEach(b => b.onclick = () => app.run(b.dataset.run));
    el.querySelectorAll("[data-drill]").forEach(k => k.onclick = () =>
      location.hash = k.dataset.drill === "settings" ? "#/settings" : "#/review?f=" + k.dataset.drill);

    // ── ① 인입 업로드 모달 ──
    el.querySelector("#ingest-btn").onclick = () => {
      if (app.state.user.role !== "admin") return app.toast("인입은 관리자만 가능합니다", true);
      const body = App.el(`
        <div class="kv" style="grid-template-columns:110px 1fr;margin-bottom:12px">
          <dt>대상 버전</dt><dd><input id="in-ver" value="${app.state.version}" style="width:120px">
            <span style="font-size:11px;color:var(--text-3)"> 새 버전명을 입력하면 버전이 생성됩니다 (예: 9.0)</span></dd>
        </div>
        <div class="dropzone" id="in-drop">
          <span class="big">⬆</span>
          <b>취합 엑셀(.xlsx) 또는 발표 PPT(.pptx)를<br>끌어다 놓거나 클릭</b>
          <div class="hint">엑셀: 갱신본이면 트리거 열이 바뀐 행만 재리뷰 대상 (판정·오버라이드 유지)<br>
          PPT: 슬라이드에서 인덱스를 찾아 Feature에 매핑 · 여러 파일 가능</div>
        </div>
        <input type="file" id="in-file" accept=".xlsx,.pptx" class="hidden" multiple>
        <div id="in-result" style="margin-top:12px"></div>
        <p style="font-size:11px;color:var(--text-3);margin-top:10px">슬라이드 이미지(PNG) 렌더링은 Office가 있는 PC에서 scripts/ppt_to_png.ps1 — 텍스트 매핑·검사는 업로드만으로 동작합니다.</p>`);
      const drop = body.querySelector("#in-drop"), finp = body.querySelector("#in-file"), res = body.querySelector("#in-result");
      const upload = async file => {
        if (!/\.(xlsx|pptx)$/i.test(file.name)) return app.toast(`지원하지 않는 형식: ${file.name}`, true);
        const ver = body.querySelector("#in-ver").value.trim();
        res.insertAdjacentHTML("beforeend", `<div style="font-size:12px;color:var(--text-2)">⏳ ${file.name} 처리 중…</div>`);
        const b64 = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(",")[1]); r.onerror = no; r.readAsDataURL(file); });
        try {
          const r = await app.api("/api/ingest/upload", { filename: file.name, b64, version: ver,
            user: app.state.user.name, role: app.state.user.role });
          res.lastElementChild.outerHTML = r.kind === "xlsx"
            ? `<div class="info-banner">📄 ${file.name} — 전체 ${r.total} · 신규 ${r.new} · 변경 ${r.changed} · 캐시 유지 ${r.kept}${r.reregistered ? ` · <b>재등록 ${r.reregistered}</b>` : ""}${r.missing.length ? ` · 갱신본에 없음 ${r.missing.length}건` : ""}</div>`
            : `<div class="info-banner">🖼 ${file.name} — Feature ${r.mapped_features}건에 슬라이드 ${r.mapped_slides}장 매핑${r.unmapped ? ` · 미매핑 ${r.unmapped}` : ""} · <a href="#/review" style="font-weight:700">매핑 확인 필요 →</a></div>`;
          app.state.boot = await app.api("/api/bootstrap");
          // 엑셀이면 관리 열 선택 창을 바로 띄운다 (새 열이 없고 이미 선택돼 있으면 생략)
          if (r.kind === "xlsx" && r.all_columns &&
              (r.new_columns.length || !r.managed_columns.length)) {
            setTimeout(() => app.columnPicker({
              cols: r.all_columns, managed: r.managed_columns, newCols: r.new_columns,
              onSaved: () => {
                res.insertAdjacentHTML("beforeend",
                  `<div class="info-banner">✅ 관리 열 저장됨 — <a href="#/settings" style="font-weight:700">설정에서 논리 필드·필수·트리거 지정 →</a></div>`);
              }
            }), 400);
          }
          if (!app.state.boot.versions.includes(app.state.version) || ver !== app.state.version) {
            const vs = document.getElementById("version-select");
            vs.innerHTML = app.state.boot.versions.map(v => `<option value="${v}">One UI ${v}</option>`).join("");
            vs.value = ver; app.state.version = ver; localStorage.setItem("version", ver);
          }
          await app.reload();
        } catch (e) { res.lastElementChild.outerHTML = `<div class="warn-banner">❌ ${file.name}: ${e.message}</div>`; }
      };
      drop.onclick = () => finp.click();
      finp.onchange = () => { [...finp.files].forEach(upload); finp.value = ""; };
      drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
      drop.ondragleave = () => drop.classList.remove("over");
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); [...e.dataTransfer.files].forEach(upload); };
      const close = document.createElement("button");
      close.className = "btn"; close.textContent = "닫기";
      close.onclick = () => { back.remove(); app.route(); };
      const back = app.modal({ title: "① 인입 — 취합 엑셀 · 발표 PPT 업로드", body, foot: [close], wide: true });
    };
  }
});
