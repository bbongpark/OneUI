/* 설정 — 엑셀 스키마 매핑(관리 열만) · AI 엔진 · 사용자. 관리자만 저장. */
App.register("settings", {
  title: "설정",
  async render(el, app) {
    const admin = app.state.user.role === "admin";
    const [eng, schema, users] = await Promise.all([
      app.api("/api/config/engines"), app.api("/api/config/excel_schema"), app.api("/api/config/users")
    ]);
    const dis = admin ? "" : "disabled";

    // 인입된 엑셀의 실제 열 (원 순서 유지)
    const feats = (app.state.data?.features?.features) || [];
    const allCols = [...new Set(feats.slice(0, 100).flatMap(f => Object.keys(f.row || {})))];
    const noData = allCols.length === 0;
    // 시스템이 알아야 하는 항목 — 각각이 엑셀의 어느 열인지 지정한다
    // (Feature 이름 열은 없다 — 제목은 AI가 변경점을 요약해 만든다)
    const ROLES = {
      feature_index: { label: "인덱스", why: "Feature 식별 · PPT 슬라이드 매핑 기준" },
      function_name: { label: "기능명", why: "회의 일정 배정 · 기능별 현황 기준" },
      ai_category: { label: "AI카테고리", why: "분류·필터 기준" },
      change_summary: { label: "변경점", why: "리뷰의 핵심 입력 · 제목(AI 요약)의 원본 · 자료 보완 규칙 대상" },
      ux_schedule: { label: "UX일정", why: "일정 리스크 판정 — 이게 있어야 개발 일정이 나온다", optional: true },
      dev_schedule: { label: "개발일정", why: "일정 리스크 판정 — DVR을 넘으면 리스크", optional: true }
    };
    const roleOf = c => Object.keys(ROLES).find(k => (schema.fields || {})[k] === c) || "";
    // 실제 데이터에서 예시 값 — 맞는 열을 골랐는지 눈으로 확인하는 용도
    const sampleOf = c => {
      const v = feats.map(f => (f.row || {})[c]).find(x => String(x || "").trim());
      return v == null ? "" : String(v).slice(0, 60);
    };
    // 매핑 표에 보일 열 = 관리 열 (+ 논리 필드로 지정된 열은 항상 포함). 미선택이면 전체.
    const managed = schema.managed_columns || [];
    const roleCols = Object.values(schema.fields || {}).filter(Boolean);
    const cols = managed.length
      ? allCols.filter(c => managed.includes(c) || roleCols.includes(c))
      : allCols;

    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">설정</div>
        <div class="page-sub">config/ 파일 편집 — 저장 즉시 반영${admin ? "" : " · 조회 전용 (변경은 관리자만)"}</div></div>
      </div>
      ${admin ? "" : '<div class="info-banner">일반 권한은 조회만 가능합니다. 변경이 필요하면 관리자에게 요청하세요.</div>'}

      <div class="card" style="margin-bottom:14px"><div class="card-head">엑셀 스키마 매핑
        <span class="sub">회사 엑셀의 열 구성을 시스템에 알려주는 곳 — 코드는 열 이름을 모른다</span></div>
        <div class="card-body">
          ${noData ? '<div class="warn-banner">인입된 엑셀 데이터가 없어 열 목록을 읽을 수 없습니다 — 현황판 "① 인입"으로 엑셀을 올린 뒤 여기서 매핑하세요.</div>' : `
          <div class="filterbar" style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">
            <span style="font-size:12.5px;color:var(--text-2)">인입된 엑셀: <b>${allCols.length}열</b> 중 관리 <b style="color:var(--accent)">${cols.length}열</b>${managed.length ? "" : " (미선택 = 전체 사용)"}</span>
            ${admin ? `<button class="btn" id="cp-open">🗂 관리 열 다시 고르기</button>` : ""}
            <span style="flex:1"></span>
            <label style="font-size:12px;color:var(--text-2)">시트 이름 <input id="sc-sheet" value="${schema.sheet_name || ""}" style="width:120px" ${dis}></label>
            <label style="font-size:12px;color:var(--text-2)">헤더 행 <input type="number" id="sc-hdr" value="${schema.header_row || 1}" min="1" style="width:55px" ${dis}></label>
          </div>

          <div style="font-weight:700;font-size:13px;margin-bottom:2px"><span class="step-num">1</span>항목 연결</div>
          <p style="font-size:12px;color:var(--text-2);margin:0 0 8px 27px">
            시스템이 알아야 하는 항목이 <b>엑셀의 어느 열인지</b> 골라주세요. 오른쪽 예시 값으로 맞게 골랐는지 확인할 수 있습니다.</p>
          <table class="tbl" style="margin-bottom:18px"><thead><tr>
            <th style="width:30%">시스템이 필요한 항목</th><th style="width:28%">엑셀의 열</th><th>이 열의 예시 값</th>
          </tr></thead><tbody>
            ${Object.entries(ROLES).map(([k, r]) => `<tr>
              <td><b>${r.label}</b>${r.optional ? ' <span class="badge b-outline">선택</span>' : ""}
                <div style="font-size:11px;color:var(--text-3);font-weight:400">${r.why}</div></td>
              <td><select data-field="${k}" ${dis}><option value="">${r.optional ? "— 사용 안 함 —" : "— 선택하세요 —"}</option>
                ${allCols.map(c => `<option ${(schema.fields || {})[k] === c ? "selected" : ""}>${c}</option>`).join("")}</select></td>
              <td class="idx" data-sample="${k}" style="font-family:var(--mono);font-size:11.5px"></td>
            </tr>`).join("")}
          </tbody></table>

          <div style="font-weight:700;font-size:13px;margin-bottom:2px"><span class="step-num">2</span>열 용도 지정 <span style="font-weight:400;color:var(--text-3);font-size:12px">— 관리 열 ${cols.length}개</span></div>
          <p style="font-size:12px;color:var(--text-2);margin:0 0 8px 27px">
            <b>필수 기입</b>: PL 검사가 "이 열이 비어 있으면 발표 준비 미완"으로 판정합니다.<br>
            <b>재리뷰 트리거</b>: 갱신본에서 이 열이 바뀐 Feature만 다시 리뷰합니다 (AI 비용 절감의 핵심 — 변경점처럼 판정에 영향을 주는 열만 고르세요).</p>
          <div class="filterbar" style="margin-bottom:6px"><input type="search" id="sc-q" placeholder="열 이름 검색…" style="min-width:180px"></div>
          <div class="tbl-wrap" style="max-height:34vh;overflow-y:auto;margin-bottom:18px">
          <table class="tbl"><thead><tr>
            <th style="width:30%">관리 열</th>
            <th style="width:14%">필수 기입 <input type="checkbox" id="th-req" title="전체 토글" style="width:auto;vertical-align:-2px" ${dis}></th>
            <th style="width:16%">재리뷰 트리거 <input type="checkbox" id="th-trig" title="전체 토글" style="width:auto;vertical-align:-2px" ${dis}></th>
            <th>예시 값</th>
          </tr></thead><tbody>
            ${cols.map(c => `<tr data-col-row="${c}">
              <td style="font-weight:600">${c}${roleOf(c) ? ` <span class="badge b-blue" title="필수 항목으로 연결됨">${ROLES[roleOf(c)].label}</span>` : ""}</td>
              <td style="text-align:center"><input type="checkbox" data-req="${c}" ${(schema.required_columns || []).includes(c) ? "checked" : ""} style="width:auto" ${dis}></td>
              <td style="text-align:center"><input type="checkbox" data-trig="${c}" ${(schema.review_trigger_columns || []).includes(c) ? "checked" : ""} style="width:auto" ${dis}></td>
              <td class="idx" style="font-family:var(--mono);font-size:11.5px;color:var(--text-3);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sampleOf(c)}</td>
            </tr>`).join("")}
          </tbody></table></div>

          <div style="font-weight:700;font-size:13px;margin-bottom:2px"><span class="step-num">3</span>개발 완료 판정 규칙</div>
          <p style="font-size:12px;color:var(--text-2);margin:0 0 8px 27px">
            현황판의 <b>개발 완료 진행률</b>을 무엇으로 셀지 정합니다.</p>
          <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:12.5px;margin-left:27px">
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
              <input type="radio" name="dv-mode" value="filled" style="width:auto" ${dis} ${(schema.dev_done_rule || {}).mode !== "values" ? "checked" : ""}>
              <b>이 열에 값이 있으면 완료</b> <span style="color:var(--text-3)">(예: CL 열에 CL 번호)</span></label>
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
              <input type="radio" name="dv-mode" value="values" style="width:auto" ${dis} ${(schema.dev_done_rule || {}).mode === "values" ? "checked" : ""}>
              <b>이 열의 값이 특정 값이면 완료</b></label>
            <label style="display:flex;align-items:center;gap:6px">판정 열
              <select id="dv-col" ${dis}><option value="">— 선택 —</option>
                ${allCols.map(c => `<option ${(schema.dev_done_rule || {}).column === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
            <label id="dv-pat-wrap" style="display:flex;align-items:center;gap:6px">값 형식 <span style="color:var(--text-3);font-size:11px">선택·정규식</span>
              <input id="dv-pat" value="${(schema.dev_done_rule || {}).pattern || ""}" placeholder="예: ^\\d{6,}$" style="width:110px" ${dis}></label>
          </div>
          <div id="dv-box" style="margin:8px 0 0 27px"></div>
          <div id="dv-preview" style="margin:8px 0 0 27px;font-size:12.5px"></div>`}
        </div>
      </div>

      <div class="grid" style="grid-template-columns:1fr 1fr; align-items:start">
        <div class="card"><div class="card-head">AI 엔진 <span class="sub">config/engines.json</span></div>
          <div class="card-body">
            <div class="kv" style="grid-template-columns:130px 1fr">
              <dt>기본 엔진</dt><dd><select id="s-engine" ${dis}>
                ${Object.keys(eng.engines || {}).map(n => `<option ${n === eng.default_engine ? "selected" : ""}>${n}</option>`).join("")}</select>
                <span style="font-size:11px;color:var(--text-3)"> gemini 전환 후 자가진단 필수</span></dd>
              <dt>배치 크기</dt><dd><input type="number" id="s-batch" value="${eng.batch_size || 15}" min="1" max="50" style="width:80px" ${dis}> <span style="font-size:11px;color:var(--text-3)">호출당 Feature 건수</span></dd>
            </div>
            <p style="font-size:11px;color:var(--text-3);margin-top:8px">페르소나별 엔진/모델 지정은 engines.json의 persona_engines에서.</p>
          </div>
        </div>
        <div class="card"><div class="card-head">사용자·역할 <span class="sub">config/users.json</span></div>
          <div class="card-body">
            <table class="tbl" id="u-tbl"><thead><tr><th>이름</th><th>역할</th><th></th></tr></thead><tbody></tbody></table>
            ${admin ? `<div style="display:flex;gap:8px;margin-top:10px">
              <input id="u-name" placeholder="이름" style="flex:1"><select id="u-role"><option value="member">일반</option><option value="admin">관리자</option></select>
              <button class="btn" id="u-add">추가</button></div>` : ""}
            <div class="kv" style="grid-template-columns:160px 1fr;margin-top:10px">
              <dt>미등록 이름 허용</dt><dd><input type="checkbox" id="s-unknown" ${users.allow_unknown ? "checked" : ""} style="width:auto" ${dis}></dd>
            </div>
          </div>
        </div>
      </div>
      ${admin ? `<div class="save-bar">
        <button class="btn primary" id="s-save">설정 저장</button>
        <span id="s-msg" style="font-size:12px;color:var(--text-3)"></span></div>` : ""}`;

    // 사용자 테이블
    const localUsers = JSON.parse(JSON.stringify(users.users || []));
    const redrawUsers = () => {
      el.querySelector("#u-tbl tbody").innerHTML = localUsers.map((u, i) => `<tr>
        <td>${u.name}</td>
        <td><select data-urole="${i}" ${dis}><option value="admin" ${u.role === "admin" ? "selected" : ""}>관리자</option><option value="member" ${u.role === "member" ? "selected" : ""}>일반</option></select></td>
        <td>${admin ? `<button class="btn ghost small" data-udel="${i}">✕</button>` : ""}</td></tr>`).join("");
      if (!admin) return;
      el.querySelectorAll("[data-udel]").forEach(b => b.onclick = () => { localUsers.splice(+b.dataset.udel, 1); redrawUsers(); });
      el.querySelectorAll("[data-urole]").forEach(s => s.onchange = () => { localUsers[+s.dataset.urole].role = s.value; });
    };
    redrawUsers();

    if (!noData) {
      el.querySelector("#sc-q").oninput = e => {
        const q = e.target.value.toLowerCase();
        el.querySelectorAll("[data-col-row]").forEach(tr =>
          tr.style.display = tr.dataset.colRow.toLowerCase().includes(q) ? "" : "none");
      };
      [["#th-req", "data-req"], ["#th-trig", "data-trig"]].forEach(([th, attr]) => {
        const h = el.querySelector(th);
        if (h) h.onchange = () =>
          el.querySelectorAll(`[data-col-row]:not([style*="none"]) [${attr}]`).forEach(c => c.checked = h.checked);
      });
      // 개발 완료 판정 규칙 — 지금 설정으로 몇 건이 완료로 잡히는지 즉시 보여준다
      const preview = () => {
        const mode = el.querySelector("[name=dv-mode]:checked").value;
        const col = el.querySelector("#dv-col").value;
        const pat = el.querySelector("#dv-pat").value;
        const vals = [...el.querySelectorAll("[data-dv]:checked")].map(c => c.dataset.dv);
        const prev = el.querySelector("#dv-preview");
        if (!col) {
          prev.innerHTML = '<span style="color:var(--serious)">판정 열을 선택하세요 — 지정 전에는 현황판에 "설정 필요"로 표시됩니다.</span>';
          return;
        }
        const keep = app.state.boot.dev_done_rule;
        app.state.boot.dev_done_rule = { mode, column: col, values: vals, pattern: mode === "filled" ? pat : "" };
        const alive = feats.filter(f => f.decision !== "rejected");
        const done = alive.filter(f => app.isDevDone(f));
        const sample = done.slice(0, 3).map(f => `${f.feature_index}=${(f.row || {})[col]}`).join(" · ");
        app.state.boot.dev_done_rule = keep;
        let err = "";
        if (mode === "filled" && pat) { try { new RegExp(pat); } catch { err = ' <span style="color:var(--crit)">⚠ 정규식 오류 — 무시됨</span>'; } }
        prev.innerHTML = `<span class="badge b-go">미리보기</span> 이 규칙으로 <b>${done.length} / ${alive.length}건</b>
          (${alive.length ? Math.round(done.length / alive.length * 100) : 0}%)이 개발 완료로 집계됩니다${err}
          ${sample ? `<div style="color:var(--text-3);font-size:11.5px;margin-top:2px">예: ${sample}</div>` : ""}`;
      };
      // 모드/열에 따라 값 목록·패턴 입력 표시를 갱신
      const ruleUI = () => {
        const mode = el.querySelector("[name=dv-mode]:checked").value;
        const col = el.querySelector("#dv-col").value;
        const box = el.querySelector("#dv-box");
        el.querySelector("#dv-pat-wrap").style.display = mode === "filled" ? "" : "none";
        if (mode === "values" && col) {
          const vals = [...new Set(feats.map(f => (f.row || {})[col]).filter(v => String(v || "").trim()))].sort();
          const saved = (schema.dev_done_rule || {}).values || [];
          box.innerHTML = vals.length
            ? `<div style="font-size:11.5px;color:var(--text-3);margin-bottom:4px">'${col}' 열의 값 ${vals.length}종 — 완료로 볼 값을 고르세요</div>` +
              vals.map(v => {
                const n = feats.filter(f => (f.row || {})[col] === v).length;
                return `<label style="display:inline-flex;align-items:center;gap:5px;margin:2px 12px 2px 0;font-size:12.5px;cursor:pointer">
                  <input type="checkbox" data-dv="${v}" ${saved.includes(v) ? "checked" : ""} style="width:auto" ${dis}>
                  ${v} <span style="color:var(--text-3);font-size:11px">${n}건</span></label>`;
              }).join("")
            : '<div style="font-size:12px;color:var(--text-3)">이 열에 값이 없습니다.</div>';
          box.querySelectorAll("[data-dv]").forEach(c => c.onchange = preview);
        } else {
          box.innerHTML = "";
        }
        preview();
      };
      el.querySelectorAll("[name=dv-mode]").forEach(r => r.onchange = ruleUI);
      el.querySelector("#dv-col").onchange = ruleUI;
      el.querySelector("#dv-pat").oninput = preview;
      ruleUI();

      // 필수 항목 연결: 예시 값 표시 + 한 열을 두 항목에 지정하지 못하게
      const drawSamples = () => el.querySelectorAll("[data-field]").forEach(s => {
        const cell = el.querySelector(`[data-sample="${s.dataset.field}"]`);
        cell.textContent = s.value ? (sampleOf(s.value) || "(값 없음)") : "";
        cell.style.color = s.value ? "var(--text-2)" : "var(--text-3)";
      });
      el.querySelectorAll("[data-field]").forEach(s => s.onchange = () => {
        if (s.value) el.querySelectorAll("[data-field]").forEach(o => { if (o !== s && o.value === s.value) o.value = ""; });
        drawSamples();
      });
      drawSamples();
    }

    if (!admin) return;

    // 관리 열 선택 창
    const cpOpen = el.querySelector("#cp-open");
    if (cpOpen) cpOpen.onclick = () => app.columnPicker({
      cols: allCols, managed, newCols: [],
      onSaved: () => app.route()          // 저장 후 매핑 표를 새 관리 열로 다시 그림
    });

    el.querySelector("#u-add").onclick = () => {
      const name = el.querySelector("#u-name").value.trim();
      if (!name) return app.toast("이름을 입력하세요", true);
      if (localUsers.some(u => u.name === name)) return app.toast("이미 있는 이름입니다", true);
      localUsers.push({ name, role: el.querySelector("#u-role").value });
      el.querySelector("#u-name").value = "";
      redrawUsers();
    };

    el.querySelector("#s-save").onclick = async () => {
      const auth = { user: app.state.user.name, role: app.state.user.role };
      const engNew = { ...eng, default_engine: el.querySelector("#s-engine").value, batch_size: +el.querySelector("#s-batch").value };
      const usersNew = { ...users, users: localUsers, allow_unknown: el.querySelector("#s-unknown").checked };
      try {
        await app.api("/api/config/engines", { ...auth, data: engNew });
        await app.api("/api/config/users", { ...auth, data: usersNew });
        if (!noData) {
          const fields = {};
          el.querySelectorAll("[data-field]").forEach(s => { if (s.value) fields[s.dataset.field] = s.value; });
          const missing = Object.keys(ROLES).filter(k => !ROLES[k].optional && !fields[k]);
          if (missing.length) return app.toast("필수 항목 미연결: " + missing.map(k => ROLES[k].label).join(", "), true);
          const picked = attr => [...el.querySelectorAll(`[${attr}]`)].filter(c => c.checked).map(c => c.getAttribute(attr));
          const schemaNew = { ...schema, sheet_name: el.querySelector("#sc-sheet").value,
            header_row: +el.querySelector("#sc-hdr").value, fields,
            required_columns: picked("data-req"), review_trigger_columns: picked("data-trig"),
            dev_done_rule: {
              mode: el.querySelector("[name=dv-mode]:checked").value,
              column: el.querySelector("#dv-col").value,
              values: picked("data-dv"),
              pattern: el.querySelector("[name=dv-mode]:checked").value === "filled" ? el.querySelector("#dv-pat").value : ""
            } };
          await app.api("/api/config/excel_schema", { ...auth, data: schemaNew });
        }
        el.querySelector("#s-msg").textContent = "저장됨 · " + new Date().toLocaleTimeString();
        app.toast("설정이 저장되었습니다");
        app.state.boot = await app.api("/api/bootstrap");
        document.getElementById("engine-chip").innerHTML = `엔진: <b>${app.state.boot.engine.default}</b>`;
      } catch (e) { app.toast(e.message, true); }
    };
  }
});
