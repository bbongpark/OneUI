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
      const recipients = [...new Set(list.flatMap(f => mails(cell(f, ownerCol))))].join(";");
      const subject = `[One UI ${ver}] 개발 일정 안내 — ${dk} (${list.length}건)`;
      const cols = ["인덱스", "기능명", "변경점", "개발일정", "지연사유"];
      const rowOf = f => [f.feature_index, f.function_name || "",
        (changeCol ? cell(f, changeCol) : ""), cell(f, devCol), reasonOf(f)];
      // 메일에 붙여넣을 표 — 외부 CSS가 안 따라가므로 스타일 인라인. 색 강조 없이 검은색·무채색으로.
      const thBase = "padding:8px 11px;text-align:left;background:#eeeeee;color:#000000;font-weight:700;border:1px solid #999999;white-space:nowrap";
      const tdBase = "padding:7px 11px;border:1px solid #cccccc;vertical-align:top;color:#000000";
      const tableHtml = `<table style="border-collapse:collapse;width:100%;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;font-size:13px;color:#000000">
        <thead><tr>${cols.map(c => `<th style="${thBase}">${c}</th>`).join("")}</tr></thead>
        <tbody>${list.map((f, ri) => `<tr style="background:${ri % 2 ? "#f7f7f7" : "#ffffff"}">${rowOf(f).map((v, ci) => {
          const extra = ci === 0 ? ";white-space:nowrap;font-weight:600" : ci === 2 ? ";min-width:240px" : ci === 3 ? ";white-space:nowrap" : "";
          return `<td style="${tdBase}${extra}">${esc(v) || '<span style="color:#999999">—</span>'}</td>`;
        }).join("")}</tr>`).join("")}</tbody></table>`;
      const tsv = [cols.join("\t"), ...list.map(f => rowOf(f).map(v => String(v).replace(/\s+/g, " ")).join("\t"))].join("\n");
      const topDefault = `안녕하세요.\n아래 기능들의 개발 일정이 ${dk}로 예정되어 있습니다. 일정 확인 및 준수 부탁드립니다.`;
      const botDefault = `일정 지연이 필요한 경우 지연사유를 회신 부탁드립니다.\n감사합니다.`;

      const wrap = App.el(`
        <div>
          <div class="section-label">수신자 <span style="font-weight:400;text-transform:none">— 담당자 메일을 ;로 연결 (${recipients ? recipients.split(";").length : 0}명)</span></div>
          <div style="display:flex;gap:8px;align-items:center">
            <input id="rcpt" readonly value="${esc(recipients)}" style="flex:1;font-size:12px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2)">
            <button class="btn small" id="cp-rcpt">복사</button>
          </div>
          ${recipients ? "" : '<div style="font-size:11.5px;color:var(--serious);margin-top:4px">이 날짜 항목에 담당자 메일이 없습니다 — 엑셀 개발담당자 열을 확인하세요.</div>'}
          <div class="section-label" style="margin-top:14px">제목</div>
          <div style="display:flex;gap:8px;align-items:center">
            <input id="subj" readonly value="${esc(subject)}" style="flex:1;font-size:12px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2)">
            <button class="btn small" id="cp-subj">복사</button>
          </div>
          <div class="section-label" style="margin-top:14px">인사말 <span style="font-weight:400;text-transform:none">— 편집 가능</span></div>
          <textarea id="mail-top" rows="2" style="width:100%;font-size:12.5px;padding:8px;border:1px solid var(--border);border-radius:8px;resize:vertical">${esc(topDefault)}</textarea>
          <div class="section-label" style="margin-top:12px">아이템 표 <span style="font-weight:400;text-transform:none">— 자동 (수정 불가)</span></div>
          <div style="border:1px solid var(--border);border-radius:8px;padding:10px;background:#fff;overflow-x:auto">${tableHtml}</div>
          <div class="section-label" style="margin-top:12px">맺음말 <span style="font-weight:400;text-transform:none">— 편집 가능</span></div>
          <textarea id="mail-bot" rows="2" style="width:100%;font-size:12.5px;padding:8px;border:1px solid var(--border);border-radius:8px;resize:vertical">${esc(botDefault)}</textarea>
        </div>`);

      const flash = (btn, ok) => { const o = btn.textContent; btn.textContent = ok ? "복사됨" : "복사 실패"; setTimeout(() => btn.textContent = o, 1300); };
      const topVal = () => wrap.querySelector("#mail-top").value;
      const botVal = () => wrap.querySelector("#mail-bot").value;
      const buildHtml = () => `<p>${esc(topVal()).replace(/\n/g, "<br>")}</p>${tableHtml}<p>${esc(botVal()).replace(/\n/g, "<br>")}</p>`;
      const buildPlain = () => `${topVal()}\n\n${tsv}\n\n${botVal()}`;

      wrap.querySelector("#cp-rcpt").onclick = async e => flash(e.target, await app.copyText(recipients));
      wrap.querySelector("#cp-subj").onclick = async e => flash(e.target, await app.copyText(subject));

      const cpBody = document.createElement("button");
      cpBody.className = "btn"; cpBody.textContent = "본문 복사 (표 포함)";
      cpBody.onclick = async () => flash(cpBody, await app.copyRich(buildHtml(), buildPlain()));
      const cpAll = document.createElement("button");
      cpAll.className = "btn primary"; cpAll.textContent = "수신자+제목+본문 복사";
      cpAll.onclick = async () => flash(cpAll, await app.copyText(`받는사람: ${recipients}\n제목: ${subject}\n\n${buildPlain()}`));
      app.modal({ title: `공지 메일 초안 — ${dk}`, body: wrap, foot: [cpBody, cpAll], wide: true });
    };

    el.querySelector("#win").oninput = draw;
    draw();
  }
});
