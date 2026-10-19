// Builds report/Dubai_Real_Estate_Report.docx from report/results.json and the figures.
// Run after scripts/analysis.py:   node scripts/build_report.js   (needs: npm install docx)
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, HeadingLevel,
  AlignmentType, WidthType, ShadingType, BorderStyle, LevelFormat, PageBreak, Footer, Header,
  PageNumber, TableOfContents,
} = require("docx");

const ROOT = path.resolve(__dirname, "..");
const R = JSON.parse(fs.readFileSync(path.join(ROOT, "report", "results.json"), "utf8"));
const AUTHOR = "Umair Asif";
const DATE = "19 October 2026";
const NAVY = "16324F", BLUE = "2A78D6", GREY = "52514E";

// ---------- formatting helpers ----------
const n0 = v => Math.round(v).toLocaleString("en-US");
const n1 = v => Number(v).toFixed(1);
const n2 = v => Number(v).toFixed(2);
const aedM = v => "AED " + (v / 1e6).toFixed(2) + "M";
const pfmt = p => p < 0.001 ? "< 0.001" : p.toFixed(3);

// "**bold** plain" -> runs
function runs(text, base = {}) {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(s =>
    s.startsWith("**") ? new TextRun({ ...base, text: s.slice(2, -2), bold: true }) : new TextRun({ ...base, text: s }));
}
const P = (text, opts = {}) => new Paragraph({ children: runs(text, opts.run), spacing: { after: 120, line: 276 }, ...opts.para });
const H1 = t => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = t => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const bullet = t => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: runs(t), spacing: { after: 60 } });
let listNo = 0;
const numbered = items => { const ref = "num" + (++listNo); return items.map(t =>
  new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t), spacing: { after: 80 } })); };
const takeaway = t => new Paragraph({ children: [new TextRun({ text: "Takeaway: ", bold: true, color: NAVY }), ...runs(t)],
  spacing: { before: 60, after: 200 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: BLUE, space: 6 } }, indent: { left: 120 } });
const caption = t => new Paragraph({ children: [new TextRun({ text: t, italics: true, size: 18, color: GREY })], alignment: AlignmentType.CENTER, spacing: { after: 60 } });

function pngSize(file) { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; }
function img(rel, width = 600) {
  const file = path.join(ROOT, rel); const { w, h } = pngSize(file);
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 40 },
    children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width, height: Math.round(width * h / w) } })] });
}

// ---------- tables ----------
const TW = 9026; // A4 text width in DXA with 1" margins
const border = { style: BorderStyle.SINGLE, size: 4, color: "D5D8DC" };
const borders = { top: border, bottom: border, left: border, right: border };
function table(head, rows, widths) {
  const sum = widths.reduce((a, b) => a + b, 0); const cw = widths.map(w => Math.round(w / sum * TW));
  cw[cw.length - 1] += TW - cw.reduce((a, b) => a + b, 0);
  const cell = (t, i, hdr) => new TableCell({ borders, width: { size: cw[i], type: WidthType.DXA },
    shading: hdr ? { fill: NAVY, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: runs(String(t), { size: 18, color: hdr ? "FFFFFF" : undefined, bold: hdr || undefined }) })] });
  return new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: cw,
    rows: [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, i, true)) }),
           ...rows.map(r => new TableRow({ children: r.map((c, i) => cell(c, i, false)) }))] });
}
const gap = () => new Paragraph({ spacing: { after: 120 }, children: [] });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

// ---------- derived numbers ----------
const K = R.kpi, T = R.tests, S = R.sampling;
const yoy = R.yoy_jan_sep, js = R.ppsf_year_jan_sep;
const yA = Object.entries(R.yield_area);
const bud = R.budget_1_5m, jvc = bud.find(b => b.area.includes("JVC")), ds = bud.find(b => b.area === "Dubai South"), bb = bud.find(b => b.area === "Business Bay");
const op = R.offplan_vs_ready_area, opAll = R.offplan_vs_ready_overall;
const opPrem = op.map(r => -r.discount_pct), opMin = Math.min(...opPrem), opMax = Math.max(...opPrem);
const opOverallDisc = (1 - opAll["Off-Plan"] / opAll["Ready"]) * 100;
const c = R.reg2.coef;
const ram = R.ramadan, ramSlow = (1 - ram.tx_per_day_in / ram.tx_per_day_out) * 100;

