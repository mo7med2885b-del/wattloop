/* Factory twin in the "factory management system" look: near-black machines with light edge lines, orange zone outlines on the floor,
   flowing energy lines, heat glows on waste, orange tag callouts, a perspective camera that can fly in to one machine.
   Everything shown is built from the run's twin specs; nothing is a canned animation. */
window.Factory = (function () {
  const T = THREE;
  const OR = 0xff6a00, GR = 0x35e08a, BODY = 0x1b1e22, DARK = 0x111316, EDGE = 0xaeb4ba;
  let LIGHT = false;  // light mode lightens dark machine bodies and darkens edge lines; accents stay orange / green
  let renderer, cam, clock, box, canvas, calloutsEl, leadersEl, running = false;
  const S = { specA: null, specB: null, partsA: {}, partsB: {}, hourA: [], hourB: [], mode: "now", paused: false, day: 6 / 24, focus: null };
  const W = { A: null, B: null };
  const orbit = { az: 0.62, el: 0.5, dist: 46, tx: 0, ty: 1.2, tz: 0 };
  let drag = null, DAY = 36, lastDom = 0, cos = {}, onFrame = null, onFocus = null, dust = null;
  const tone = (c) => { if (!LIGHT) return c; const k = new T.Color(c); if (k.r * .3 + k.g * .59 + k.b * .11 > .3) return c; return k.lerp(new T.Color(0xffffff), .8).getHex(); };
  const mat = (c, o = {}) => new T.MeshStandardMaterial({ color: tone(c), roughness: LIGHT ? .55 : .38, metalness: LIGHT ? .2 : .6, ...o });
  let STATIC = false;  // platform pieces are not animated when the machines assemble
  function edges(mesh, col = EDGE, op = .55) { mesh.userData.part = true; mesh.userData.static = STATIC; if (LIGHT && col !== OR && col !== GR) { col = 0x3f474f; op = Math.min(1, op + .25); } const e = new T.LineSegments(new T.EdgesGeometry(mesh.geometry, 28), new T.LineBasicMaterial({ color: col, transparent: true, opacity: op })); mesh.add(e); mesh.userData.edge = e; return mesh; }
  const mk = (geo, col, ec, op) => edges(new T.Mesh(geo, mat(col)), ec, op);
  const Box = (w, h, d, col = BODY, ec, op) => mk(new T.BoxGeometry(w, h, d), col, ec, op);
  const Cyl = (r, h, col = BODY, ec, seg = 22, op) => mk(new T.CylinderGeometry(r, r, h, seg), col, ec, op);
  const isFixed = { pump: (c) => !!c.vsd, compressor: (c) => c.leak < 0.07, lighting: (c) => !!(c.led || c.controls), hvac: (c) => c.setpoint_c >= 24, standby: (c) => !!c.auto_off, pv: () => true, motors: () => false };
  const wasteful = { pump: (c) => !c.vsd, compressor: (c) => c.leak >= 0.07, lighting: (c) => !(c.led || c.controls) && c.after_hours_h > 0, hvac: (c) => c.setpoint_c < 23, standby: (c) => !c.auto_off, pv: () => false, motors: () => false };

  function glowTex(rgba) { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, rgba); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c); }
  const GLOW = {};
  const glow = (key, rgba, size, y, op = 0) => { GLOW[key] = GLOW[key] || glowTex(rgba); const s = new T.Sprite(new T.SpriteMaterial({ map: GLOW[key], transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: op })); s.scale.set(size, size, 1); s.position.y = y; return s; };

  function zoneOutline(sc, cx, cz, w, d, color) {
    const pts = [new T.Vector3(cx - w / 2, .05, cz - d / 2), new T.Vector3(cx + w / 2, .05, cz - d / 2), new T.Vector3(cx + w / 2, .05, cz + d / 2), new T.Vector3(cx - w / 2, .05, cz + d / 2)];
    const g = new T.BufferGeometry().setFromPoints(pts);
    [0, 1].forEach((k) => { const l = new T.LineLoop(g, new T.LineBasicMaterial({ color, transparent: true, opacity: k ? .35 : 1 })); l.scale.set(1 + k * .02, 1, 1 + k * .03); l.position.set(cx * (-k * .02), 0, cz * (-k * .03)); sc.add(l); });
    const fill = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshBasicMaterial({ color, transparent: true, opacity: .07, blending: T.AdditiveBlending, depthWrite: false })); fill.rotation.x = -Math.PI / 2; fill.position.set(cx, .04, cz); sc.add(fill);
    return fill;
  }
  function flowLine(sc, pts, color) {
    const g = new T.BufferGeometry().setFromPoints(pts.map((p) => new T.Vector3(p[0], .06, p[1])));
    const m = new T.LineDashedMaterial({ color, dashSize: .7, gapSize: .5, transparent: true, opacity: .95 }); const l = new T.Line(g, m); l.computeLineDistances(); sc.add(l); return l;
  }

  function build(spec, after) {
    const sc = new T.Scene(), w = { sc, spec, after, anchors: {}, lights: [], glows: [], pumps: [], boxes: [], pv: [], flows: {}, heat: {}, fills: {}, leaks: null, fan: null, stby: null };
    const bg = LIGHT ? 0xe9ecf0 : 0x08090a; sc.background = new T.Color(bg); sc.fog = new T.Fog(bg, 55, 120);
    const amb = new T.AmbientLight(0xb8c4d0, LIGHT ? .9 : .42); sc.add(amb); w.amb = amb;
    const sun = new T.DirectionalLight(0xffe2c0, .8); sun.position.set(-12, 22, 14); sc.add(sun); w.sun = sun;
    const rim = new T.DirectionalLight(0x6a8cff, .35); rim.position.set(14, 10, -16); sc.add(rim);
    STATIC = true;
    // platform: slab, fine grid, orange perimeter like the reference
    const slab = new T.Mesh(new T.BoxGeometry(34, 1, 23), mat(0x0f1113, { roughness: .8, metalness: .2 })); slab.position.y = -.5; edges(slab, 0x3a3e44, .8); sc.add(slab);
    const grid = new T.GridHelper(34, 34, LIGHT ? 0xb9c0c7 : 0x24272b, LIGHT ? 0xd0d5db : 0x1a1c1f); grid.position.y = .02; grid.scale.z = 23 / 34; sc.add(grid);
    const per = zoneOutline(sc, 0, 0, 33.4, 22.4, 0x7a3300); per.material.opacity = .02;
    // distant structures for context (tanks and sheds), like the wider factory in the reference
    [[-25, -10, 2.4, 5], [-29, 4, 2, 3.5], [25, -13, 2.6, 5.5], [30, 3, 1.8, 4]].forEach(([x, z, r, h]) => { const t = Cyl(r, h, 0x15181b, 0x5a5f66, 24, .5); t.position.set(x, h / 2, z); sc.add(t); });
    [[-24, 12, 6, 3, 5], [24, 14, 7, 2.5, 5]].forEach(([x, z, bw, bh, bd]) => { const b = Box(bw, bh, bd, 0x14171a, 0x5a5f66, .5); b.position.set(x, bh / 2, z); sc.add(b); });
    STATIC = false;
    const byType = (t) => spec.components.filter((c) => c.type === t);
    const zc = (c) => (after && isFixed[c.type](c) ? GR : OR);
    const zone = (c, cx, cz, zw, zd) => { w.fills[c.id] = zoneOutline(sc, cx, cz, zw, zd, zc(c)); w.anchors[c.id] = new T.Vector3(cx, 2.2, cz); w.zones = w.zones || {}; w.zones[c.id] = [cx, cz]; };

    const L = byType("lighting")[0];
    if (L) {
      for (let i = 0; i < 6; i++) {
        const s = Box(3.8, .16, .5, 0x2a2e33, EDGE, .8); s.position.set(-10 + i * 4, 7.4, i % 2 ? -3 : 3); sc.add(s); w.lights.push(s);
        const g = glow(L.led ? "cool" : "warm", L.led ? "rgba(190,235,255,.55)" : "rgba(255,190,110,.55)", 9, .35); g.position.x = s.position.x; g.position.z = s.position.z; sc.add(g); w.glows.push(g);
      }
      w.anchors[L.id] = new T.Vector3(0, 7.4, 0); w.zones = w.zones || {}; w.zones[L.id] = [0, 0];
    }
    const P = byType("pump")[0];
    if (P) {
      const n = Math.min(3, P.count);
      for (let i = 0; i < n; i++) {
        const g = new T.Group(); g.position.set(-10.5 + i * 3.6, 0, 6);
        const base = Box(3, .35, 1.9, DARK, EDGE, .7); base.position.y = .18; g.add(base);
        const motor = Cyl(.72, 2.1, BODY, EDGE, 24, .6); motor.rotation.z = Math.PI / 2; motor.position.set(-.35, 1.15, 0); g.add(motor);
        const vol = Cyl(.9, .6, 0x25292d, EDGE, 24, .6); vol.rotation.z = Math.PI / 2; vol.position.set(1.1, 1.15, 0); g.add(vol);
        const imp = Box(.1, 1.3, .16, OR, OR, 1); imp.position.set(1.42, 1.15, 0); g.add(imp);
        const valve = new T.Mesh(new T.TorusGeometry(.32, .08, 8, 20), mat(P.vsd ? GR : 0xff3b30, { emissive: P.vsd ? 0x0b4a2a : 0x600c08, emissiveIntensity: 1, roughness: .4 })); valve.position.set(2.05, 2.1, 0); valve.rotation.y = Math.PI / 2; g.add(valve);
        const pipe = Box(.24, 1.1, .24, 0x2a2e33, EDGE, .6); pipe.position.set(2.05, 1.45, 0); g.add(pipe);
        sc.add(g); w.pumps.push({ imp, valve });
      }
      zone(P, -10.5 + (n - 1) * 1.8 + .5, 6, n * 3.6 + 2, 4.4);
      const h = glow("heatR", "rgba(255,70,40,.8)", 7, 2.2); h.position.set(-8, 2.2, 6); sc.add(h); w.heat[P.id] = h;
    }
    const C = byType("compressor")[0];
    if (C) {
      const g = new T.Group(); g.position.set(5, 0, 5.4);
      const body = Box(2.9, 2.4, 2, 0x201d12, EDGE, .75); body.position.y = 1.2; g.add(body);
      const tank = Cyl(.9, 3.6, BODY, EDGE, 26, .65); tank.rotation.z = Math.PI / 2; tank.position.set(3.8, 1.05, 0); g.add(tank);
      const mot = Cyl(.55, 1.1, 0x25292d, EDGE); mot.position.set(0, 2.95, 0); g.add(mot);
      sc.add(g); zone(C, 7, 5.4, 9.6, 4.6);
      const n = 110, geo = new T.BufferGeometry(), pos = new Float32Array(n * 3), ph = new Float32Array(n).map(() => Math.random());
      geo.setAttribute("position", new T.BufferAttribute(pos, 3));
      const pts = new T.Points(geo, new T.PointsMaterial({ color: 0xffd9b0, size: .24, transparent: true, opacity: .9, depthWrite: false, blending: T.AdditiveBlending })); pts.frustumCulled = false; sc.add(pts);
      w.leaks = { pts, ph, n, base: [[6, 2.2, 5.4], [8.9, 1.9, 6], [5.2, 1.4, 6.4]] };
      const h = glow("heatR", "rgba(255,70,40,.8)", 9, 2.4); h.position.set(7.4, 2.4, 5.4); sc.add(h); w.heat[C.id] = h;
    }
    const M = byType("motors")[0];
    if (M) {
      const belt = Box(16, .5, 2, 0x16191c, EDGE, .75); belt.position.set(-2, 1, -3.6); sc.add(belt);
      for (let i = 0; i < 6; i++) { const b = Box(1.1, .85, 1.1, 0x3a2e1f, OR, .9); b.position.set(-9.5 + i * 2.5, 1.7, -3.6); sc.add(b); w.boxes.push(b); }
      const mot = Cyl(.65, 1.4, BODY, EDGE); mot.rotation.z = Math.PI / 2; mot.position.set(6.8, .95, -3.6); sc.add(mot);
      zone(M, -1.6, -3.6, 18, 3.6);
    }
    const H = byType("hvac")[0];
    if (H) {
      const u = Box(3.6, 1.5, 1, 0x23272b, EDGE, .8); u.position.set(10, 3.5, -10.6); sc.add(u);
      const fan = new T.Mesh(new T.CircleGeometry(.5, 18), mat(0x4b535a)); fan.position.set(10, 3.5, -10.08); edges(fan, EDGE); sc.add(fan); w.fan = fan;
      w.anchors[H.id] = new T.Vector3(10, 4.4, -10.6); w.zones = w.zones || {}; w.zones[H.id] = [10, -10.6]; w.fills[H.id] = zoneOutline(sc, 10, -9, 4.6, 3, zc(H));
    }
    const SB = byType("standby")[0];
    if (SB) {
      const b = Box(2, 2, 1.5, BODY, EDGE, .7); b.position.set(-13.5, 1, -3.6); sc.add(b);
      const led = new T.Mesh(new T.SphereGeometry(.18, 10, 10), mat(0x303030, { emissive: 0xff2a20, emissiveIntensity: 0 })); led.position.set(-12.6, 1.7, -2.8); sc.add(led); w.stby = { led, off: !!SB.auto_off };
      zone(SB, -13.5, -3.6, 3.6, 3);
    }
    const V = byType("pv")[0];
    if (V) {
      const cnt = Math.min(14, Math.max(4, Math.round(V.kwp / 4)));
      for (let i = 0; i < cnt; i++) { const p = Box(2.3, .1, 1.5, 0x0f1d3d, GR, .9); p.position.set(-10 + (i % 7) * 3.4, 8.6, -3 + Math.floor(i / 7) * 3.6); p.rotation.x = -.25; sc.add(p); w.pv.push(p); }
      w.anchors[V.id] = new T.Vector3(0, 9, 0); w.zones = w.zones || {}; w.zones[V.id] = [0, 0];
    }
    // energy flow lines from the grid entry (front left) to every zone, like the routed paths in the reference
    const entry = [-15, 10]; const color = after ? GR : OR;
    Object.entries(w.zones || {}).forEach(([id, [x, z]]) => { if (!w.fills[id]) return; w.flows[id] = flowLine(sc, [entry, [entry[0], z > 0 ? z : 9.5], [x, z > 0 ? 9.5 : 9.5], [x, z + (z > 0 ? 2.3 : z < -9 ? 2 : 1.8)]], color); });
    return w;
  }
  function disposeW(w) { if (!w) return; w.sc.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()); }); }
  const active = (c, h, sh) => h >= sh.start && h < sh.end && h - sh.start < (c.hours || 24);

  function animate(w, hour, dt, parts) {
    const sp = w.spec, sh = sp.shift, t = performance.now() / 1000, day = hour >= 6 && hour < 18, sunk = day ? Math.sin((hour - 6) / 12 * Math.PI) : 0;
    w.amb.intensity = (LIGHT ? .7 : .36) + .22 * sunk; w.sun.intensity = (LIGHT ? .35 : .4) + .6 * sunk;
    const c = (ty) => sp.components.find((x) => x.type === ty), L = c("lighting"), P = c("pump"), C = c("compressor"), M = c("motors"), H = c("hvac");
    let lit = false;
    if (L) { lit = active(L, hour, sh); if (!lit && !L.controls && L.after_hours_h > 0) lit = ((hour - sh.end + 24) % 24) < L.after_hours_h; }
    w.lights.forEach((m, i) => { m.material.emissive.setHex(lit ? (L.led ? 0xbfefff : 0xffd090) : 0); m.material.emissiveIntensity = lit ? 1.6 : 0; const g = w.glows[i].material; g.opacity += ((lit ? .8 : 0) - g.opacity) * Math.min(1, dt * 6); });
    if (P) { const on = active(P, hour, sh), s = on ? (P.vsd ? .6 + 5 * P.flow_demand : 9) : 0; w.pumps.forEach((p) => { p.imp.rotation.x += s * dt; p.valve.scale.setScalar(!P.vsd && on ? .8 + .14 * Math.sin(t * 6) : 1); }); }
    if (w.leaks) {
      const on = C && active(C, hour, sh), fr = C ? C.leak : 0, lk = w.leaks, a = lk.pts.geometry.attributes.position.array;
      for (let i = 0; i < lk.n; i++) { lk.ph[i] = (lk.ph[i] + dt * (.5 + (i % 5) * .15)) % 1; const f = lk.ph[i], b = lk.base[i % 3], vis = on && i / lk.n < Math.min(1, fr * 4);
        a[i * 3] = vis ? b[0] + Math.sin(i * 7.1) * f * 1.6 : 0; a[i * 3 + 1] = vis ? b[1] + f * 2.8 : -50; a[i * 3 + 2] = vis ? b[2] + Math.cos(i * 3.3) * f * 1.6 : 0; }
      lk.pts.geometry.attributes.position.needsUpdate = true;
    }
    if (M && w.boxes.length) { const on = active(M, hour, sh), s = on ? 1.3 * M.load_factor + .5 : 0; w.boxes.forEach((b) => { b.position.x += s * dt; if (b.position.x > 5.6) b.position.x = -9.8; }); }
    if (w.fan) { const on = H && active(H, hour, sh); w.fan.rotation.z += (on ? 9 : 0) * dt; }
    if (w.stby) { const out = !(hour >= sh.start && hour < sh.end), v = out && !w.stby.off ? (Math.sin(t * 4) > 0 ? 3 : .5) : 0; w.stby.led.material.emissiveIntensity = v; }
    w.pv.forEach((p) => { p.material.emissive.setHex(0x1d4fd0); p.material.emissiveIntensity = .1 + 1.2 * sunk; });
    // heat glows pulse while a wasteful machine is actually running; energy lines flow faster with real kW
    const hi = Math.floor(hour) % 24;
    Object.entries(w.heat).forEach(([id, g]) => { const comp = sp.components.find((x) => x.id === id); const run = comp && active(comp, hour, sh) && wasteful[comp.type](comp); g.material.opacity += ((run ? .5 + .3 * Math.sin(t * 3) : 0) - g.material.opacity) * Math.min(1, dt * 5); });
    Object.entries(w.flows).forEach(([id, l]) => { const kw = Math.abs((parts[id] || [])[hi] || 0); l.material.dashSize = .7; l.material.opacity = kw > .3 ? .95 : .25; l.material.dashOffset = (l.material.dashOffset || 0) - dt * Math.min(9, .8 + kw * .1); });
    Object.entries(w.fills).forEach(([id, f]) => { const kw = Math.abs((parts[id] || [])[hi] || 0); f.material.opacity = .05 + Math.min(.14, kw * .004); });
  }

  // ------------------------------------------------------------------ callouts
  const TITLES = { pump: "PUMPS", compressor: "AIR COMPRESSOR", motors: "CONVEYORS", hvac: "COOLING", lighting: "LIGHTING", standby: "STANDBY", pv: "SOLAR PV" };
  const OFFS = { pump: [-10, -78], compressor: [30, -86], motors: [0, -90], hvac: [0, -56], lighting: [0, -30], standby: [0, -70], pv: [0, -30] };
  function buildCallouts(spec) {
    calloutsEl.innerHTML = ""; leadersEl.innerHTML = ""; cos = {};
    if (S.mode === "compare" || !spec) return;
    spec.components.forEach((c) => {
      const d = document.createElement("div"); d.className = "co"; d.innerHTML = `<span class="tab">${TITLES[c.type] || c.type}</span><span class="sub"></span><div class="body"></div>`; calloutsEl.appendChild(d);
      d.addEventListener("click", (e) => { e.stopPropagation(); api.focus(S.focus === c.id ? null : c.id); });
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "path"); ln.setAttribute("fill", "none"); ln.setAttribute("stroke-width", "1.2"); leadersEl.appendChild(ln); cos[c.id] = { d, ln, c };
    });
  }
  function fillCallouts(w, parts, hour) {
    const hi = Math.floor(hour) % 24;
    Object.values(cos).forEach(({ d, c }) => {
      const kw = (parts[c.id] || [])[hi] ?? 0, fixed = w.after && isFixed[c.type](c), rows = [], R = (a, b) => rows.push(`<div class="r"><span>${a}</span><b>${b}</b></div>`);
      let warn = "", sub = `${Math.abs(kw).toFixed(1)} kW now`;
      if (c.type === "pump") { R("Flow demand", Math.round(c.flow_demand * 100) + "%"); R("Drive", c.vsd ? "variable speed" : "fixed + valve"); warn = c.vsd ? "FIXED · SPEED CONTROLLED" : "WARNING · THROTTLED VALVE"; }
      if (c.type === "compressor") { R("Leaks", Math.round(c.leak * 100) + "% of capacity"); R("Air demand", Math.round(c.air_demand * 100) + "%"); warn = c.leak < 0.07 ? "FIXED · LEAKS REPAIRED" : "WARNING · AIR LEAKS"; }
      if (c.type === "motors") { R("Load", Math.round(c.load_factor * 100) + "%"); R("Runs", c.hours + " h/day"); }
      if (c.type === "hvac") { R("Setpoint", c.setpoint_c.toFixed(0) + " °C"); R("Runs", c.hours + " h/day"); warn = c.setpoint_c >= 24 ? "FIXED · SETPOINT RAISED" : c.setpoint_c < 23 ? "OVER-COOLED?" : ""; }
      if (c.type === "lighting") { R("Type", c.led ? "LED" : "fluorescent"); R("After hours", c.controls ? "controlled" : (c.after_hours_h || 0) + " h on"); warn = c.led || c.controls ? "FIXED · EFFICIENT + CONTROLLED" : (c.after_hours_h > 0 ? "WARNING · LEFT ON AFTER HOURS" : ""); }
      if (c.type === "standby") { R("Overnight", c.auto_off ? "auto off" : c.kw.toFixed(1) + " kW on"); warn = c.auto_off ? "FIXED · AUTO SHUT-DOWN" : "WARNING · LEFT ON"; }
      if (c.type === "pv") { sub = `${Math.abs(kw).toFixed(1)} kW output`; R("Size", c.kwp.toFixed(0) + " kWp"); warn = "ADDED · SOLAR"; }
      d.classList.toggle("fixed", !!fixed || c.type === "pv"); d.querySelector(".sub").textContent = sub; const warnHtml = warn ? `<span class="warn">${warn}</span>` : ""; d.querySelector(".body").innerHTML = `<div class="rows">${rows.filter((r) => !r.startsWith("<span")).join("")}</div>${warnHtml}`; d.classList.toggle("solo", S.focus === c.id);
    });
  }
  const tmp = new T.Vector3();
  function placeCallouts(w, rect) {
    const placed = [];   // simple collision avoidance: push a tag up until it no longer covers one already placed
    Object.values(cos).forEach(({ d, ln, c }) => {
      const a = w.anchors[c.id]; const hidden = !a || (S.focus && S.focus !== c.id);
      if (hidden) { d.style.opacity = 0; d.style.pointerEvents = "none"; ln.setAttribute("opacity", 0); return; }
      tmp.copy(a).project(cam); const x = (tmp.x * .5 + .5) * rect.w, y = (-tmp.y * .5 + .5) * rect.h, o = OFFS[c.type] || [0, -70];
      const cx = Math.max(80, Math.min(rect.w - 80, x + o[0])), cy = Math.max(76, Math.min(rect.h - 30, y + o[1]));
      let top = cy; const hgt = d.offsetHeight || 80;
      for (let k = 0; k < 8; k++) { const hit = placed.find((p) => Math.abs(p.x - cx) < 158 && top - hgt < p.y && top > p.y - p.h); if (!hit) break; top = hit.y - hit.h - 4; }
      top = Math.max(hgt + 8, top); placed.push({ x: cx, y: top, h: hgt });
      d.style.opacity = 1; d.style.pointerEvents = "auto"; d.style.left = cx + "px"; d.style.top = top + "px";
      const col = d.classList.contains("fixed") ? "#35e08a" : "#ff6a00"; ln.setAttribute("d", `M${cx},${top} L${x},${y}`); ln.setAttribute("stroke", col); ln.setAttribute("opacity", .85);
    });
  }

  // ------------------------------------------------------------------ main loop
  function frame() {
    if (!running) return; requestAnimationFrame(frame);
    const dt = Math.min(.05, clock.getDelta()); if (!S.paused) S.day = (S.day + dt / DAY) % 1; const hour = S.day * 24;
    const w = box.clientWidth, h = box.clientHeight; if (!w || !h) return;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    const views = S.mode === "compare" ? [[W.A, 0, S.partsA], [W.B, 1, S.partsB]] : S.mode === "after" ? [[W.B, 0, S.partsB]] : [[W.A, 0, S.partsA]];
    const n = views.length, vw = w / n; cam.aspect = vw / h; cam.fov = n === 2 ? 44 : 34; cam.updateProjectionMatrix();
    if (!drag && !S.focus) orbit.az += dt * .012;
    const ce = Math.cos(orbit.el); cam.position.set(orbit.tx + Math.sin(orbit.az) * ce * orbit.dist, orbit.ty + Math.sin(orbit.el) * orbit.dist, orbit.tz + Math.cos(orbit.az) * ce * orbit.dist); cam.lookAt(orbit.tx, orbit.ty, orbit.tz);
    if (dust) { dust.rotation.y += dt * .01; }
    renderer.setScissorTest(true);
    views.forEach(([sc, i, parts]) => { if (!sc) return; animate(sc, hour, dt, parts); renderer.setViewport(i * vw, 0, vw, h); renderer.setScissor(i * vw, 0, vw, h); renderer.render(sc.sc, cam); });
    const now = performance.now();
    if (S.mode !== "compare" && views[0][0]) {
      const wv = views[0][0], parts = views[0][2];
      if (now - lastDom > 250) { fillCallouts(wv, parts, hour); lastDom = now; }
      placeCallouts(wv, { w, h }); leadersEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
    if (onFrame) onFrame({ hour, partsA: S.partsA, partsB: S.partsB, hourA: S.hourA, hourB: S.hourB, mode: S.mode, focus: S.focus });
  }
  let assemble = false, holdUntil = 0, pending = null, pendTimer = null;
  function assembleIn(w) {
    if (!w || !window.gsap) return; const parts = []; w.sc.traverse((o) => { if (o.isMesh && o.userData.part && !o.userData.static) parts.push(o); });
    parts.sort((a, b) => (a.getWorldPosition(new T.Vector3()).x + a.getWorldPosition(new T.Vector3()).z * .3) - (b.getWorldPosition(new T.Vector3()).x + b.getWorldPosition(new T.Vector3()).z * .3));
    parts.forEach((m, i) => { const s = m.scale.clone(); m.scale.setScalar(.001); gsap.to(m.scale, { x: s.x, y: s.y, z: s.z, duration: .55, delay: .15 + i * .022, ease: "back.out(1.6)" }); });
    Object.values(w.fills).forEach((f) => { const o = f.material.opacity; f.material.opacity = 0; gsap.to(f.material, { opacity: o, duration: 1, delay: .6 }); });
  }
  function rebuild() {
    disposeW(W.A); disposeW(W.B); W.A = S.specA ? build(S.specA, false) : null; W.B = S.specB ? build(S.specB, true) : null;
    if (assemble && S.specA && S.specA.components.length) { assemble = false; holdUntil = performance.now() + 2300; assembleIn(W.A); assembleIn(W.B); }
    buildCallouts(S.mode === "after" ? S.specB : S.specA);
  }
  const api = {
    init(el, calloutsDiv, leaders) {
      box = el; calloutsEl = calloutsDiv; leadersEl = leaders; canvas = document.createElement("canvas"); box.appendChild(canvas);
      renderer = new T.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); cam = new T.PerspectiveCamera(34, 1, .5, 400); clock = new T.Clock();
      const n = 260, g = new T.BufferGeometry(), p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - .5) * 70; p[i * 3 + 1] = Math.random() * 22; p[i * 3 + 2] = (Math.random() - .5) * 50; }
      g.setAttribute("position", new T.BufferAttribute(p, 3)); dust = new T.Points(g, new T.PointsMaterial({ color: 0x9aa4ad, size: .09, transparent: true, opacity: .45, depthWrite: false }));
      box.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; box.setPointerCapture(e.pointerId); });
      box.addEventListener("pointermove", (e) => { if (!drag) return; orbit.az -= (e.clientX - drag.x) * .006; orbit.el = Math.min(1.25, Math.max(.2, orbit.el + (e.clientY - drag.y) * .004)); drag = { x: e.clientX, y: e.clientY }; });
      box.addEventListener("pointerup", () => { drag = null; });
      box.addEventListener("wheel", (e) => { e.preventDefault(); orbit.dist = Math.min(80, Math.max(8, orbit.dist * (e.deltaY > 0 ? 1.07 : 1 / 1.07))); }, { passive: false });
    },
    start() { if (!running) { running = true; clock.getDelta(); frame(); } }, stop() { running = false; },
    setSpecs(...args) {   // while machines are assembling, later updates wait so the animation is not reset
      const now = performance.now(); if (now < holdUntil) { pending = args; clearTimeout(pendTimer); pendTimer = setTimeout(() => { const p = pending; pending = null; if (p) api.setSpecsNow(...p); }, holdUntil - now + 60); return; }
      api.setSpecsNow(...args);
    },
    setSpecsNow(a, b, pa, pb, ha, hb) { S.specA = a; S.specB = b || a; S.partsA = pa || S.partsA; S.partsB = pb || pa || S.partsB; S.hourA = ha || S.hourA; S.hourB = hb || ha || S.hourB; rebuild(); },
    expectAssemble() { assemble = true; }, setTheme(light) { LIGHT = !!light; rebuild(); }, setMode(m) { S.mode = m; rebuild(); }, togglePause() { S.paused = !S.paused; return S.paused; },
    focus(id) {
      S.focus = id; const w = S.mode === "after" ? W.B : W.A;
      const to = id && w && w.anchors[id] ? { tx: w.anchors[id].x, ty: Math.min(2.5, w.anchors[id].y * .6), tz: w.anchors[id].z, dist: 15, el: .42 } : { tx: 0, ty: 1.2, tz: 0, dist: 46, el: .5 };
      if (window.gsap) gsap.to(orbit, { ...to, duration: 1.3, ease: "power2.inOut" }); else Object.assign(orbit, to);
      if (onFocus) onFocus(id);
    },
    onFrame(f) { onFrame = f; }, onFocus(f) { onFocus = f; }, getSpec() { return S.mode === "after" ? S.specB : S.specA; }, get mode() { return S.mode; }, get focused() { return S.focus; },
    scene() { return (S.mode === "after" ? W.B : W.A); },
  };
  return api;
})();
