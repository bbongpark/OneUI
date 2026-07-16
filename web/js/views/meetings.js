/* 회의 현황 — 마일스톤, 기간 입력→배정, 슬롯(이동/취소/소요시간), 예상 판정, 회의록 입력→추출 확인→확정. */
App.register("meetings", {
  title: "회의",
  render(el, app) {
    const d = app.state.data, sched = d.schedule, feats = d.features.features;
    const fmap = Object.fromEntries(feats.map(f => [f.feature_index, f]));
    const readonly = d.features.readonly;
    const admin = app.state.user.role === "admin";
    const stats = d.pred_stats.runs || [];

    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">회의 현황</div>
        <div class="page-sub">슬롯 생성(수동) → 소요시간 추정 배정 → SW담당 예상 판정 → 회의록 확정</div></div>
        <div class="actions">
          <button class="btn primary" id="assign" title="만들어둔 슬롯들에 안건을 배정">④ 일정 배정 실행</button>
          <button class="btn" data-run="predict">④-2 예상 판정</button>
        </div>
      </div>
      ${sched.warning ? `<div class="warn-banner">⚠ ${sched.warning}</div>` : ""}

      <div class="grid" style="grid-template-columns: 2fr 1fr; align-items:start">
        <div>
          <div class="card" style="margin-bottom:14px"><div class="card-head">회의 슬롯 <span class="sub">회의 시간은 매번 다름 — 슬롯을 직접 추가/삭제 · 항목 클릭: 이동/취소/소요시간 수정 · ★=후속 보고</span></div>
            <div class="card-body">
            ${readonly ? "" : `<div class="filterbar" style="margin-bottom:12px">
              <input type="date" id="s-date">
              <input type="time" id="s-time" value="10:00" step="600">
              <select id="s-cap"><option value="60">60분</option><option value="90">90분</option><option value="120">120분</option><option value="30">30분</option></select>
              <button class="btn" id="s-add">+ 슬롯 추가</button>
            </div>`}
            <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))" id="slots"></div>
            ${(sched.unassigned || []).length ? `<div class="warn-banner" style="margin-top:12px">미배정 ${sched.unassigned.length}건: ${sched.unassigned.join(", ")} — 슬롯 부족, 수동 조정 필요</div>` : ""}</div>
          </div>
          <div class="card"><div class="card-head">회의록 <span class="sub">붙여넣기 → AI 추출 → 사람 확인 후 확정</span></div>
            <div class="card-body" id="meetings-box"></div>
          </div>
        </div>
        <div>
          <div class="card" style="margin-bottom:14px"><div class="card-head">과제 일정
            <span class="sub">DVR = 개발 일정 리스크 판정 기준일</span></div>
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:10px">
                <b style="font-size:13px;color:var(--accent)">DVR</b>
                ${readonly || !admin ? `<span style="font-family:var(--mono);font-size:13px">${sched.dvr || "미설정"}</span>`
                  : `<input type="date" id="dvr-in" value="${sched.dvr || ""}" style="flex:1">
                     <button class="btn small primary" id="dvr-save">저장</button>`}
              </div>
              <div id="ms-list">${(sched.milestones || []).map((m, i) => `
                <div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px dashed var(--border);font-size:12.5px">
                  <span style="flex:1">${m.name}</span>
                  <b style="font-family:var(--mono);font-size:12px">${m.date}</b>
                  ${admin && !readonly ? `<button class="btn ghost small" data-msdel="${i}" style="padding:0 5px">✕</button>` : ""}
                </div>`).join("") || '<div style="font-size:12px;color:var(--text-3);padding:4px 0">마일스톤 없음</div>'}</div>
              ${admin && !readonly ? `<div style="display:flex;gap:6px;margin-top:8px">
                <input id="ms-name" placeholder="마일스톤 이름" style="flex:1">
                <input type="date" id="ms-date" style="width:140px">
                <button class="btn small" id="ms-add">추가</button></div>` : ""}
              <p style="font-size:11px;color:var(--text-3);margin-top:8px">개발 일정이 DVR을 넘으면 일정 리스크로 판정됩니다. 마일스톤은 PL 검사의 참고 자료입니다.</p>
            </div>
          </div>
          <div class="card"><div class="card-head">SW담당 예상 적중률</div>
            <div class="card-body">
              ${stats.length ? `<div class="acc-chart">${stats.slice(0, 8).reverse().map(r =>
                `<div class="bar" style="height:${r.accuracy}%" title="${r.meeting_id} · ${r.n}건"><span>${r.accuracy}%</span></div>`).join("")}</div>
                <p style="font-size:11px;color:var(--text-3);margin-top:6px">회의 확정 시 자동 측정 · 회의록이 쌓일수록 페르소나를 보강하세요</p>`
                : '<div class="empty">아직 측정 없음 — 회의 확정 시 자동 기록</div>'}
            </div>
          </div>
        </div>
      </div>`;

    // ── 슬롯 렌더 ──
    const slotBox = el.querySelector("#slots");
    slotBox.innerHTML = (sched.slots || []).map((s, si) => {
      const used = s.items.reduce((a, i) => a + i.est_min, 0);
      return `<div class="slot ${used > s.capacity_min ? "over" : ""}">
        <div class="slot-head"><span>${s.date} ${s.time}</span><span class="cap">${used}/${s.capacity_min}분
          ${readonly ? "" : `<button class="btn ghost small" data-del-slot="${s.date}|${s.time}" title="슬롯 삭제 (안건은 미배정으로 이동)" style="padding:0 5px">✕</button>`}</span></div>
        ${s.items.map(i => {
          const f = fmap[i.feature_index] || { name: i.feature_index };
          return `<div class="slot-item" data-si="${si}" data-idx="${i.feature_index}" style="cursor:pointer" title="클릭: 조정">
            ${i.followup ? "★ " : ""}<span class="idx" style="font-family:var(--mono);font-size:10.5px;color:var(--text-3)">${i.feature_index}</span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span>
            ${i.predicted ? app.recBadge(i.predicted.predicted_decision) : ""}
            <span class="est">${i.est_min}분</span></div>`;
        }).join("") || '<div style="color:var(--text-3);font-size:11.5px;padding:4px">비어 있음</div>'}
      </div>`;
    }).join("") || '<div class="empty">슬롯이 없습니다 — 위에서 날짜·시각·시간을 정해 슬롯을 추가한 뒤 배정을 실행하세요</div>';

    // 슬롯 추가/삭제
    const addBtn = el.querySelector("#s-add");
    if (addBtn) addBtn.onclick = async () => {
      const date = el.querySelector("#s-date").value, time = el.querySelector("#s-time").value;
      if (!date || !time) return app.toast("날짜와 시각을 입력하세요", true);
      try {
        await app.api("/api/schedule/slot", { version: app.state.version, op: "add", date, time,
          capacity_min: el.querySelector("#s-cap").value, base_rev: sched.rev });
        app.toast(`슬롯 추가됨: ${date} ${time}`);
        await app.reload(); app.route();
      } catch (e) { app.toast(e.message.includes("rev") ? "다른 사용자가 먼저 수정했습니다 — 새로고침됩니다" : e.message, true); if (e.message.includes("rev")) { await app.reload(); app.route(); } }
    };
    slotBox.querySelectorAll("[data-del-slot]").forEach(b => b.onclick = async e => {
      e.stopPropagation();
      const [date, time] = b.dataset.delSlot.split("|");
      try {
        await app.api("/api/schedule/slot", { version: app.state.version, op: "del", date, time, base_rev: sched.rev });
        app.toast("슬롯 삭제됨 — 담긴 안건은 미배정으로 이동");
        await app.reload(); app.route();
      } catch (e2) { app.toast(e2.message, true); }
    });

    slotBox.querySelectorAll(".slot-item").forEach(item => item.onclick = () => {
      if (readonly) return;
      const idx = item.dataset.idx;
      const cur = sched.slots.flatMap(s => s.items).find(i => i.feature_index === idx);
      const pred = cur.predicted;
      const body = App.el(`
        ${pred ? `<div class="pscore" style="margin-bottom:12px"><div class="ph"><span>SW담당 예상</span>
          <span>${app.recBadge(pred.predicted_decision)} <small style="color:var(--text-3)">확신도 ${pred.confidence}</small></span></div>
          <div class="rat">${pred.rationale}</div>
          ${(pred.anticipated_questions || []).map(q => `<div class="rat" style="color:var(--accent)">예상 질문: ${q}</div>`).join("")}</div>` : ""}
        <div class="kv" style="grid-template-columns:100px 1fr">
          <dt>소요시간(분)</dt><dd><input type="number" id="mv-est" value="${cur.est_min}" min="3" max="30" style="width:90px"></dd>
          <dt>이동할 슬롯</dt><dd><select id="mv-slot"><option value="">이동 안 함</option>
            ${sched.slots.map(s => `<option value="${s.date}|${s.time}">${s.date} ${s.time} (${s.items.reduce((a, i) => a + i.est_min, 0)}/${s.capacity_min}분)</option>`).join("")}</select></dd>
        </div>`);
      const save = document.createElement("button");
      save.className = "btn primary"; save.textContent = "적용";
      save.onclick = async () => {
        try {
          const est = +body.querySelector("#mv-est").value;
          if (est !== cur.est_min)
            await app.api("/api/schedule/est", { version: app.state.version, feature_index: idx, est_min: est, user: app.state.user.name, base_rev: sched.rev });
          const mv = body.querySelector("#mv-slot").value;
          if (mv) {
            const [date, time] = mv.split("|");
            const r = await app.api("/api/schedule/move", { version: app.state.version, feature_index: idx, date, time });
            if (r.warning) app.toast("⚠ " + r.warning, true);
          }
          back.remove(); await app.reload(); app.route();
        } catch (e) { app.toast(e.message, true); }
      };
      const cancel = document.createElement("button");
      cancel.className = "btn danger"; cancel.textContent = "배정 취소";
      cancel.onclick = async () => {
        await app.api("/api/schedule/move", { version: app.state.version, feature_index: idx, cancel: true });
        back.remove(); await app.reload(); app.route();
      };
      const back = app.modal({ title: `안건 조정 — ${idx}`, body, foot: [cancel, save] });
    });

    // ── 회의록 ──
    const mbox = el.querySelector("#meetings-box");
    const meets = d.meetings.items || [];
    mbox.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input id="m-title" placeholder="회의 이름 (예: 리뷰 회의 2차)" style="flex:1">
        <button class="btn primary" id="m-new">새 회의록 입력</button>
      </div>
      ${meets.map(m => `
        <div class="pscore" style="margin-bottom:8px">
          <div class="ph"><span>${m.title} <small style="color:var(--text-3)">${m.date} ${m.time || ""}</small></span>
          <span>${m.confirmed ? '<span class="badge b-go">확정됨</span>' : '<span class="badge b-blue">확인 대기</span>'}</span></div>
          ${m.extracted ? `<div class="rat">결정 ${m.extracted.decisions.length}건 · 액션 ${m.extracted.actions.length}건${m.confirmed ? ` · ${m.confirmed_by} 확정` : ""}</div>` : ""}
          <div style="margin-top:6px"><button class="btn small" data-open="${m.id}">${m.confirmed ? "내용 보기" : "추출 결과 확인·확정"}</button></div>
        </div>`).join("")}`;

    mbox.querySelector("#m-new").onclick = () => {
      if (readonly) return app.toast("읽기 전용 버전입니다", true);
      const title = mbox.querySelector("#m-title").value.trim() || "리뷰 회의";
      const body = App.el(`
        <p style="font-size:12px;color:var(--text-2);margin-bottom:8px">회의록 원문을 붙여넣으세요. AI가 건별 결정(go/조건부/보류/거절)과 액션 아이템을 추출합니다. 예: "F012 잠금화면 위젯 — 진행 확정. 검증 결과 8월 보고."</p>
        <textarea id="m-raw" class="editor" style="min-height:220px" placeholder="회의록 원문…"></textarea>`);
      const go = document.createElement("button");
      go.className = "btn primary"; go.textContent = "AI 추출 실행";
      go.onclick = async () => {
        const minutes = body.querySelector("#m-raw").value.trim();
        if (!minutes) return app.toast("회의록을 입력하세요", true);
        const mid = "M" + (meets.length + 1);
        await app.run("minutes", { meeting_id: mid, minutes, title });
        back.remove();
      };
      const back = app.modal({ title: "회의록 입력 — " + title, body, foot: [go], wide: true });
    };

    mbox.querySelectorAll("[data-open]").forEach(b => b.onclick = () => {
      const m = meets.find(x => x.id === b.dataset.open);
      const ex = m.extracted || { decisions: [], actions: [] };
      const body = App.el(`
        <div class="section-label">회의록 원문</div>
        <div style="font-size:12px;color:var(--text-2);white-space:pre-wrap;background:var(--surface-2);border-radius:8px;padding:10px;max-height:130px;overflow-y:auto">${m.minutes_raw || ""}</div>
        <div class="section-label">추출된 결정 ${m.confirmed ? "" : "(수정 가능)"}</div>
        <table class="tbl"><thead><tr><th>인덱스</th><th>결정</th><th>조건</th></tr></thead><tbody>
          ${ex.decisions.map((x, i) => `<tr>
            <td class="idx">${x.feature_index}</td>
            <td>${m.confirmed ? app.recBadge(x.decision) : `<select data-dec="${i}">
              ${["go", "conditional_go", "defer", "no_go"].map(o => `<option value="${o}" ${x.decision === o ? "selected" : ""}>${{ go: "진행", conditional_go: "조건부", defer: "보류", no_go: "거절" }[o]}</option>`).join("")}</select>`}</td>
            <td style="font-size:11.5px">${(x.conditions || []).join(", ") || "—"}</td></tr>`).join("")}
        </tbody></table>
        <div class="section-label">추출된 액션 아이템</div>
        ${ex.actions.map(a => `<div style="font-size:12px;padding:3px 0">· <b>${a.feature_index}</b> ${a.action} ${a.owner_dept ? "(" + a.owner_dept + ")" : ""} ${a.due || ""}</div>`).join("") || '<div style="color:var(--text-3);font-size:12px">없음</div>'}`);
      const foot = [];
      if (!m.confirmed && !readonly) {
        const ok = document.createElement("button");
        ok.className = "btn primary"; ok.textContent = "확정 — 결정 반영 + 예상 비교";
        ok.onclick = async () => {
          const decisions = ex.decisions.map((x, i) => ({ ...x, decision: body.querySelector(`[data-dec="${i}"]`)?.value || x.decision }));
          try {
            await app.api("/api/meetings/confirm", { version: app.state.version, meeting_id: m.id, decisions, actions: ex.actions, user: app.state.user.name, base_rev: d.meetings.rev });
            app.toast("회의 결과가 확정되었습니다");
            back.remove(); await app.reload(); app.route();
          } catch (e) { app.toast(e.message, true); }
        };
        foot.push(ok);
      }
      const back = app.modal({ title: m.title + " — 추출 결과", body, foot, wide: true });
    });

    el.querySelector("#assign").onclick = () => {
      if (!(sched.slots || []).length) return app.toast("슬롯이 없습니다 — 먼저 \"+ 슬롯 추가\"로 회의 슬롯을 만드세요", true);
      app.run("schedule", {});
    };
    el.querySelectorAll("[data-run]").forEach(b => b.onclick = () => app.run(b.dataset.run));

    // ── 과제 일정: DVR + 마일스톤 ──
    const savePlan = async payload => {
      try {
        await app.api("/api/schedule/plan", { version: app.state.version, user: app.state.user.name,
          role: app.state.user.role, base_rev: sched.rev, ...payload });
        app.toast("과제 일정이 저장되었습니다");
        await app.reload(); app.route();
      } catch (e) { app.toast(e.message, true); }
    };
    const dvrSave = el.querySelector("#dvr-save");
    if (dvrSave) dvrSave.onclick = () => {
      const v = el.querySelector("#dvr-in").value;
      if (!v) return app.toast("DVR 날짜를 입력하세요", true);
      savePlan({ dvr: v });
    };
    const msAdd = el.querySelector("#ms-add");
    if (msAdd) msAdd.onclick = () => {
      const name = el.querySelector("#ms-name").value.trim(), date = el.querySelector("#ms-date").value;
      if (!name || !date) return app.toast("이름과 날짜를 입력하세요", true);
      savePlan({ milestones: [...(sched.milestones || []), { name, date }].sort((a, b) => a.date.localeCompare(b.date)) });
    };
    el.querySelectorAll("[data-msdel]").forEach(b => b.onclick = () =>
      savePlan({ milestones: (sched.milestones || []).filter((_, i) => i !== +b.dataset.msdel) }));
  }
});