// ============================================================================
const children = [];

// 1. Title page
children.push(
  new Paragraph({ spacing: { before: 2400 }, children: [new TextRun({ text: "DUBAI REAL ESTATE", size: 28, color: BLUE, bold: true })] }),
  new Paragraph({ children: [new TextRun({ text: "Market Analyzer", size: 64, bold: true, color: NAVY })] }),
  new Paragraph({ spacing: { before: 200, after: 600 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BLUE, space: 8 } },
    children: [new TextRun({ text: "Where to invest, when to buy, and what the risks are. An analysis of 1,800 property sales from January 2023 to September 2026.", size: 26, color: GREY })] }),
  P(`**Prepared by:** ${AUTHOR}`), P(`**Date:** ${DATE}`), P("**Audience:** Investment and development managers"),
  P("**Tools:** Python (pandas, SciPy, statsmodels), Power BI / HTML dashboard"),
  new Paragraph({ spacing: { before: 1600 }, shading: { fill: "FFF4E5", type: ShadingType.CLEAR, color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: "EB6834", space: 8 } },
    children: [new TextRun({ text: "Mock-data notice: ", bold: true }), new TextRun("every figure in this report comes from a synthetic dataset created for learning. It does not describe the real Dubai property market. Do not use it for real investment decisions.")] }),
  pageBreak());

// 2. Executive summary
children.push(H1("1. Executive summary"),
  P("**Question.** Which Dubai areas give the best rental return? Are prices still rising? Is off-plan really cheaper than ready?"),
  P("**What we found.**"),
  ...numbered([
    `**Yield is highest in the cheapest areas.** Ready units in Dubai South earn **${n2(R.yield_area["Dubai South"])}%** gross and JVC earns **${n2(R.yield_area["Jumeirah Village Circle (JVC)"])}%**. Palm Jumeirah earns only ${n2(R.yield_area["Palm Jumeirah"])}%. The market average is ${n2(K.avg_yield)}%.`,
    `**Prices are still rising.** Comparing Jan–Sep with Jan–Sep, price per sq ft rose **${n1(yoy["2024"])}%** in 2024, **${n1(yoy["2025"])}%** in 2025 and ${n1(yoy["2026"])}% so far in 2026. The 2025 increase is statistically significant (p ${pfmt(T[3].p)}).`,
    `**Off-plan is not a discount.** Overall, off-plan looks ${n1(opOverallDisc)}% cheaper per sq ft. Inside every one of the nine areas, however, it costs **${n1(opMin)}–${n1(opMax)}% more** than ready stock. The overall gap only appears because off-plan is concentrated in low-cost areas.`]),
  P(`**Recommendation.** For an AED 1.5M budget aimed at rental income, buy a **ready apartment in JVC**. The average price is ${aedM(jvc.price)}, the yield is **${n2(jvc.yield_)}%**, and the rent is about **AED ${n0(jvc.rent)} a year**. This rests on ${jvc.n} comparable sales, the largest sample of any area in this price range.`),
  P(`**Key numbers:** **${n0(K.transactions)}** sales worth **AED ${(K.sales_value / 1e9).toFixed(2)}B**; median price **${aedM(K.median_price)}**; average **${n0(K.avg_ppsf)} AED/sq ft**; average time to sell **${n1(K.avg_dom)} days**.`));

// 3. Business problem
children.push(H1("2. Business problem and objectives"),
  P("A Dubai property developer or investment firm must decide where to put capital, when to buy, and whether to buy off-plan or ready. This report answers five questions with transaction data:"),
  ...numbered([
    "Which areas offer the best gross rental yield, and what does that yield cost in price per sq ft?",
    "How have prices per sq ft moved since 2023, and is the rise statistically real?",
    "Are there seasonal patterns, such as Ramadan or summer, that make some months better for buying or selling?",
    "Is off-plan cheaper than ready once location is held constant?",
    "Where should an investor with AED 1.5M buy for rental income?"]),
  P("The findings support three decisions: area allocation, the timing of purchases and launches, and the off-plan vs ready mix."));

