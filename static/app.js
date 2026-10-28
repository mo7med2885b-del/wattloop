"use strict";
const $ = (s) => document.querySelector(s);
const NS = "http://www.w3.org/2000/svg";
const el = (n, a = {}, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TITLES = { pump: "PUMPS", compressor: "AIR", motors: "BELTS", hvac: "COOL", lighting: "LIGHT", standby: "IDLE", pv: "SOLAR" };

const App = (() => {
  let runId = null, since = 0, timer = null, cost = 0, calls = 0, rej = 0, calSpec = null, autoCompare = true;
  let source = { type: "gallery", id: "demo" }, upload = null, imgOk = true, gallery = [];
  const calib = { twin: [], bill: 0 };
  const S = { hourA: [], hourB: [], partsA: {}, partsB: {}, hour: 6, shown: { a: 0, b: 0 }, lastHi: -1, result: null };
  const caption = (t, s) => { $("#capT").textContent = t; $("#capS").textContent = s; if (window.gsap && !reduce) gsap.fromTo("#caption", { opacity: .2, x: -12 }, { opacity: 1, x: 0, duration: .4 }); };
  const alog = (text, cls = "") => { const l = $("#alog"); if (l.firstChild && l.firstChild.textContent === "No events yet.") l.innerHTML = ""; const d = document.createElement("div"); d.className = "a " + cls; d.textContent = text; l.append(d); l.scrollTop = l.scrollHeight; };

  // ---------------------------------------------------------------- charts and widgets
  function drawCal() {
    const svg = $("#calchart"); svg.innerHTML = ""; const w = 280, h = 110, pl = 34, pb = 16, pt = 6, pr = 6; if (!calib.twin.length) return;
    const max = Math.max(calib.bill, ...calib.twin) * 1.12, n = Math.max(2, calib.twin.length), X = (i) => pl + (i / (n - 1)) * (w - pl - pr), Y = (v) => pt + (1 - v / max) * (h - pt - pb);
    el("line", { x1: pl, x2: w - pr, y1: Y(calib.bill), y2: Y(calib.bill), stroke: "#ffc857", "stroke-dasharray": "4 4" }, svg);
    el("text", { x: w - pr, y: Y(calib.bill) - 3, fill: "#ffc857", "font-size": 9, "text-anchor": "end" }, svg).textContent = "bill " + fmt(calib.bill) + " kWh";
    el("polyline", { points: calib.twin.map((v, i) => `${X(i)},${Y(v)}`).join(" "), fill: "none", stroke: "#ff6a00", "stroke-width": 2 }, svg);
    calib.twin.forEach((v, i) => { el("circle", { cx: X(i), cy: Y(v), r: 3.5, fill: "#ff6a00" }, svg); el("text", { x: X(i), y: h - 3, fill: "#8a9096", "font-size": 9, "text-anchor": "middle" }, svg).textContent = "#" + (i + 1); });
    el("text", { x: 2, y: 12, fill: "#8a9096", "font-size": 9 }, svg).textContent = fmt(max);
  }
  function radar(score) {
    const s = $("#radar"); if (!s.childNodes.length) {
      const d = el("defs", {}, s), g = el("radialGradient", { id: "rg", cx: "0%", cy: "0%", r: "100%" }, d); el("stop", { offset: "0", "stop-color": "#ff6a00", "stop-opacity": ".85" }, g); el("stop", { offset: "1", "stop-color": "#ff6a00", "stop-opacity": "0" }, g);
      [52, 38, 24].forEach((r) => el("circle", { cx: 60, cy: 60, r, fill: "none", stroke: "#3a3e44" }, s)); el("line", { x1: 8, y1: 60, x2: 112, y2: 60, stroke: "#3a3e44" }, s); el("line", { x1: 60, y1: 8, x2: 60, y2: 112, stroke: "#3a3e44" }, s);
      const sw = el("g", { class: "sweep" }, s); el("path", { d: "M60,60 L60,8 A52,52 0 0 1 100,26 Z", fill: "url(#rg)" }, sw);
      el("text", { id: "rscore", x: 60, y: 69, "text-anchor": "middle", fill: "#fff", "font-size": 26, "font-weight": 700 }, s).textContent = "–";
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
    const box = $("#gauges"); if (!box.children.length) defs.forEach(() => { const d = document.createElement("div"); d.innerHTML = '<svg viewBox="0 0 80 62"><path d="M10,52 A30,30 0 1 1 70,52" fill="none" stroke="#2b2e33" stroke-width="7" stroke-linecap="round"></path><path class="gv" d="M10,52 A30,30 0 1 1 70,52" fill="none" stroke="#ff6a00" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" style="transition:stroke-dashoffset .9s,stroke .4s"></path><text x="40" y="44" text-anchor="middle" fill="#fff" font-size="15" font-weight="700" class="gt">0</text></svg><div class="gl"></div>'; box.append(d); });
    [...box.children].forEach((d, i) => { const [label, v, max] = defs[i], p = d.querySelector(".gv"), fixed = v < max * .08; p.style.strokeDashoffset = 100 - Math.min(100, v / max * 100); p.setAttribute("stroke", fixed ? "#35e08a" : "#ff6a00"); d.querySelector(".gt").textContent = v.toFixed(v < 10 ? 1 : 0); d.querySelector(".gl").textContent = label; });
  }
  function drawBars(hour) {
    const svg = $("#bars"), A = S.hourA, B = S.hourB; if (!A.length) { svg.innerHTML = ""; return; }
    const max = Math.max(...A, ...B, 1) * 1.1, w = 300, h = 100, bw = w / 24; svg.innerHTML = "";
    for (let i = 0; i < 24; i++) { const ha = A[i] / max * (h - 6), hb = (B[i] || 0) / max * (h - 6); el("rect", { x: i * bw + 1, y: h - ha, width: bw - 2, height: ha, fill: "#ff6a00", opacity: .85 }, svg); if (B !== A) el("rect", { x: i * bw + 3, y: h - hb, width: bw - 6, height: hb, fill: "#35e08a", opacity: .95 }, svg); }
    el("rect", { x: Math.floor(hour) * bw, y: 0, width: bw, height: h, fill: "none", stroke: "#fff", "stroke-width": 1 }, svg);
  }
  function drawCmp() {
    const spec = Factory.getSpec(); if (!spec) return; const wd = spec.shift.days_per_week * 4.33, sum = (p) => (p || []).reduce((a, b) => a + b, 0) * wd;
    const rows = spec.components.map((c) => ({ n: c.name || c.id, a: sum((S.partsA || {})[c.id]), b: sum((S.partsB || {})[c.id]) })), max = Math.max(1, ...rows.map((r) => Math.max(r.a, Math.abs(r.b))));
    $("#cmp tbody").innerHTML = rows.slice(0, 7).map((r) => `<tr><td>${String(r.n).slice(0, 18)}</td><td style="width:30%"><span class="bar o" style="width:${Math.max(2, r.a / max * 100)}%"></span></td><td>${fmt(r.a)}</td><td style="width:20%"><span class="bar" style="width:${Math.max(2, Math.abs(r.b) / max * 100)}%"></span></td><td>${fmt(r.b)}</td></tr>`).join("");
  }
  function drawMini() {
    const svg = $("#minimap"); svg.innerHTML = ""; const spec = Factory.getSpec(); if (!spec) return;
    const X = (x) => 8 + (x + 17) / 34 * 144, Z = (z) => 6 + (z + 11.5) / 23 * 76; el("rect", { x: 6, y: 5, width: 148, height: 80, fill: "#0b0c0e", stroke: "#3a3e44" }, svg);
    const plan = { pump: [-8, 6, 13, 4], compressor: [7, 5.4, 9.6, 4.4], motors: [-1.6, -3.6, 18, 3.4], hvac: [10, -9, 4.6, 2.6], standby: [-13.5, -3.6, 3.4, 2.8] }, sc = Factory.scene(), after = sc && sc.after;
    spec.components.forEach((c) => { const p = plan[c.type]; if (!p) return; const ok = after && ({ pump: c.vsd, compressor: c.leak < .07, standby: c.auto_off, hvac: c.setpoint_c >= 24 }[c.type]), col = ok ? "#35e08a" : "#ff6a00";
      el("rect", { x: X(p[0] - p[2] / 2), y: Z(p[1] - p[3] / 2), width: p[2] / 34 * 144, height: p[3] / 23 * 76, fill: col, opacity: .2, stroke: col }, svg); });
    if (spec.components.some((c) => c.type === "pv")) el("text", { x: 80, y: 46, fill: "#35e08a", "font-size": 10, "text-anchor": "middle" }, svg).textContent = "☀ PV roof";
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
      case "node_start": { const m = { scene: ["Checking the image", "Is it clearly a factory? Muse Spark vision looks first."], vision: ["Reading the equipment", "Muse Spark vision lists machines and waste signs."], segment: ["Locating equipment", "SAM 3.1 outlines each machine in the photo."], engineer: ["Building the twin", "Muse Spark writes a first-guess model as structured data."], calibrate: ["Calibrating to your bill", "Adjusting the uncertain parameters until the twin matches the bill."], hunt: ["Testing fixes in the twin", "Aggressive proposals first; code rejects what is impractical."], critic: ["Trying to refute the savings", "The Critic attacks the claim; code adds a sensitivity range."], report: ["Writing the engineer brief", "Only verified numbers are allowed in the text."] }[ev.node]; if (m) caption(...m); break; }
      case "node_done":
        calls += ev.calls || 0; cost += ev.usd || 0;
        if (ev.node === "segment" && ev.output && ev.output.boxes) overlay(ev.output.boxes);
        if (ev.node === "scene") alog(ev.output && ev.output.ok ? "Scene check: " + (ev.output.subject || "factory") : "Scene check refused the image", ev.output && ev.output.ok ? "ok" : "bad"); break;
      case "loop": calib.bill = ev.bill_kwh; calib.twin.push(ev.twin_kwh); drawCal(); calSpec = ev.spec; S.hourA = ev.hourly; S.hourB = ev.hourly; S.partsA = ev.parts; S.partsB = ev.parts;
        Factory.setSpecs(ev.spec, ev.spec, ev.parts, ev.parts, ev.hourly, ev.hourly); refreshAll(); $("#calnote").textContent = `Iteration ${ev.iter}: twin ${fmt(ev.twin_kwh)} vs bill ${fmt(ev.bill_kwh)} kWh (${ev.err_pct > 0 ? "+" : ""}${ev.err_pct}%)` + (Math.abs(ev.err_pct) <= 5 ? " · calibrated" : " · adjusting…");
        caption("Calibrating to your bill", `Twin ${fmt(ev.twin_kwh)} vs bill ${fmt(ev.bill_kwh)} kWh (${ev.err_pct > 0 ? "+" : ""}${ev.err_pct}%)`); alog(`Calibration ${ev.iter}: ${ev.err_pct > 0 ? "+" : ""}${ev.err_pct}%`, Math.abs(ev.err_pct) <= 5 ? "ok" : ""); radar(Math.max(0, Math.round(100 - Math.abs(ev.err_pct) * 3))); break;
      case "note": alog(ev.text); break;
      case "fix_round": fixRows(ev.round, ev.results); S.hourA = ev.hourly_before; S.hourB = ev.hourly_after; S.partsA = ev.parts_before; S.partsB = ev.parts_after; if (calSpec) Factory.setSpecs(calSpec, ev.spec_after, ev.parts_before, ev.parts_after, ev.hourly_before, ev.hourly_after); refreshAll(); break;
      case "gate": showResult(ev.result); Factory.setSpecs(calSpec, ev.result.spec_after, S.partsA, S.partsB, S.hourA, S.hourB); refreshAll(); caption("Verified in the twin", "Simulated estimates. An engineer must review before any action."); alog(`Plan verified: ${fmt(ev.result.evaluation.saved_egp_year)} EGP/yr (simulated)`, "ok"); if (autoCompare) { autoCompare = false; setMode("compare"); } break;
      case "decision": $("#decided").textContent = "Engineer decision recorded: " + ev.action; alog("Engineer: " + ev.action, ev.action === "approve" ? "ok" : ""); break;
      case "rejected": caption("Image refused", ev.reason); imgStatus("bad", "Not processed: " + ev.reason); alog("Image refused: " + ev.reason, "bad"); $("#summary").textContent = "No analysis: the image is not a factory."; break;
      case "done": $("#run").disabled = false; clearInterval(timer); break;
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
  async function poll() { const r = await (await fetch(`/api/run/${runId}?since=${since}`)).json(); r.events.forEach(handle); since = r.next; }

  // ---------------------------------------------------------------- instant demo (pre-computed, no AI)
  async function demo() {
    clearInterval(timer); const d = await (await fetch("/api/demo/instant")).json();
    source = { type: "gallery", id: "demo" }; imgOk = true; setPhoto("/api/demo/image"); $("#desc").value = d.description; $("#bill").value = d.bill_kwh; $("#overlay").innerHTML = "";
    calSpec = d.spec; calib.twin = d.calibration; calib.bill = d.bill_kwh; drawCal(); $("#calnote").textContent = "Pre-computed demo: the twin already matches the bill."; $("#fixes tbody").innerHTML = ""; rej = 0;
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
  async function start() {
    const bill = +$("#bill").value; if (!(bill > 0)) { imgStatus("bad", "Enter the monthly electricity bill in kWh."); return; }
    if (source.type === "upload" && !imgOk) { imgStatus("bad", "This image was not accepted. Choose a factory photo."); return; }
    $("#run").disabled = true; since = 0; autoCompare = true; setMode("now"); Factory.focus(null);
    const body = source.type === "gallery" ? { gallery_id: source.id, description: $("#desc").value, bill_kwh: bill } : { image_b64: upload, description: $("#desc").value, bill_kwh: bill };
    const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { $("#run").disabled = false; let m = "Could not start."; try { m = (await r.json()).detail || m; } catch (e) { /* ignore */ } imgStatus("bad", m); return; }
    runId = (await r.json()).run_id; clearInterval(timer); timer = setInterval(poll, 500); poll();
  }
  function setMode(m) { Factory.setMode(m); document.querySelectorAll("#scenes button").forEach((b) => b.classList.toggle("on", b.dataset.m === m)); refreshAll(); }

  async function init() {
    Factory.init($("#iso"), $("#callouts"), $("#leaders")); buildTimeline(); radar(null);
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
  return { runId: () => runId, start };
})();
