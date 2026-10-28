const $ = (s) => document.querySelector(s);
const NS = "http://www.w3.org/2000/svg";
const el = (n, a = {}, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// id, title, subtitle, x, y, metaLogo
const NODES = [
  ["intake", "Intake", "Photo · text · bill (code)", 450, 40],
  ["vision", "Vision Reader", "Muse Spark 1.3", 250, 125, 1],
  ["segment", "Segmenter", "SAM 3.1", 650, 125, 1],
  ["engineer", "Twin Engineer", "Muse Spark 1.3", 450, 215, 1],
  ["calibrate", "Calibrator loop", "Muse Spark 1.3 + simulator", 450, 305, 1],
  ["hunt", "Waste Hunter", "Muse Spark 1.3", 250, 400, 1],
  ["verify", "Fix Verifier", "Simulator (code)", 650, 400],
  ["critic", "Critic", "Muse Spark 1.3", 450, 490, 1],
  ["report", "Report Writer", "Muse Spark 1.3", 250, 575, 1],
  ["gate", "Engineer Gate", "Human review", 650, 575],
];
const EDGES = [["intake", "vision"], ["vision", "segment"], ["vision", "engineer"], ["segment", "engineer"], ["engineer", "calibrate"], ["calibrate", "hunt"],
  ["hunt", "verify"], ["verify", "hunt"], ["hunt", "critic"], ["verify", "critic"], ["critic", "report"], ["report", "gate"]];
const PRED = { vision: ["intake"], segment: ["vision"], engineer: ["vision", "segment"], calibrate: ["engineer"], hunt: ["calibrate"], verify: ["hunt"], critic: ["hunt", "verify"], report: ["critic"], gate: ["report"] };
const W = 170, H = 56;
const pos = Object.fromEntries(NODES.map((n) => [n[0], { x: n[3], y: n[4] }]));
const nodeEl = {}, edgeEl = {}, detail = {};
let runId = null, since = 0, timer = null, cost = 0, calls = 0, demoDesc = "", iters = 0;

function buildGraph() {
  const g = $("#graph"); g.innerHTML = "";
  const eg = el("g", {}, g), ng = el("g", {}, g), pg = el("g", { id: "pulses" }, g);
  EDGES.forEach(([a, b]) => {
    const A = pos[a], B = pos[b]; let d;
    if (A.y === B.y) { const s = A.x < B.x ? 1 : -1; const off = a === "verify" ? 12 : -12; d = `M${A.x + s * W / 2},${A.y + off} L${B.x - s * W / 2},${B.y + off}`; }
    else d = `M${A.x},${A.y + H / 2} C${A.x},${(A.y + B.y) / 2} ${B.x},${(A.y + B.y) / 2} ${B.x},${B.y - H / 2}`;
    edgeEl[a + ">" + b] = el("path", { d, class: "edge" }, eg);
  });
  NODES.forEach(([id, t, s, x, y, logo]) => {
    const n = el("g", { class: "node", transform: `translate(${x - W / 2},${y - H / 2})` }, ng);
    el("rect", { width: W, height: H }, n);
    el("rect", { width: W, height: H, rx: 14, class: "ring", pathLength: 430 }, n);
    if (logo) el("image", { href: "/static/assets/meta-symbol.png", x: 10, y: 8, width: 16, height: 16, opacity: .9 }, n);
    const tt = el("text", { class: "t", x: logo ? 32 : 12, y: 22 }, n); tt.textContent = t;
    const ss = el("text", { class: "s", x: 12, y: 42 }, n); ss.textContent = s;
    const bd = el("text", { class: "badge", x: W - 10, y: 18, "text-anchor": "end" }, n);
    n.addEventListener("click", () => showDetail(id));
    nodeEl[id] = { g: n, badge: bd };
  });
}

function pulse(a, b) {
  const p = edgeEl[a + ">" + b]; if (!p || reduce || !window.gsap) return;
  p.classList.add("hot");
  const c = el("circle", { r: 5, class: "pulse" }, $("#pulses")), len = p.getTotalLength(), o = { t: 0 };
  gsap.to(o, { t: 1, duration: .7, ease: "power1.inOut", onUpdate() { const q = p.getPointAtLength(o.t * len); c.setAttribute("cx", q.x); c.setAttribute("cy", q.y); },
    onComplete() { c.remove(); setTimeout(() => p.classList.remove("hot"), 400); } });
}

function setState(id, cls) { const g = nodeEl[id]?.g; if (!g) return; g.classList.remove("running", "done", "fallback", "error"); if (cls) g.classList.add(cls); }

function showDetail(id) {
  const d = detail[id]; const box = $("#detail");
  if (!d) { box.textContent = "No output yet."; return; }
  const out = JSON.stringify(d.output, (k, v) => (k === "hourly" || k === "breakdown" ? undefined : v), 1).slice(0, 1400);
  box.innerHTML = `<b>${id}</b> · ${d.model || "code"} · ${d.ms} ms · $${d.usd}${d.fallback ? ' · <span style="color:var(--warn)">fallback' + (d.note ? ": " + d.note : "") + "</span>" : ""}<pre style="white-space:pre-wrap;font-size:11px;max-height:220px;overflow:auto">${out.replace(/</g, "&lt;")}</pre>`;
}

function chartLine(svg, series, opts) {
  svg.innerHTML = ""; const w = 320, h = 150, pl = 34, pb = 20, pt = 8, pr = 8;
  const all = series.flatMap((s) => s.v); const max = Math.max(...all, opts.min || 0) * 1.1 || 1; const n = Math.max(...series.map((s) => s.v.length));
  const X = (i) => pl + (i / Math.max(1, n - 1)) * (w - pl - pr), Y = (v) => pt + (1 - v / max) * (h - pt - pb);
  el("line", { x1: pl, y1: h - pb, x2: w - pr, y2: h - pb, stroke: "rgba(150,200,205,.3)" }, svg);
  const t = el("text", { x: 2, y: 14, fill: "#8fb0b4", "font-size": 10 }, svg); t.textContent = fmt(max);
  series.forEach((s) => {
    if (s.hline != null) { el("line", { x1: pl, x2: w - pr, y1: Y(s.hline), y2: Y(s.hline), stroke: s.color, "stroke-dasharray": "4 4" }, svg); const l = el("text", { x: w - pr - 2, y: Y(s.hline) - 4, fill: s.color, "font-size": 10, "text-anchor": "end" }, svg); l.textContent = s.label; return; }
    const pts = s.v.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
    el("polyline", { points: pts, fill: "none", stroke: s.color, "stroke-width": 2.2 }, svg);
    if (s.dots) s.v.forEach((v, i) => { el("circle", { cx: X(i), cy: Y(v), r: 4, fill: s.color }, svg); });
  });
  (opts.xlabels || []).forEach((lab, i) => { const q = el("text", { x: X(i), y: h - 6, fill: "#8fb0b4", "font-size": 10, "text-anchor": "middle" }, svg); q.textContent = lab; });
}

const calib = { twin: [], bill: 0 };
function drawCalibration() {
  chartLine($("#calchart"), [{ v: calib.twin, color: "#35d0c0", dots: true }, { hline: calib.bill, color: "#f5b84a", label: "bill " + fmt(calib.bill) + " kWh" }], { min: calib.bill, xlabels: calib.twin.map((_, i) => "#" + (i + 1)) });
}
let loadBefore = [], loadAfter = null;
function drawLoad() {
  const s = [{ v: loadBefore, color: "#ff8a7a" }]; if (loadAfter) s.push({ v: loadAfter, color: "#43d68a" });
  chartLine($("#loadchart"), s, { xlabels: loadBefore.map((_, i) => (i % 6 === 0 ? i : "")) });
}

function overlay(boxes) {
  const o = $("#overlay"); o.innerHTML = "";
  boxes.forEach((b, i) => { const [x1, y1, x2, y2] = b.box; el("rect", { x: x1, y: y1, width: x2 - x1, height: y2 - y1, fill: "rgba(53,208,192,.12)", stroke: "#35d0c0", "stroke-width": 3, "vector-effect": "non-scaling-stroke" }, o);
    const t = el("text", { x: x1 + 6, y: y1 + 26, fill: "#35d0c0", "font-size": 24, "font-weight": 700 }, o); t.textContent = b.phrase; });
}

function renderFixes(round, results) {
  const box = $("#fixes"); if (round === 1) box.innerHTML = "";
  const h = document.createElement("div"); h.className = "rnd"; h.textContent = "Round " + round; box.appendChild(h);
  results.forEach((r) => {
    const d = document.createElement("div"); d.className = "row " + (r.status === "accepted" ? "ok" : "no");
    const f = r.fix; const name = f.type.replace(/_/g, " ") + (f.target ? " · " + f.target : "");
    d.innerHTML = `${r.status === "accepted" ? "✓" : "✗"} <b>${name}</b>${r.status === "accepted" ? ` <span class="muted">saves ${fmt(r.saved_egp_year)} EGP/yr</span>` : `<br><span style="color:var(--warn)">rejected: ${r.reason}</span>`}`;
    box.appendChild(d);
    if (r.status !== "accepted" && window.gsap && !reduce) gsap.from(d, { x: -8, duration: .3, repeat: 3, yoyo: true });
  });
}

function showResult(res) {
  $("#result").hidden = false;
  const e = res.evaluation, a = res.arbiter;
  $("#tiles").innerHTML = [[fmt(e.saved_kwh_month), "kWh saved / month"], [fmt(e.saved_egp_year), "EGP saved / year"], [e.co2_t_year, "t CO₂ / year"], [e.payback_months ?? "–", "payback (months)"],
    [a.level + " (" + a.confidence_score + ")", "confidence"], [fmt(a.range_egp_year[0]) + "–" + fmt(a.range_egp_year[1]), "EGP/yr range"]].map(([b, s]) => `<div class="tile"><b>${b}</b><span>${s}</span></div>`).join("");
  $("#summary").textContent = res.summary;
  $("#critic").innerHTML = "<b>Critic:</b> " + (res.critic.challenges || []).slice(0, 3).map((c) => `<div>• ${String(c.concern).replace(/</g, "&lt;")} <span class="muted">(${c.severity})</span></div>`).join("");
  loadAfter = e.hourly_after; loadBefore = e.hourly_before; drawLoad();
  if (calSpec) Twin3D.setSpecs(calSpec, res.spec_after, e.hourly_before, e.hourly_after);
  if (window.gsap && !reduce) gsap.from("#tiles .tile", { opacity: 0, y: 10, stagger: .06, duration: .4 });
}

function handle(ev) {
  switch (ev.type) {
    case "run_start": break;
    case "node_start":
      setState(ev.node, "running"); (PRED[ev.node] || []).forEach((p) => pulse(p, ev.node)); break;
    case "node_done":
      detail[ev.node] = ev; cost += ev.usd || 0; calls += ev.calls || 0;
      setState(ev.node, ev.output?.error ? "error" : ev.fallback ? "fallback" : "done");
      if (ev.node === "segment" && ev.output?.boxes) overlay(ev.output.boxes);
      if (ev.node === "verify" || ev.node === "hunt") if (ev.node === "hunt") pulse("hunt", "critic");
      break;
    case "loop":
      iters = ev.iter; calib.bill = ev.bill_kwh; calib.twin.push(ev.twin_kwh); drawCalibration();
      loadBefore = ev.hourly; loadAfter = null; drawLoad();
      calSpec = ev.spec; Twin3D.setSpecs(ev.spec, ev.spec, ev.hourly, ev.hourly);
      nodeEl.calibrate.badge.textContent = "loop " + ev.iter;
      $("#calnote").textContent = `Iteration ${ev.iter}: twin ${fmt(ev.twin_kwh)} vs bill ${fmt(ev.bill_kwh)} kWh (${ev.err_pct > 0 ? "+" : ""}${ev.err_pct}%)` + (Math.abs(ev.err_pct) <= 5 ? " — within 5%, calibrated" : " — adjusting…");
      pulse("calibrate", "calibrate"); break;
    case "fix_round": renderFixes(ev.round, ev.results); if (calSpec) Twin3D.setSpecs(calSpec, ev.spec_after, ev.hourly_before, ev.hourly_after); pulse("hunt", "verify"); setTimeout(() => pulse("verify", "hunt"), 700); break;
    case "note": $("#calnote").textContent += "\n" + ev.text; break;
    case "gate": setState("gate", "running"); showResult(ev.result); break;
    case "decision": $("#decided").textContent = "Engineer decision recorded: " + ev.action; setState("gate", "done"); break;
    case "done": $("#stat").textContent = `${ev.calls} model calls · $${ev.cost_usd.toFixed(4)} · ${ev.seconds} s`; $("#run").disabled = false; clearInterval(timer); break;
  }
  if (ev.type !== "done") $("#stat").textContent = `${calls} model calls · $${cost.toFixed(4)}`;
}

async function poll() {
  const r = await (await fetch(`/api/run/${runId}?since=${since}`)).json();
  r.events.forEach(handle); since = r.next;
}

async function start() {
  $("#run").disabled = true; since = 0; cost = 0; calls = 0; calib.twin = []; loadBefore = []; loadAfter = null;
  $("#fixes").textContent = "No attempts yet."; $("#result").hidden = true; $("#overlay").innerHTML = ""; $("#decided").textContent = ""; $("#calnote").textContent = "Starting…";
  $("#calchart").innerHTML = ""; $("#loadchart").innerHTML = "";
  buildGraph();
  const custom = $("#desc").value.trim() !== demoDesc.trim();
  const body = custom ? { use_demo: false, description: $("#desc").value, bill_kwh: +$("#bill").value } : { use_demo: true };
  const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { $("#run").disabled = false; $("#calnote").textContent = "Could not start: " + (await r.text()); return; }
  runId = (await r.json()).run_id; clearInterval(timer); timer = setInterval(poll, 600); poll();
}

document.querySelectorAll(".btns button").forEach((b) => b.addEventListener("click", async () => {
  if (!runId) return;
  await fetch(`/api/run/${runId}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: b.dataset.a }) });
}));
$("#run").addEventListener("click", start);

let calSpec = null, view = "twin";
function setView(v) {
  view = v; $("#twin").hidden = v !== "twin"; $("#graph").hidden = v === "twin";
  $("#tab-twin").classList.toggle("on", v === "twin"); $("#tab-flow").classList.toggle("on", v !== "twin");
  if (v === "twin") Twin3D.start(); else Twin3D.stop();
}
$("#tab-twin").onclick = () => setView("twin"); $("#tab-flow").onclick = () => setView("flow");
(async () => {
  Twin3D.init($("#twin"));
  const pv = await (await fetch("/api/demo/preview")).json(); Twin3D.setSpecs(pv.spec, pv.spec, pv.hourly, pv.hourly); loadBefore = pv.hourly; drawLoad(); setView("twin");
  buildGraph();
  const c = await (await fetch("/api/demo/case")).json();
  demoDesc = c.description; $("#desc").value = c.description; $("#bill").value = c.bill_kwh;
  const p = $("#live"); p.textContent = c.meta_live ? "Meta API live" : "demo mode (no Meta key)"; if (c.meta_live) p.classList.add("on");
})();
