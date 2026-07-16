/* 질의 — 채팅형 자연어 검색. 전 버전 가로질러 검색, 출처 링크. */
App.register("query", {
  title: "질의",
  render(el, app) {
    const hist = JSON.parse(localStorage.getItem("qhist_" + app.state.user.name) || "[]");
    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">자연어 질의</div>
        <div class="page-sub">회의록·Feature·리뷰 결과를 전 버전에서 검색 — 답변에 출처 표기 · 기본 2단계 검색${app.state.user.role === "admin" ? " · 심층 검색 가능(관리자)" : ""}</div></div>
      </div>
      <div class="chat" id="chat">
        ${hist.slice(-6).map(h => `<div class="q">${h.q}</div><div class="a">${h.a}${srcHtml(h.sources)}</div>`).join("")}
        ${!hist.length ? `<div class="a">예시 질문: "야간모드 관련 논의가 회의록에 있었나?", "잠금화면 위젯 기능이 어떤 버전 어디에 있었지?"</div>` : ""}
      </div>
      <div style="display:flex;gap:8px;max-width:780px;margin-top:16px">
        <input id="q-in" placeholder="질문을 입력하세요…" style="flex:1;padding:10px 14px;font-size:13.5px">
        ${app.state.user.role === "admin" ? `<label style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--text-2)"><input type="checkbox" id="q-deep" style="width:auto">심층</label>` : ""}
        <button class="btn primary" id="q-go">질문</button>
      </div>`;
    function srcHtml(sources) {
      return (sources || []).length ? `<div class="src">${sources.map(s =>
        `<span class="badge b-blue" title="${s.kind} · ${s.ref}">${s.version}${s.feature_index ? "/" + s.feature_index : ""}</span>`).join("")}</div>` : "";
    }
    const go = async () => {
      const q = el.querySelector("#q-in").value.trim();
      if (!q) return;
      const chat = el.querySelector("#chat");
      chat.insertAdjacentHTML("beforeend", `<div class="q">${q}</div><div class="a" id="q-wait">검색 중… (후보 추출 → AI 1회 호출)</div>`);
      el.querySelector("#q-in").value = "";
      chat.scrollIntoView(false);
      try {
        const deep = el.querySelector("#q-deep")?.checked;
        const r = await app.api("/api/query", { question: q, user: app.state.user.name, mode: deep ? "deep" : "basic" });
        document.getElementById("q-wait").outerHTML = `<div class="a">${r.answer}${srcHtml(r.sources)}<div style="font-size:10.5px;color:var(--text-3);margin-top:6px">후보 ${r.candidates}건 검색됨</div></div>`;
        hist.push({ q, a: r.answer, sources: r.sources });
        localStorage.setItem("qhist_" + app.state.user.name, JSON.stringify(hist.slice(-30)));
      } catch (e) { document.getElementById("q-wait").outerHTML = `<div class="a" style="color:var(--crit)">오류: ${e.message}</div>`; }
    };
    el.querySelector("#q-go").onclick = go;
    el.querySelector("#q-in").onkeydown = e => { if (e.key === "Enter") go(); };
  }
});
