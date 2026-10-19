"""Dubai Real Estate Market Analyzer - cleaning, statistics and report figures.

Run:  python scripts/analysis.py   (from the project root)
Needs: pandas numpy scipy statsmodels matplotlib
Outputs:
  data/dubai_real_estate_clean.csv        cleaned table (also used by Power BI)
  dashboard/powerbi_kit/date_table.csv    calendar table for time intelligence
  report/results.json                     every number quoted in the report
  report/figures/*.png                    charts for the report
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from scipy import stats

ROOT = Path(__file__).resolve().parents[1]
FIG = ROOT / "report" / "figures"
FIG.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(42)

NAVY, GOLD, GREY = "#2A78D6", "#EB6834", "#9AA7B5"
plt.rcParams.update({"font.family": "Segoe UI", "font.size": 10,
                     "axes.spines.top": False, "axes.spines.right": False,
                     "axes.edgecolor": "#888", "axes.titleweight": "bold",
                     "axes.titlesize": 12, "figure.dpi": 150})

R = {}  # results collected for the report

# --------------------------------------------------------------------------- #
# 1. Cleaning
# --------------------------------------------------------------------------- #
# keep_default_na=False so the literal "N/A" in payment_plan is NOT read as missing
raw = pd.read_csv(ROOT / "data" / "dubai_real_estate_mock.csv",
                  keep_default_na=False, na_values=[""])
R["raw_rows"], R["raw_cols"] = raw.shape
R["missing_before"] = {k: int(v) for k, v in raw.isna().sum().items() if v}

df = raw.copy()
df["date"] = pd.to_datetime(df["date"])
df["view"] = df["view"].fillna("Unknown")
df["payment_plan"] = df["payment_plan"].replace("N/A", "Not applicable (Ready)")
df["ramadan_label"] = np.where(df["ramadan_period"] == 1, "Yes", "No")
df["price_band"] = pd.cut(df["sale_price_aed"], [0, 1e6, 3e6, 6e6, np.inf],
                          labels=["Under 1M", "1-3M", "3-6M", "6M+"], right=False)
df["size_band"] = pd.cut(df["size_sqft"], [0, 800, 1500, 3000, np.inf],
                         labels=["Under 800", "800-1,500", "1,500-3,000", "3,000+"], right=False)
df["year_quarter"] = df["year"].astype(str) + "-" + df["quarter"]
df["area_short"] = df["area"].replace({"Jumeirah Village Circle (JVC)": "JVC",
                                       "Jumeirah Beach Residence": "JBR",
                                       "Dubai Hills Estate": "Dubai Hills"})

R["missing_after"] = {k: int(v) for k, v in df[raw.columns].isna().sum().items() if v}
R["clean_rows"] = len(df)
R["n_ready"] = int((df.status == "Ready").sum())
R["n_offplan"] = int((df.status == "Off-Plan").sum())
R["date_min"], R["date_max"] = str(df.date.min().date()), str(df.date.max().date())

# Outliers (IQR) in price per sqft - kept, see report section 5
q1, q3 = df.price_per_sqft_aed.quantile([.25, .75])
hi = q3 + 1.5 * (q3 - q1)
out = df[(df.price_per_sqft_aed > hi) | (df.price_per_sqft_aed < q1 - 1.5 * (q3 - q1))]
R["outliers"] = {"n": len(out), "upper_fence": round(hi), "areas": out.area.value_counts().to_dict()}

df.drop(columns=["area_short"]).to_csv(ROOT / "data" / "dubai_real_estate_clean.csv", index=False)

dates = pd.DataFrame({"Date": pd.date_range("2023-01-01", "2026-12-31")})
dates["Year"] = dates.Date.dt.year
dates["Quarter"] = "Q" + dates.Date.dt.quarter.astype(str)
dates["YearQuarter"] = dates.Year.astype(str) + "-" + dates.Quarter
dates["MonthNo"] = dates.Date.dt.month
dates["Month"] = dates.Date.dt.strftime("%b")
dates.to_csv(ROOT / "dashboard" / "powerbi_kit" / "date_table.csv", index=False)

ready = df[df.status == "Ready"]

# --------------------------------------------------------------------------- #
# 2. KPIs and descriptive results
# --------------------------------------------------------------------------- #
R["kpi"] = {
    "transactions": len(df),
    "sales_value": int(df.sale_price_aed.sum()),
    "avg_ppsf": round(df.price_per_sqft_aed.mean(), 1),
    "median_ppsf": round(df.price_per_sqft_aed.median(), 1),
    "mean_price": round(df.sale_price_aed.mean()),
    "median_price": round(df.sale_price_aed.median()),
    "std_price": round(df.sale_price_aed.std()),
    "avg_yield": round(ready.gross_yield_pct.mean(), 2),
    "avg_dom": round(df.days_on_market.mean(), 1),
}
area_tbl = df.groupby("area").agg(n=("transaction_id", "size"),
                                  ppsf=("price_per_sqft_aed", "mean"),
                                  mean_price=("sale_price_aed", "mean"),
                                  median_price=("sale_price_aed", "median"),
                                  dom=("days_on_market", "mean"))
area_tbl["yield"] = ready.groupby("area").gross_yield_pct.mean()
area_tbl = area_tbl.sort_values("ppsf", ascending=False).round(2)
R["area"] = area_tbl.reset_index().to_dict("records")

yr = df.groupby("year").price_per_sqft_aed.mean()
same = df[df.month <= 9].groupby("year").price_per_sqft_aed.mean()  # like-for-like Jan-Sep
R["ppsf_year_full"] = yr.round(1).to_dict()
R["ppsf_year_jan_sep"] = same.round(1).to_dict()
R["yoy_jan_sep"] = (same.pct_change() * 100).round(1).dropna().to_dict()
R["cagr_2023_2025"] = round(((yr[2025] / yr[2023]) ** 0.5 - 1) * 100, 1)
R["dom_year"] = df.groupby("year").days_on_market.mean().round(1).to_dict()
R["tx_year"] = df.groupby("year").size().to_dict()
R["tx_month"] = df.groupby("month").size().to_dict()
R["tx_quarter"] = df.groupby("quarter").size().to_dict()
R["ptype_share"] = (df.property_type.value_counts(normalize=True) * 100).round(1).to_dict()

# Ramadan: compare transactions per day inside vs outside the Ramadan window
# Ramadan window length per year = first to last flagged date
rw = df[df.ramadan_period == 1].groupby("year").date.agg(["min", "max"])
days_in = int(((rw["max"] - rw["min"]).dt.days + 1).sum())
period_days = (df.date.max() - df.date.min()).days + 1
R["ramadan"] = {"tx_in": int(df.ramadan_period.sum()), "tx_out": int((df.ramadan_period == 0).sum()),
                "share_in_pct": round(df.ramadan_period.mean() * 100, 1), "days_in": days_in,
                "tx_per_day_in": round(df.ramadan_period.sum() / days_in, 2),
                "tx_per_day_out": round((df.ramadan_period == 0).sum() / (period_days - days_in), 2)}

# Yield
yt = ready.groupby("area").gross_yield_pct.mean().sort_values(ascending=False)
R["yield_area"] = yt.round(2).to_dict()
R["yield_matrix"] = ready.pivot_table(index="area", columns="property_type",
                                      values="gross_yield_pct", aggfunc="mean").round(2).astype(object).where(lambda t: t.notna(), None).to_dict("index")

# Budget AED 1.5M (ready units only, because only they have a rent/yield)
b = ready[ready.sale_price_aed <= 1_500_000]
bud = b.groupby("area").agg(n=("transaction_id", "size"), yield_=("gross_yield_pct", "mean"),
                            price=("sale_price_aed", "mean"), rent=("annual_rent_aed", "mean"),
                            dom=("days_on_market", "mean")).query("n >= 10").sort_values("yield_", ascending=False)
R["budget_1_5m"] = bud.round(2).reset_index().to_dict("records")

# Off-plan vs ready inside each area (trap 2: area mix)
op = df.groupby(["area", "status"]).price_per_sqft_aed.mean().unstack()
op["discount_pct"] = (1 - op["Off-Plan"] / op["Ready"]) * 100
R["offplan_vs_ready_area"] = op.round(1).reset_index().to_dict("records")
R["offplan_vs_ready_overall"] = df.groupby("status").price_per_sqft_aed.mean().round(1).to_dict()
R["offplan_share_area"] = (df.groupby("area").status.apply(lambda s: (s == "Off-Plan").mean()) * 100).round(1).to_dict()
R["dev_dom"] = df[df.status == "Off-Plan"].groupby("developer").agg(
    n=("transaction_id", "size"), dom=("days_on_market", "mean")).round(1).sort_values("dom").reset_index().to_dict("records")
R["payment_plan"] = df[df.status == "Off-Plan"].payment_plan.value_counts().to_dict()

# --------------------------------------------------------------------------- #
# 3. Statistics
# --------------------------------------------------------------------------- #
pop = df.price_per_sqft_aed.to_numpy()
samp = {n: np.array([rng.choice(pop, n, replace=False).mean() for _ in range(1000)]) for n in (30, 100)}
R["sampling"] = {"pop_mean": round(pop.mean(), 1), "pop_sd": round(pop.std(ddof=0), 1),
                 "pop_skew": round(stats.skew(pop), 2)}
for n, m in samp.items():
    R["sampling"][f"n{n}"] = {"mean_of_means": round(m.mean(), 1), "se_empirical": round(m.std(ddof=1), 1),
                              "se_theory": round(pop.std(ddof=0) / np.sqrt(n), 1), "skew": round(stats.skew(m), 2)}


def ci(x, conf=.95):
    x = pd.Series(x).dropna()
    m, se = x.mean(), stats.sem(x)
    h = se * stats.t.ppf((1 + conf) / 2, len(x) - 1)
    return {"n": len(x), "mean": round(m, 2), "low": round(m - h, 2), "high": round(m + h, 2)}


R["ci"] = {a: ci(df.loc[df.area == a, "price_per_sqft_aed"]) for a in
           ["Dubai Marina", "Jumeirah Village Circle (JVC)", "Business Bay", "Downtown Dubai"]}
R["ci_yield_ready"] = ci(ready.gross_yield_pct)

tests = []
m, bb = (df.loc[df.area == a, "price_per_sqft_aed"] for a in ["Dubai Marina", "Business Bay"])
t, p = stats.ttest_ind(m, bb, equal_var=False)
tests.append({"name": "Marina vs Business Bay (price/sqft)", "method": "Welch two-sample t-test",
              "stat": round(t, 3), "p": p, "detail": f"{m.mean():.0f} vs {bb.mean():.0f} AED/sqft"})

overall_yield = df.gross_yield_pct.mean()  # all rows that have a yield (= ready units)
apt_ready = ready[ready.property_type == "Apartment"].gross_yield_pct
t, p = stats.ttest_1samp(apt_ready, overall_yield)
tests.append({"name": "Ready apartment yield vs overall ready average", "method": "One-sample t-test",
              "stat": round(t, 3), "p": p,
              "detail": f"{apt_ready.mean():.2f}% vs {overall_yield:.2f}% (n={len(apt_ready)})"})
R["overall_yield_avg"] = round(overall_yield, 3)

groups = [g.price_per_sqft_aed for _, g in df.groupby("area")]
f, p = stats.f_oneway(*groups)
kw_h, kw_p = stats.kruskal(*groups)
tests.append({"name": "Price/sqft across all 9 areas", "method": "One-way ANOVA (Kruskal-Wallis check)",
              "stat": round(f, 1), "p": p, "detail": f"F={f:.1f}; Kruskal H={kw_h:.1f}, p={kw_p:.1e}"})

y24 = df.loc[(df.year == 2024) & (df.month <= 9), "price_per_sqft_aed"]
y25 = df.loc[(df.year == 2025) & (df.month <= 9), "price_per_sqft_aed"]
t, p = stats.ttest_ind(y25, y24, equal_var=False, alternative="greater")
tests.append({"name": "2025 vs 2024 price/sqft (Jan-Sep only)", "method": "Welch t-test, one-sided",
              "stat": round(t, 3), "p": p, "detail": f"{y25.mean():.0f} vs {y24.mean():.0f} AED/sqft"})

# Extra: is the off-plan discount real once area is held fixed? (paired by area, Business Bay)
bbay = df[df.area == "Business Bay"]
t, p = stats.ttest_ind(bbay.loc[bbay.status == "Off-Plan", "price_per_sqft_aed"],
                       bbay.loc[bbay.status == "Ready", "price_per_sqft_aed"], equal_var=False)
tests.append({"name": "Off-plan vs ready inside Business Bay", "method": "Welch two-sample t-test",
              "stat": round(t, 3), "p": p,
              "detail": f"{bbay.loc[bbay.status=='Off-Plan','price_per_sqft_aed'].mean():.0f} vs "
                        f"{bbay.loc[bbay.status=='Ready','price_per_sqft_aed'].mean():.0f} AED/sqft"})
for tt in tests:
    tt["reject_h0"] = bool(tt["p"] < 0.05)
    tt["p"] = float(f"{tt['p']:.3g}")
R["tests"] = tests

# Power of the Marina vs Business Bay test (Type II error discussion)
from statsmodels.stats.power import TTestIndPower
pooled_sd = np.sqrt((m.var() + bb.var()) / 2)
R["power_marina_bb"] = {
    "observed_d": round(abs(m.mean() - bb.mean()) / pooled_sd, 3),
    "power_for_100aed": round(TTestIndPower().power(100 / pooled_sd, nobs1=len(m), ratio=len(bb) / len(m), alpha=0.05), 2),
}

reg1 = smf.ols("sale_price_aed ~ size_sqft", data=df).fit()
reg2 = smf.ols("sale_price_aed ~ size_sqft + C(area, Treatment('Dubai South')) + bedrooms + "
               "C(status, Treatment('Ready'))", data=df).fit()
R["reg1"] = {"r2": round(reg1.rsquared, 3), "slope": round(reg1.params["size_sqft"], 1),
             "intercept": round(reg1.params["Intercept"])}
coef = reg2.params.drop("Intercept")
R["reg2"] = {"r2": round(reg2.rsquared, 3), "adj_r2": round(reg2.rsquared_adj, 3),
             "coef": {k.replace("C(area, Treatment('Dubai South'))[T.", "area: ")
                       .replace("C(status, Treatment('Ready'))[T.", "status: ").rstrip("]"):
                      {"b": round(v), "p": float(f"{reg2.pvalues[k]:.3g}")} for k, v in coef.items()}}
reg3 = smf.ols("np.log(sale_price_aed) ~ np.log(size_sqft) + C(area, Treatment('Dubai South')) + bedrooms + "
               "C(status, Treatment('Ready'))", data=df).fit()
R["reg3_log"] = {"r2": round(reg3.rsquared, 3), "size_elasticity": round(reg3.params["np.log(size_sqft)"], 3),
                 "offplan_pct": round((np.exp(reg3.params["C(status, Treatment('Ready'))[T.Off-Plan]"]) - 1) * 100, 1),
                 "palm_pct": round((np.exp(reg3.params["C(area, Treatment('Dubai South'))[T.Palm Jumeirah]"]) - 1) * 100, 1)}

(ROOT / "report" / "results.json").write_text(json.dumps(R, indent=2, default=str))

# --------------------------------------------------------------------------- #
# 4. Figures for the report
# --------------------------------------------------------------------------- #
def save(fig, name):
    fig.tight_layout()
    fig.savefig(FIG / name, bbox_inches="tight", facecolor="white")
    plt.close(fig)


fig, axes = plt.subplots(1, 3, figsize=(13, 3.8))
axes[0].hist(pop, bins=40, color=GREY, edgecolor="white")
axes[0].set_title("Population: price per sq ft (N = 1,800)")
for i, n in enumerate((30, 100), 1):
    axes[i].hist(samp[n], bins=35, color=NAVY if n == 100 else "#86B6EF", edgecolor="white")
    axes[i].set_title(f"1,000 sample means, n = {n}\nSE = {R['sampling'][f'n{n}']['se_empirical']:.0f} AED")
for ax in axes:
    ax.axvline(pop.mean(), color=GOLD, lw=2)
    ax.set_xlabel("AED per sq ft")
for ax in axes[1:]: ax.set_xlim(pop.mean() - 650, pop.mean() + 650)
save(fig, "sampling_distribution.png")

fig, ax = plt.subplots(figsize=(8, 3.6))
ax.hist(pop, bins=45, color=NAVY, edgecolor="white")
ax.axvline(pop.mean(), color="#0B0B0B", lw=2.5, label=f"Mean {pop.mean():,.0f}")
ax.axvline(np.median(pop), color=GOLD, lw=2.5, ls="--", label=f"Median {np.median(pop):,.0f}")
ax.set_title("Price per sq ft: long right tail, mean just above the median")
ax.set_xlabel("AED per sq ft"); ax.set_ylabel("Transactions"); ax.legend(frameon=False)
save(fig, "ppsf_histogram.png")

a = df.groupby("area_short").sale_price_aed.agg(["mean", "median"]).sort_values("mean", ascending=False) / 1e6
fig, ax = plt.subplots(figsize=(9, 3.8))
x = np.arange(len(a))
ax.bar(x - .2, a["mean"], .4, color=NAVY, label="Mean")
ax.bar(x + .2, a["median"], .4, color=GOLD, label="Median")
ax.set_xticks(x, a.index, rotation=25, ha="right"); ax.set_ylabel("AED millions")
ax.set_title("Luxury villas pull the mean above the median, most in Palm Jumeirah")
ax.legend(frameon=False)
save(fig, "mean_vs_median.png")

ya = ready.groupby("area_short").agg(ppsf=("price_per_sqft_aed", "mean"), y=("gross_yield_pct", "mean"),
                                    n=("transaction_id", "size"))
fig, ax = plt.subplots(figsize=(8, 4.2))
ax.scatter(ya.ppsf, ya.y, s=ya.n * 2.2, color=NAVY, alpha=.8, edgecolor="white")
for k, r in ya.iterrows():
    ax.annotate(k, (r.ppsf, r.y), xytext=(6, 4), textcoords="offset points", fontsize=9)
ax.set_xlabel("Avg price per sq ft (AED, ready units)"); ax.set_ylabel("Avg gross yield %")
ax.set_title("The cheaper the area, the higher the yield")
save(fig, "price_vs_yield.png")

ci_df = pd.DataFrame(R["ci"]).T
fig, ax = plt.subplots(figsize=(8, 2.8))
lbl = [s.replace("Jumeirah Village Circle (JVC)", "JVC") for s in ci_df.index]
ax.errorbar(ci_df["mean"], lbl, xerr=[ci_df["mean"] - ci_df["low"], ci_df["high"] - ci_df["mean"]],
            fmt="o", color=NAVY, ecolor=GOLD, elinewidth=4, capsize=5)
ax.set_xlabel("Mean price per sq ft, AED (95% CI)")
ax.set_title("Marina and Business Bay intervals overlap; JVC and Downtown do not")
save(fig, "confidence_intervals.png")

print(json.dumps({k: R[k] for k in ["kpi", "tests", "reg1", "reg3_log", "yoy_jan_sep", "cagr_2023_2025"]}, indent=1))

# --------------------------------------------------------------------------- #
# 5. Build the HTML dashboard (data embedded so it opens offline from disk)
# --------------------------------------------------------------------------- #
rows = [{"y": int(r.year), "q": r.quarter, "m": int(r.month), "r": int(r.ramadan_period), "a": r.area,
         "t": r.property_type, "s": r.status, "b": r.buyer_type, "p": int(r.sale_price_aed),
         "pp": int(r.price_per_sqft_aed), "dom": int(r.days_on_market),
         "yl": None if pd.isna(r.gross_yield_pct) else float(r.gross_yield_pct),
         "rent": None if pd.isna(r.annual_rent_aed) else int(r.annual_rent_aed),
         "dev": r.developer, "pl": r.payment_plan} for r in df.itertuples()]
tpl = (ROOT / "dashboard" / "dashboard_template.html").read_text(encoding="utf-8")
(ROOT / "dashboard" / "dubai_real_estate_dashboard.html").write_text(
    tpl.replace("/*__DATA__*/", json.dumps(rows, separators=(",", ":"))), encoding="utf-8")
