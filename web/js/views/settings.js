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
    const ROLES = {
      feature_index: "인덱스 번호", feature_name: "Feature 이름", department: "제안 부서",
      dev_status: "개발 상태", change_summary: "변경점"
    };
    const roleOf = c => Object.keys(ROLES).find(k => (schema.fields || {})[k] === c) || "";
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
        <span class="sub">config/excel_schema.json — 관리 열의 역할과 용도를 지정</span></div>
        <div class="card-body">
          ${noData ? '<div class="warn-banner">인입된 엑셀 데이터가 없어 열 목록을 읽을 수 없습니다 — 현황판 "① 인입"으로 엑셀을 올린 뒤 여기서 매핑하세요.</div>' : `
          <div class="filterbar" style="margin-bottom:10px">
            ${admin ? `<button class="btn primary" id="cp-open">🗂 관리 열 선택</button>` : ""}
            <label style="font-size:12px;color:var(--text-2)">시트 <input id="sc-sheet" value="${schema.sheet_name || ""}" style="width:130px" ${dis}></label>
            <label style="font-size:12px;color:var(--text-2)">헤더 행 <input type="number" id="sc-hdr" value="${schema.header_row || 1}" min="1" style="width:60px" ${dis}></label>
            <input type="search" id="sc-q" placeholder="열 이름 검색…" style="min-width:150px">
            <span class="count">엑셀 ${allCols.length}열 중 <b style="color:var(--accent)">관리 ${cols.length}열</b>${managed.length ? "" : " (미선택 = 전체 사용)"}</span>
          </div>
          <div class="tbl-wrap" style="max-height:46vh;overflow-y:auto">
          <table class="tbl"><thead><tr>
            <th style="min-width:150px">관리 열</th>
            <th style="min-width:150px">논리 필드 <span style="font-weight:400;text-transform:none;color:var(--text-3)">(5개 필수)</span></th>
            <th>필수 기입 <input type="checkbox" id="th-req" title="전체 토글" style="width:auto;vertical-align:-2px" ${dis}><div style="font-weight:400;text-transform:none;color:var(--text-3)">PL 완결성 검사 대상</div></th>
            <th>재리뷰 트리거 <input type="checkbox" id="th-trig" title="전체 토글" style="width:auto;vertical-align:-2px" ${dis}><div style="font-weight:400;text-transform:none;color:var(--text-3)">갱신 시 변경되면 재리뷰</div></th>
          </tr></thead><tbody>
            ${cols.map(c => `<tr data-col-row="${c}">
              <td style="font-weight:600">${c}</td>
              <td><select data-role="${c}" ${dis}><option value="">—</option>
                ${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${roleOf(c) === k ? "selected" : ""}>${l}</option>`).join("")}</select></td>
              <td style="text-align:center"><input type="checkbox" data-req="${c}" ${(schema.required_columns || []).includes(c) ? "checked" : ""} style="width:auto" ${dis}></td>
              <td style="text-align:center"><input type="checkbox" data-trig="${c}" ${(schema.review_trigger_columns || []).includes(c) ? "checked" : ""} style="width:auto" ${dis}></td>
            </tr>`).join("")}
          </tbody></table></div>
          <p style="font-size:11px;color:var(--text-3);margin-top:8px">관리 열만 AI 페르소나에 전달되고 리뷰 보드 상세에 표시됩니다. 목록을 바꾸려면 "관리 열 선택".</p>
          <div class="section-label" style="display:flex;align-items:center;gap:8px">개발 완료로 볼 상태 값
            <span style="font-weight:400;text-transform:none">— 현황판 "개발 완료 진행률" 집계 기준. 개발 상태 열의 실제 값에서 고르세요</span></div>
          <div id="dv-box"></div>`}
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
      // 개발 완료로 볼 상태 값 — 개발 상태 열의 실제 값을 읽어 체크박스로
      const drawDoneValues = () => {
        const col = [...el.querySelectorAll("[data-role]")].find(s => s.value === "dev_status")?.dataset.role;
        const box = el.querySelector("#dv-box");
        if (!col) {
          box.innerHTML = '<div style="font-size:12px;color:var(--serious)">개발 상태 열을 논리 필드에서 먼저 지정하세요.</div>';
          return;
        }
        const vals = [...new Set(feats.map(f => (f.row || {})[col]).filter(v => v))].sort();
        const done = schema.dev_status_done_values || [];
        box.innerHTML = vals.length
          ? `<div style="font-size:11.5px;color:var(--text-3);margin-bottom:4px">'${col}' 열의 값 ${vals.length}종</div>` +
            vals.map(v => {
              const n = feats.filter(f => (f.row || {})[col] === v).length;
              return `<label style="display:inline-flex;align-items:center;gap:5px;margin:2px 12px 2px 0;font-size:12.5px;cursor:pointer">
                <input type="checkbox" data-dv="${v}" ${done.includes(v) ? "checked" : ""} style="width:auto" ${dis}>
                ${v} <span style="color:var(--text-3);font-size:11px">${n}건</span></label>`;
            }).join("")
          : '<div style="font-size:12px;color:var(--text-3)">이 열에 값이 없습니다.</div>';
      };
      drawDoneValues();

      // 논리 필드 중복 방지 + 개발 상태 열 변경 시 값 목록 갱신
      el.querySelectorAll("[data-role]").forEach(s => s.onchange = () => {
        if (s.value) el.querySelectorAll("[data-role]").forEach(o => { if (o !== s && o.value === s.value) o.value = ""; });
        drawDoneValues();
      });
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
          el.querySelectorAll("[data-role]").forEach(s => { if (s.value) fields[s.value] = s.dataset.role; });
          const missing = Object.keys(ROLES).filter(k => !fields[k]);
          if (missing.length) return app.toast("논리 필드 미지정: " + missing.map(k => ROLES[k]).join(", "), true);
          const picked = attr => [...el.querySelectorAll(`[${attr}]`)].filter(c => c.checked).map(c => c.getAttribute(attr));
          const schemaNew = { ...schema, sheet_name: el.querySelector("#sc-sheet").value,
            header_row: +el.querySelector("#sc-hdr").value, fields,
            required_columns: picked("data-req"), review_trigger_columns: picked("data-trig"),
            dev_status_done_values: picked("data-dv") };
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
