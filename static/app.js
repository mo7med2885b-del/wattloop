"use strict";
const $ = (s) => document.querySelector(s);
const NS = "http://www.w3.org/2000/svg";
const el = (n, a = {}, p) => { const e = document.createElementNS(NS, n); for (const k in a) { const v = a[k]; if (typeof v === "string" && v.startsWith("var(")) e.style.setProperty(k, v); else e.setAttribute(k, v); } if (p) p.appendChild(e); return e; };
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TITLES = { pump: "PUMPS", compressor: "AIR", motors: "BELTS", hvac: "COOL", lighting: "LIGHT", standby: "IDLE", pv: "SOLAR" };

const App = (() => {
  let running = false, runId = null, since = 0, timer = null, cost = 0, calls = 0, rej = 0, calSpec = null, autoCompare = true;
  let source = { type: "gallery", id: "demo" }, upload = null, imgOk = true, gallery = [];
  const calib = { twin: [], bill: 0 };
  const S = { hourA: [], hourB: [], partsA: {}, partsB: {}, hour: 6, shown: { a: 0, b: 0 }, lastHi: -1, result: null };
  const caption = (t, s) => { $("#capT").textContent = t; $("#capS").textContent = s; if (window.gsap && !reduce) gsap.fromTo("#caption", { opacity: .2, x: -12 }, { opacity: 1, x: 0, duration: .4 }); };
  const alog = (text, cls = "") => { const l = $("#alog"); if (l.firstChild && l.firstChild.textContent === "No events yet.") l.innerHTML = ""; const d = document.createElement("div"); d.className = "a " + cls; d.textContent = text; l.append(d); l.scrollTop = l.scrollHeight; };

  // ---------------------------------------------------------------- live twin build panel
  const ICON = { pump: "◎", compressor: "▤", lighting: "☼", hvac: "❄", motors: "⚙", standby: "⏻", pv: "▦" };
  const nf = (v, d = 0) => (Number.isFinite(+v) ? (+v).toFixed(d) : "?"), pc = (v) => (Number.isFinite(+v) ? Math.round(+v * 100) + "%" : "?");
  const brief = (c) => ({ pump: `${c.count || 1}× ${nf(c.rated_kw)} kW · flow ${pc(c.flow_demand)} · ${c.vsd ? "VSD" : "valve"}`, compressor: `${nf(c.rated_kw)} kW · leak ${pc(c.leak)} · demand ${pc(c.air_demand)}`,
    lighting: `${nf(c.kw)} kW · ${c.led ? "LED" : "fluorescent"} · after-hrs ${c.controls ? "controlled" : c.after_hours_h || 0}`, hvac: `${nf(c.kw)} kW · ${nf(c.setpoint_c)} °C · ${c.hours || "?"} h`, motors: `${nf(c.kw)} kW · load ${pc(c.load_factor)}`, standby: `${c.auto_off ? "auto off" : nf(c.kw, 1) + " kW"}`, pv: `${nf(c.kwp)} kWp` }[c.type] || String(c.type));
  const buildPrev = {};
  function renderBuild(spec, stage, reset) {
    const box = $("#build"); if (reset) { box.innerHTML = ""; for (const k in buildPrev) delete buildPrev[k]; } $("#buildStage").textContent = stage;
    if (!spec) return; if (box.firstElementChild && box.firstElementChild.classList.contains("muted")) box.innerHTML = "";
    spec.components.forEach((c) => {
      const now = brief(c); let row = box.querySelector(`[data-id="${c.id}"]`);
      if (!row) { row = document.createElement("div"); row.className = "brow"; row.dataset.id = c.id; row.innerHTML = `<div class="bi">${ICON[c.type] || "•"}</div><div><b>${c.name || c.id}</b><span class="d"></span></div><i class="pg"></i>`; box.append(row);
        if (window.gsap && !reduce) { gsap.from(row, { x: -18, opacity: 0, duration: .45 }); gsap.fromTo(row.querySelector(".pg"), { scaleX: 0, transformOrigin: "0 50%" }, { scaleX: 1, duration: .7, onComplete() { row.querySelector(".pg").style.opacity = 0; } }); } }
      const d = row.querySelector(".d"), was = buildPrev[c.id];
      if (was && was !== now) { d.innerHTML = `<del>${was}</del><span class="chg">${now}</span>`; if (window.gsap && !reduce) gsap.fromTo(row, { backgroundColor: "rgba(255,106,0,.28)" }, { backgroundColor: "rgba(0,0,0,0)", duration: 1.2, clearProps: "backgroundColor" }); }
      else d.textContent = now; buildPrev[c.id] = now; row.classList.toggle("ok", stage.startsWith("after"));
    });
  }

  // ---------------------------------------------------------------- charts and widgets
  function drawCal() {
    const svg = $("#calchart"); svg.innerHTML = ""; const w = 280, h = 110, pl = 34, pb = 16, pt = 6, pr = 6; if (!calib.twin.length) return;
    const max = Math.max(calib.bill, ...calib.twin) * 1.12, n = Math.max(2, calib.twin.length), X = (i) => pl + (i / (n - 1)) * (w - pl - pr), Y = (v) => pt + (1 - v / max) * (h - pt - pb);
    el("line", { x1: pl, x2: w - pr, y1: Y(calib.bill), y2: Y(calib.bill), stroke: "var(--warn)", "stroke-dasharray": "4 4" }, svg);
    el("text", { x: w - pr, y: Y(calib.bill) - 3, fill: "var(--warn)", "font-size": 9, "text-anchor": "end" }, svg).textContent = "bill " + fmt(calib.bill) + " kWh";
    el("polyline", { points: calib.twin.map((v, i) => `${X(i)},${Y(v)}`).join(" "), fill: "none", stroke: "var(--or)", "stroke-width": 2 }, svg);
    calib.twin.forEach((v, i) => { el("circle", { cx: X(i), cy: Y(v), r: 3.5, fill: "var(--or)" }, svg); el("text", { x: X(i), y: h - 3, fill: "var(--mut)", "font-size": 9, "text-anchor": "middle" }, svg).textContent = "#" + (i + 1); });
    el("text", { x: 2, y: 12, fill: "var(--mut)", "font-size": 9 }, svg).textContent = fmt(max);
  }
  function radar(score) {
    const s = $("#radar"); if (!s.childNodes.length) {
      const d = el("defs", {}, s), g = el("radialGradient", { id: "rg", cx: "0%", cy: "0%", r: "100%" }, d); el("stop", { offset: "0", "stop-color": "var(--or)", "stop-opacity": ".85" }, g); el("stop", { offset: "1", "stop-color": "var(--or)", "stop-opacity": "0" }, g);
      [52, 38, 24].forEach((r) => el("circle", { cx: 60, cy: 60, r, fill: "none", stroke: "var(--line2)" }, s)); el("line", { x1: 8, y1: 60, x2: 112, y2: 60, stroke: "var(--line2)" }, s); el("line", { x1: 60, y1: 8, x2: 60, y2: 112, stroke: "var(--line2)" }, s);
      const sw = el("g", { class: "sweep" }, s); el("path", { d: "M60,60 L60,8 A52,52 0 0 1 100,26 Z", fill: "url(#rg)" }, sw);
      el("text", { id: "rscore", x: 60, y: 69, "text-anchor": "middle", fill: "var(--tx)", "font-size": 26, "font-weight": 700 }, s).textContent = "–";
    }
    $("#rscore").textContent = score == null ? "–" : score;
  }
  function flagsFor(spec) {
    const out = []; if (!spec) return out;
    spec.components.forEach((c) => {
      if (c.type === "pump") out.push(["Throttled pumps", !c.vsd]);
      if (c.type === "compressor") out.push(["Compressed-air leaks", c.leak >= 0.07]);
      if (c.type === "lighting") { out.push(["Inefficient lighting", !c.led]); out.push(["Lights on after hours", c.after_hours_h > 0 && !c.controls]); }
      if (c.type === "hvac") out.push(["Over-cooling", c.setpoint_c < 23]);
      if (c.type === "standby") out.push(["Standby loads overnight", !c.auto_off]);
    });
    return out;
  }
  function drawFlags() { const spec = Factory.getSpec(); $("#flags").innerHTML = flagsFor(spec).map(([t, bad]) => `<li class="${bad ? "bad" : "ok"}"><span>${t}</span><i class="tg"></i></li>`).join(""); }
  function drawGauges() {
    const spec = Factory.getSpec(); if (!spec) return; const g = (ty) => spec.components.find((c) => c.type === ty);
    const defs = [["Air leaks %", g("compressor") ? g("compressor").leak * 100 : 0, 40], ["Valve loss %", g("pump") && !g("pump").vsd ? (1 - g("pump").flow_demand) * 100 : 0, 60], ["After-hours lights h", g("lighting") && !g("lighting").controls ? g("lighting").after_hours_h || 0 : 0, 8], ["Standby kW", g("standby") && !g("standby").auto_off ? g("standby").kw : 0, 12]];
    const box = $("#gauges"); if (!box.children.length) defs.forEach(() => { const d = document.createElement("div"); d.innerHTML = '<svg viewBox="0 0 80 62"><path d="M10,52 A30,30 0 1 1 70,52" fill="none" style="stroke:var(--track)" stroke-width="7" stroke-linecap="round"></path><path class="gv" d="M10,52 A30,30 0 1 1 70,52" fill="none" stroke="var(--or)" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" style="transition:stroke-dashoffset .9s,stroke .4s"></path><text x="40" y="44" text-anchor="middle" style="fill:var(--tx)" font-size="15" font-weight="700" class="gt">0</text></svg><div class="gl"></div>'; box.append(d); });
    [...box.children].forEach((d, i) => { const [label, v, max] = defs[i], p = d.querySelector(".gv"), fixed = v < max * .08; p.style.strokeDashoffset = 100 - Math.min(100, v / max * 100); p.style.stroke = fixed ? "var(--ok)" : "var(--or)"; d.querySelector(".gt").textContent = v.toFixed(v < 10 ? 1 : 0); d.querySelector(".gl").textContent = label; });
  }
  function drawBars(hour) {
    const svg = $("#bars"), A = S.hourA, B = S.hourB; if (!A.length) { svg.innerHTML = ""; return; }
    const max = Math.max(...A, ...B, 1) * 1.1, w = 300, h = 100, bw = w / 24; svg.innerHTML = "";
    for (let i = 0; i < 24; i++) { const ha = A[i] / max * (h - 6), hb = (B[i] || 0) / max * (h - 6); el("rect", { x: i * bw + 1, y: h - ha, width: bw - 2, height: ha, fill: "var(--or)", opacity: .85 }, svg); if (B !== A) el("rect", { x: i * bw + 3, y: h - hb, width: bw - 6, height: hb, fill: "var(--ok)", opacity: .95 }, svg); }
    el("rect", { x: Math.floor(hour) * bw, y: 0, width: bw, height: h, fill: "none", stroke: "var(--tx)", "stroke-width": 1 }, svg);
  }
  function drawCmp() {
    const spec = Factory.getSpec(); if (!spec) return; const wd = spec.shift.days_per_week * 4.33, sum = (p) => (p || []).reduce((a, b) => a + b, 0) * wd;
    const rows = spec.components.map((c) => ({ n: c.name || c.id, a: sum((S.partsA || {})[c.id]), b: sum((S.partsB || {})[c.id]) })), max = Math.max(1, ...rows.map((r) => Math.max(r.a, Math.abs(r.b))));
    $("#cmp tbody").innerHTML = rows.slice(0, 7).map((r) => `<tr><td>${String(r.n).slice(0, 18)}</td><td style="width:30%"><span class="bar o" style="width:${Math.max(2, r.a / max * 100)}%"></span></td><td>${fmt(r.a)}</td><td style="width:20%"><span class="bar" style="width:${Math.max(2, Math.abs(r.b) / max * 100)}%"></span></td><td>${fmt(r.b)}</td></tr>`).join("");
  }
  function drawMini() {
    const svg = $("#minimap"); svg.innerHTML = ""; const spec = Factory.getSpec(); if (!spec) return;
    const X = (x) => 8 + (x + 17) / 34 * 144, Z = (z) => 6 + (z + 11.5) / 23 * 76; el("rect", { x: 6, y: 5, width: 148, height: 80, fill: "var(--field)", stroke: "var(--line2)" }, svg);
    const plan = { pump: [-8, 6, 13, 4], compressor: [7, 5.4, 9.6, 4.4], motors: [-1.6, -3.6, 18, 3.4], hvac: [10, -9, 4.6, 2.6], standby: [-13.5, -3.6, 3.4, 2.8] }, sc = Factory.scene(), after = sc && sc.after;
    spec.components.forEach((c) => { const p = plan[c.type]; if (!p) return; const ok = after && ({ pump: c.vsd, compressor: c.leak < .07, standby: c.auto_off, hvac: c.setpoint_c >= 24 }[c.type]), col = ok ? "var(--ok)" : "var(--or)";
      el("rect", { x: X(p[0] - p[2] / 2), y: Z(p[1] - p[3] / 2), width: p[2] / 34 * 144, height: p[3] / 23 * 76, fill: col, opacity: .2, stroke: col }, svg); });
    if (spec.components.some((c) => c.type === "pv")) el("text", { x: 80, y: 46, fill: "var(--ok)", "font-size": 10, "text-anchor": "middle" }, svg).textContent = "☀ PV roof";
  }
  function drawTabs() {
    const spec = Factory.getSpec(), box = $("#ztabs"); if (!spec) return; box.innerHTML = "";
    const mk = (id, label) => { const b = document.createElement("button"); b.textContent = label; b.className = (Factory.focused || "") === (id || "") ? "on" : ""; b.onclick = () => Factory.focus(id); box.append(b); };
    mk(null, "ALL"); spec.components.forEach((c) => mk(c.id, TITLES[c.type] || c.type.toUpperCase()));
  }
  function buildTimeline() { const t = $("#timeline"); t.innerHTML = ""; for (let h = 0; h < 24; h++) { const d = document.createElement("div"); d.className = "tk"; d.textContent = String(h).padStart(2, "0"); t.append(d); } }
  function markTimeline(hi) { const spec = Factory.getSpec(), sh = spec ? spec.shift : { start: 6, end: 22 }; [...$("#timeline").children].forEach((d, h) => { d.classList.toggle("on", h === hi); d.classList.toggle("shift", h >= sh.start && h < sh.end); }); }
  const RANGES = { pump: ["Flow demand", "%", 30, 100, (c) => c.flow_demand * 100, "variable-speed drives need at least 30%"], compressor: ["Leak share", "%", 0, 40, (c) => c.leak * 100, "practical floor about 3%"], hvac: ["Setpoint", "°C", 16, 30, (c) => c.setpoint_c, "verifier limit 26 °C"],
    lighting: ["After-hours on", "h", 0, 8, (c) => (c.controls ? 0 : c.after_hours_h || 0), "controls switch lights off"], standby: ["Standby load", "kW", 0, 12, (c) => (c.auto_off ? 0 : c.kw), "auto shut-down removes it"], motors: ["Load", "%", 20, 100, (c) => c.load_factor * 100, "production load, not changed"], pv: ["Array", "kWp", 0, 80, (c) => c.kwp, "capped by daytime load"] };
  function onFocus(id) {
    drawTabs(); $("#vg").hidden = !id; $("#overview").hidden = !id; const spec = Factory.getSpec();
    if (!id || !spec) { caption("Energy twin", "Click a machine tag or tab to look closer."); return; }
    const c = spec.components.find((x) => x.id === id), r = RANGES[c.type]; if (!r) return; const v = r[4](c);
    $("#vgv").textContent = v.toFixed(v < 10 ? 1 : 0) + " " + r[1]; $("#vgn").textContent = r[0] + " · " + r[5];
    const p = Math.max(0, Math.min(1, (v - r[2]) / (r[3] - r[2]))); $("#vgfill").style.height = p * 100 + "%"; $("#vgknob").style.bottom = `calc(${p * 100}% - 3px)`;
    caption(c.name || c.id, c.type === "compressor" ? "Leaks burn energy all day while the machine runs." : c.type === "pump" ? "A throttled valve wastes pump power; a drive matches speed to flow." : c.type === "hvac" ? "Each degree of setpoint changes cooling energy." : c.type === "lighting" ? "Lights on after closing are pure waste." : "Live values from the twin.");
  }
  Factory.onFocus(onFocus);
  Factory.onFrame((f) => {
    S.hour = f.hour; const hi = Math.floor(f.hour), foc = f.focus, sec = Math.floor((f.hour % 1) * 3600);
    $("#clock").textContent = `${String(hi).padStart(2, "0")}:${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
    if (S.lastHi !== hi) { S.lastHi = hi; markTimeline(hi); drawBars(f.hour); }
    const a = foc ? (f.partsA[foc] || [])[hi] || 0 : f.hourA[hi] || 0, b = foc ? (f.partsB[foc] || [])[hi] || 0 : f.hourB[hi] || 0;
    S.shown.a += (a - S.shown.a) * .15; S.shown.b += (b - S.shown.b) * .15; $("#bnA").textContent = Math.abs(S.shown.a).toFixed(0); $("#bnB").textContent = Math.abs(S.shown.b).toFixed(0);
    $("#bnLabelA").textContent = foc ? "NOW · THIS MACHINE" : "NOW"; $("#bnLabelB").textContent = foc ? "AFTER · THIS MACHINE" : "AFTER FIXES";
  });
  function refreshAll() {
    const A = S.hourA, B = S.hourB, da = A.reduce((x, y) => x + y, 0), db = B.reduce((x, y) => x + y, 0); $("#totkwh").textContent = da ? fmt(da) : "–";
    $("#dSave").textContent = db < da ? fmt(da - db) : "–"; $("#dPct").textContent = db < da ? Math.round((1 - db / da) * 100) + "%" : "–";
    drawFlags(); drawGauges(); drawCmp(); drawMini(); drawTabs(); drawBars(S.hour);
  }

  // ---------------------------------------------------------------- events from a live run
  function showResult(r) {
    const e = r.evaluation; S.result = r; S.hourA = e.hourly_before; S.hourB = e.hourly_after; S.partsA = e.parts_before; S.partsB = e.parts_after;
    $("#summary").textContent = r.summary; $("#critic").innerHTML = "<b>Critic:</b> " + (r.critic.challenges || []).slice(0, 2).map((c) => `<div>• ${String(c.concern).replace(/</g, "&lt;")} <span class="muted">(${c.severity})</span></div>`).join("");
    $("#egp").textContent = fmt(e.saved_egp_year); $("#pay").textContent = e.payback_months ?? "–"; $("#conf").textContent = r.arbiter.level; radar(r.arbiter.confidence_score);
  }
  function handle(ev) {
    WF.apply(ev);
    switch (ev.type) {
      case "run_start": cost = 0; calls = 0; rej = 0; calib.twin = []; S.result = null; $("#calchart").innerHTML = ""; $("#fixes tbody").innerHTML = ""; $("#alog").innerHTML = ""; $("#decided").textContent = ""; $("#summary").textContent = "Running…"; $("#critic").textContent = ""; radar(null); alog("Run started"); caption("Reading your facility", "Photo, description and bill received."); break;
      case "node_start": stepMark(ev.node, "act"); { const m = { scene: ["Checking the image", "Is it clearly a factory? Muse Spark vision looks first."], vision: ["Reading the equipment", "Muse Spark vision lists machines and waste signs."], segment: ["Locating equipment", "SAM 3.1 outlines each machine in the photo."], engineer: ["Building the twin", "Muse Spark writes a first-guess model as structured data."], calibrate: ["Calibrating to your bill", "Adjusting the uncertain parameters until the twin matches the bill."], hunt: ["Testing fixes in the twin", "Aggressive proposals first; code rejects what is impractical."], critic: ["Trying to refute the savings", "The Critic attacks the claim; code adds a sensitivity range."], report: ["Writing the engineer brief", "Only verified numbers are allowed in the text."] }[ev.node]; if (m) caption(...m); break; }
      case "node_done":
        stepMark(ev.node, "done");
        if (ev.node === "engineer" && ev.output && ev.output.spec) { renderBuild(ev.output.spec, "engineer draft", true); hideLoader(); const z = Array(24).fill(0); calSpec = ev.output.spec; Factory.setSpecs(ev.output.spec, ev.output.spec, {}, {}, z, z); refreshAll(); caption("Twin written", "Machines assemble from the model's structured output."); }
        calls += ev.calls || 0; cost += ev.usd || 0;
        if (ev.node === "segment" && ev.output && ev.output.boxes) overlay(ev.output.boxes);
        if (ev.node === "scene") alog(ev.output && ev.output.ok ? "Scene check: " + (ev.output.subject || "factory") : "Scene check refused the image", ev.output && ev.output.ok ? "ok" : "bad"); break;
      case "loop": hideLoader(); renderBuild(ev.spec, "calibration " + ev.iter); calib.bill = ev.bill_kwh; calib.twin.push(ev.twin_kwh); drawCal(); calSpec = ev.spec; S.hourA = ev.hourly; S.hourB = ev.hourly; S.partsA = ev.parts; S.partsB = ev.parts;
        Factory.setSpecs(ev.spec, ev.spec, ev.parts, ev.parts, ev.hourly, ev.hourly); refreshAll(); $("#calnote").textContent = `Iteration ${ev.iter}: twin ${fmt(ev.twin_kwh)} vs bill ${fmt(ev.bill_kwh)} kWh (${ev.err_pct > 0 ? "+" : ""}${ev.err_pct}%)` + (Math.abs(ev.err_pct) <= 5 ? " · calibrated" : " · adjusting…");
        caption("Calibrating to your bill", `Twin ${fmt(ev.twin_kwh)} vs bill ${fmt(ev.bill_kwh)} kWh (${ev.err_pct > 0 ? "+" : ""}${ev.err_pct}%)`); alog(`Calibration ${ev.iter}: ${ev.err_pct > 0 ? "+" : ""}${ev.err_pct}%`, Math.abs(ev.err_pct) <= 5 ? "ok" : ""); radar(Math.max(0, Math.round(100 - Math.abs(ev.err_pct) * 3))); break;
      case "note": alog(ev.text); break;
      case "fix_round": renderBuild(ev.spec_after, "after fixes · round " + ev.round); fixRows(ev.round, ev.results); S.hourA = ev.hourly_before; S.hourB = ev.hourly_after; S.partsA = ev.parts_before; S.partsB = ev.parts_after; if (calSpec) Factory.setSpecs(calSpec, ev.spec_after, ev.parts_before, ev.parts_after, ev.hourly_before, ev.hourly_after); refreshAll(); break;
      case "gate": showResult(ev.result); Factory.setSpecs(calSpec, ev.result.spec_after, S.partsA, S.partsB, S.hourA, S.hourB); refreshAll(); caption("Verified in the twin", "Simulated estimates. An engineer must review before any action."); alog(`Plan verified: ${fmt(ev.result.evaluation.saved_egp_year)} EGP/yr (simulated)`, "ok"); if (autoCompare) { autoCompare = false; setMode("compare"); } break;
      case "decision": $("#decided").textContent = "Engineer decision recorded: " + ev.action; alog("Engineer: " + ev.action, ev.action === "approve" ? "ok" : ""); break;
      case "rejected": hideLoader(); caption("Image refused", ev.reason); imgStatus("bad", "Not processed: " + ev.reason); alog("Image refused: " + ev.reason, "bad"); $("#summary").textContent = "No analysis: the image is not a factory."; break;
      case "cancelled": hideLoader(); caption("Run cancelled", "No further model calls will be made."); alog("Run cancelled by you", "bad"); $("#summary").textContent = "Cancelled."; break;
      case "error": hideLoader(); alog("Stopped: " + ev.message, "bad"); caption("Run stopped", ev.message); break;
      case "done": hideLoader(); setRunning(false); clearInterval(timer); break;
    }
    $("#stat").textContent = `${calls} model calls · $${cost.toFixed(4)}`;
  }
  function fixRows(round, results) {
    const tb = $("#fixes tbody"); if (round === 1) tb.innerHTML = "<tr><th>Fix</th><th>Target</th><th>Verdict</th></tr>";
    results.forEach((r) => { const tr = document.createElement("tr"); tr.className = r.status === "accepted" ? "ok" : "no"; tr.innerHTML = `<td>${r.fix.type.replace(/_/g, " ")}</td><td>${r.fix.target || (r.fix.kwp ? r.fix.kwp + " kWp" : "")}</td><td>${r.status === "accepted" ? "✓ " + fmt(r.saved_egp_year) + " EGP/yr" : "✗ " + r.reason}</td>`; tb.append(tr);
      if (r.status !== "accepted") { rej++; alog("Rejected: " + r.fix.type.replace(/_/g, " ") + ": " + r.reason, "bad"); if (window.gsap && !reduce) gsap.from(tr, { backgroundColor: "#ff4d3d", duration: .9 }); } });
    $("#fixnote").textContent = `Round ${round}: rejected fixes go back to the hunter with the reason.`;
  }
  function overlay(boxes) { const o = $("#overlay"); o.innerHTML = ""; boxes.forEach((b) => { const [x1, y1, x2, y2] = b.box; el("rect", { x: x1, y: y1, width: x2 - x1, height: y2 - y1, fill: "rgba(255,106,0,.12)", stroke: "#ff6a00", "stroke-width": 3, "vector-effect": "non-scaling-stroke" }, o); el("text", { x: x1 + 6, y: y1 + 28, fill: "#ff9a4d", "font-size": 26, "font-weight": 700 }, o).textContent = b.phrase; }); }
  async function poll() { const r = await (await fetch(`/api/run/${runId}?since=${since}`)).json(); since = r.next; r.events.forEach((ev) => { try { handle(ev); } catch (e) { console.error("event handler failed", ev.type, e); } }); }

  // ---------------------------------------------------------------- instant demo (pre-computed, no AI)
  async function demo() {
    clearInterval(timer); hideLoader(); const d = await (await fetch("/api/demo/instant")).json();
    source = { type: "gallery", id: "demo" }; imgOk = true; setPhoto("/api/demo/image"); $("#desc").value = d.description; $("#bill").value = d.bill_kwh; $("#overlay").innerHTML = "";
    renderBuild(d.spec, "pre-computed", true); renderBuild(d.result.spec_after, "after fixes · demo"); calSpec = d.spec; calib.twin = d.calibration; calib.bill = d.bill_kwh; drawCal(); $("#calnote").textContent = "Pre-computed demo: the twin already matches the bill."; $("#fixes tbody").innerHTML = ""; rej = 0;
    d.rounds.forEach((r, i) => fixRows(i + 1, r)); $("#alog").innerHTML = ""; alog("DEMO: pre-computed model, no AI call", "ok"); alog("Round 1 rejected 2 over-aggressive fixes", "bad"); alog("Round 2 verified the corrected plan", "ok");
    showResult(d.result); S.hourA = d.result.evaluation.hourly_before; S.hourB = d.result.evaluation.hourly_after; S.partsA = d.result.evaluation.parts_before; S.partsB = d.result.evaluation.parts_after;
    Factory.setSpecs(d.spec, d.result.spec_after, S.partsA, S.partsB, S.hourA, S.hourB); Factory.focus(null); setMode("compare"); refreshAll(); $("#stat").textContent = "DEMO · 0 model calls · $0.0000";
    caption("Demo twin loaded", "Pre-computed, no AI call. Click any machine tag or tab to look closer; press Build the twin for a live run."); imgStatus("ok", "Demo twin loaded instantly (pre-computed).");
  }

  // ---------------------------------------------------------------- image source: gallery / upload
  function imgStatus(kind, text) { const s = $("#imgstatus"); s.hidden = !text; s.className = "imgstatus " + (kind || ""); s.textContent = text || ""; }
  function setPhoto(src) { $("#photo").src = src; $("#overlay").innerHTML = ""; }
  async function pickGallery(item) {
    source = { type: "gallery", id: item.id }; upload = null; imgOk = true; setPhoto(item.file); imgStatus("ok", "Gallery image: " + item.title); $("#bill").value = item.bill_kwh; $("#gal").hidden = true;
    $("#desc").value = item.id === "demo" ? (await (await fetch("/api/demo/case")).json()).description : ""; caption("Image selected", item.title + ". Press Build the twin; the models read it live.");
  }
  function resizeToB64(file) {
    return new Promise((res, rej2) => { const url = URL.createObjectURL(file), im = new Image(); im.onload = () => { const k = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", .9)); }; im.onerror = () => rej2(new Error("not an image")); im.src = url; });
  }
  async function onFile(file) {
    if (!file) return; if (file.size > 12 * 1024 * 1024) { imgStatus("bad", "That file is larger than 12 MB."); return; }
    let b64; try { b64 = await resizeToB64(file); } catch (e) { imgStatus("bad", "That file is not a readable image (use JPG, PNG or WebP)."); return; }
    source = { type: "upload" }; upload = b64; imgOk = false; setPhoto(b64); $("#desc").value = ""; $("#bill").value = ""; imgStatus("", "Checking with Muse Spark vision: is this a factory?"); $("#run").disabled = true;
    try {
      const r = await (await fetch("/api/check_image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_b64: b64 }) })).json();
      if (r.ok) { imgOk = true; imgStatus("ok", "Factory detected: " + r.subject + ". Add your monthly bill (kWh), then build."); caption("Image accepted", r.subject); }
      else { imgOk = false; imgStatus("bad", "Not processed. " + (r.reason || "This does not look like a factory.") + " Upload a clear photo of a factory floor, plant room or workshop."); caption("Image refused", "Only clear factory photos are processed."); }
    } catch (e) { imgStatus("bad", "Could not check the image. Try again."); }
    $("#run").disabled = false;
  }
  async function openGallery() {
    $("#gal").hidden = false; if (!gallery.length) gallery = await (await fetch("/api/gallery")).json();
    $("#galGrid").innerHTML = gallery.map((g) => `<button class="gi" data-id="${g.id}" type="button"><img loading="lazy" src="${g.file}" alt=""><span>${g.title}</span><small>illustrative bill ${fmt(g.bill_kwh)} kWh/month</small></button>`).join("");
    $("#galGrid").querySelectorAll(".gi").forEach((b) => b.addEventListener("click", () => pickGallery(gallery.find((g) => g.id === b.dataset.id))));
  }
  // fresh build: clear the plant, show the loader, and let the machines assemble when the first twin arrives
  function showLoader() {
    const L = $("#loader"); L.hidden = false; L.classList.remove("out"); L.querySelectorAll("li").forEach((li) => li.className = ""); $("#photo").parentElement.classList.add("scanning");
  }
  function hideLoader() { const L = $("#loader"); if (L.hidden) return; L.classList.add("out"); $("#photo").parentElement.classList.remove("scanning"); setTimeout(() => { if (L.classList.contains("out")) L.hidden = true; }, 520); }
  function stepMark(node, cls) { const li = document.querySelector(`#lsteps li[data-n="${node}"]`); if (li) li.className = cls; }
  function resetForBuild() {
    const empty = { name: "", shift: { start: 6, end: 22, days_per_week: 6 }, components: [] }, z = Array(24).fill(0);
    S.hourA = S.hourB = z; S.partsA = S.partsB = {}; S.result = null; calSpec = null; calib.twin = []; Factory.focus(null); Factory.expectAssemble(); Factory.setSpecs(empty, empty, {}, {}, z, z);
    renderBuild(null, "starting…", true); $("#build").innerHTML = '<div class="muted small">Waiting for the models to write the twin…</div>'; $("#calchart").innerHTML = ""; $("#cmp tbody").innerHTML = ""; $("#fixes tbody").innerHTML = "";
    ["egp", "pay", "conf"].forEach((i) => { $("#" + i).textContent = "–"; }); $("#totkwh").textContent = "–"; $("#dSave").textContent = "–"; $("#dPct").textContent = "–"; $("#overlay").innerHTML = "";
    refreshAll(); showLoader();
  }
  function setRunning(on) {
    running = on; const b = $("#run"); b.disabled = false; b.textContent = on ? "Cancel run" : "Build the twin"; b.classList.toggle("danger", on);
    const w = $("#wfRun"); if (w) { w.textContent = on ? "Stop workflow" : "Run workflow"; w.disabled = false; w.classList.toggle("danger", on); }
  }
  async function cancel() {
    if (!runId || !running) return; clearInterval(timer); setRunning(false);
    try { const r = await fetch(`/api/run/${runId}/cancel`, { method: "POST" }); await r.json(); await poll(); } catch (e) { /* the server drops later events anyway */ }
    WF.apply({ type: "cancelled" }); handle({ type: "cancelled" });
  }
  async function start() {
    if (running) { cancel(); return; }
    const bill = +$("#bill").value; if (!(bill > 0)) { imgStatus("bad", "Enter the monthly electricity bill in kWh."); return; }
    if (source.type === "upload" && !imgOk) { imgStatus("bad", "This image was not accepted. Choose a factory photo."); return; }
    setRunning(true); since = 0; autoCompare = true; setMode("now"); resetForBuild();
    const body = source.type === "gallery" ? { gallery_id: source.id, description: $("#desc").value, bill_kwh: bill } : { image_b64: upload, description: $("#desc").value, bill_kwh: bill };
    const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { setRunning(false); let m = "Could not start."; try { m = (await r.json()).detail || m; } catch (e) { /* ignore */ } imgStatus("bad", m); return; }
    runId = (await r.json()).run_id; clearInterval(timer); timer = setInterval(poll, 500); poll();
  }
  function setMode(m) { Factory.setMode(m); document.querySelectorAll("#scenes button").forEach((b) => b.classList.toggle("on", b.dataset.m === m)); refreshAll(); }

  function applyTheme(t) { document.documentElement.dataset.theme = t; Factory.setTheme(t === "light"); try { localStorage.setItem("wl-theme", t); } catch (e) { /* private mode: no persistence */ } }
  const toggleTheme = () => applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  async function init() {
    Factory.init($("#iso"), $("#callouts"), $("#leaders"));
    let t0 = "dark"; try { t0 = localStorage.getItem("wl-theme") || "dark"; } catch (e) { /* ignore */ } applyTheme(t0);
    $("#themeBtn").addEventListener("click", toggleTheme); $("#wfTheme").addEventListener("click", toggleTheme); buildTimeline(); radar(null);
    document.querySelectorAll("#scenes button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.m)));
    $("#run").addEventListener("click", start); $("#wfOpen").addEventListener("click", () => WF.open()); $("#demoBtn").addEventListener("click", demo); $("#overview").addEventListener("click", () => Factory.focus(null));
    $("#pick").addEventListener("click", (e) => { e.stopPropagation(); $("#pickMenu").hidden = !$("#pickMenu").hidden; });
    document.addEventListener("click", () => { $("#pickMenu").hidden = true; });
    $("#pickMenu").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { $("#pickMenu").hidden = true; if (b.dataset.p === "gallery") openGallery(); else $("#file").click(); }));
    $("#file").addEventListener("change", (e) => { onFile(e.target.files[0]); e.target.value = ""; });
    $("#galClose").addEventListener("click", () => { $("#gal").hidden = true; }); $("#gal").addEventListener("click", (e) => { if (e.target.id === "gal") $("#gal").hidden = true; });
    document.querySelectorAll(".btns button").forEach((b) => b.addEventListener("click", async () => { if (!runId && !S.result) return; if (runId) await fetch(`/api/run/${runId}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: b.dataset.a }) }); $("#decided").textContent = "Engineer decision recorded: " + b.dataset.a; alog("Engineer: " + b.dataset.a, b.dataset.a === "approve" ? "ok" : ""); }));
    WF.init();
    const [c, pv] = await Promise.all([fetch("/api/demo/case").then((r) => r.json()), fetch("/api/demo/preview").then((r) => r.json())]);
    $("#desc").value = c.description; $("#bill").value = c.bill_kwh; imgStatus("ok", "Gallery image: Food plant (Delta Foods)");
    const p = $("#live"); p.textContent = c.meta_live ? "Meta API live" : "demo mode (no Meta key)"; if (c.meta_live) p.classList.add("on");
    S.hourA = S.hourB = pv.hourly; S.partsA = S.partsB = pv.parts; Factory.setSpecs(pv.spec, pv.spec, pv.parts, pv.parts, pv.hourly, pv.hourly); refreshAll(); Factory.start();
    caption("Energy twin", "Press Demo for an instant pre-computed twin, or Build the twin for a live run.");
  }
  init();
  return { runId: () => runId, start, cancel, isRunning: () => running };
})();
