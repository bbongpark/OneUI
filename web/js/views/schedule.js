/* 일정 관리 — 개발 일정이 임박한 항목을 날짜별로 모아 보여주고, 날짜별 공지 메일 초안을 만든다.
   담당자 메일(.com)을 ;로 연결한 수신자 1줄 + 해당 날짜 아이템 표. AI 호출 없음(순수 조회·생성). */
App.register("schedule", {
  title: "일정 관리",
  render(el, app) {
    const d = app.state.data, feats = d.features.features;
    const fields = app.state.boot.schema_fields || {};
    const devCol = fields.dev_schedule, ownerCol = fields.dev_owner;
    const ver = app.state.version;
    const today = (() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); })();
    const pad = n => String(n).padStart(2, "0");
    const keyOf = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const dday = dt => Math.round((dt - today) / 86400000);
    // 셀 값에서 .com으로 끝나는 메일 토큰만 추출 (공백·쉼표·세미콜론 어떤 구분이든)
    const mails = s => (String(s == null ? "" : s).match(/[^\s,;]+\.com\b/gi) || []);

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
      // 미지원 제외 · 개발 일정이 있고 · 임박창 이내(지난 것도 경고로 포함)
      const rows = feats.filter(f => f.decision !== "reject").map(f => {
        const dt = app.parseDate((f.row || {})[devCol]);
        return dt ? { f, dt, dd: dday(dt) } : null;
      }).filter(Boolean).filter(x => x.dd <= win).sort((a, b) => a.dt - b.dt);

      if (!rows.length) {
        body.innerHTML = `<div class="card"><div class="card-body"><div class="empty" style="padding:26px 0">
          임박 기준 이내에 개발 일정이 잡힌 항목이 없습니다.</div></div></div>`;
        return;
      }
      // 날짜별 그룹
      const groups = {};
      rows.forEach(x => { (groups[keyOf(x.dt)] = groups[keyOf(x.dt)] || []).push(x); });
      const dates = Object.keys(groups).sort();

      body.innerHTML = `<div style="font-size:12px;color:var(--text-2);margin-bottom:10px">
          임박 <b>${rows.length}</b>건 · 날짜 <b>${dates.length}</b>개${rows.some(x => x.dd < 0) ? ` · <span style="color:var(--serious)">일정 지남 ${rows.filter(x => x.dd < 0).length}건</span>` : ""}</div>` +
        dates.map(dk => {
          const g = groups[dk], dd = g[0].dd;
          const owners = [...new Set(g.flatMap(x => mails((x.f.row || {})[ownerCol])))];
          const ddLabel = dd < 0 ? `<span style="color:var(--serious)">D+${-dd} 지남</span>` : dd === 0 ? "오늘" : `D-${dd}`;
          return `<div class="card" style="margin-bottom:12px">
            <div class="card-head">${dk} <span class="sub">${ddLabel} · ${g.length}건${owners.length ? ` · 담당자 ${owners.length}명` : " · 담당자 없음"}</span>
              <button class="btn small" data-mail="${dk}" style="margin-left:auto">✉ 공지 메일 초안</button></div>
            <div class="card-body" style="overflow-x:auto">
              <table class="tbl"><thead><tr><th>인덱스</th><th>제목</th><th>기능명</th><th>개발일정</th><th>담당자</th></tr></thead>
              <tbody>${g.map(x => `<tr>
                <td class="idx">${x.f.feature_index}</td>
                <td>${x.f.name || '<span style="color:var(--text-3)">미기재</span>'}</td>
                <td>${x.f.function_name || ""}</td>
                <td>${(x.f.row || {})[devCol] || ""}</td>
                <td style="font-size:11.5px;color:var(--text-2)">${mails((x.f.row || {})[ownerCol]).join(", ") || '<span style="color:var(--text-3)">미기재</span>'}</td>
              </tr>`).join("")}</tbody></table>
            </div></div>`;
        }).join("");

      body.querySelectorAll("[data-mail]").forEach(b => b.onclick = () => openMail(b.dataset.mail, groups[b.dataset.mail]));
    };

    const openMail = (dk, g) => {
      const recipients = [...new Set(g.flatMap(x => mails((x.f.row || {})[ownerCol])))].join(";");
      const subject = `[One UI ${ver}] 개발 일정 안내 — ${dk} (${g.length}건)`;
      // 메일 본문 표 (HTML)
      const tableHtml = `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f0f2f6">
          <th>인덱스</th><th>제목</th><th>기능명</th><th>개발일정</th><th>담당자</th></tr></thead>
        <tbody>${g.map(x => `<tr>
          <td>${x.f.feature_index}</td><td>${x.f.name || ""}</td><td>${x.f.function_name || ""}</td>
          <td>${(x.f.row || {})[devCol] || ""}</td><td>${mails((x.f.row || {})[ownerCol]).join(", ")}</td></tr>`).join("")}</tbody></table>`;
      const greeting = `안녕하세요. 아래 기능들의 개발 일정이 ${dk}로 예정되어 있습니다.\n일정 확인 및 준수 부탁드립니다.`;
      const bodyHtml = `<p>${greeting.replace(/\n/g, "<br>")}</p>${tableHtml}<p>감사합니다.</p>`;
      // plain text 폴백 (탭 구분 표 — 엑셀·메일에 붙이기 좋음)
      const tsv = ["인덱스\t제목\t기능명\t개발일정\t담당자",
        ...g.map(x => [x.f.feature_index, x.f.name || "", x.f.function_name || "",
          (x.f.row || {})[devCol] || "", mails((x.f.row || {})[ownerCol]).join(", ")].join("\t"))].join("\n");
      const bodyPlain = `${greeting}\n\n${tsv}\n\n감사합니다.`;

      const wrap = App.el(`
        <div>
          <div class="section-label">수신자 <span style="font-weight:400;text-transform:none">— 담당자 메일을 ;로 연결 (${recipients ? recipients.split(";").length : 0}명)</span></div>
          <div style="display:flex;gap:8px;align-items:center">
            <input id="rcpt" readonly value="${recipients}" style="flex:1;font-size:12px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2)">
            <button class="btn small" id="cp-rcpt">복사</button>
          </div>
          ${recipients ? "" : '<div style="font-size:11.5px;color:var(--serious);margin-top:4px">이 날짜 항목에 담당자 메일이 없습니다 — 엑셀 개발담당자 열을 확인하세요.</div>'}
          <div class="section-label" style="margin-top:14px">제목</div>
          <div style="display:flex;gap:8px;align-items:center">
            <input id="subj" readonly value="${subject}" style="flex:1;font-size:12px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2)">
            <button class="btn small" id="cp-subj">복사</button>
          </div>
          <div class="section-label" style="margin-top:14px">본문 미리보기</div>
          <div id="mailbody" style="border:1px solid var(--border);border-radius:8px;padding:12px;background:#fff;max-height:300px;overflow:auto">${bodyHtml}</div>
        </div>`);

      const cpRcpt = wrap.querySelector("#cp-rcpt");
      const cpSubj = wrap.querySelector("#cp-subj");
      const flash = (btn, ok) => { const o = btn.textContent; btn.textContent = ok ? "복사됨" : "복사 실패"; setTimeout(() => btn.textContent = o, 1300); };
      cpRcpt.onclick = async () => flash(cpRcpt, await app.copyText(recipients));
      cpSubj.onclick = async () => flash(cpSubj, await app.copyText(subject));

      const cpBody = document.createElement("button");
      cpBody.className = "btn"; cpBody.textContent = "본문 복사 (표 포함)";
      cpBody.onclick = async () => flash(cpBody, await app.copyRich(bodyHtml, bodyPlain));
      const cpAll = document.createElement("button");
      cpAll.className = "btn primary"; cpAll.textContent = "수신자+제목+본문 복사";
      cpAll.onclick = async () => flash(cpAll, await app.copyText(`받는사람: ${recipients}\n제목: ${subject}\n\n${bodyPlain}`));
      app.modal({ title: `공지 메일 초안 — ${dk}`, body: wrap, foot: [cpBody, cpAll], wide: true });
    };

    el.querySelector("#win").oninput = draw;
    draw();
  }
});
