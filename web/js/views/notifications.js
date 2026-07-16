/* 알림 센터 — 이벤트 피드, 유형 필터, 읽음 처리. */
App.register("notifications", {
  title: "알림 센터",
  render(el, app) {
    const ICONS = { job: ["⚙", "var(--p2-bg)"], needs_human: ["✋", "var(--accent-bg)"], risk: ["⚠", "var(--crit-bg)"],
                    meeting: ["📅", "var(--violet-bg)"], persona: ["🎭", "var(--warn-bg)"], followup: ["★", "var(--accent-bg)"],
                    override: ["✍", "var(--warn-bg)"] };
    const TYPES = { "": "전체", job: "작업", needs_human: "사람 확인", risk: "리스크", meeting: "회의", persona: "페르소나", followup: "후속 보고", override: "판정 수정" };
    let filter = "";
    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">알림 센터</div>
        <div class="page-sub">파이프라인 이벤트 피드 — 발행부는 어댑터로 분리되어 회사에서 메신저 연동 확장 가능</div></div>
        <div class="actions"><button class="btn" id="read-all">모두 읽음</button></div>
      </div>
      <div class="filterbar" id="type-filter">
        ${Object.entries(TYPES).map(([k, v]) => `<button class="btn small ${k === "" ? "primary" : ""}" data-t="${k}">${v}</button>`).join("")}
      </div>
      <div class="card"><div class="card-body" id="feed"></div></div>`;
    const draw = () => {
      const items = app.state.notifs.items.filter(n => !filter || n.type === filter);
      el.querySelector("#feed").innerHTML = items.map(n => {
        const [ic, bg] = ICONS[n.type] || ["·", "var(--p2-bg)"];
        const unread = !n.read_by.includes(app.state.user.name);
        return `<div class="notif ${unread ? "unread" : ""}">
          <div class="ic" style="background:${bg}">${ic}</div>
          <div class="tx">${n.text}<div class="at">${App.fmtDate(n.at)} · ${TYPES[n.type] || n.type}</div></div>
        </div>`;
      }).join("") || '<div class="empty">알림이 없습니다</div>';
    };
    el.querySelectorAll("[data-t]").forEach(b => b.onclick = () => {
      filter = b.dataset.t;
      el.querySelectorAll("[data-t]").forEach(x => x.classList.toggle("primary", x === b));
      draw();
    });
    el.querySelector("#read-all").onclick = async () => {
      await app.api("/api/notifications/read", { user: app.state.user.name });
      await app.poll(); draw(); app.toast("모두 읽음 처리되었습니다");
    };
    draw();
  }
});
