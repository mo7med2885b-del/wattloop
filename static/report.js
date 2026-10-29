"use strict";
/* PDF report: 3D snapshots, what is wrong, what it costs, what to fix and when. Built in the browser with jsPDF. All figures come from the run's verified result. */
const Report = (() => {
  const OR = [255, 106, 0], DK = [24, 27, 31], GR = [16, 152, 90], MUT = [95, 103, 112];
  const f0 = (n) => Math.round(+n || 0).toLocaleString("en-US"), f1 = (n) => (+n || 0).toFixed(1);
  const ascii = (s) => String(s == null ? "" : s).replace(/[‒-―]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/×/g, "x").replace(/[^\x20-\x7e°\n]/g, "");

  function imgToDataUrl(src, max = 900) {
    return new Promise((res) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); res({ url: c.toDataURL("image/jpeg", .85), w: c.width, h: c.height }); }; im.onerror = () => res(null); im.src = src; });
  }
  const probName = (f) => ({ vsd_pump: "Throttled pumps", repair_leaks: "Compressed-air leaks", led_retrofit: "Inefficient lighting", lighting_controls: "Lights on after hours", hvac_setpoint: "Over-cooling", standby_shutdown: "Idle machines left on", solar_pv: "Unused daytime solar potential" }[f.type] || f.type);
  const fixName = (f) => ({ vsd_pump: "Variable-speed drive on pumps", repair_leaks: "Repair compressed-air leaks", led_retrofit: "LED lighting retrofit", lighting_controls: "Lighting controls (after-hours off)", hvac_setpoint: "Raise cooling setpoint", standby_shutdown: "Auto shut-down of idle machines", solar_pv: "Rooftop solar PV" }[f.type] || f.type.replace(/_/g, " "));
  function problem(f, spec) {
    const c = (id) => (spec.components || []).find((x) => x.id === f.target) || {};
    const k = c();
    switch (f.type) {
      case "vsd_pump": return `Pumps run at full speed while a half-closed valve throttles the flow (flow demand ${Math.round((k.flow_demand || 0) * 100)}%). The motor burns the difference as heat. A drive matches speed to demand.`;
      case "repair_leaks": return `About ${Math.round((k.leak || 0) * 100)}% of the compressor's capacity is lost to leaks. The machine runs all day to replace air that escapes. Target after repair: ${Math.round((f.target_leak || 0.05) * 100)}%.`;
      case "led_retrofit": return `Old ${(k.legacy || "t8").toUpperCase()} fluorescent lighting draws about ${Math.round(1 / (({ t8: .65, t12: .49, metal_halide: .32 })[k.legacy || "t8"]) * 100 - 100)}% more power than LED for the same job.`;
      case "lighting_controls": return `Lights stay on about ${k.after_hours_h || 0} hours after closing. Controls switch them off when nobody is working.`;
      case "hvac_setpoint": return `Cooling is set to ${f1(k.setpoint_c)} C. Each degree of setpoint changes cooling energy by roughly 6% (published range 4.5 to 10%). Proposed: ${f1(f.setpoint_c)} C, within the 26 C limit.`;
      case "standby_shutdown": return `Idle equipment (about ${f1(k.kw)} kW) is left on overnight and on rest days. Auto shut-down removes this base load.`;
      case "solar_pv": return `Daytime load is high and steady, so a ${f1(f.kwp)} kWp array can be used on site (no export credit assumed).`;
      default: return "";
    }
  }
  function when(d) {
    const pb = d.payback_months;
    if (d.capex_egp <= 10000 || pb === 0) return ["1 - This week", "no or very low cost"];
    if (pb != null && pb <= 6) return ["2 - This month", "pays back within 6 months"];
    if (pb != null && pb <= 18) return ["3 - Next 3 months", "pays back within 18 months"];
    return ["4 - Plan within 12 months", "longer payback: get supplier quotes"];
  }

  async function download({ result, specBefore, billKwh, caseName }) {
    if (!result) return;
    const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: "mm", format: "a4" }), W = 210, M = 14; let y = 0;
    const e = result.evaluation, tariff = (result.params || {}).tariff_egp_per_kwh || 0.10, co2f = (result.params || {}).grid_kgco2_per_kwh || 0.45;
    const base = e.base_kwh_month, after = e.new_kwh_month, monthNow = (billKwh || base) * tariff, monthAfter = after * tariff * ((billKwh || base) / base);
    const logo = await imgToDataUrl("/static/assets/logo.png", 128), photo = await imgToDataUrl($("#photo").src, 900);
    const snapNow = Factory.snapshot("now"), snapAfter = Factory.snapshot("after");
    const head = (title) => { doc.setFillColor(...DK); doc.rect(0, 0, W, 20, "F"); if (logo) doc.addImage(logo.url, "JPEG", M, 4, 12, 12); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("WattLoop", M + 15, 10.5); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(ascii(title), M + 15, 15.5); doc.setTextColor(255, 255, 255); doc.text(new Date().toLocaleDateString("en-GB"), W - M, 10.5, { align: "right" }); doc.setFillColor(...OR); doc.rect(0, 20, W, 1.2, "F"); doc.setTextColor(20, 20, 20); y = 28; };
    const h2 = (t) => { doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(...DK); doc.text(ascii(t), M, y); doc.setDrawColor(...OR); doc.setLineWidth(.5); doc.line(M, y + 1.5, M + 18, y + 1.5); y += 7; doc.setFont("helvetica", "normal"); };
    const para = (t, size = 9, color = [40, 40, 40]) => { doc.setFontSize(size); doc.setTextColor(...color); const lines = doc.splitTextToSize(ascii(t), W - 2 * M); doc.text(lines, M, y); y += lines.length * (size * .43) + 2; };

    // ---------------- page 1: summary + images
    head("Energy audit report - screening estimate from a digital twin");
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...DK); doc.text(ascii(caseName), M, y); y += 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...OR); doc.text("REQUIRES ENGINEER REVIEW - simulated estimates, not measurements", M, y); y += 6;
    const tiles = [["Today", `${f0(billKwh || base)} kWh/month`, `${f0(monthNow)} USD/month`], ["After fixes (simulated)", `${f0(after * (billKwh || base) / base)} kWh/month`, `${f0(monthAfter)} USD/month`], ["Saving", `${f0(e.saved_egp_year)} USD/year`, `${f0(e.saved_kwh_month)} kWh/month`], ["Investment / payback", `${f0(e.capex_egp)} USD (estimate)`, e.payback_months != null ? `${f1(e.payback_months)} months` : "n/a"]];
    const tw = (W - 2 * M - 9) / 4; tiles.forEach((t, i) => { const x = M + i * (tw + 3); doc.setFillColor(245, 246, 247); doc.rect(x, y, tw, 20, "F"); doc.setFillColor(...(i === 2 ? GR : OR)); doc.rect(x, y, 1.3, 20, "F"); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUT); doc.text(ascii(t[0]), x + 3.5, y + 5); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...DK); doc.text(ascii(t[1]), x + 3.5, y + 11.5); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUT); doc.text(ascii(t[2]), x + 3.5, y + 16.5); });
    y += 25;
    para(`${result.summary}`, 9);
    const range = result.arbiter.range_egp_year;
    para(`Confidence: ${result.arbiter.level} (${result.arbiter.confidence_score}). Saving range with the evidence-based assumption sets: ${f0(range[0])} to ${f0(range[1])} USD per year. Avoided emissions about ${f1(e.co2_t_year)} tonnes CO2 per year (grid factor ${co2f} kg/kWh).`, 8.5, MUT);
    if (result.arbiter.data_basis_text) para(`Confidence basis: ${result.arbiter.data_basis_text}.` + (result.solar && result.solar.solar_egp_year > 0 ? ` Without solar the saving is ${f0(result.solar.saved_egp_year_no_solar)} USD per year; solar adds ${f0(result.solar.solar_egp_year)} USD per year (capped at 20% of the plant energy).` : ""), 8.5, MUT);
    y += 1; h2("The facility and its digital twin");
    const iw = (W - 2 * M - 6) / 2, ih = iw * 0.58;
    if (photo) { const r = photo.h / photo.w; doc.addImage(photo.url, "JPEG", M, y, iw, Math.min(ih, iw * r)); }
    if (snapNow) doc.addImage(snapNow, "JPEG", M + iw + 6, y, iw, ih);
    doc.setFontSize(7.5); doc.setTextColor(...MUT); doc.text("Facility photo (as provided)", M, y + ih + 4); doc.text("3D twin today: orange outlines mark waste", M + iw + 6, y + ih + 4); y += ih + 9;
    if (snapAfter) { doc.addImage(snapAfter, "JPEG", M, y, iw, ih); doc.text("3D twin after the verified fixes: green outlines mark fixed machines", M, y + ih + 4); }
    doc.setFontSize(8); doc.setTextColor(40, 40, 40);
    const note = doc.splitTextToSize("How to read this: the twin was written by Muse Spark from the photo and description, then calibrated to the monthly bill. A code simulator tested each fix and rejected impractical ones before this plan was produced.", iw);
    doc.text(note, M + iw + 6, y + 6);

    // ---------------- page 2: problems, cost, timing
    doc.addPage(); head("Problems found, what they cost and when to fix them"); h2("1. Problems found (technical issue)");
    const detail = (result.plan_detail || []).slice();
    doc.autoTable({ startY: y, margin: { left: M, right: M }, head: [["Problem", "Technical explanation", "Energy wasted (kWh/month)"]], body: detail.map((d) => [ascii(probName(d.fix)), ascii(problem(d.fix, specBefore || { components: [] })), f0(d.saved_kwh_month)]), styles: { fontSize: 8, cellPadding: 1.8, textColor: [40, 40, 40] }, headStyles: { fillColor: DK, textColor: 255 }, columnStyles: { 0: { cellWidth: 42, fontStyle: "bold" }, 2: { cellWidth: 30, halign: "right" } } });
    y = doc.lastAutoTable.finalY + 7; h2("2. What to fix, what it costs, and when");
    const rows = detail.map((d) => ({ d, w: when(d) })).sort((a, b) => a.w[0].localeCompare(b.w[0]));
    doc.autoTable({ startY: y, margin: { left: M, right: M }, head: [["When", "Fix", "Cost (USD, estimate)", "Saves (USD/year)", "Payback (months)"]], body: rows.map(({ d, w }) => [ascii(w[0] + "\n" + w[1]), ascii(fixName(d.fix)), f0(d.capex_egp), f0(d.saved_egp_year), d.payback_months == null ? "n/a" : f1(d.payback_months)]), styles: { fontSize: 8, cellPadding: 1.8, textColor: [40, 40, 40] }, headStyles: { fillColor: OR, textColor: [20, 10, 0] }, columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } } });
    y = doc.lastAutoTable.finalY + 4;
    para("Each fix is tested on its own in this table; savings overlap when fixes are combined, so the combined total on page 1 is lower than the sum of the rows. Costs are PLACEHOLDER ESTIMATES (status UNVERIFIED: no Egyptian price source was found). Replace them with supplier quotes before any decision.", 8, MUT);
    y += 2; h2("3. Money: what you spend today and after");
    doc.autoTable({ startY: y, margin: { left: M, right: M }, head: [["", "Energy (kWh/month)", "Cost at " + tariff + " USD/kWh (USD/month)", "USD/year"]], body: [["Today (your bill)", f0(billKwh || base), f0(monthNow), f0(monthNow * 12)], ["After the fixes (simulated)", f0(after * (billKwh || base) / base), f0(monthAfter), f0(monthAfter * 12)], ["Difference", f0(e.saved_kwh_month), f0(monthNow - monthAfter), f0(e.saved_egp_year)]], styles: { fontSize: 8.5, cellPadding: 1.8, textColor: [40, 40, 40] }, headStyles: { fillColor: DK, textColor: 255 }, columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } } });
    y = doc.lastAutoTable.finalY + 6;

    // ---------------- page 3: risks, evidence, sign-off
    doc.addPage(); head("Risks, evidence and sign-off"); h2("4. Concerns raised by the Critic agent");
    ((result.critic && result.critic.challenges) || []).slice(0, 5).forEach((c) => para(`- ${c.concern} (${c.severity})`, 8.5));
    para("Always verify on site: baseline load, equipment ratings, installation constraints and the cost quotes.", 8.5, MUT); y += 2;
    h2("5. How reliable are these numbers");
    para("The twin's component formulas were checked against 27 published data points from 8 independent sources (pump test, compressed-air fact sheets and case study, lamp measurements, office HVAC studies). Median error before fitting: 13.6 percent, mean 17.6 percent, worst case 62.5 percent (cooling setpoint savings, which are understated). This is a check against published component data, not a field validation of this plant. Cooling-setpoint savings use the conservative 6 percent per degree, with a 4.5 to 10 percent band.", 8.5);
    para(`Inputs: tariff ${tariff} USD/kWh (high-voltage industry, Arab Finance 2026; medium and low voltage unverified), grid factor ${co2f} kg CO2/kWh (UNFCCC 2019), solar yield from EU JRC PVGIS. Capex values are placeholders. Standby load is a user input.`, 8, MUT);
    para(`Models used: Muse Spark (reading the photo, writing and calibrating the twin, proposing fixes, critique, report), SAM 3.1 (locating equipment in the photo), Muse Image (the demo photo). Run cost: about $${(result.cost_usd || 0).toFixed(3)} for ${result.model_calls || 0} model calls.`, 8, MUT); y += 3;
    h2("6. Engineer sign-off (required before any action)");
    doc.setDrawColor(150, 150, 150); doc.setLineWidth(.2); doc.rect(M, y, W - 2 * M, 34);
    doc.setFontSize(9); doc.setTextColor(40, 40, 40); doc.text("Reviewed by: ________________________________    Date: ________________", M + 4, y + 9);
    doc.text("Decision:    [  ] Approve for site audit      [  ] Modify      [  ] Reject", M + 4, y + 18); doc.text("Notes: _______________________________________________________________________", M + 4, y + 27);
    y += 42; para("This report is a screening estimate produced by software. It supports an engineer's decision; it does not replace a site audit.", 8, MUT);
    const pages = doc.getNumberOfPages(); for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(140, 140, 140); doc.text(`WattLoop energy twin - page ${i} of ${pages}`, W / 2, 291, { align: "center" }); }
    doc.save(`WattLoop-report-${ascii(caseName).replace(/[^A-Za-z0-9]+/g, "-").slice(0, 30)}.pdf`);
  }
  return { download };
})();
