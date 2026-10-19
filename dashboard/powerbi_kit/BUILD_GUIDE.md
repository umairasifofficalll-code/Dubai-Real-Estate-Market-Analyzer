# Rebuild the dashboard in Power BI Desktop (about 60–90 minutes)

`dubai_real_estate_dashboard.html` is the reference design. Every visual below matches one on that page, and the HTML numbers match what Power BI should show. Use them to check your work.

## 0. Setup (5 min)
1. Open Power BI Desktop and choose **View > Themes > Browse for themes**. Pick `dubai_theme.json`.
2. Set the page size: **Format page > Canvas settings > 16:9 (1280×720)**.

## 1. Data (10 min)
1. **Home > Transform data > New Source > Blank Query > Advanced Editor**. Paste `power_query.m` and fix the file path. Rename the query **Transactions**.
2. **Close & Apply**.
3. Sort `Price Band` by `Price Band Sort` (Column tools > Sort by column).
4. **Modeling > New table**. Paste the `Date` table from `measures.dax`. Then **Mark as date table** on `Date[Date]`.
5. In **Model view**, drag `Date[Date]` onto `Transactions[date]` to create a one-to-many, single-direction relationship.
6. Sort `Date[Month]` by `Date[Month No]`.

## 2. Measures (10 min)
Create every measure in `measures.dax` with **Modeling > New measure**. Then set the formats:

| Measure | Format |
|---|---|
| Total Sales Value, Median/Mean Sale Price | Currency, Display units = Millions, prefix "AED" |
| Avg Gross Yield %, YoY Price Growth % | Percentage, 2 decimals |
| Avg Price per Sqft, Avg Days on Market | Whole number / 1 decimal |

## 3. Shared layout on every page
- **Title bar**: a rectangle across the top (fill `#16324F`) with a text box for "Dubai Real Estate Market Analyzer".
- **Slicers** in one row under the title: `Date[Year]`, `area`, `property_type`, `status`, `buyer_type`. Set them to Dropdown style.
  - Build them on Page 1, then select them all and use **View > Sync slicers** to tick all 4 pages, so they sit in the same place everywhere.
- **Footer** text box: *Source: synthetic mock data, built by Umair Asif.*
- **Navigation**: Insert > Buttons > Navigator > **Page navigator**.

## 4. Page 1: Market Overview
| Visual | Settings |
|---|---|
| 6 × Card (new) | Total Transactions, Total Sales Value, Avg Price per Sqft, Median Sale Price, Avg Gross Yield %, Avg Days on Market |
| Line chart | X `Date[Year Quarter]`, Y `Avg Price per Sqft`. Title: *Price per sq ft rose about 14% a year from 2023 to 2025* |
| Bar chart | Y `area`, X `Avg Price per Sqft`, sorted descending. Title: *Palm Jumeirah costs 4× Dubai South per sq ft* |
| Bar / donut | `property_type`, `Total Transactions`. Title: *7 in 10 sales are apartments* |

## 5. Page 2: Investor View
| Visual | Settings |
|---|---|
| Bar chart | Y `area`, X `Avg Gross Yield %`, sorted descending. **Bars > Color > fx > Field value > Yield Bar Colour** |
| Scatter | X `Avg Price per Sqft`, Y `Avg Gross Yield %`, Values `area`, Size `Total Transactions`, **Category labels On**. Add the `status = Ready` filter on this visual |
| Matrix | Rows `area`, Columns `property_type`, Values `Avg Gross Yield %`. **Cell elements > Background color > Gradient** |
| Slicer | `sale_price_aed`, style **Between** (range). Test it with a 1,500,000 maximum |
| Card | `Best Yield Area` |

## 6. Page 3: Timing and Off-Plan
| Visual | Settings |
|---|---|
| Stacked column | X `Date[Month]`, Y `Total Transactions`, Legend `Ramadan Label` |
| Line chart | X `Date[Year Quarter]`, Y `Avg Days on Market` |
| Clustered column | X `area`, Y `Avg Price per Sqft`, Legend `status`. Title: *Inside every area, off-plan costs more per sq ft than ready* |
| Bar chart | Y `developer`, X `Avg Days on Market`, with the visual filter `status = Off-Plan` |
| Column chart | `payment_plan`, `Total Transactions`, with the visual filter `status = Off-Plan` |

## 7. Page 4: Statistics and Insights
| Visual | Settings |
|---|---|
| Histogram | Right-click `price_per_sqft_aed` > **New group** > Bin size 250. X = the new bins field, Y `Total Transactions`. In the **Analytics pane**, add an X-axis constant line at the mean (2,341) and one at the median (2,326) |
| Clustered column | X `area`, Y `Mean Sale Price` and `Median Sale Price` |
| Text box | **Key insights**. Copy the three numbered findings from page 4 of the HTML dashboard |
| Text box | **Recommendation**. Copy the AED 1.5M recommendation from page 4 of the HTML dashboard |

## 8. Export
- **File > Save as** `dashboard/dubai_real_estate.pbix`
- **File > Export > Export to PDF** saves the dashboard PDF.
- For screenshots, use **Win+Shift+S** on each page and save them to `dashboard/screenshots/page1.png` … `page4.png`. This replaces the HTML screenshots if you want Power BI ones.

## Check your numbers (no filters applied)
| Check | Expected |
|---|---|
| Total Transactions | 1,800 |
| Total Sales Value | AED 6.99B |
| Avg Price per Sqft | 2,341 |
| Median Sale Price | AED 2.62M (2,615,500) |
| Avg Gross Yield % | 5.57% |
| Avg Days on Market | 30.9 |
| Best Yield Area | Dubai South · 7.52% |
| With a budget ≤ 1.5M: Best Yield Area | Dubai South · 7.62% |
