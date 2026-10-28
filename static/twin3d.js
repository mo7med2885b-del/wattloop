/* Live 3D energy twin: two plants side by side (now vs after verified fixes) sharing one accelerated day. */
window.Twin3D = (function () {
  const T = THREE;
  let renderer, cam, clock, wrap, canvas, hud, running = false;
  let A = null, B = null, specA = null, specB = null, hourlyA = [], hourlyB = [];
  let dayT = 6 / 24, DAY_SECONDS = 28, orbit = { az: 0.55, el: 0.34, dist: 21 }, drag = null;
  const kwhOf = (h) => (h && h.length ? h.reduce((a, b) => a + b, 0) : 0);

  function label(text, color = "#cfeff0") {
    const c = document.createElement("canvas"); c.width = 512; c.height = 96; const g = c.getContext("2d");
    g.fillStyle = "rgba(6,26,32,.78)"; g.fillRect(0, 0, 512, 96); g.strokeStyle = "rgba(120,200,210,.5)"; g.strokeRect(1, 1, 510, 94);
    g.fillStyle = color; g.font = "600 34px system-ui,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 256, 50);
    const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, depthTest: false }));
    s.scale.set(5.2, 0.98, 1); s.renderOrder = 10; return s;
  }
  const mat = (c, e) => new T.MeshStandardMaterial({ color: c, roughness: .6, metalness: .25, emissive: e || 0x000000 });

  function build(spec) {
    const sc = new T.Scene(); const w = { sc, parts: {}, spec, tmp: [] };
    sc.fog = new T.Fog(0x04121a, 60, 140);
    const amb = new T.AmbientLight(0xffffff, .5); sc.add(amb); w.amb = amb;
    const sun = new T.DirectionalLight(0xfff0d0, .9); sun.position.set(-8, 14, 10); sc.add(sun); w.sun = sun;
    const floor = new T.Mesh(new T.PlaneGeometry(26, 16), mat(0x4a5a60)); floor.rotation.x = -Math.PI / 2; sc.add(floor);
    const grid = new T.GridHelper(26, 26, 0x2c5560, 0x2c5560); grid.position.y = .01; sc.add(grid);
    const wall = new T.Mesh(new T.BoxGeometry(26, 8, .4), mat(0x2d4a52)); wall.position.set(0, 4, -8); sc.add(wall);
    const roof = new T.Mesh(new T.BoxGeometry(26, .3, 16), mat(0x24373d)); roof.position.y = 8.2; roof.material.transparent = true; roof.material.opacity = .18; sc.add(roof);
    const byType = (t) => spec.components.filter((c) => c.type === t);

    // lights (a row of tubes)
    w.lights = []; const L = byType("lighting")[0];
    for (let i = 0; i < 6; i++) { const m = new T.Mesh(new T.BoxGeometry(3.4, .14, .5), mat(0xffffee, 0x000000)); m.position.set(-10 + i * 4, 7.6, i % 2 ? -2 : 3); sc.add(m); w.lights.push(m); }
    if (L) { const s = label(L.led ? "LED lighting" + (L.controls ? " + controls" : "") : "Fluorescent lighting", L.led ? "#7ef0b8" : "#ffd9a0"); s.position.set(-4, 8.7, 0); sc.add(s); }

    // pumps
    w.pumps = []; const P = byType("pump")[0];
    if (P) {
      for (let i = 0; i < Math.min(3, P.count); i++) {
        const g = new T.Group(); g.position.set(-9 + i * 3.1, 0, 3.5);
        g.add(new T.Mesh(new T.BoxGeometry(2.4, .3, 1.6), mat(0x55646b)));
        const motor = new T.Mesh(new T.CylinderGeometry(.62, .62, 1.7, 24), mat(P.vsd ? 0x1faa6a : 0x2f6fd0)); motor.rotation.z = Math.PI / 2; motor.position.y = .95; g.add(motor);
        const imp = new T.Mesh(new T.CylinderGeometry(.55, .55, .22, 20), mat(0xb8c4c8)); imp.rotation.z = Math.PI / 2; imp.position.set(1.15, .95, 0); g.add(imp);
        const fins = new T.Mesh(new T.BoxGeometry(.06, 1.0, .12), mat(0x23333a)); fins.position.set(1.15, .95, 0); g.add(fins); w.pumps.push({ imp, fins, motor });
        const valve = new T.Mesh(new T.TorusGeometry(.26, .06, 8, 18), mat(P.vsd ? 0x2ad080 : 0xd93a3a, P.vsd ? 0x0a3a20 : 0x4a0808)); valve.position.set(1.7, 1.55, 0); valve.rotation.y = Math.PI / 2; g.add(valve); w.pumps[i].valve = valve;
        sc.add(g);
      }
      const s = label(P.vsd ? "Pumps: variable-speed drive" : "Pumps: valve throttled", P.vsd ? "#7ef0b8" : "#ff9a8a"); s.position.set(-6.5, 3.7, 3.5); sc.add(s);
    }

    // compressor + leaks
    const C = byType("compressor")[0]; w.leaks = null;
    if (C) {
      const g = new T.Group(); g.position.set(2.5, 0, 3.2);
      const body = new T.Mesh(new T.BoxGeometry(2.4, 1.9, 1.6), mat(0xe0b020)); body.position.y = 1; g.add(body);
      const tank = new T.Mesh(new T.CylinderGeometry(.7, .7, 3, 24), mat(0x8f9aa0)); tank.rotation.z = Math.PI / 2; tank.position.set(3, .9, 0); g.add(tank);
      sc.add(g); w.comp = body;
      const n = 90; const geo = new T.BufferGeometry(); const pos = new Float32Array(n * 3); const ph = new Float32Array(n);
      for (let i = 0; i < n; i++) ph[i] = Math.random();
      geo.setAttribute("position", new T.BufferAttribute(pos, 3));
      const pts = new T.Points(geo, new T.PointsMaterial({ color: 0xcfe8ff, size: .22, transparent: true, opacity: .8, depthWrite: false })); pts.frustumCulled = false; sc.add(pts);
      w.leaks = { pts, ph, n, base: [[3.4, 1.9, 3.2], [5.9, 1.6, 3.4], [2.4, 1.2, 4.2]], frac: C.leak };
      const s = label(C.leak > 0.07 ? `Compressor: leaks ${Math.round(C.leak * 100)}% of capacity` : `Compressor: leaks fixed (${Math.round(C.leak * 100)}%)`, C.leak > 0.07 ? "#ff9a8a" : "#7ef0b8"); s.position.set(4.3, 3.7, 3.2); sc.add(s);
    }

    // conveyor (motors)
    const M = byType("motors")[0]; w.boxes = [];
    if (M) {
      const belt = new T.Mesh(new T.BoxGeometry(14, .35, 1.7), mat(0x20282b)); belt.position.set(-2, 1.0, -2.2); sc.add(belt);
      for (let i = 0; i < 6; i++) { const b = new T.Mesh(new T.BoxGeometry(.9, .7, .9), mat(0xc79a5a)); b.position.set(-9 + i * 2.3, 1.55, -2.2); sc.add(b); w.boxes.push(b); }
      const mot = new T.Mesh(new T.CylinderGeometry(.5, .5, 1.1, 18), mat(0x3a8f6a)); mot.rotation.z = Math.PI / 2; mot.position.set(5.6, .8, -2.2); sc.add(mot);
      const s = label("Conveyors and mixers", "#cfeff0"); s.position.set(-2, 3.3, -2.2); sc.add(s);
    }

    // HVAC
    const H = byType("hvac")[0]; w.fan = null;
    if (H) {
      const unit = new T.Mesh(new T.BoxGeometry(3.2, 1.2, .8), mat(0xe6ecee)); unit.position.set(8.2, 5.3, -7.4); sc.add(unit);
      const fan = new T.Mesh(new T.CircleGeometry(.4, 16), mat(0x78909c)); fan.position.set(8.2, 5.3, -6.98); sc.add(fan); w.fan = fan;
      const s = label(`Cooling set to ${H.setpoint_c.toFixed(0)} °C`, H.setpoint_c >= 24 ? "#7ef0b8" : "#ffd9a0"); s.position.set(8.2, 6.7, -7.2); sc.add(s);
    }

    // standby LEDs
    const S = byType("standby")[0]; w.stby = null;
    if (S) {
      const box = new T.Mesh(new T.BoxGeometry(1.6, 1.6, 1.2), mat(0x59656b)); box.position.set(-11, .8, -2.2); sc.add(box);
      const led = new T.Mesh(new T.SphereGeometry(.14, 10, 10), mat(0xff3030, 0xff2020)); led.position.set(-10.2, 1.4, -1.6); sc.add(led); w.stby = { led, off: !!S.auto_off };
      const s = label(S.auto_off ? "Standby: auto shut-down" : "Idle machine left on", S.auto_off ? "#7ef0b8" : "#ff9a8a"); s.position.set(-11, 2.8, -2.2); sc.add(s);
    }

    // PV
    const V = byType("pv")[0]; w.pv = [];
    if (V) {
      const cnt = Math.min(14, Math.max(3, Math.round(V.kwp / 4)));
      for (let i = 0; i < cnt; i++) { const p = new T.Mesh(new T.BoxGeometry(1.8, .08, 1.1), mat(0x1c3f8f, 0x061a44)); p.position.set(-10 + (i % 7) * 3.1, 8.55, -3 + Math.floor(i / 7) * 3.2); p.rotation.x = -.25; sc.add(p); w.pv.push(p); }
      const s = label(`Rooftop solar ${V.kwp.toFixed(0)} kWp`, "#ffe27a"); s.position.set(-1, 9.8, 0); sc.add(s);
    }
    // sky dome colour via background
    sc.background = new T.Color(0x07161c);
    return w;
  }

  function active(c, hour, shift) {
    const k = hour - shift.start; return hour >= shift.start && hour < shift.end && k < (c.hours || 24);
  }

  function update(w, hour, dt, spec) {
    const sh = spec.shift, t = performance.now() / 1000;
    const day = hour >= 6 && hour < 18; const sunk = day ? Math.sin((hour - 6) / 12 * Math.PI) : 0;
    w.amb.intensity = .55 + .45 * sunk; w.sun.intensity = .25 + .9 * sunk;
    w.sc.background.setRGB(.04 + .25 * sunk, .1 + .38 * sunk, .15 + .5 * sunk);
    const comp = (ty) => spec.components.find((c) => c.type === ty);
    const L = comp("lighting"), P = comp("pump"), C = comp("compressor"), M = comp("motors"), H = comp("hvac");
    // lights on: during shift, or after-hours waste if no controls
    let lightOn = false;
    if (L) { lightOn = active(L, hour, sh); if (!lightOn && !L.controls && L.after_hours_h > 0) { const past = ((hour - sh.end) + 24) % 24; lightOn = past < L.after_hours_h; } }
    w.lights.forEach((m) => { m.material.emissive.setHex(lightOn ? (L.led ? 0xeaffff : 0xfff0b0) : 0x000000); m.material.emissiveIntensity = lightOn ? (L.led ? .9 : 1.5) : 0; });
    if (P) { const on = active(P, hour, sh); const sp = on ? (P.vsd ? .4 + 5 * P.flow_demand : 9) : 0; w.pumps.forEach((p) => { p.imp.rotation.x += sp * dt; p.valve.scale.setScalar(!P.vsd && on ? .75 + .1 * Math.sin(t * 6) : 1); p.valve.material.emissiveIntensity = !P.vsd && on ? 1 : .2; }); }
    if (w.leaks) {
      const on = C && active(C, hour, sh); const fr = C ? C.leak : 0; const lk = w.leaks; const p = lk.pts.geometry.attributes.position.array;
      for (let i = 0; i < lk.n; i++) { lk.ph[i] = (lk.ph[i] + dt * (.5 + (i % 5) * .15)) % 1; const f = lk.ph[i]; const b = lk.base[i % lk.base.length]; const vis = on && (i / lk.n) < Math.min(1, fr * 4);
        p[i * 3] = vis ? b[0] + Math.sin(i * 7.1) * f * 1.4 : 0; p[i * 3 + 1] = vis ? b[1] + f * 2.4 : -50; p[i * 3 + 2] = vis ? b[2] + Math.cos(i * 3.3) * f * 1.4 : 0; }
      lk.pts.geometry.attributes.position.needsUpdate = true;
    }
    if (M && w.boxes.length) { const on = active(M, hour, sh); const sp = on ? 1.2 * M.load_factor + .5 : 0; w.boxes.forEach((b) => { b.position.x += sp * dt; if (b.position.x > 5) b.position.x = -9; }); }
    if (w.fan) { const on = H && active(H, hour, sh); w.fan.rotation.z += (on ? 8 : 0) * dt; }
    if (w.stby) { const out = !(hour >= sh.start && hour < sh.end); const lit = out && !w.stby.off ? (Math.sin(t * 4) > 0 ? 3 : .6) : 0; w.stby.led.material.emissiveIntensity = lit; w.stby.led.visible = true; w.stby.led.material.color.setHex(lit ? 0xff3030 : 0x303030); }
    w.pv.forEach((p) => { p.material.emissiveIntensity = .3 + 1.6 * sunk; });
  }

  function setSpecs(a, b, ha, hb) {
    if (a) { specA = a; if (A) disposeScene(A); A = build(a); hourlyA = ha || hourlyA; }
    if (b || a) { specB = b || a; if (B) disposeScene(B); B = build(specB); hourlyB = hb || ha || hourlyB; }
  }
  function disposeScene(w) { w.sc.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); } }); }

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(.05, clock.getDelta()); dayT = (dayT + dt / DAY_SECONDS) % 1; const hour = dayT * 24;
    const w = wrap.clientWidth, h = wrap.clientHeight; if (canvas.width !== w * devicePixelRatio || canvas.height !== h * devicePixelRatio) { renderer.setSize(w, h, false); }
    const hh = h / 2; cam.aspect = w / hh; cam.updateProjectionMatrix();
    const ex = Math.cos(orbit.el) * orbit.dist; cam.position.set(Math.sin(orbit.az) * ex, Math.sin(orbit.el) * orbit.dist + 1, Math.cos(orbit.az) * ex); cam.lookAt(-1, 2.6, 0);
    renderer.setScissorTest(true); renderer.setClearColor(0x06141a);
    if (!drag) orbit.az += dt * .04;
    [[A, specA, 0], [B, specB, 1]].forEach(([sc, sp, i]) => {
      if (!sc) return; update(sc, hour, dt, sp);
      const y0 = i === 0 ? hh : 0; renderer.setViewport(0, y0, w, hh); renderer.setScissor(0, y0, w, hh); renderer.render(sc.sc, cam);
    });
    const hi = Math.floor(hour), now = (arr) => (arr && arr.length ? arr[hi] : 0);
    const dA = kwhOf(hourlyA), dB = kwhOf(hourlyB);
    hud.querySelector("#tw-clock").textContent = String(hi).padStart(2, "0") + ":" + String(Math.floor((hour % 1) * 60)).padStart(2, "0");
    hud.querySelector("#tw-a").textContent = `${now(hourlyA).toFixed(0)} kW now · ${dA.toFixed(0)} kWh/day`;
    hud.querySelector("#tw-b").textContent = `${now(hourlyB).toFixed(0)} kW now · ${dB.toFixed(0)} kWh/day` + (dA > 0 && dB < dA ? `  (−${Math.round((1 - dB / dA) * 100)}%)` : "");
  }

  function init(container) {
    wrap = container; canvas = document.createElement("canvas"); canvas.style.cssText = "width:100%;height:100%;display:block"; wrap.appendChild(canvas);
    renderer = new T.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); cam = new T.PerspectiveCamera(52, 1, .1, 200); clock = new T.Clock();
    hud = document.createElement("div"); hud.className = "tw-hud";
    hud.innerHTML = `<div class="tw-half top"><span class="tw-tag a">NOW · as the bill says</span><span class="tw-read" id="tw-a"></span></div>
      <div class="tw-half bot"><span class="tw-tag b">AFTER · fixes verified in the twin</span><span class="tw-read" id="tw-b"></span></div>
      <span class="tw-clock">day cycle <b id="tw-clock">06:00</b> (accelerated)</span><div class="tw-hint">drag to orbit · scroll to zoom · same day in both</div>`;
    wrap.appendChild(hud);
    wrap.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; wrap.setPointerCapture(e.pointerId); });
    wrap.addEventListener("pointermove", (e) => { if (!drag) return; orbit.az -= (e.clientX - drag.x) * .006; orbit.el = Math.min(1.2, Math.max(.12, orbit.el + (e.clientY - drag.y) * .004)); drag = { x: e.clientX, y: e.clientY }; });
    wrap.addEventListener("pointerup", () => { drag = null; });
    wrap.addEventListener("wheel", (e) => { e.preventDefault(); orbit.dist = Math.min(80, Math.max(14, orbit.dist + e.deltaY * .02)); }, { passive: false });
  }
  function start() { if (running) return; running = true; clock.getDelta(); frame(); }
  function stop() { running = false; }
  return { init, start, stop, setSpecs, setHourly(a, b) { if (a) hourlyA = a; if (b) hourlyB = b; } };
})();