// 4. Data description
children.push(H1("3. Data description"),
  P(`**Source:** dubai_real_estate_mock.csv, a synthetic dataset. **Size:** ${n0(R.raw_rows)} rows × ${R.raw_cols} columns, one row per sale. **Period:** ${R.date_min} to ${R.date_max}, so 2026 is a partial year (January to September). **Currency:** AED.`),
  table(["Column", "Meaning"], [
    ["transaction_id, date, year, quarter, month", "Sale ID and when it happened"],
    ["ramadan_period", "1 if the sale happened during Ramadan"],
    ["area", "One of 9 communities (e.g. Business Bay, JVC, Palm Jumeirah)"],
    ["property_type, bedrooms, size_sqft", "Apartment / Townhouse / Villa; 0 bedrooms = studio; size 302–10,272 sq ft"],
    ["status", `Ready (${R.n_ready}) or Off-Plan (${R.n_offplan})`],
    ["building_age_years, view", "Age of the building (0 = off-plan) and main view"],
    ["developer, payment_plan", "Developer (\"Resale\" for ready units) and off-plan payment split (e.g. 70/30)"],
    ["buyer_type", "Investor or End-user"],
    ["sale_price_aed, price_per_sqft_aed", "Price paid (AED 0.32M–45.2M) and price ÷ size"],
    ["days_on_market", "Days from listing to sale (2–152)"],
    ["annual_rent_aed, gross_yield_pct", "Rent and rent ÷ price × 100. Ready units only"],
  ], [38, 62]), gap());

// 5. Cleaning
const mb = R.missing_before;
children.push(H1("4. Data cleaning"),
  P("Each decision below is reflected in data/dubai_real_estate_clean.csv and in the Power Query steps (dashboard/powerbi_kit/power_query.m)."),
  table(["Issue", "Before", "After", "Decision and reason"], [
    ["Rows", n0(R.raw_rows), n0(R.clean_rows), "No rows removed. There are no duplicate IDs and no duplicate rows."],
    ["date stored as text", "text", "Date", "Converted, so time trends and the Date table work."],
    ["view blank", mb.view, "0", "Replaced with \"Unknown\". The sale itself is valid."],
    ["building_age_years blank", mb.building_age_years, mb.building_age_years, "Left blank. The value is missing, not zero, and the column is not used in any result."],
    ["annual_rent / gross_yield blank", mb.gross_yield_pct, mb.gross_yield_pct, `Left blank. The ${mb.gross_yield_pct} blanks are exactly the ${R.n_offplan} off-plan units, which have no tenant yet. Filling them would invent yields.`],
    ["payment_plan \"N/A\"", "1,093", "relabelled", "\"N/A\" appears only on ready units. It was relabelled \"Not applicable (Ready)\" so it is not read as missing."],
    ["Outliers in price/sq ft (IQR)", R.outliers.n, R.outliers.n, `Kept. All ${R.outliers.n} sales above ${n0(R.outliers.upper_fence)} AED/sq ft are in Palm Jumeirah. They are real luxury sales, not errors.`],
    ["Helper columns", "–", "4 added", "Price Band, Size Band, Ramadan Label (Yes/No) and Year-Quarter, for slicing."],
  ], [20, 9, 9, 62]), gap(),
  P(`**Consistency checks passed:** price per sq ft equals price ÷ size within 5 AED, and gross yield equals rent ÷ price within 0.1 percentage points on every ready unit.`),
  P("**Why we avoided imputation.** Filling off-plan yields with area medians, or dropping rows with a missing view, would change the averages. It would also mix ready and off-plan economics. Every yield figure in this report uses the 1,093 ready units only."));

