/* 회의 현황 — 마일스톤, 기간 입력→배정, 슬롯(이동/취소/소요시간), 예상 판정, 회의록 입력→추출 확인→확정. */
App.register("meetings", {
  title: "회의",
  render(el, app) {
    const d = app.state.data, sched = d.schedule, feats = d.features.features;
    const fmap = Object.fromEntries(feats.map(f => [f.feature_index, f]));
    const readonly = d.features.readonly;
    const admin = app.state.user.role === "admin";
    const stats = d.pred_stats.runs || [];
    const BOARD_MAX = 5;          // 안건 배정 보드에 한 번에 표시할 회의일 수

    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">회의 현황</div>
        <div class="page-sub">회의일 지정 → 소요시간 추정 배정 → 드래그로 조정 → SW담당 예상 판정 → 회의록 확정</div></div>
        <div class="actions">
          <button class="btn primary" id="assign" title="지정한 회의일에 안건을 자동 배정 (드래그로 다시 조정 가능)">④ 일정 배정 실행</button>
          <button class="btn" data-run="predict">④-2 예상 판정</button>
        </div>
      </div>
      ${sched.warning ? `<div class="warn-banner">⚠ ${sched.warning}</div>` : ""}

      <div class="grid" style="grid-template-columns: 1fr 1fr; align-items:stretch; margin-bottom:14px">
        <div class="card"><div class="card-head">과제 일정
          <span class="sub">DVR = 개발 일정 리스크 판정 기준일</span></div>
          <div class="card-body" style="display:flex;gap:18px;align-items:flex-start">
            <div style="flex:0 0 auto;min-width:190px">
              <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">DVR</div>
              ${readonly || !admin ? `<div style="font-family:var(--mono);font-size:15px;font-weight:600;color:var(--accent)">${sched.dvr || "미설정"}</div>`
                : `<div style="display:flex;gap:6px"><input type="date" id="dvr-in" value="${sched.dvr || ""}" style="flex:1">
                   <button class="btn small primary" id="dvr-save">저장</button></div>`}
              <p style="font-size:11px;color:var(--text-3);margin-top:6px;line-height:1.5">개발 일정이 이 날짜를 넘으면<br>일정 리스크로 판정됩니다.</p>
            </div>
            <div style="flex:1;min-width:0;border-left:1px solid var(--border);padding-left:16px">
              <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">마일스톤 <span style="font-weight:400;text-transform:none">— PL 검사 참고 자료</span></div>
              <div id="ms-list">${(sched.milestones || []).map((m, i) => `
                <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px dashed var(--border);font-size:12.5px">
                  <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.name}</span>
                  <b style="font-family:var(--mono);font-size:12px">${m.date}</b>
                  ${admin && !readonly ? `<button class="btn ghost small" data-msdel="${i}" style="padding:0 5px">✕</button>` : ""}
                </div>`).join("") || '<div style="font-size:12px;color:var(--text-3);padding:4px 0">마일스톤 없음</div>'}</div>
              ${admin && !readonly ? `<div style="display:flex;gap:6px;margin-top:8px">
                <input id="ms-name" placeholder="마일스톤 이름" style="flex:1;min-width:0">
                <input type="date" id="ms-date" style="width:135px">
                <button class="btn small" id="ms-add">추가</button></div>` : ""}
            </div>
          </div>
        </div>
        <div class="card"><div class="card-head"><span style="white-space:nowrap">SW 담당님 예상 적중률</span>
          <span class="sub">예상 vs 실제 결정 일치율</span></div>
          <div class="card-body">
            ${stats.length ? `<div style="display:flex;gap:18px;align-items:flex-start">
                <div style="flex:0 0 auto">
                  <div style="font-size:11px;color:var(--text-3)">최근 회의 (${stats[0].meeting_id})</div>
                  <div style="font-size:30px;font-weight:700;letter-spacing:-1px;color:var(--accent)">${stats[0].accuracy}%</div>
                  <div style="font-size:11.5px;color:var(--text-2)">안건 ${stats[0].n}건 중 ${Math.round(stats[0].accuracy / 100 * stats[0].n)}건 적중</div>
                </div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:10.5px;color:var(--text-3);margin-bottom:2px">회의별 적중률 추이 (막대 1개 = 회의 1회)</div>
                  <div class="acc-chart" style="height:64px">${stats.slice(0, 10).reverse().map(r =>
                    `<div class="acc-col" title="${r.meeting_id} · 안건 ${r.n}건 · 적중 ${r.accuracy}%">
                       <div class="bar" style="height:${Math.max(r.accuracy, 4)}%"><span>${r.accuracy}%</span></div>
                       <div class="acc-lbl">${r.meeting_id}</div>
                     </div>`).join("")}</div>
                </div>
              </div>
              <p style="font-size:11px;color:var(--text-3);margin-top:8px">회의록이 쌓일수록 SW담당 페르소나의 판단 성향을 보강하세요</p>`
              : '<div class="empty" style="padding:20px 0">아직 측정 없음 — 회의록을 확정하면 예상과 실제를 비교해 기록합니다</div>'}
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px"><div class="card-head">회의일 지정
        <span class="sub">회의는 하루 한 번 — <b>더블클릭</b>: 회의일 추가/삭제 · <b>클릭</b>: 아래 안건 배정에 표시/숨김 (최대 ${BOARD_MAX}일)</span></div>
        <div class="card-body">
          <div class="grid" style="grid-template-columns: 1fr 1fr; align-items:start; gap:18px">
            <div>
              <div class="cal-head">
                <button class="btn ghost small" id="cal-prev">◀</button>
                <span class="mon" id="cal-mon"></span>
                <button class="btn ghost small" id="cal-next">▶</button>
                <button class="btn ghost small" id="cal-today">오늘</button>
                <span style="margin-left:auto;font-size:11px;color:var(--text-3)">
                  <span class="badge b-blue">회의일</span> <span class="badge b-nogo">DVR</span> <span class="badge b-violet">마일스톤</span></span>
              </div>
              <div class="cal" id="cal"></div>
            </div>
            <div>
              ${readonly ? "" : `<div class="filterbar" style="margin-bottom:10px">
                <label style="font-size:12px;color:var(--text-2)">회의 시각 <input type="time" id="s-time" value="14:00" step="600" style="width:110px"></label>
                <label style="font-size:12px;color:var(--text-2)">길이
                  <select id="s-cap"><option value="60">60분</option><option value="90">90분</option><option value="120">120분</option><option value="30">30분</option></select></label>
                <span style="font-size:11px;color:var(--text-3)">← 날짜를 새로 지정할 때 적용</span>
              </div>`}
              <div id="picked"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px"><div class="card-head">안건 배정
        <span class="sub">안건을 끌어다 다른 회의일·미배정으로 옮기세요 (회의일 자체는 위에서 관리) · 항목 클릭 = 소요시간·예상 판정 · ★=후속 보고</span>
        <span class="count" id="slot-sum" style="margin-left:auto;font-size:11.5px;color:var(--text-3)"></span></div>
        <div class="card-body"><div class="board" id="board"></div></div>
      </div>
      <div class="card"><div class="card-head">회의록 <span class="sub">붙여넣기 → AI 추출 → 사람 확인 후 확정</span></div>
        <div class="card-body" id="meetings-box"></div>
      </div>`;

    // ── 달력(회의일 지정) + 보드(안건 드래그 배정) ──
    // 회의는 하루 한 번 → 슬롯 = 날짜. 날짜당 슬롯이 하나만 있도록 관리한다.
    const slots = (sched.slots || []).slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const byDate = {};
    slots.forEach(s => { if (!byDate[s.date]) byDate[s.date] = s; });
    const msByDate = {};
    (sched.milestones || []).forEach(m => (msByDate[m.date] = msByDate[m.date] || []).push(m.name));
    const iso = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const DOW = ["일", "월", "화", "수", "목", "금", "토"];
    const dates = Object.keys(byDate).sort();
    const today = iso(new Date());
    let calMon = new Date((dates[0] || today) + "T00:00:00");
    calMon.setDate(1);

    // 보드에 표시할 회의일 — 화면 상태일 뿐 데이터가 아니다 (기본: 날짜순 앞에서 BOARD_MAX일)
    let shownDates = (app._meetShown || []).filter(ds => byDate[ds]);
    if (!shownDates.length) shownDates = dates.slice(0, BOARD_MAX);
    app._meetShown = shownDates;

    const totalMin = slots.reduce((a, s) => a + s.items.reduce((x, i) => x + i.est_min, 0), 0);
    const totalItems = slots.reduce((a, s) => a + s.items.length, 0);
    const sum = el.querySelector("#slot-sum");
    if (sum) sum.textContent = `회의일 ${dates.length}일 · 배정 ${totalItems}건 · ${totalMin}분` +
      ((sched.unassigned || []).length ? ` · 미배정 ${sched.unassigned.length}건` : "");

    el.querySelector("#cal-prev").onclick = () => { calMon.setMonth(calMon.getMonth() - 1); drawCal(); };
    el.querySelector("#cal-next").onclick = () => { calMon.setMonth(calMon.getMonth() + 1); drawCal(); };
    el.querySelector("#cal-today").onclick = () => { calMon = new Date(); calMon.setDate(1); drawCal(); };

    const drawCal = () => {
      el.querySelector("#cal-mon").textContent = `${calMon.getFullYear()}년 ${calMon.getMonth() + 1}월`;
      const first = new Date(calMon.getFullYear(), calMon.getMonth(), 1);
      const last = new Date(calMon.getFullYear(), calMon.getMonth() + 1, 0);
      const cells = DOW.map((w, i) => `<div class="dow ${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${w}</div>`);
      for (let i = 0; i < first.getDay(); i++) cells.push('<div class="day pad"></div>');
      for (let dnum = 1; dnum <= last.getDate(); dnum++) {
        const ds = iso(new Date(calMon.getFullYear(), calMon.getMonth(), dnum));
        const s = byDate[ds];
        const over = s && s.items.reduce((a, i) => a + i.est_min, 0) > s.capacity_min;
        const on = shownDates.includes(ds);
        cells.push(`<div class="day ${s ? "has" : ""} ${s && on ? "shown" : ""} ${ds < today ? "past" : ""}" ${readonly ? "" : `data-day="${ds}"`}
          title="${s ? (on ? "클릭: 안건 배정에서 숨기기 · 더블클릭: 회의일 삭제" : "클릭: 안건 배정에 표시 · 더블클릭: 회의일 삭제")
                    : "더블클릭: 회의일로 지정"}">
          <span class="d">${dnum}${s && on ? ' <span class="eye">●</span>' : ""}</span>
          ${s ? `<span class="pill ${over ? "over" : ""}">${s.time} · ${s.items.length}건</span>` : ""}
          ${sched.dvr === ds ? '<span class="dvr">DVR</span>' : ""}
          ${(msByDate[ds] || []).map(n => `<span class="ms" title="${n}">◆ ${n}</span>`).join("")}
        </div>`);
      }
      el.querySelector("#cal").innerHTML = cells.join("");
      // 클릭 = 보드 표시/숨김, 더블클릭 = 회의일 추가/삭제.
      // 더블클릭 시 click도 먼저 오므로, 잠깐 기다렸다가 단독 클릭일 때만 표시 토글한다.
      let clickTimer = null;
      el.querySelectorAll("[data-day]").forEach(c => {
        c.onclick = () => {
          clearTimeout(clickTimer);
          const ds = c.dataset.day;
          clickTimer = setTimeout(() => { if (byDate[ds]) toggleShown(ds); }, 220);
        };
        c.ondblclick = () => { clearTimeout(clickTimer); toggleSlot(c.dataset.day); };
      });
    };

    // 클릭 — 보드에 표시/숨김 (데이터 변경 없음)
    const toggleShown = ds => {
      if (shownDates.includes(ds)) shownDates = shownDates.filter(x => x !== ds);
      else {
        if (shownDates.length >= BOARD_MAX)
          return app.toast(`안건 배정에는 최대 ${BOARD_MAX}일까지 표시됩니다 — 하나를 숨긴 뒤 선택하세요`, true);
        shownDates = dates.filter(x => shownDates.includes(x) || x === ds);   // 날짜순 유지
      }
      app._meetShown = shownDates;
      drawCal(); drawPicked(); drawBoard();
    };

    // 더블클릭 — 회의일 추가/삭제 (실제 데이터 변경)
    const toggleSlot = async ds => {
      const s = byDate[ds];
      try {
        if (s) {
          const n = s.items.length;
          if (!confirm(`${ds} 회의일을 삭제할까요?${n ? ` 배정된 ${n}건은 미배정으로 이동합니다.` : ""}`)) return;
          await app.api("/api/schedule/slot", { version: app.state.version, op: "del", date: ds, time: s.time, base_rev: sched.rev });
          app.toast(`회의일 삭제: ${ds}`);
          app._meetShown = shownDates.filter(x => x !== ds);
        } else {
          await app.api("/api/schedule/slot", { version: app.state.version, op: "add", date: ds,
            time: el.querySelector("#s-time").value || "14:00",
            capacity_min: el.querySelector("#s-cap").value, base_rev: sched.rev });
          app.toast(`회의일 추가: ${ds}`);
          if (shownDates.length < BOARD_MAX) app._meetShown = [...shownDates, ds];   // 여유가 있으면 바로 표시
        }
        await app.reload(); app.route();
      } catch (e) {
        app.toast(e.message.includes("rev") ? "다른 사용자가 먼저 수정했습니다 — 새로고침합니다" : e.message, true);
        if (e.message.includes("rev")) { await app.reload(); app.route(); }
      }
    };

    // 지정된 회의일 목록 (달력 옆)
    const drawPicked = () => {
      el.querySelector("#picked").innerHTML = dates.length
        ? `<div style="font-size:12px;color:var(--text-2);margin-bottom:6px">지정된 회의일 <b>${dates.length}일</b>
             <span style="color:var(--text-3)">· 안건 배정에 표시 중 ${shownDates.length}/${BOARD_MAX}일</span></div>` +
          dates.map(ds => {
            const s = byDate[ds], used = s.items.reduce((a, i) => a + i.est_min, 0);
            const dw = DOW[new Date(ds + "T00:00:00").getDay()];
            const on = shownDates.includes(ds);
            return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed var(--border);font-size:12.5px;${on ? "" : "opacity:.55"}">
              <input type="checkbox" data-show="${ds}" ${on ? "checked" : ""} style="width:auto" title="안건 배정에 표시">
              <b style="font-family:var(--mono)">${ds}</b><span style="color:var(--text-3)">(${dw})</span>
              ${readonly ? `<span>${s.time}</span>`
                : `<input type="time" data-t="${ds}" value="${s.time}" step="600" style="width:100px;padding:3px 6px">`}
              <span style="margin-left:auto;color:${used > s.capacity_min ? "var(--crit)" : "var(--text-2)"}">${used}/${s.capacity_min}분 · ${s.items.length}건</span>
              ${readonly ? "" : `<button class="btn ghost small" data-rm="${ds}" title="회의일 삭제 (안건은 미배정으로)" style="padding:0 5px">✕</button>`}
            </div>`;
          }).join("")
        : '<div class="empty" style="padding:24px 0">달력에서 날짜를 <b>더블클릭</b>해 회의일을 추가하세요</div>';
      el.querySelectorAll("[data-show]").forEach(c => c.onclick = e => { e.preventDefault(); toggleShown(c.dataset.show); });
      el.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => toggleSlot(b.dataset.rm));
      el.querySelectorAll("[data-t]").forEach(inp => inp.onchange = async () => {
        const ds = inp.dataset.t, old = byDate[ds].time;
        try {   // 시각 변경 = 같은 날 슬롯을 새 시각으로 다시 만든다 (안건 유지)
          await app.api("/api/schedule/slot", { version: app.state.version, op: "time",
            date: ds, time: old, new_time: inp.value, base_rev: sched.rev });
          await app.reload(); app.route();
        } catch (e) { app.toast(e.message, true); }
      });
    };

    // ── 보드: 표시 중인 회의일(최대 BOARD_MAX)을 나란히 놓고 안건을 드래그로 옮긴다 ──
    // 회의일 추가·삭제는 위 "회의일 지정"에서만 — 여기 ✕는 보드에서 숨기기일 뿐이다.
    const drawBoard = () => {
      const un = sched.unassigned || [];
      const shown = dates.filter(ds => shownDates.includes(ds));
      const card = (i, fi) => {
        const f = fmap[fi] || { name: fi };
        const est = i ? i.est_min : 5;
        return `<div class="bitem ${i && i.followup ? "fu" : ""}" draggable="${!readonly}" data-idx="${fi}"
                     title="${f.name} — 클릭: 상세·소요시간, 드래그: 다른 회의일로 이동">
          <span class="fi">${fi}</span><span class="nm">${f.name}</span>
          ${i && i.predicted ? app.recBadge(i.predicted.predicted_decision) : ""}
          <span class="mn">${est}분</span></div>`;
      };
      const cols = shown.map(ds => {
        const s = byDate[ds], used = s.items.reduce((a, i) => a + i.est_min, 0);
        const pct = Math.min(Math.round(used / s.capacity_min * 100), 100);
        const dw = DOW[new Date(ds + "T00:00:00").getDay()];
        return `<div class="bcol ${used > s.capacity_min ? "over-cap" : ""}" data-drop="${ds}">
          <div class="bhead"><span class="dt">${ds.slice(5)}</span><span class="dow">(${dw}) ${s.time}</span>
            <button class="btn ghost small x" data-hide="${ds}" title="안건 배정에서 숨기기 (회의일은 유지됩니다)" style="padding:0 4px">✕</button></div>
          <div class="cap"><span>${s.items.length}건</span><span style="${used > s.capacity_min ? "color:var(--crit);font-weight:700" : ""}">${used}/${s.capacity_min}분</span></div>
          <div class="meter ${used > s.capacity_min ? "over" : pct > 85 ? "warn" : ""}"><i style="width:${pct}%"></i></div>
          ${s.items.map(i => card(i, i.feature_index)).join("") || '<div class="empty-drop">여기로 안건을 끌어오세요</div>'}
        </div>`;
      }).join("");
      el.querySelector("#board").innerHTML = (cols || "") +
        `<div class="bcol un" data-drop="">
          <div class="bhead"><span class="dt">미배정</span><span class="dow">${un.length}건</span></div>
          <div class="cap"><span style="color:var(--text-3);font-size:10.5px">회의일에서 빼면 여기로</span></div>
          ${un.map(fi => card(null, fi)).join("") || '<div class="empty-drop">없음</div>'}
        </div>` +
        (shown.length ? "" : `<div class="empty" style="flex:1">${dates.length
          ? "표시할 회의일을 위 달력에서 클릭하세요"
          : '위 달력에서 날짜를 <b>더블클릭</b>해 회의일을 추가하세요'}</div>`);
      bindBoard();
    };

    const bindBoard = () => {
      el.querySelectorAll("[data-hide]").forEach(b => b.onclick = e => { e.stopPropagation(); toggleShown(b.dataset.hide); });
      el.querySelectorAll(".bitem").forEach(it => {
        it.onclick = () => openItem(it.dataset.idx);
        it.ondragstart = e => {
          e.dataTransfer.setData("text/plain", it.dataset.idx);
          e.dataTransfer.effectAllowed = "move";
          it.classList.add("dragging");
        };
        it.ondragend = () => it.classList.remove("dragging");
      });
      // 커서 위치 → 끼워 넣을 자리 (끌고 있는 항목은 계산에서 제외)
      const insertPos = (col, y) => {
        const items = [...col.querySelectorAll(".bitem:not(.dragging)")];
        for (let i = 0; i < items.length; i++) {
          const r = items[i].getBoundingClientRect();
          if (y < r.top + r.height / 2) return { index: i, before: items[i] };
        }
        return { index: items.length, before: null };
      };
      const clearLine = () => el.querySelectorAll(".drop-line").forEach(l => l.remove());

      el.querySelectorAll("[data-drop]").forEach(col => {
        col.ondragover = e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          col.classList.add("drop");
          clearLine();
          const { before } = insertPos(col, e.clientY);      // 표시선을 그 자리에 그린다
          const line = document.createElement("div");
          line.className = "drop-line";
          if (before) before.before(line);
          else (col.querySelector(".empty-drop") || col).append(line);
        };
        col.ondragleave = e => {
          if (col.contains(e.relatedTarget)) return;         // 자식으로 이동한 것뿐이면 유지
          col.classList.remove("drop"); clearLine();
        };
        col.ondrop = async e => {
          e.preventDefault();
          const { index } = insertPos(col, e.clientY);
          col.classList.remove("drop"); clearLine();
          const fi = e.dataTransfer.getData("text/plain");
          if (!fi) return;
          const to = col.dataset.drop;                       // "" = 미배정 컬럼
          const from = slots.find(s => s.items.some(i => i.feature_index === fi));
          const sameCol = (from && from.date === to) || (!from && !to);
          // 같은 컬럼의 제자리 드롭이면 서버를 부르지 않는다.
          // (index는 자기 자신을 뺀 자리 번호 → 원래 자리와 같으면 결과가 동일)
          if (sameCol) {
            const list = to ? byDate[to].items.map(i => i.feature_index) : (sched.unassigned || []);
            if (index === list.indexOf(fi)) return;
          }
          try {
            const r = await app.api("/api/schedule/move", to
              ? { version: app.state.version, feature_index: fi, date: to, time: byDate[to].time, index }
              : { version: app.state.version, feature_index: fi, cancel: true, index });
            app.toast(sameCol ? `${fi} 순서 변경` : to ? `${fi} → ${to} 이동` : `${fi} → 미배정`);
            if (r.warning) app.toast("⚠ " + r.warning, true);
            await app.reload(); app.route();
          } catch (e2) { app.toast(e2.message, true); }
        };
      });
    };

    function openItem(idx) {
      if (readonly) return;
      const cur = sched.slots.flatMap(s => s.items).find(i => i.feature_index === idx);
      if (!cur) return app.toast(`${idx} — 미배정 상태입니다. 회의일 컬럼으로 끌어다 놓으세요`, true);
      const pred = cur.predicted;
      const body = App.el(`
        ${pred ? `<div class="pscore" style="margin-bottom:12px"><div class="ph"><span>SW담당 예상</span>
          <span>${app.recBadge(pred.predicted_decision)} <small style="color:var(--text-3)">확신도 ${pred.confidence}</small></span></div>
          <div class="rat">${pred.rationale}</div>
          ${(pred.anticipated_questions || []).map(q => `<div class="rat" style="color:var(--accent)">예상 질문: ${q}</div>`).join("")}</div>` : ""}
        <div class="kv" style="grid-template-columns:100px 1fr">
          <dt>소요시간(분)</dt><dd><input type="number" id="mv-est" value="${cur.est_min}" min="3" max="30" style="width:90px"></dd>
          <dt>회의일 이동</dt><dd><select id="mv-slot"><option value="">이동 안 함</option>
            ${sched.slots.map(s => `<option value="${s.date}|${s.time}">${s.date} ${s.time} (${s.items.reduce((a, i) => a + i.est_min, 0)}/${s.capacity_min}분)</option>`).join("")}</select>
            <div style="font-size:11px;color:var(--text-3);margin-top:3px">보드에서 드래그로도 옮길 수 있습니다</div></dd>
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
    }

    drawCal();
    drawPicked();
    drawBoard();

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
              ${Object.entries(App.DECISIONS).map(([o, v]) => `<option value="${o}" ${x.decision === o ? "selected" : ""}>${v.label}</option>`).join("")}</select>`}</td>
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
      if (!(sched.slots || []).length) return app.toast("회의일이 없습니다 — 달력에서 날짜를 클릭해 지정하세요", true);
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
