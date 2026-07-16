/* 일정 관리 — 개발 일정이 임박한 항목을 날짜별로 모아 보여주고, 날짜별 공지 메일 초안을 만든다.
   담당자 메일(.com)을 ;로 연결한 수신자 1줄 + 아이템 표 + 편집 가능한 인사말/맺음말. AI 호출 없음. */
App.register("schedule", {
  title: "일정 관리",
  render(el, app) {
    const d = app.state.data, feats = d.features.features;
    const fields = app.state.boot.schema_fields || {};
    const devCol = fields.dev_schedule, ownerCol = fields.dev_owner;
    const changeCol = fields.change_summary, reasonCol = fields.dev_delay_reason;
    const ver = app.state.version;
    const today = (() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); })();
    const pad = n => String(n).padStart(2, "0");
    const keyOf = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const dday = dt => Math.round((dt - today) / 86400000);
    const mails = s => (String(s == null ? "" : s).match(/[^\s,;]+\.com\b/gi) || []);
    const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const cell = (f, col) => (f.row || {})[col] || "";
    const reasonOf = f => (reasonCol ? cell(f, reasonCol) : "") || (f.dev_delay && f.dev_delay.reason) || "";

    if (!devCol) {
      el.innerHTML = `<div class="page-head"><div><div class="page-title">일정 관리</div></div></div>
        <div class="card"><div class="card-body"><div class="empty" style="padding:26px 0">
          개발 일정 열이 지정되지 않았습니다 — 설정 → 엑셀 스키마 매핑에서 <b>개발일정</b>을 연결하세요.</div></div></div>`;
      return;
    }

    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">일정 관리</div>
        <div class="page-sub">개발 일정이 임박한 항목을 날짜별로 확인하고, 날짜별 공지 메일 초안을 만들어 담당자에게 보냅니다</div></div>
        <div class="actions">
          <label style="font-size:12px;color:var(--text-2)">임박 기준
            <select id="win" style="margin-left:6px">
              <option value="30">30일 이내</option><option value="45" selected>45일 이내</option>
              <option value="60">60일 이내</option><option value="90">90일 이내</option>
              <option value="9999">전체</option>
            </select></label>
        </div>
      </div>
      <div id="sched-body"></div>`;

    const body = el.querySelector("#sched-body");
    const draw = () => {
      const win = +el.querySelector("#win").value;
      const rows = feats.filter(f => f.decision !== "reject").map(f => {
        const dt = app.parseDate(cell(f, devCol));
        return dt ? { f, dt, dd: dday(dt) } : null;
      }).filter(Boolean).filter(x => x.dd <= win).sort((a, b) => a.dt - b.dt);

      if (!rows.length) {
        body.innerHTML = `<div class="card"><div class="card-body"><div class="empty" style="padding:26px 0">
          임박 기준 이내에 개발 일정이 잡힌 항목이 없습니다.</div></div></div>`;
        return;
      }
      const groups = {};
      rows.forEach(x => { (groups[keyOf(x.dt)] = groups[keyOf(x.dt)] || []).push(x); });
      const dates = Object.keys(groups).sort();
      const delayCnt = rows.filter(x => x.f.dev_delay).length;

      body.innerHTML = `<div style="font-size:12px;color:var(--text-2);margin-bottom:10px">
          임박 <b>${rows.length}</b>건 · 날짜 <b>${dates.length}</b>개${rows.some(x => x.dd < 0) ? ` · <span style="color:var(--serious)">일정 지남 ${rows.filter(x => x.dd < 0).length}건</span>` : ""}${delayCnt ? ` · <span style="color:var(--crit)">⏰ 일정 지연 ${delayCnt}건</span>` : ""}</div>` +
        dates.map(dk => {
          const g = groups[dk], dd = g[0].dd;
          const owners = [...new Set(g.flatMap(x => mails(cell(x.f, ownerCol))))];
          const ddLabel = dd < 0 ? `<span style="color:var(--serious)">D+${-dd} 지남</span>` : dd === 0 ? "오늘" : `D-${dd}`;
          return `<div class="card" style="margin-bottom:12px">
            <div class="card-head">${dk} <span class="sub">${ddLabel} · ${g.length}건${owners.length ? ` · 담당자 ${owners.length}명` : " · 담당자 없음"}</span>
              <button class="btn small" data-mail="${dk}" style="margin-left:auto">✉ 공지 메일 초안</button></div>
            <div class="card-body" style="overflow-x:auto">
              <table class="tbl" style="table-layout:fixed;width:100%">
              <colgroup><col style="width:72px"><col style="width:128px"><col><col style="width:150px"><col style="width:168px"></colgroup>
              <thead><tr><th>인덱스</th><th>기능명</th><th>변경점</th><th>개발일정</th><th>지연사유</th></tr></thead>
              <tbody>${g.map(({ f }) => {
                const chg = changeCol ? cell(f, changeCol) : "";
                const reason = reasonOf(f);
                const clip = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
                return `<tr>
                  <td class="idx">${f.feature_index}</td>
                  <td style="${clip}" title="${esc(f.function_name)}">${esc(f.function_name)}</td>
                  <td style="font-size:11.5px;color:var(--text-2);${clip}" title="${esc(chg)}">${esc(chg) || "—"}</td>
                  <td style="white-space:nowrap">${esc(cell(f, devCol))}${f.dev_delay ? ` <span class="badge b-nogo" title="${esc(f.dev_delay.from)} → ${esc(f.dev_delay.to)}">⏰ 지연</span>` : ""}</td>
                  <td style="font-size:11.5px;${clip};${reason ? "color:var(--serious)" : "color:var(--text-3)"}" title="${esc(reason)}">${esc(reason) || (f.dev_delay ? "미기재" : "—")}</td>
                </tr>`;
              }).join("")}</tbody></table>
            </div></div>`;
        }).join("");

      body.querySelectorAll("[data-mail]").forEach(b => b.onclick = () => openMail(b.dataset.mail, groups[b.dataset.mail].map(x => x.f)));
    };

    const openMail = (dk, list) => {
      const recipients = [...new Set(list.flatMap(f => App.extractMails(cell(f, ownerCol))))].join(";");
      app.mailDraftModal({
        title: `공지 메일 초안 — ${dk}`,
        recipients,
        subject: `[One UI ${ver}] 개발 일정 안내 — ${dk} (${list.length}건)`,
        cols: ["인덱스", "기능명", "변경점", "개발일정", "지연사유"],
        rows: list.map(f => [f.feature_index, f.function_name || "",
          (changeCol ? cell(f, changeCol) : ""), cell(f, devCol), reasonOf(f)]),
        tableAtEnd: false,
        topDefault: `안녕하세요.\n아래 기능들의 개발 일정이 ${dk}로 예정되어 있습니다. 일정 확인 및 준수 부탁드립니다.`,
        botDefault: `일정 지연이 필요한 경우 지연사유를 회신 부탁드립니다.\n감사합니다.`,
      });
    };

    el.querySelector("#win").oninput = draw;
    draw();
  }
});