// 6. EDA
const yrs = R.ppsf_year_full;
children.push(H1("5. Exploratory analysis"),
  H2("5.1 Market overview"),
  img("dashboard/screenshots/page1.png", 470), caption("Figure 1. Dashboard page 1: Market overview (no filters)"),
  takeaway(`Price per sq ft climbed from ${n0(yrs["2023"])} AED in 2023 to ${n0(yrs["2025"])} AED in 2025, a **${n1(R.cagr_2023_2025)}% compound annual rate**. Palm Jumeirah (${n0(R.area[0].ppsf)}) costs about four times as much per sq ft as Dubai South (${n0(R.area[R.area.length - 1].ppsf)}).`),
  P(`**Prices are skewed.** The mean sale price (${aedM(K.mean_price)}) is ${n0((K.mean_price / K.median_price - 1) * 100)}% above the median (${aedM(K.median_price)}), because a few large villas pull the mean up. This report therefore uses the **median** for "typical price" and price per sq ft for comparisons between areas.`),
  img("report/figures/mean_vs_median.png", 470), caption("Figure 2. Mean vs median sale price by area"),
  takeaway("The gap between mean and median is largest in Palm Jumeirah, Dubai Hills and Arabian Ranches, where villas dominate. In apartment areas such as JVC and Marina, mean and median are almost equal."),
  H2("5.2 Timing and seasonality"),
  img("dashboard/screenshots/page3.png", 440), caption("Figure 3. Dashboard page 3: Timing and off-plan"),
  takeaway(`January is the busiest month (${R.tx_month["1"]} sales) and August the quietest (${R.tx_month["8"]}). Q1 has ${R.tx_quarter.Q1} sales vs ${R.tx_quarter.Q3} in Q3. Ramadan runs at ${n2(ram.tx_per_day_in)} sales a day vs ${n2(ram.tx_per_day_out)} outside it, about **${n0(ramSlow)}% slower**.`),
  P(`**The market got faster.** Average days on market fell from ${n1(R.dom_year["2024"])} in 2024 to ${n1(R.dom_year["2025"])} in 2025 and ${n1(R.dom_year["2026"])} in 2026. Among off-plan sellers, Emaar (${n1(R.dev_dom[0].dom)} days) and Damac (${n1(R.dev_dom[1].dom)}) sell fastest, and Nakheel is slowest (${n1(R.dev_dom[R.dev_dom.length - 1].dom)} days, only ${R.dev_dom[R.dev_dom.length - 1].n} sales).`),
  H2("5.3 Trap: off-plan vs ready, and the area mix"),
  table(["Area", "Off-plan AED/sq ft", "Ready AED/sq ft", "Off-plan premium", "Off-plan share of sales"],
    op.map(r => [r.area, n0(r["Off-Plan"]), n0(r.Ready), "+" + n1(-r.discount_pct) + "%", n1(R.offplan_share_area[r.area]) + "%"]), [34, 17, 17, 16, 16]), gap(),
  takeaway(`Off-plan looks ${n1(opOverallDisc)}% cheaper overall (${n0(opAll["Off-Plan"])} vs ${n0(opAll.Ready)} AED/sq ft). In every area, however, it is more expensive. More than half of all sales in Dubai South, JVC, Business Bay and Dubai Hills are off-plan, and those low-priced areas drag the overall off-plan average down. Always compare within an area.`));

// 7. Investor analysis
children.push(H1("6. Investor analysis"),
  img("dashboard/screenshots/page2.png", 470), caption("Figure 4. Dashboard page 2: Investor view (ready units)"),
  takeaway(`There is a clear price–yield trade-off. The three cheapest areas per sq ft (Dubai South, JVC, Business Bay) are also the three highest-yielding. The three most expensive (Palm Jumeirah, Downtown, Dubai Hills) are among the lowest. Within each area, property type barely changes the yield.`),
  table(["Area", "Avg gross yield (ready)"], yA.map(([a, y]) => [a, n2(y) + "%"]), [70, 30]), gap(),
  H2("6.1 Recommendation for an AED 1.5M budget"),
  P("Filter: ready units priced at AED 1.5M or less (only ready units have a rent). Areas with fewer than 10 comparable sales are excluded."),
  table(["Area", "Comparable sales", "Avg price", "Gross yield", "Avg annual rent", "Days on market"],
    bud.map(b => [b.area, b.n, aedM(b.price), n2(b.yield_) + "%", "AED " + n0(b.rent), n1(b.dom)]), [30, 13, 15, 13, 16, 13]), gap(),
  takeaway(`**Buy a ready apartment in JVC.** It yields ${n2(jvc.yield_)}%, about AED ${n0(jvc.rent)} a year on an average ${aedM(jvc.price)} unit. That leaves around AED ${n0((1.5e6 - jvc.price) / 1e3)}k of the budget for fees and furnishing. Dubai South yields slightly more (${n2(ds.yield_)}%), but it has fewer comparable sales (${ds.n}) and the slowest resale (${n1(ds.dom)} days). Business Bay (${n2(bb.yield_)}%, ${n1(bb.dom)} days) is the central-location option.`),
  P("A prime-area unit at about 4.5% yield would earn roughly AED 67,500 a year on AED 1.5M. That is less than JVC earns on a unit costing a third less."));

