/* 설정 — 엔진, 사용자, 엑셀 스키마 매핑(열 단위 표: 논리 필드/관리/필수/트리거). 관리자만 저장. */
App.register("settings", {
  title: "설정",
  async render(el, app) {
    const admin = app.state.user.role === "admin";
    const [eng, schema, users] = await Promise.all([
      app.api("/api/config/engines"), app.api("/api/config/excel_schema"), app.api("/api/config/users")
    ]);
    const dis = admin ? "" : "disabled";

    // 인입된 엑셀의 실제 열 목록 (현재 버전 features의 row 키 합집합, 원 순서 유지)
    const feats = (app.state.data?.features?.features) || [];
    const cols = [...new Set(feats.slice(0, 100).flatMap(f => Object.keys(f.row || {})))];
    const noData = cols.length === 0;
    const ROLES = {
      feature_index: "인덱스 번호", feature_name: "Feature 이름", department: "제안 부서",
      dev_status: "개발 상태", change_summary: "변경점"
    };
    const roleOf = c => Object.keys(ROLES).find(k => (schema.fields || {})[k] === c) || "";

    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">설정</div>
        <div class="page-sub">config/ 파일 편집 — 저장 즉시 반영${admin ? "" : " · 조회 전용 (변경은 관리자만)"}</div></div>
      </div>
      ${admin ? "" : '<div class="info-banner">일반 권한은 조회만 가능합니다. 변경이 필요하면 관리자에게 요청하세요.</div>'}
      <div class="grid" style="grid-template-columns:1fr 1fr; align-items:start; margin-bottom:14px">
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

      <div class="card"><div class="card-head">엑셀 스키마 매핑 <span class="sub">config/excel_schema.json — 열 하나당 한 행, 역할과 용도를 지정</span></div>
        <div class="card-body">
          ${noData ? '<div class="warn-banner">인입된 엑셀 데이터가 없어 열 목록을 읽을 수 없습니다 — 현황판 "① 인입"으로 엑셀을 올린 뒤 여기서 매핑하세요.</div>' : `
          <div class="filterbar" style="margin-bottom:10px">
            <label style="font-size:12px;color:var(--text-2)">시트 <input id="sc-sheet" value="${schema.sheet_name || ""}" style="width:130px" ${dis}></label>
            <label style="font-size:12px;color:var(--text-2)">헤더 행 <input type="number" id="sc-hdr" value="${schema.header_row || 1}" min="1" style="width:60px" ${dis}></label>
            <input type="search" id="sc-q" placeholder="열 이름 검색…" style="min-width:180px">
            <span class="count">전체 ${cols.length}열 · <span id="mg-count"></span></span>
          </div>
          <div class="tbl-wrap" style="max-height:52vh;overflow-y:auto">
          <table class="tbl"><thead><tr>
            <th style="min-width:140px">열 이름</th>
            <th style="min-width:150px">논리 필드 <span style="font-weight:400;text-transform:none;color:var(--text-3)">(5개 필수 지정)</span></th>
            <th>관리 <input type="checkbox" id="th-mg" title="전체 토글" style="width:auto;vertical-align:-2px" ${dis}><div style="font-weight:400;text-transform:none;color:var(--text-3)">AI 참고·상세 표시</div></th>
            <th>필수 기입 <input type="checkbox" id="th-req" title="전체 토글" style="width:auto;vertical-align:-2px" ${dis}><div style="font-weight:400;text-transform:none;color:var(--text-3)">PL 완결성 검사</div></th>
            <th>재리뷰 트리거 <input type="checkbox" id="th-trig" title="전체 토글" style="width:auto;vertical-align:-2px" ${dis}><div style="font-weight:400;text-transform:none;color:var(--text-3)">갱신 시 변경되면 재리뷰</div></th>
          </tr></thead><tbody>
            ${cols.map(c => `<tr data-col-row="${c}">
              <td style="font-weight:600">${c}</td>
              <td><select data-role="${c}" ${dis}><option value="">—</option>
                ${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${roleOf(c) === k ? "selected" : ""}>${l}</option>`).join("")}</select></td>
              <td style="text-align:center"><input type="checkbox" data-mg="${c}" ${(schema.managed_columns || []).includes(c) ? "checked" : ""} style="width:auto" ${dis}></td>
              <td style="text-align:center"><input type="checkbox" data-req="${c}" ${(schema.required_columns || []).includes(c) ? "checked" : ""} style="width:auto" ${dis}></td>
              <td style="text-align:center"><input type="checkbox" data-trig="${c}" ${(schema.review_trigger_columns || []).includes(c) ? "checked" : ""} style="width:auto" ${dis}></td>
            </tr>`).join("")}
          </tbody></table></div>
          <p style="font-size:11px;color:var(--text-3);margin-top:8px">관리 열 미선택 = 전체 열 사용. 논리 필드가 지정된 열은 관리 여부와 무관하게 항상 AI에 전달됩니다.</p>`}
        </div>
      </div>
      ${admin ? `<div style="position:sticky;bottom:-40px;padding:14px 0;margin:14px -8px 0;background:var(--bg);border-top:1px solid var(--border)">
        <button class="btn primary" id="s-save" style="padding:10px 26px;margin-left:8px">설정 저장</button>
        <span id="s-msg" style="font-size:12px;color:var(--text-3);margin-left:10px"></span></div>` : ""}`;

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
      // 검색 필터
      el.querySelector("#sc-q").oninput = e => {
        const q = e.target.value.toLowerCase();
        el.querySelectorAll("[data-col-row]").forEach(tr =>
          tr.style.display = tr.dataset.colRow.toLowerCase().includes(q) ? "" : "none");
      };
      // 관리 카운트
      const mgCount = () => {
        const n = [...el.querySelectorAll("[data-mg]")].filter(c => c.checked).length;
        el.querySelector("#mg-count").textContent = n ? `관리 ${n}열` : "관리: 전체 사용";
      };
      el.querySelectorAll("[data-mg]").forEach(c => c.onchange = mgCount);
      mgCount();
      // 헤더 전체 토글 (검색으로 보이는 행만)
      [["#th-mg", "data-mg"], ["#th-req", "data-req"], ["#th-trig", "data-trig"]].forEach(([th, attr]) => {
        const h = el.querySelector(th);
        if (h) h.onchange = () => {
          el.querySelectorAll(`[data-col-row]:not([style*="none"]) [${attr}]`).forEach(c => c.checked = h.checked);
          mgCount();
        };
      });
      // 논리 필드 중복 방지: 같은 역할이 다른 열에 있으면 해제
      el.querySelectorAll("[data-role]").forEach(s => s.onchange = () => {
        if (!s.value) return;
        el.querySelectorAll("[data-role]").forEach(o => { if (o !== s && o.value === s.value) o.value = ""; });
      });
    }

    if (!admin) return;

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
            managed_columns: picked("data-mg"), required_columns: picked("data-req"),
            review_trigger_columns: picked("data-trig") };
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
