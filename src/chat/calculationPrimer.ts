/**
 * Calculation-authoring instructions for the @tableau agent.
 *
 * The workbook primer (twbPrimer.ts) teaches the model what a .twb file IS.
 * This teaches it how Tableau EVALUATES a calculation — which is where models
 * reliably produce confident nonsense, because Tableau's aggregation and
 * level-of-detail rules have no equivalent in SQL or in a spreadsheet.
 *
 * Included only for calculation work, so border and formatting questions do
 * not pay for it.
 */
export const TABLEAU_CALCULATION_PRIMER = `<TABLEAU_CALCULATION_GUIDE>

<evaluation_model>
Tableau does not evaluate a formula row by row and then hand you the answer.
Understanding the pipeline is what separates a correct calculation from one
that merely looks right.

ROW-LEVEL vs AGGREGATE. Every expression is one or the other.
- Row level: [Sales] * 0.9, DATETRUNC('month', [Order Date]), UPPER([Region]).
  Evaluated once per underlying data row.
- Aggregate: SUM([Sales]), COUNTD([Customer ID]), AVG([Profit]).
  Evaluated once per mark, over the rows behind that mark.
You CANNOT mix them in one expression. [Sales] - SUM([Profit]) is an error:
"Cannot mix aggregate and non-aggregate arguments". Fix it by aggregating the
row-level side — SUM([Sales]) - SUM([Profit]) — not by removing the aggregate.

VIZ LEVEL OF DETAIL. An aggregate is computed at whatever dimensions are on
the sheet. SUM([Sales]) is total sales per Region on a Region view, and per
Category on a Category view. The same calculation therefore returns different
numbers on different sheets, by design. Only an LOD expression pins it.

ORDER OF OPERATIONS (earlier stages cannot see later ones):
  1. Extract filters
  2. Data source filters
  3. Context filters
  4. FIXED LOD expressions
  5. Dimension filters
  6. INCLUDE / EXCLUDE LOD expressions
  7. Measure filters
  8. Table calculations, and filters on them
This is why a FIXED LOD ignores a normal dimension filter but DOES respect a
context filter — the filter runs after step 4 in one case and before it in the
other. If the user reports "my LOD is not filtering", this is nearly always why.
</evaluation_model>

<lod_expressions>
Syntax: { FIXED | INCLUDE | EXCLUDE [Dim], [Dim2] : AGGREGATE(expression) }

- FIXED: compute at exactly these dimensions, ignoring the view's dimensions.
    {FIXED [Customer ID] : SUM([Sales])}          sales per customer, always
- INCLUDE: the view's dimensions PLUS these. Use for "average of a finer
  grain than the view shows".
    AVG({INCLUDE [Order ID] : SUM([Sales])})      average order value
- EXCLUDE: the view's dimensions MINUS these. Use for "percent of a coarser
  total".
    SUM([Sales]) / MAX({EXCLUDE [Sub-Category] : SUM([Sales])})

An LOD returns a value at ITS level, which is usually finer than the mark, so
it normally needs re-aggregating: AVG({FIXED [Customer ID] : SUM([Sales])}),
not the bare LOD. Wrapping in MIN/MAX/AVG when the LOD is already at or above
the mark's grain is the idiomatic way to make it usable.

{FIXED : SUM([Sales])} with no dimension is the grand total across the whole
data source, unaffected by any dimension filter.
</lod_expressions>

<types_and_nulls>
- No implicit conversion. "Total: " + SUM([Sales]) is an error; use
  "Total: " + STR(SUM([Sales])). The + operator concatenates two strings and
  adds two numbers, but never mixes them.
- Conversions: INT(), FLOAT(), STR(), DATE(), DATETIME(), BOOL().
- NULL propagates: any arithmetic with NULL is NULL. ZN(expr) turns a NULL
  number into 0. IFNULL(a, b) returns b when a is NULL. ISNULL(a) tests it.
- Tableau has no NULLIF. Guard division explicitly:
    IIF(SUM([Quantity]) = 0, NULL, SUM([Sales]) / SUM([Quantity]))
- Division returns a decimal; 7/2 is 3.5, not 3.
- Comparing to NULL with = never matches. Use ISNULL().
</types_and_nulls>

<control_flow>
IF [Sales] > 1000 THEN "High" ELSEIF [Sales] > 100 THEN "Mid" ELSE "Low" END
- ELSEIF is one word. ELSE IF is a syntax error.
- Every IF and CASE needs a matching END.
- ELSE is optional; without it, unmatched rows are NULL.

CASE [Region] WHEN "West" THEN 1 WHEN "East" THEN 2 ELSE 0 END
- CASE compares one expression against constant values only. Anything
  involving a range, AND/OR, or another field must be an IF.

IIF(test, then, else) is the two-branch shorthand and takes an optional
fourth argument for the NULL case: IIF(test, then, else, unknown).
</control_flow>

<table_calculations>
TOTAL(), WINDOW_SUM(), WINDOW_AVG(), LOOKUP(), PREVIOUS_VALUE(), INDEX(),
RANK(), RUNNING_SUM() operate on the aggregated result set, AFTER everything
else. They depend on partitioning and addressing set in the view, so the same
formula can give different answers depending on how the user configures
"Compute Using".

  Percent of total:  SUM([Sales]) / TOTAL(SUM([Sales]))
  Running total:     RUNNING_SUM(SUM([Sales]))
  Prior period:      LOOKUP(SUM([Sales]), -1)
  Period over period:
    (SUM([Sales]) - LOOKUP(SUM([Sales]), -1)) / ABS(LOOKUP(SUM([Sales]), -1))

If a fixed, view-independent answer is wanted, an LOD is usually the right
tool instead of a table calculation — say so when it matters.
</table_calculations>

<worked_patterns>
Ratio of two measures — aggregate first, divide second. Dividing row by row
and averaging is the single most common wrong answer:
  RIGHT:  SUM([Profit]) / SUM([Sales])
  WRONG:  AVG([Profit] / [Sales])

Conditional aggregate. Tableau has no SUMIF; put the condition inside:
  SUM(IF [Region] = "West" THEN [Sales] END)
  COUNTD(IF [Returned] THEN [Order ID] END)

Boolean flag — return the condition, do not wrap it:
  RIGHT:  [Profit] < 0
  CLUMSY: IF [Profit] < 0 THEN TRUE ELSE FALSE END

Date bucketing and elapsed time:
  DATETRUNC('month', [Order Date])
  DATEDIFF('day', [Order Date], [Ship Date])
  DATEADD('month', -1, [Order Date])
  Date parts are lowercase quoted strings: 'year', 'quarter', 'month', 'week',
  'day', 'hour', 'minute', 'second'.

Customer-level metric reused in an aggregate view:
  AVG({FIXED [Customer ID] : SUM([Sales])})

Cohort / first-purchase date:
  {FIXED [Customer ID] : MIN([Order Date])}

Rank within a partition (table calc):
  RANK(SUM([Sales]))
</worked_patterns>

<mistakes_to_avoid>
- COUNT(DISTINCT [X]) — not Tableau. Use COUNTD([X]).
- SUMIF / COUNTIF / AVERAGEIF — do not exist. Use SUM(IF … END).
- ELSE IF as two words. It is ELSEIF.
- Omitting END on an IF or CASE.
- CASE with a comparison or compound condition in WHEN. Use IF.
- Mixing aggregate and row-level in one expression.
- Referencing a field that is not in the datasource. Every [Field] must come
  from tableau_listFields output for the datasource being written to. Do not
  infer a field from a caption you saw in a formula string, and do not invent
  a plausible name like [Customer Name] because the data "should" have one.
- Using a field from datasource A in a calculation being written to
  datasource B. Calculations can only reference fields in their own
  datasource.
- Square brackets are required around field names: [Sales], not Sales.
  Names containing no spaces still take brackets.
- String literals use single or double quotes; be consistent within a formula.
</mistakes_to_avoid>

<choosing_the_datatype>
The tool's datatype argument is the type the formula RETURNS, and it decides
whether Tableau treats the field as a measure or a dimension:
  real     — any ratio, average, or currency amount. Default for arithmetic.
  integer  — counts: COUNTD(...), a whole-number offset, DATEDIFF(...).
  boolean  — a bare condition, e.g. [Profit] < 0.
  string   — text output, including an IF that returns labels.
  date     — DATETRUNC / DATEADD / MIN([Some Date]) returning a date.
  datetime — the same when time of day is preserved.
A formula whose branches return different types is an error in Tableau; make
every branch agree before writing it.
</choosing_the_datatype>

<authoring_procedure>
1. Call tableau_listFields for the target datasource. Confirm the exact
   spelling and datatype of every field the formula will reference.
2. Decide row-level vs aggregate, and whether the answer must be independent
   of the view (LOD) or relative to it (plain aggregate or table calc).
3. Write the formula. Re-read it against mistakes_to_avoid.
4. Pick the datatype from what the formula returns.
5. Call tableau_addCalculation. The user sees your formula on a confirmation
   card before anything is written.
6. Report what was written, name the backup, and say Tableau must reopen the
   workbook to show the field.

Name the field the way a Tableau user would: title case, no brackets, no
"calc" or "field" suffix — "Profit Ratio", not "calc_profit_ratio".

If the request is ambiguous in a way that changes the formula — "top
customers" by sales or by profit, "this year" calendar or fiscal — ask one
short question instead of guessing. If it is ambiguous in a way that does not
change the formula, just build it.
</authoring_procedure>

</TABLEAU_CALCULATION_GUIDE>`;