// 8. Statistics
const ci = R.ci;
const ciRow = (a, lbl) => [lbl || a, ci[a].n, n1(ci[a].mean), `${n1(ci[a].low)} – ${n1(ci[a].high)}`];
children.push(H1("7. Statistical analysis"),
  H2("7.1 Sampling distribution and the Central Limit Theorem"),
  P(`We treat the ${n0(R.clean_rows)} sales as the population (mean ${n1(S.pop_mean)} AED/sq ft, SD ${n1(S.pop_sd)}, skew ${S.pop_skew}). From it we drew 1,000 random samples of n = 30 and 1,000 of n = 100, and recorded each sample's mean.`),
  img("report/figures/sampling_distribution.png", 600), caption("Figure 5. Population (left) and the sampling distribution of the mean for n = 30 and n = 100"),
  table(["", "Mean of sample means", "Standard error (observed)", "SE theory σ/√n", "Skew"], [
    ["n = 30", n1(S.n30.mean_of_means), n1(S.n30.se_empirical), n1(S.n30.se_theory), S.n30.skew],
    ["n = 100", n1(S.n100.mean_of_means), n1(S.n100.se_empirical), n1(S.n100.se_theory), S.n100.skew]], [16, 21, 23, 22, 18]), gap(),
  takeaway(`The population is skewed (${S.pop_skew}), yet the sample means form a symmetric bell centred on the true mean, as the Central Limit Theorem predicts. Making the sample 3.3× larger roughly halves the standard error (${n0(S.n30.se_empirical)} → ${n0(S.n100.se_empirical)}), because SE shrinks with √n.`),
  H2("7.2 Confidence intervals (95%)"),
  table(["Area", "n", "Mean AED/sq ft", "95% CI"], [
    ciRow("Dubai Marina"), ciRow("Business Bay"), ciRow("Jumeirah Village Circle (JVC)", "JVC"), ciRow("Downtown Dubai")], [34, 12, 24, 30]), gap(),
  img("report/figures/confidence_intervals.png", 440), caption("Figure 6. 95% confidence intervals for mean price per sq ft"),
  takeaway(`If we repeated the sampling many times, 95% of intervals built this way would contain the true mean. For Marina, the true mean price is plausibly between ${n0(ci["Dubai Marina"].low)} and ${n0(ci["Dubai Marina"].high)} AED/sq ft. The Marina and Business Bay intervals overlap heavily, which points to no real difference. JVC and Downtown are far apart from each other and from both.`));

