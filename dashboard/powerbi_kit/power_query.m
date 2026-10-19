// Power Query (M) for the Transactions table.
// Power BI Desktop > Home > Transform data > New Source > Blank Query > Advanced Editor, paste this,
// then change the file path on the Source line. Rename the query to: Transactions
let
    Source = Csv.Document(File.Contents("C:\path\to\data\dubai_real_estate_mock.csv"),
        [Delimiter = ",", Columns = 21, Encoding = 65001, QuoteStyle = QuoteStyle.None]),
    Headers = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),

    // 1. Data types
    Typed = Table.TransformColumnTypes(Headers, {
        {"transaction_id", type text}, {"date", type date}, {"year", Int64.Type}, {"quarter", type text},
        {"month", Int64.Type}, {"ramadan_period", Int64.Type}, {"area", type text}, {"property_type", type text},
        {"bedrooms", Int64.Type}, {"size_sqft", Int64.Type}, {"status", type text},
        {"building_age_years", Int64.Type}, {"view", type text}, {"developer", type text},
        {"payment_plan", type text}, {"buyer_type", type text}, {"sale_price_aed", Currency.Type},
        {"price_per_sqft_aed", Int64.Type}, {"days_on_market", Int64.Type},
        {"annual_rent_aed", Currency.Type}, {"gross_yield_pct", type number}}),

    // 2. Blank view -> "Unknown". building_age_years and gross_yield_pct stay blank on purpose
    //    (blank yield = off-plan unit with no rent yet; blank age = not recorded).
    ViewFixed = Table.ReplaceValue(Typed, each [view], each if [view] = null or [view] = "" then "Unknown" else [view],
        Replacer.ReplaceValue, {"view"}),
    // "N/A" payment plan only appears on ready units -> make that explicit
    PlanFixed = Table.ReplaceValue(ViewFixed, "N/A", "Not applicable (Ready)", Replacer.ReplaceValue, {"payment_plan"}),

    // 3. Helper columns
    AddPriceBand = Table.AddColumn(PlanFixed, "Price Band", each
        if [sale_price_aed] < 1000000 then "Under 1M"
        else if [sale_price_aed] < 3000000 then "1-3M"
        else if [sale_price_aed] < 6000000 then "3-6M" else "6M+", type text),
    AddPriceBandSort = Table.AddColumn(AddPriceBand, "Price Band Sort", each
        List.PositionOf({"Under 1M", "1-3M", "3-6M", "6M+"}, [Price Band]), Int64.Type),
    AddSizeBand = Table.AddColumn(AddPriceBandSort, "Size Band", each
        if [size_sqft] < 800 then "Under 800"
        else if [size_sqft] < 1500 then "800-1,500"
        else if [size_sqft] < 3000 then "1,500-3,000" else "3,000+", type text),
    AddRamadan = Table.AddColumn(AddSizeBand, "Ramadan Label", each if [ramadan_period] = 1 then "Yes" else "No", type text),
    AddYQ = Table.AddColumn(AddRamadan, "Year Quarter", each Text.From([year]) & "-" & [quarter], type text)
in
    AddYQ
