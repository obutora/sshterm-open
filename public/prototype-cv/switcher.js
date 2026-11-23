// PROTOTYPE（#1862）: SSH Term Desktop の販売ページの案（/ja/desktop/prototype-cv-<x>）を行き来する浮いたバー。
// 案そのものはスクリプトなしで動く。このファイルは見比べるためだけのもので、本番（sshterm.iru-yo.com）では何も出さない。
// 案を決めたら、prototype-cv/ と prototype-cv-*.html ごと main に入れずに消す。
(() => {
  if (location.hostname === "sshterm.iru-yo.com") return;

  const variants = [
    { key: "c", name: "どこで動かす？診断" },
    { key: "d", name: "14 日の試し方" },
    { key: "e", name: "積み木で見せる" },
  ];
  const match = location.pathname.match(/prototype-cv-([a-z])(?:\.html)?$/);
  const index = Math.max(0, variants.findIndex((v) => v.key === (match ? match[1] : "")));
  const current = variants[index];
  const go = (dir) => {
    const next = variants[(index + dir + variants.length) % variants.length];
    location.assign(`/ja/desktop/prototype-cv-${next.key}`);
  };

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };

  const bar = el("div", "proto-switcher");
  const prev = el("button", "proto-arrow", "‹");
  prev.type = "button";
  prev.setAttribute("aria-label", "前の案");
  prev.addEventListener("click", () => go(-1));
  const next = el("button", "proto-arrow", "›");
  next.type = "button";
  next.setAttribute("aria-label", "次の案");
  next.addEventListener("click", () => go(1));
  const label = el("span", "proto-label", `${current.key.toUpperCase()} (${current.name})`);
  const compare = el("a", "proto-compare", "現行");
  compare.href = "/ja/desktop";
  bar.append(prev, label, next, compare);
  document.body.append(bar);
  document.title = `[${current.key.toUpperCase()}] ${document.title}`;

  document.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.closest("input:not([type=radio]), textarea, select") || t.isContentEditable)) return;
    if (t instanceof HTMLInputElement && t.type === "radio") return;
    go(e.key === "ArrowLeft" ? -1 : 1);
  });
  console.log("[prototype] variant", current.key, current.name);
})();