children.push(H2("7.3 Hypothesis tests (α = 0.05)"),
  table(["Test", "H0", "H1", "Method", "Result", "p-value", "Conclusion"], [
    ["Marina vs Business Bay", "Mean price/sq ft is equal", "Means differ", "Welch two-sample t-test", T[0].detail + `, t = ${T[0].stat}`, pfmt(T[0].p), "Fail to reject H0. No evidence of a price difference."],
    ["Ready apartment yield vs overall ready average", `Mean = ${n2(R.overall_yield_avg)}%`, "Mean ≠ " + n2(R.overall_yield_avg) + "%", "One-sample t-test", T[1].detail + `, t = ${T[1].stat}`, pfmt(T[1].p), "Fail to reject H0. Apartments yield about the same as the average."],
    ["Price across all 9 areas", "All area means are equal", "At least one differs", "One-way ANOVA", `F = ${T[2].stat} (Kruskal–Wallis agrees)`, pfmt(T[2].p), "Reject H0. Location drives price."],
    ["2025 vs 2024, Jan–Sep only", "Means are equal", "2025 is higher", "Welch t-test, one-sided", T[3].detail + `, t = ${T[3].stat}`, pfmt(T[3].p), "Reject H0. Prices rose in 2025."],
    ["Off-plan vs ready in Business Bay", "Means are equal", "Means differ", "Welch two-sample t-test", T[4].detail + `, t = ${T[4].stat}`, pfmt(T[4].p), "Reject H0. Off-plan carries a premium."],
  ], [15, 13, 11, 13, 19, 9, 20]), gap(),
  P(`**Note on test 2.** Gross yield exists only for ready units. "Ready yield vs the overall average" would therefore compare the average with itself. We tested **ready apartments** (n = ${T[1].detail.match(/n=(\d+)/)[1]}) against the overall ready average of ${n2(R.overall_yield_avg)}%. That average was calculated first, as the guide asks.`),
  P(`**Type I and Type II errors.** In the 2025 vs 2024 test, a Type I error would mean concluding that prices rose when they did not. With α = 0.05 that risk is capped at 5%, and the actual p-value is far below it. In the Marina vs Business Bay test, the risk is a Type II error: missing a real difference. The observed effect is tiny (Cohen's d = ${R.power_marina_bb.observed_d}). With these sample sizes the test has **${n0(R.power_marina_bb.power_for_100aed * 100)}% power** to detect a 100 AED/sq ft gap. A difference that large would very likely have been found, so the two areas really do price alike.`),
  H2("7.4 Regression"),
  table(["Model", "R²", "Key coefficients"], [
    ["1. price ~ size", R.reg1.r2, `+AED ${n0(R.reg1.slope)} per extra sq ft`],
    ["2. price ~ size + area + bedrooms + status", R.reg2.r2, `Palm Jumeirah +${aedM(c["area: Palm Jumeirah"].b)} vs Dubai South; Downtown +${aedM(c["area: Downtown Dubai"].b)}; size +AED ${n0(c.size_sqft.b)}/sq ft; off-plan +AED ${n0(c["status: Off-Plan"].b)}; bedrooms ${n0(c.bedrooms.b)}`],
    ["3. log(price) ~ log(size) + area + bedrooms + status", R.reg3_log.r2, `Size elasticity ${R.reg3_log.size_elasticity}; off-plan +${n1(R.reg3_log.offplan_pct)}%; Palm +${n0(R.reg3_log.palm_pct)}% vs Dubai South`],
  ], [36, 10, 54]), gap(),
  takeaway(`Size alone explains ${n0(R.reg1.r2 * 100)}% of the variation in price. Adding area, bedrooms and status raises this to ${n0(R.reg2.r2 * 100)}%. The two biggest coefficients are both location. An otherwise identical home costs about **${aedM(c["area: Palm Jumeirah"].b)} more in Palm Jumeirah** and **${aedM(c["area: Downtown Dubai"].b)} more in Downtown** than in Dubai South. The negative bedrooms coefficient means that, at the same size, more bedrooms means smaller rooms and a lower price. The log model confirms the off-plan premium of about ${n0(R.reg3_log.offplan_pct)}% once area is controlled.`),
  P("**Caveat:** the residuals of model 2 grow with price, because luxury sales vary more. The log model (R² = " + R.reg3_log.r2 + ") handles this better, and it is the one we would use for valuation."));

// 9. Recommendations
children.push(H1("8. Recommendations"),
  ...numbered([
    `**For rental income, allocate to JVC and Dubai South ready stock.** They yield ${n2(R.yield_area["Jumeirah Village Circle (JVC)"])}% and ${n2(R.yield_area["Dubai South"])}%, against ${n2(K.avg_yield)}% for the market. For AED 1.5M, a ready JVC apartment gives about ${n2(jvc.yield_)}% (AED ${n0(jvc.rent / 1e3)}k a year).`,
    `**Treat Palm Jumeirah and Downtown as capital-growth plays, not income plays.** Yields are ${n2(R.yield_area["Palm Jumeirah"])}% and ${n2(R.yield_area["Downtown Dubai"])}%, and prices per sq ft are the highest in the city.`,
    `**Do not buy off-plan for a "discount".** Within the same area, off-plan costs ${n0(opMin)}–${n0(opMax)}% more per sq ft. Buy off-plan only for the payment plan (70/30 and 60/40 are most common) or for expected growth before handover.`,
    `**Time purchases for Ramadan and late summer, and time sales or launches for Q1.** Activity is about ${n0(ramSlow)}% lower per day during Ramadan, and August has the fewest sales. That means less competition for buyers. January has the most sales, which suits sellers.`,
    `**Expect price growth to slow.** Like-for-like growth was +${n1(yoy["2025"])}% in 2025 and +${n1(yoy["2026"])}% in 2026 so far. Use growth assumptions below 10% in models for 2027.`]));

