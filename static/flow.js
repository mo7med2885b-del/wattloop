"use strict";
/* Agent workflow view: orb + glass agent cards + animated lines. Animates ONLY real run events (fed by app.js).
   Nothing loops except one slow idle ring on the orb and the quiet icon idles. Draggable nodes, wheel zoom, pan, reset. */
const WF = (() => {
  const NS = "http://www.w3.org/2000/svg", ASSET = "/static/assets/";
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasG = typeof gsap !== "undefined";
  const CW = 196, CH = 66;
  // id, name, icon, kind (agent = Muse model, code = no model, human = engineer), sub
  const DEF = [
    ["intake", "Intake", "cog", "code", "Photo · text · bill"],
    ["scene", "Scene Check", "vision", "agent", "Is it a factory?"],
    ["vision", "Vision Reader", "vision", "agent", ""],
    ["segment", "Segmenter", "segment", "agent", "SAM 3.1"],
    ["engineer", "Twin Engineer", "engineer", "agent", ""],
    ["design", "Scene Designer", "segment", "agent", "3D layout and props"],
    ["calibrate", "Calibrator loop", "calibrate", "agent", ""],
    ["hunt", "Waste Hunter", "hunt", "agent", ""],
    ["verify", "Fix Verifier", "verify", "code", "Simulator · no model"],
    ["critic", "Critic", "critic", "agent", ""],
    ["report", "Report Writer", "report", "agent", ""],
    ["gate", "Engineer review", "gate", "human", "Final decision"],
  ];
  const POS = { core: [500, 95], intake: [150, 95], scene: [500, 215], vision: [320, 325], segment: [680, 325], engineer: [500, 425], design: [500, 510], calibrate: [500, 595], hunt: [320, 700], verify: [680, 700], critic: [500, 795], report: [320, 885], gate: [680, 885] };
  const DEFAULT_POS = JSON.parse(JSON.stringify(POS));
  // line id -> [from, to]; "final" is the special return line from the orb to the review gate
  const EDGES = { intake: ["intake", "core"], core_scene: ["core", "scene"], scene_vision: ["scene", "vision"], scene_segment: ["scene", "segment"], vision_segment: ["vision", "segment"],
    vision_engineer: ["vision", "engineer"], segment_engineer: ["segment", "engineer"], engineer_design: ["engineer", "design"], design_calibrate: ["design", "calibrate"], calibrate_hunt: ["calibrate", "hunt"],
    hunt_verify: ["hunt", "verify"], verify_hunt: ["verify", "hunt"], hunt_critic: ["hunt", "critic"], verify_critic: ["verify", "critic"], critic_report: ["critic", "report"], report_gate: ["report", "gate"] };
  const INLINES = { scene: ["core_scene"], vision: ["scene_vision"], segment: ["scene_segment", "vision_segment"], engineer: ["vision_engineer", "segment_engineer"], design: ["engineer_design"], calibrate: ["design_calibrate"], hunt: ["calibrate_hunt"], verify: ["hunt_verify"], critic: ["hunt_critic", "verify_critic"], report: ["critic_report"], gate: ["report_gate"] };
  const view = { k: 1, x: 0, y: 0 };
  let svg, layer, nodes = {}, lines = {}, icons = {}, results = {}, breathe = null, t0 = 0, done = 0, calls = 0, cost = 0, rej = 0, modelLabel = "Muse Spark 1.3";
  const $$ = (id) => document.getElementById(id);
  const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) { const v = attrs[k]; if (typeof v === "string" && v.startsWith("var(")) e.style.setProperty(k, v); else e.setAttribute(k, v); } if (parent) parent.append(e); return e; };
  const pretty = (m) => (m || "").replace(/^muse-spark-/, "Muse Spark ").replace(/^muse-/, "Muse ").replace(/^sam-/, "SAM ") || "Muse Spark 1.3";
  const nameOf = (id) => (DEF.find((d) => d[0] === id) || [])[1] || (id === "core" ? "Orchestrator" : id);

  function card(id, name, ico, kind, sub) {
    const [x, y] = POS[id];
    const g = el("g", { class: `wf-node ${kind}`, "data-id": id, transform: `translate(${x} ${y})`, tabindex: 0 }, layer);
    el("rect", { class: "wf-card", x: -CW / 2, y: -CH / 2, width: CW, height: CH, rx: 18 }, g);
    el("rect", { class: "wf-edge", x: -CW / 2, y: -CH / 2, width: CW, height: CH, rx: 18, pathLength: 500, filter: "url(#wfGlow)" }, g);
    el("rect", { class: "wf-edge wf-edge2", x: -CW / 2, y: -CH / 2, width: CW, height: CH, rx: 18, pathLength: 500, filter: "url(#wfGlow)" }, g);
    const ig = el("g", { transform: `translate(${-CW / 2 + 30} 0)` }, g);
    el("circle", { class: "wf-ibg", r: 19 }, ig);
    icons[id] = WFIcons.make(ico, ig);
    const tx = -CW / 2 + 58;
    el("text", { class: "wf-name", x: tx, y: -7 }, g).textContent = name;
    if (kind === "agent" && !sub) { el("image", { href: ASSET + "meta-symbol-color.png", x: tx, y: 0, width: 14, height: 14 }, g); el("text", { class: "wf-sub wf-mname", x: tx + 18, y: 11 }, g).textContent = modelLabel; }
    else if (kind === "agent") { el("image", { href: ASSET + "meta-symbol-color.png", x: tx, y: 0, width: 14, height: 14 }, g); el("text", { class: "wf-sub", x: tx + 18, y: 11 }, g).textContent = sub; }
    else el("text", { class: "wf-sub", x: tx, y: 8 }, g).textContent = sub;
    el("text", { class: "wf-stance", x: tx, y: 25 }, g);
    nodes[id] = g;
  }
  function lineD(id) {
    if (id === "final") { const [cx, cy] = POS.core, [gx, gy] = POS.gate, x0 = cx + 44, x1 = gx + CW / 2, far = Math.max(x0, x1) + 260; return `M${x0},${cy} C${far},${cy} ${far},${gy} ${x1},${gy}`; }
    const [a, b] = EDGES[id], A = POS[a], B = POS[b], ha = a === "core" ? 40 : CH / 2;
    if (Math.abs(A[1] - B[1]) < 30) { const s = A[0] < B[0] ? 1 : -1, off = id === "verify_hunt" ? 14 : id === "hunt_verify" ? -14 : 0, aw = a === "core" || a === "intake" ? (a === "core" ? 44 : CW / 2) : CW / 2, bw = b === "core" ? 44 : CW / 2; return `M${A[0] + s * aw},${A[1] + off} L${B[0] - s * bw},${B[1] + off}`; }
    const down = A[1] < B[1], y0 = A[1] + (down ? ha : -ha), y1 = B[1] + (down ? -(b === "core" ? 40 : CH / 2) : (b === "core" ? 40 : CH / 2)), m = (y0 + y1) / 2;
    return `M${A[0]},${y0} C${A[0]},${m} ${B[0]},${m} ${B[0]},${y1}`;
  }
  function refreshLines(first) {
    for (const [id, p] of Object.entries(lines)) {
      p.setAttribute("d", lineD(id)); const len = p.getTotalLength(); p.dataset.len = len; p.style.strokeDasharray = len;
      if (first) p.style.strokeDashoffset = reduce || !hasG ? 0 : len; else if (p.dataset.drawn === "1" || reduce || !hasG) p.style.strokeDashoffset = 0;
    }
  }
  function build() {
    svg = $$("wfSvg"); svg.replaceChildren(); nodes = {}; lines = {}; icons = {}; results = {};
    const defs = el("defs", {}, svg); layer = el("g", { id: "wfWorld" }, svg); applyView();
    const f = el("filter", { id: "wfGlow", x: "-80%", y: "-80%", width: "260%", height: "260%" }, defs);
    el("feGaussianBlur", { stdDeviation: "3.2", result: "b" }, f); const m = el("feMerge", {}, f); el("feMergeNode", { in: "b" }, m); el("feMergeNode", { in: "SourceGraphic" }, m);
    const lg = el("linearGradient", { id: "wfLineGrad", gradientUnits: "userSpaceOnUse", x1: 0, y1: 0, x2: 0, y2: 940 }, defs);
    el("stop", { offset: "0", "stop-color": "var(--or)" }, lg); el("stop", { offset: "0.55", "stop-color": "var(--or2)" }, lg); el("stop", { offset: "1", "stop-color": "var(--warn)" }, lg);
    const cg = el("linearGradient", { id: "wfCardGrad", x1: 0, y1: 0, x2: 1, y2: 1 }, defs); el("stop", { offset: "0", "stop-color": "var(--card1)", "stop-opacity": ".95" }, cg); el("stop", { offset: "1", "stop-color": "var(--card2)", "stop-opacity": ".97" }, cg);
    const hc = el("linearGradient", { id: "wfCardHuman", x1: 0, y1: 0, x2: 1, y2: 1 }, defs); el("stop", { offset: "0", "stop-color": "var(--hcard1)", "stop-opacity": ".95" }, hc); el("stop", { offset: "1", "stop-color": "var(--hcard2)", "stop-opacity": ".97" }, hc);
    const og = el("radialGradient", { id: "wfOrb", cx: "38%", cy: "32%", r: "75%" }, defs); el("stop", { offset: "0", "stop-color": "#c9dcff" }, og); el("stop", { offset: "0.45", "stop-color": "#4d7dff" }, og); el("stop", { offset: "1", "stop-color": "#0b1d6e" }, og);
    const hg = el("radialGradient", { id: "wfHalo" }, defs); el("stop", { offset: "0.5", "stop-color": "#4d9bff", "stop-opacity": ".55" }, hg); el("stop", { offset: "1", "stop-color": "#4d9bff", "stop-opacity": "0" }, hg);
    Object.keys(EDGES).forEach((id) => { lines[id] = el("path", { class: "wf-line" + (id === "intake" ? "" : id === "verify_hunt" ? " faint" : ""), d: "" }, layer); });
    lines.final = el("path", { class: "wf-line faint", d: "" }, layer); lines.report_gate.classList.add("human"); refreshLines(true);
    const [cx, cy] = POS.core;
    const core = el("g", { class: "wf-node wf-core", "data-id": "core", transform: `translate(${cx} ${cy})`, tabindex: 0 }, layer); const disc = el("g", { class: "wf-disc" }, core);
    el("circle", { class: "wf-halo", r: 66, fill: "url(#wfHalo)" }, disc); el("circle", { class: "wf-core-ring", r: 88 }, disc); el("circle", { class: "wf-core-ring", r: 62 }, disc);
    el("circle", { class: "wf-orb", r: 36, fill: "url(#wfOrb)", stroke: "rgba(200,225,255,.6)", "stroke-width": 1.2 }, disc);
    el("circle", { class: "wf-edge", r: 42, pathLength: 500, filter: "url(#wfGlow)" }, disc); el("circle", { class: "wf-edge wf-edge2", r: 42, pathLength: 500, filter: "url(#wfGlow)" }, disc);
    el("image", { href: ASSET + "meta-symbol.png", x: -17, y: -17, width: 34, height: 34 }, disc);
    el("text", { class: "wf-orb-label", y: -96 }, core).textContent = "Orchestrator"; el("text", { class: "wf-orb-sub", y: -83 }, core).textContent = "Plans, routes, retries (code)";
    nodes.core = core;
    DEF.forEach(([id, name, ico, kind, sub]) => card(id, name, ico, kind, sub));
    enableDrag(); if (!svg._zp) { enableZoomPan(); svg._zp = true; }
    if (hasG && !reduce) intro(); Object.values(icons).forEach((i) => i.idle());
  }
  function setPos(id, x, y) { POS[id] = [x, y]; const g = nodes[id]; if (id === "core" || !hasG) g.setAttribute("transform", `translate(${x} ${y})`); else gsap.set(g, { x, y }); refreshLines(false); }
  function enableDrag() {
    let drag = null;
    svg.addEventListener("pointerdown", (e) => { const g = e.target.closest && e.target.closest(".wf-node"); if (!g) return; const id = g.dataset.id, pt = world(svgPoint(e)); drag = { id, g, dx: POS[id][0] - pt.x, dy: POS[id][1] - pt.y, sx: e.clientX, sy: e.clientY, moved: false }; g.setPointerCapture(e.pointerId); g.classList.add("dragging"); e.preventDefault(); });
    svg.addEventListener("pointermove", (e) => { if (!drag) return; if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return; drag.moved = true; const pt = world(svgPoint(e)); setPos(drag.id, Math.max(-600, Math.min(1600, pt.x + drag.dx)), Math.max(-300, Math.min(1300, pt.y + drag.dy))); });
    const end = () => { if (!drag) return; drag.g.classList.remove("dragging"); if (!drag.moved) showDetail(drag.id); drag = null; };
    svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
  }
  function applyView() { if (layer) layer.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.k})`); }
  function zoomAt(px, py, factor) { const k = Math.max(0.5, Math.min(2.6, view.k * factor)), r = k / view.k; view.x = px - (px - view.x) * r; view.y = py - (py - view.y) * r; view.k = k; applyView(); }
  const world = (p) => ({ x: (p.x - view.x) / view.k, y: (p.y - view.y) / view.k });
  function svgPoint(e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  function enableZoomPan() {
    svg.addEventListener("wheel", (e) => { e.preventDefault(); const p = svgPoint(e); zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    let pan = null;
    svg.addEventListener("pointerdown", (e) => { if (e.target.closest && e.target.closest(".wf-node")) return; const p = svgPoint(e); pan = { sx: p.x, sy: p.y, vx: view.x, vy: view.y }; svg.setPointerCapture(e.pointerId); svg.classList.add("panning"); });
    svg.addEventListener("pointermove", (e) => { if (!pan) return; const p = svgPoint(e); view.x = pan.vx + (p.x - pan.sx); view.y = pan.vy + (p.y - pan.sy); applyView(); });
    const stop = () => { pan = null; svg.classList.remove("panning"); }; svg.addEventListener("pointerup", stop); svg.addEventListener("pointercancel", stop);
  }
  function resetLayout() { view.k = 1; view.x = 0; view.y = 0; applyView(); Object.keys(DEFAULT_POS).forEach((id) => { if (nodes[id]) setPos(id, DEFAULT_POS[id][0], DEFAULT_POS[id][1]); }); }
  function intro() {
    gsap.from(Object.values(nodes).map((n) => n.querySelector(".wf-disc") || n), { scale: 0.6, opacity: 0, duration: 0.7, ease: "back.out(1.15)", stagger: 0.04, transformOrigin: "50% 50%" });
    gsap.to(Object.values(lines), { strokeDashoffset: 0, duration: 0.9, ease: "power2.out", stagger: 0.03, delay: 0.3, onComplete() { Object.values(lines).forEach((p) => { p.dataset.drawn = "1"; }); } });
  }
  function resetStates() {
    stopBreathing();
    Object.values(nodes).forEach((g) => { g.classList.remove("thinking", "waiting", "done", "rejected", "st-code", "st-support", "st-against", "st-uncertain", "st-human", "st-warn", "st-bad"); const st = g.querySelector(".wf-stance"); if (st) st.textContent = ""; });
    Object.values(lines).forEach((p) => p.classList.remove("live", "warn")); Object.values(icons).forEach((i) => i.idle());
    results = {}; done = 0; calls = 0; cost = 0; rej = 0;
    $$("tDone").textContent = "0/12"; $$("tRej").textContent = "–"; $$("tErr").textContent = "–"; $$("tCalls").textContent = "0"; $$("tCost").textContent = "Model calls"; $$("tSave").textContent = "Running…";
    $$("wfBrief").hidden = true; $$("wfLog").replaceChildren(); $$("wfAnswer").hidden = true;
  }
  function startBreathing() { if (!hasG || reduce || breathe) return; breathe = gsap.to(nodes.core.querySelector(".wf-halo"), { scale: 1.2, opacity: 0.6, duration: 1.3, ease: "sine.inOut", yoyo: true, repeat: -1, transformOrigin: "50% 50%" }); }
  function stopBreathing() { if (breathe) { breathe.kill(); breathe = null; if (nodes.core) gsap.to(nodes.core.querySelector(".wf-halo"), { scale: 1, opacity: 1, duration: 0.4, transformOrigin: "50% 50%" }); } }
  function pulse(id, cls = "", dur = 0.9, back = false, delay = 0) {
    const p = lines[id]; if (!p || !hasG || reduce) return; const len = Number(p.dataset.len), dot = el("circle", { class: "wf-pulse " + cls, r: 5, filter: "url(#wfGlow)" }, layer), o = { t: 0 };
    gsap.to(o, { t: 1, duration: dur, delay, ease: "power2.inOut", onUpdate() { const pt = p.getPointAtLength((back ? 1 - o.t : o.t) * len); dot.setAttribute("cx", pt.x); dot.setAttribute("cy", pt.y); }, onComplete() { dot.remove(); } });
  }
  function pop(id) { if (hasG && !reduce && nodes[id]) gsap.fromTo(nodes[id].querySelector(".wf-disc") || nodes[id], { scale: 1.12 }, { scale: 1, duration: 0.5, ease: "back.out(2)", transformOrigin: "50% 50%" }); }
  function log(text, cls = "") { const d = document.createElement("div"); d.className = cls; const t = document.createElement("time"); t.textContent = (performance.now() / 1000 - t0).toFixed(1) + "s"; d.append(t, document.createTextNode(text)); $$("wfLog").append(d); $$("wfLog").scrollTop = $$("wfLog").scrollHeight; }
  function status(txt, cls = "") { const s = $$("wfStatus"); s.textContent = txt; s.className = "wf-status " + cls; }
  const add = (box, tag, text, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; box.append(e); return e; };

  function summarize(id, ev) {
    const o = ev.output || {};
    if (ev.fallback) return "FALLBACK";
    switch (id) {
      case "scene": return o.ok ? "FACTORY ✓" : "NOT A FACTORY";
      case "vision": return (o.equipment ? o.equipment.length : 0) + " ITEMS";
      case "segment": return (o.boxes ? o.boxes.length : 0) + " REGIONS";
      case "engineer": return (o.spec ? o.spec.components.length : 0) + " PARTS";
      case "design": return ((o.design && o.design.extras) ? o.design.extras.length : 0) + " PROPS";
      case "calibrate": return "ERR " + (o.final_err_pct > 0 ? "+" : "") + o.final_err_pct + "%";
      case "hunt": return (o.plan ? o.plan.length : 0) + " FIXES";
      case "verify": return (o.accepted || 0) + " OK · " + (o.rejected || 0) + " NO";
      case "critic": return ((o.challenges || []).length) + " CONCERNS";
      case "report": return "BRIEF READY";
      default: return "DONE";
    }
  }
  function showDetail(id) {
    const r = results[id], box = $$("wfDetail"); box.replaceChildren(); add(box, "h4", "Agent"); add(box, "b", nameOf(id));
    if (id === "core") { add(box, "div", "Runs the plan in code: routes work, retries failures, stops loops at their caps. It never decides the result; the engineer does.", "meta"); return; }
    if (!r) { add(box, "div", "No result yet.", "meta"); return; }
    const o = r.output || {}, ul = add(box, "ul", "");
    if (id === "scene") add(ul, "li", `${o.subject || ""}${o.reason ? " · " + o.reason : ""}`);
    if (id === "vision") (o.equipment || []).slice(0, 6).forEach((e) => add(ul, "li", `${e.phrase} (${e.kind})`)), (o.waste_signs || []).slice(0, 4).forEach((w) => add(ul, "li", "Sign: " + w));
    if (id === "segment") (o.boxes || []).slice(0, 8).forEach((b) => add(ul, "li", b.phrase));
    if (id === "design" && o.design) { Object.entries(o.design.layout || {}).forEach(([k, v]) => add(ul, "li", `${k}: x ${v.x}, z ${v.z}, scale ${v.scale}${v.why ? " - " + v.why : ""}`)); (o.design.extras || []).forEach((x) => add(ul, "li", `prop: ${x.role} (${x.shape})`)); if (o.design.notes) add(ul, "li", o.design.notes); }
    if (id === "engineer") (o.spec ? o.spec.components : []).forEach((c) => add(ul, "li", `${c.name || c.id} (${c.type})`));
    if (id === "calibrate") add(ul, "li", `Final twin error vs bill: ${o.final_err_pct}% (${o.calibrated ? "calibrated" : "not within 5%"})`);
    if (id === "hunt") (o.plan || []).forEach((f) => add(ul, "li", f.type.replace(/_/g, " ") + (f.target ? " · " + f.target : "")));
    if (id === "verify") add(ul, "li", `${o.accepted || 0} accepted, ${o.rejected || 0} rejected this round`);
    if (id === "critic") (o.challenges || []).forEach((c) => add(ul, "li", `${c.concern} (${c.severity})`));
    if (id === "report") add(ul, "li", "Brief written from verified numbers only");
    if (id === "gate") { add(ul, "li", "The engineer approves, modifies or rejects. Nothing is final without this step."); if (gateResult) { const b = add(box, "button", "Open the decision card", "wf-cptoggle"); b.type = "button"; b.addEventListener("click", cpOpen); } }
    add(box, "div", `${r.model ? pretty(r.model) : "Code, no model"}${r.ms ? " · " + (r.ms / 1000).toFixed(1) + " s" : ""}${r.fallback ? " · fallback" + (r.note ? " (" + r.note + ")" : "") : ""}`, "meta");
  }

  function apply(ev) {
    switch (ev.type) {
      case "run_start": gateResult = null; $$("wfCp").hidden = true; STEPS.forEach((n) => stepMark(n, "")); $$("wfLeft").classList.remove("alert"); resetStates(); t0 = performance.now() / 1000; $$("wfCaseTitle").textContent = ev.case.name; status("Running", "run"); startBreathing(); log("Workflow started"); icons.intake && 0; break;
      case "node_start": { if (STEPS.includes(ev.node)) stepMark(ev.node, "act"); const g = nodes[ev.node]; if (!g) break; g.classList.add("thinking"); icons[ev.node] && icons[ev.node].think(true); (INLINES[ev.node] || []).forEach((l, i) => { lines[l].classList.add("live"); pulse(l, "", 0.8, false, i * 0.06); });
        if (ev.node === "intake") pulse("intake", "", 0.6); log(ev.label || nameOf(ev.node)); break; }
      case "node_done": {
        const id = ev.node, g = nodes[id]; if (!g) break; results[id] = ev; if (STEPS.includes(id)) stepMark(id, "done"); if (id === "design" && $$("wf").classList.contains("lc")) $$("wfLeft").classList.add("alert"); g.classList.remove("thinking"); icons[id] && (icons[id].think(false), icons[id].done());
        const bad = ev.output && (ev.output.error || ev.output.ok === false); g.classList.add("done", ev.fallback ? "st-warn" : bad ? "st-bad" : (DEF.find((d) => d[0] === id) || [])[3] === "code" ? "st-code" : "st-against"); pop(id);
        g.querySelector(".wf-stance").textContent = summarize(id, ev);
        if (ev.model) { const mn = g.querySelector(".wf-mname"); if (mn) mn.textContent = pretty(ev.model); }
        done += 1; $$("tDone").textContent = `${done}/12`; calls += ev.calls || 0; cost += ev.usd || 0; $$("tCalls").textContent = String(calls); $$("tCost").textContent = "Model calls";
        (INLINES[id] || []).forEach((l) => pulse(l, "back", 0.7, true));
        log(`${nameOf(id)}: ${summarize(id, ev).toLowerCase()}${ev.fallback && ev.note ? " (" + ev.note + ")" : ""}`, ev.fallback ? "warn" : bad ? "bad" : "ok"); break; }
      case "loop": $$("tErr").textContent = (ev.err_pct > 0 ? "+" : "") + ev.err_pct + "%"; pulse("design_calibrate", "", 0.5); log(`Calibration ${ev.iter}: twin ${Math.round(ev.twin_kwh).toLocaleString()} vs bill ${Math.round(ev.bill_kwh).toLocaleString()} kWh (${ev.err_pct > 0 ? "+" : ""}${ev.err_pct}%)`, Math.abs(ev.err_pct) <= 5 ? "ok" : "warn"); break;
      case "note": log(ev.text, "warn"); break;
      case "fix_round": {
        pulse("hunt_verify", "", 0.7); setTimeout(() => pulse("verify_hunt", "back", 0.7, false), 750);
        ev.results.forEach((r) => { if (r.status === "rejected") { rej += 1; $$("tRej").textContent = String(rej); lines.verify_hunt.classList.add("warn"); log(`Rejected ${r.fix.type.replace(/_/g, " ")}: ${r.reason}`, "bad"); } else log(`Verified ${r.fix.type.replace(/_/g, " ")} (${Math.round(r.saved_egp_year).toLocaleString()} USD/yr)`, "ok"); });
        if (!rej) $$("tRej").textContent = "0"; break; }
      case "gate": { gateResult = ev.result; setTimeout(cpOpen, 900);
        const r = ev.result, e = r.evaluation; nodes.gate.classList.remove("thinking"); nodes.gate.classList.add("waiting"); icons.gate.think(true); stopBreathing(); pulse("final", "final", 1.3); pulse("report_gate", "human", 0.7);
        status("Waiting for engineer", "wait"); $$("tSave").textContent = Math.round(e.saved_egp_year).toLocaleString() + " USD/yr · " + r.arbiter.level;
        const b = $$("wfBrief"); b.hidden = false; b.replaceChildren(); add(b, "h4", "Orchestrator brief"); add(b, "div", r.summary); add(b, "div", `Confidence ${r.arbiter.level} (${r.arbiter.confidence_score}) · range ${Math.round(r.arbiter.range_egp_year[0]).toLocaleString()}–${Math.round(r.arbiter.range_egp_year[1]).toLocaleString()} USD/yr`, "row");
        log("Verified plan ready: requires engineer review", "human"); break; }
      case "decision": $$("wfCp").hidden = true; nodes.gate.classList.remove("waiting"); nodes.gate.classList.add("done", "st-human"); icons.gate.think(false); icons.gate.done(); nodes.gate.querySelector(".wf-stance").textContent = ev.action.toUpperCase(); status("Engineer: " + ev.action, ""); log(`Engineer decision: ${ev.action}`, "human"); break;
      case "rejected": nodes.scene.classList.remove("thinking"); nodes.scene.classList.add("rejected"); stopBreathing(); status("Stopped: not a factory", "wait"); $$("tSave").textContent = "Image refused"; log("Scene Check refused the image: " + ev.reason, "bad"); break;
      case "cancelled": stopBreathing(); Object.values(nodes).forEach((g) => { g.classList.remove("thinking", "waiting"); }); status("Cancelled", "wait"); $$("tSave").textContent = "Cancelled"; log("Workflow cancelled: no further model calls", "bad"); break;
      case "error": log("Stopped: " + ev.message, "bad"); status("Stopped", "wait"); break;
      case "done": stopBreathing(); if (!ev.rejected) status($$("wfStatus").className.includes("wait") ? $$("wfStatus").textContent : "Done", $$("wfStatus").className.includes("wait") ? "wait" : ""); Object.values(nodes).forEach((g) => g.classList.remove("thinking")); break;
    }
  }
  async function ask(e) {
    e.preventDefault(); const q = $$("wfQ").value.trim(), box = $$("wfAnswer"); if (!q) return; box.hidden = false;
    if (!App.runId()) { box.textContent = "Run the twin first, so there is a result to ask about."; return; }
    box.textContent = "Thinking…"; $$("wfQ").value = "";
    try { const r = await (await fetch(`/api/run/${App.runId()}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) })).json(); box.textContent = r.answer; } catch (err) { box.textContent = "Could not reach the server."; }
  }
  // the live 3D view: the same canvas is moved into the left panel while the workflow is open
  let isoHome = null, gateResult = null;
  function mountView() { const iso = document.getElementById("iso"), v = $$("wfView"); if (!iso || !v || v.contains(iso)) return; isoHome = { parent: iso.parentElement, next: iso.nextSibling }; v.appendChild(iso); }
  function unmountView() { const iso = document.getElementById("iso"); if (!iso || !isoHome || isoHome.parent.contains(iso)) return; isoHome.parent.insertBefore(iso, isoHome.next); }
  function open() { $$("wf").hidden = false; document.body.style.overflow = "hidden"; mountView(); }
  function close() { $$("wf").hidden = true; document.body.style.overflow = ""; unmountView(); }
  const STEPS = ["scene", "vision", "segment", "engineer", "design"];
  function stepMark(n, cls) { const li = document.querySelector(`#wfSteps li[data-n="${n}"]`); if (li) li.className = cls; }
  const money = (n) => Math.round(+n || 0).toLocaleString("en-US");
  const fixTitle = (f) => ({ vsd_pump: "Variable-speed drive on pumps", repair_leaks: "Repair compressed-air leaks", led_retrofit: "LED lighting retrofit", lighting_controls: "Lighting controls", hvac_setpoint: "Raise cooling setpoint", standby_shutdown: "Auto shut-down of idle machines", solar_pv: "Rooftop solar PV" }[f.type] || f.type);
  function cpOpen() {
    const r = gateResult; if (!r) return; const e = r.evaluation, a = r.arbiter, d = r.plan_detail || [];
    $$("cpLead").textContent = `WattLoop tested ${r.plan.length} fixes in the twin and kept the ones that passed the safety checks. Nothing is final until you decide. All figures are simulated estimates, not measurements.`;
    $$("cpNums").innerHTML = [[money(e.saved_egp_year) + " USD/yr", "simulated saving"], [money(e.saved_kwh_month) + " kWh/mo", "energy saved"], [e.payback_months == null ? "n/a" : e.payback_months + " months", "payback (placeholder costs)"], [a.level + " (" + a.confidence_score + ")", money(a.range_egp_year[0]) + " to " + money(a.range_egp_year[1]) + " USD/yr"]].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("");
    $$("cpFixes").innerHTML = d.length ? d.map((x) => `<div class="cp-row ok">${fixTitle(x.fix)} - saves ${money(x.saved_egp_year)} USD/yr, costs about ${money(x.capex_egp)} USD (estimate)</div>`).join("") : r.plan.map((f) => `<div class="cp-row ok">${fixTitle(f)}</div>`).join("");
    const w = ((r.critic && r.critic.challenges) || []).slice(0, 4).map((c) => `<div class="cp-row">${String(c.concern).replace(/</g, "&lt;")} (${c.severity})</div>`).join("");
    $$("cpWatch").innerHTML = w + '<div class="cp-row">Cost figures are placeholders: get supplier quotes. Confirm equipment ratings and operating hours on site.</div>';
    $$("cpMsg").textContent = ""; $$("wfCp").hidden = false;
  }
  async function cpDecide(action) {
    const note = $$("cpNote").value.trim(), who = $$("cpWho").value.trim();
    if ((action === "modify" || action === "reject") && note.length < 3) { $$("cpMsg").textContent = "Add a short note: it is required for Modify and Reject."; return; }
    $$("cpMsg").textContent = "Recording your decision…"; await App.decide(action, (who ? who + ": " : "") + note);
  }
  function init() {
    build();
    $$("wfOpen").addEventListener("click", open); $$("wfClose").addEventListener("click", close); $$("wfHome").addEventListener("click", close);
    $$("wfRun").addEventListener("click", () => { App.start(); });  // starts a run, or cancels the active one
    $$("wfReset").addEventListener("click", resetLayout); $$("wfZin").addEventListener("click", () => zoomAt(500, 400, 1.2)); $$("wfZout").addEventListener("click", () => zoomAt(500, 400, 1 / 1.2));
    $$("wfLtoggle").addEventListener("click", () => { const c = $$("wf").classList.toggle("lc"); $$("wfLtoggle").innerHTML = c ? "&rsaquo;" : "&lsaquo;"; if (!c) $$("wfLeft").classList.remove("alert"); });
    $$("cpHide").addEventListener("click", () => { $$("wfCp").hidden = true; }); $$("cpPdf").addEventListener("click", () => { $$("cpPdf").dispatchEvent(new CustomEvent("pdf", { bubbles: true })); document.getElementById("pdfBtn").click(); });
    document.querySelectorAll(".cp-actions [data-a]").forEach((b) => b.addEventListener("click", () => cpDecide(b.dataset.a)));
    $$("wfAsk").addEventListener("submit", ask); document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$$("wf").hidden) close(); });
  }
  return { init, apply, open, close, setModel(m) { $$("wfModel").textContent = m; $$("wfAskModel").textContent = m; } };
})();
