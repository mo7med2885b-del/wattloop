"use strict";
/* Small animated agent icons. Each returns { idle(), think(on), done() }. Transform / stroke motion only; reduced motion keeps them still. */
const WFIcons = (() => {
  const NS = "http://www.w3.org/2000/svg", hasG = typeof gsap !== "undefined";
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const el = (t, a, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.append(e); return e; };
  const path = (d, cls, p, x = {}) => el("path", { d, class: "wfi " + cls, ...x }, p);
  const anchor = (p) => el("circle", { r: 12, fill: "none", stroke: "none", "pointer-events": "none" }, p);
  const loop = (state, targets, vars, speed) => { state.tw && state.tw.forEach((t) => t.kill()); state.tw = []; if (!hasG || reduce) return; state.tw = [gsap.to(targets, { ...vars, svgOrigin: "0 0", duration: speed, ease: "sine.inOut", yoyo: true, repeat: -1 })]; };
  const pop = (t) => { if (hasG && !reduce) gsap.fromTo(t, { scale: 1.3 }, { scale: 1, duration: .5, ease: "back.out(2)", svgOrigin: "0 0" }); };
  const make = {
    vision(g) { const s = {}; path("M-11,0 C-6,-8 6,-8 11,0 C6,8 -6,8 -11,0 Z", "s", g); const ir = el("circle", { r: 3.6, class: "wfi a", fill: "rgba(255,160,70,.15)" }, g); const pu = el("circle", { r: 1.5, class: "wfi-f" }, g);
      const run = (sp, amp) => loop(s, [ir, pu], { x: amp }, sp); return { idle: () => run(1.8, 3), think: (on) => run(on ? .5 : 1.8, on ? 4 : 3), done: () => pop(ir) }; },
    segment(g) { const s = {}; [["M-10,-5 L-10,-10 L-5,-10", ""], ["M10,-5 L10,-10 L5,-10", ""], ["M-10,5 L-10,10 L-5,10", ""], ["M10,5 L10,10 L5,10", ""]].forEach(([d]) => path(d, "s", g));
      const sc = path("M-8,0 L8,0", "a", g); const run = (sp) => loop(s, sc, { y: 7 }, sp); sc.setAttribute("transform", "translate(0,-7)"); return { idle: () => run(1.6), think: (on) => run(on ? .45 : 1.6), done: () => pop(g) }; },
    engineer(g) { const s = {}; const c = el("g", {}, g); anchor(c); path("M0,-10 L9,-5 L9,5 L0,10 L-9,5 L-9,-5 Z", "s", c); path("M0,-10 L0,0 L9,5 M0,0 L-9,5", "a", c);
      const run = (sp) => loop(s, c, { rotation: 8 }, sp); return { idle: () => run(2.2), think: (on) => run(on ? .5 : 2.2), done: () => pop(c) }; },
    calibrate(g) { const s = {}; path("M-10,5 A10,10 0 1 1 10,5", "s", g); const nd = el("g", {}, g); anchor(nd); path("M0,3 L5,-6", "a", nd); el("circle", { r: 1.8, class: "wfi-f", cy: 3 }, nd);
      const run = (sp, amp) => { s.tw && s.tw.forEach((t) => t.kill()); if (!hasG || reduce) return; s.tw = [gsap.fromTo(nd, { rotation: -amp }, { rotation: amp, duration: sp, ease: "sine.inOut", yoyo: true, repeat: -1, svgOrigin: "0 3" })]; };
      return { idle: () => run(1.8, 35), think: (on) => run(on ? .4 : 1.8, on ? 60 : 35), done: () => pop(nd) }; },
    hunt(g) { const s = {}; const l = el("g", {}, g); anchor(l); el("circle", { cx: -2, cy: -2, r: 6.5, class: "wfi s", fill: "rgba(255,160,70,.08)" }, l); path("M3,3 L10,10", "s", l, { "stroke-width": 2.4 }); path("M-3,0 L-1,-4 L1,0 L3,-3", "a", l);
      const run = (sp, amp) => loop(s, l, { x: amp, y: -amp * .6 }, sp); return { idle: () => run(2.2, 1.4), think: (on) => run(on ? .6 : 2.2, on ? 3 : 1.4), done: () => pop(l) }; },
    verify(g) { const s = {}; const sh = el("g", {}, g); anchor(sh); path("M0,-11 L9,-7 L9,2 C9,7 4,10 0,12 C-4,10 -9,7 -9,2 L-9,-7 Z", "s", sh); const ck = path("M-4,0 L-1,3 L5,-4", "a", sh, { pathLength: 1, "stroke-dasharray": 1 });
      const run = (sp) => { s.tw && s.tw.forEach((t) => t.kill()); if (!hasG || reduce) return; s.tw = [gsap.fromTo(ck, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: sp, ease: "power2.out", repeat: -1, repeatDelay: sp * 1.4 })]; };
      return { idle: () => run(.9), think: (on) => run(on ? .35 : .9), done: () => { s.tw && s.tw.forEach((t) => t.kill()); if (hasG) gsap.set(ck, { strokeDashoffset: 0 }); pop(sh); } }; },
    critic(g) { const s = {}; const a = el("g", {}, g), b = el("g", {}, g); anchor(a); anchor(b); path("M-9,-9 L9,9 M-9,-9 L-9,-5 M-9,-9 L-5,-9", "s", a); path("M9,-9 L-9,9 M9,-9 L9,-5 M9,-9 L5,-9", "a", b);
      const run = (sp, amp) => loop(s, [a, b], { rotation: amp }, sp); return { idle: () => run(1.6, 6), think: (on) => run(on ? .4 : 1.6, on ? 14 : 6), done: () => pop(g) }; },
    report(g) { const s = {}; path("M-7,-10 L4,-10 L8,-6 L8,10 L-7,10 Z", "s", g); const ls = [path("M-3,-2 L4,-2", "a", g, { pathLength: 1, "stroke-dasharray": 1 }), path("M-3,2 L4,2", "a", g, { pathLength: 1, "stroke-dasharray": 1 }), path("M-3,6 L1,6", "a", g, { pathLength: 1, "stroke-dasharray": 1 })];
      const run = (sp) => { s.tw && s.tw.forEach((t) => t.kill()); if (!hasG || reduce) return; s.tw = [gsap.fromTo(ls, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: sp, ease: "power2.out", stagger: sp * .3, repeat: -1, repeatDelay: sp }) ]; };
      return { idle: () => run(.8), think: (on) => run(on ? .3 : .8), done: () => { s.tw && s.tw.forEach((t) => t.kill()); if (hasG) gsap.set(ls, { strokeDashoffset: 0 }); pop(g); } }; },
    gate(g) { const s = {}; const h = el("g", {}, g); anchor(h); path("M-9,3 C-9,-8 9,-8 9,3 Z M-11,3 L11,3 M0,-9 L0,-3", "s", h); path("M-5,8 L-1,11 L6,5", "a", h);
      const run = (sp) => loop(s, h, { y: -1.2 }, sp); return { idle: () => run(1.8), think: (on) => run(on ? .6 : 1.8), done: () => pop(h) }; },
    cog(g) { const s = {}; const c = el("g", {}, g); anchor(c); path("M0,-9 L2,-9 L3,-6 L6,-7 L7,-5 L5,-3 L7,0 L5,2 L7,5 L6,7 L3,6 L2,9 L-2,9 L-3,6 L-6,7 L-7,5 L-5,2 L-7,0 L-5,-3 L-7,-5 L-6,-7 L-3,-6 L-2,-9 Z", "s", c); el("circle", { r: 2.6, class: "wfi a" }, c);
      const run = (sp) => { s.tw && s.tw.forEach((t) => t.kill()); if (!hasG || reduce) return; s.tw = [gsap.to(c, { rotation: 360, svgOrigin: "0 0", duration: sp, ease: "none", repeat: -1 })]; }; return { idle: () => run(14), think: (on) => run(on ? 2.5 : 14), done: () => pop(c) }; },
  };
  return { make(name, parent) { const g = el("g", { class: "wf-ic" }, parent); return (make[name] || make.cog)(g); } };
})();