// 10. Limitations
children.push(H1("9. Limitations and next steps"),
  bullet("**Synthetic data.** The data is mock, so the patterns are built in. The method transfers to real data; the numbers do not."),
  bullet("**2026 is partial** (January to September). All year-on-year comparisons use January to September only."),
  bullet("**Gross yield only.** There are no service charges, vacancy or fees, so real net yields would be 1–2 points lower."),
  bullet("**No macro factors.** The analysis has no mortgage rates, inflation, population or supply pipeline data."),
  bullet("**Off-plan has no rent**, so its yield cannot be compared until handover."),
  P("**With real data we would add:** Dubai Land Department transactions, rent contracts (Ejari), service charges, the supply pipeline by area, and mortgage rates. We would then model net yield and forecast price growth by area."));

// Appendix
children.push(pageBreak(), H1("Appendix"),
  H2("A. Dashboard: Statistics and Insights page"),
  img("dashboard/screenshots/page4.png", 470), caption("Figure 7. Dashboard page 4"),
  takeaway("This page summarises the skew in prices, the gap between mean and median, the three key insights and the recommendation."),
  H2("B. Price-per-sq-ft distribution"),
  img("report/figures/ppsf_histogram.png", 480), caption("Figure 8. Distribution of price per sq ft"),
  takeaway(`Most sales fall between 1,000 and 3,500 AED/sq ft. The right tail comes from Palm Jumeirah. The mean (${n0(K.avg_ppsf)}) sits just above the median (${n0(K.median_ppsf)}).`),
  H2("C. Code snippets"),
  ...[
    "# 95% confidence interval",
    "m, se = x.mean(), stats.sem(x)",
    "h = se * stats.t.ppf(0.975, len(x) - 1)",
    "# Welch t-test, 2025 vs 2024 (Jan-Sep)",
    "stats.ttest_ind(y25, y24, equal_var=False, alternative='greater')",
    "# Regression",
    "smf.ols(\"sale_price_aed ~ size_sqft + C(area) + bedrooms + C(status)\", df).fit()",
  ].map(t => new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: t, font: "Consolas", size: 18 })] })),
  gap(),
  H2("D. Project files"),
  bullet("data/: raw and cleaned CSV"),
  bullet("scripts/analysis.py: cleaning, statistics, figures and dashboard build. scripts/build_report.js builds this report"),
  bullet("dashboard/: interactive HTML dashboard, PNG screenshots, PDF, and powerbi_kit/ (Power Query, DAX, theme, build guide)"),
  bullet("GitHub repository: https://github.com/umairasifofficalll-code/Dubai-Real-Estate-Market-Analyzer"));

// ---------- document ----------
const doc = new Document({
  creator: AUTHOR, title: "Dubai Real Estate Market Analyzer",
  styles: {
    default: { document: { run: { font: "Calibri", size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, color: NAVY }, paragraph: { spacing: { before: 240, after: 140 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 25, bold: true, color: BLUE }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [
    { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
    ...Array.from({ length: 10 }, (_, i) => ({ reference: "num" + (i + 1), levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] })),
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1440, right: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Dubai Real Estate Market Analyzer · synthetic data", size: 16, color: "8A8A8A" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "Source: synthetic mock data, built by " + AUTHOR + " · Page ", size: 16, color: "8A8A8A" }),
      new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "8A8A8A" })] })] }) },
    children,
  }],
});
Packer.toBuffer(doc).then(b => {
  const out = path.join(ROOT, "report", "Dubai_Real_Estate_Report.docx");
  fs.writeFileSync(out, b); console.log("wrote", out);
});
