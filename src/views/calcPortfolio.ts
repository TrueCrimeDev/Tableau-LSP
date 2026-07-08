// Calculation Portfolio — a curated set of stock example Tableau calculations
// shown in the "Tableau Tools" sidebar. Inserting one drops a `// Title - description`
// header comment plus the formula at the cursor, matching the .twbl header convention.
//
// These are intentionally written in the extension's preferred multi-line style
// (IF/THEN/ELSE/END on their own lines) so they read well once inserted.

export interface PortfolioCalc {
    title: string;
    description: string;
    formula: string;
}

export interface PortfolioGroup {
    category: string;
    calcs: PortfolioCalc[];
}

export const CALC_PORTFOLIO: PortfolioGroup[] = [
    {
        category: 'Logic & Conditionals',
        calcs: [
            {
                title: 'Tiered Bucket',
                description: 'Bucket a measure into High / Medium / Low bands',
                formula: 'IF [Sales] >= 10000 THEN "High"\nELSEIF [Sales] >= 5000 THEN "Medium"\nELSE "Low"\nEND'
            },
            {
                title: 'Region Grouping',
                description: 'Map dimension members to a coarser group with CASE',
                formula: 'CASE [Region]\nWHEN "East" THEN "Coastal"\nWHEN "West" THEN "Coastal"\nELSE "Inland"\nEND'
            },
            {
                title: 'Profit Flag',
                description: 'Three-way IIF with an explicit unknown branch',
                formula: 'IIF([Profit] > 0, "Profit", "Loss", "Unknown")'
            },
            {
                title: 'Null-Safe Value',
                description: 'Substitute a default when a field is Null',
                formula: 'IFNULL([Discount], 0)'
            },
            {
                title: 'Recent Order Flag',
                description: 'Boolean: order placed within the last year',
                formula: '[Order Date] >= DATEADD(\'year\', -1, TODAY())'
            }
        ]
    },
    {
        category: 'Aggregation & Ratios',
        calcs: [
            {
                title: 'Conditional Sum',
                description: 'Sum a measure for one segment only',
                formula: 'SUM(IF [Category] = "Furniture" THEN [Sales] END)'
            },
            {
                title: 'Distinct Customers',
                description: 'Count unique members of a dimension',
                formula: 'COUNTD([Customer ID])'
            },
            {
                title: 'Profit Ratio',
                description: 'Aggregate-then-divide (correct ratio of totals)',
                formula: 'SUM([Profit]) / SUM([Sales])'
            },
            {
                title: 'Average Order Value',
                description: 'Total sales divided by distinct orders',
                formula: 'SUM([Sales]) / COUNTD([Order ID])'
            },
            {
                title: 'Safe Divide',
                description: 'Return Null instead of dividing by zero',
                formula: 'IF SUM([Sales]) = 0 THEN NULL\nELSE SUM([Profit]) / SUM([Sales])\nEND'
            }
        ]
    },
    {
        category: 'Level of Detail (LOD)',
        calcs: [
            {
                title: 'Sales per Customer',
                description: 'FIXED total that ignores viz granularity',
                formula: '{ FIXED [Customer ID] : SUM([Sales]) }'
            },
            {
                title: 'First Purchase Date',
                description: 'Earliest order date per customer',
                formula: '{ FIXED [Customer ID] : MIN([Order Date]) }'
            },
            {
                title: 'Percent of Grand Total',
                description: 'Row value over the FIXED grand total',
                formula: 'SUM([Sales]) / SUM({ FIXED : SUM([Sales]) })'
            },
            {
                title: 'Repeat Customer',
                description: 'True when a customer has more than one order',
                formula: '{ FIXED [Customer ID] : COUNTD([Order ID]) } > 1'
            },
            {
                title: 'Customer-Level Average',
                description: 'INCLUDE pulls customer detail into the aggregate',
                formula: 'AVG({ INCLUDE [Customer ID] : SUM([Sales]) })'
            }
        ]
    },
    {
        category: 'Table Calculations',
        calcs: [
            {
                title: 'Running Total',
                description: 'Cumulative sum along the table',
                formula: 'RUNNING_SUM(SUM([Sales]))'
            },
            {
                title: 'Moving Average (3)',
                description: 'Trailing three-period average',
                formula: 'WINDOW_AVG(SUM([Sales]), -2, 0)'
            },
            {
                title: 'Year-over-Year Growth',
                description: 'Percent change vs. the previous period',
                formula: '(SUM([Sales]) - LOOKUP(SUM([Sales]), -1))\n/ LOOKUP(SUM([Sales]), -1)'
            },
            {
                title: 'Rank',
                description: 'Descending competition rank of a measure',
                formula: 'RANK(SUM([Sales]))'
            },
            {
                title: 'Percent of Total',
                description: 'Share of the partition total',
                formula: 'SUM([Sales]) / TOTAL(SUM([Sales]))'
            },
            {
                title: 'Difference from Prior',
                description: 'Null-safe change from the previous mark',
                formula: 'ZN(SUM([Sales])) - LOOKUP(ZN(SUM([Sales])), -1)'
            }
        ]
    },
    {
        category: 'Date & Time',
        calcs: [
            {
                title: 'Age in Years',
                description: 'Whole years between a date and today',
                formula: 'DATEDIFF(\'year\', [Birth Date], TODAY())'
            },
            {
                title: 'Truncate to Month',
                description: 'Snap a date to the first of its month',
                formula: 'DATETRUNC(\'month\', [Order Date])'
            },
            {
                title: 'Fiscal Year (Oct start)',
                description: 'Shift the year for an October fiscal calendar',
                formula: 'IF DATEPART(\'month\', [Order Date]) >= 10\nTHEN DATEPART(\'year\', [Order Date]) + 1\nELSE DATEPART(\'year\', [Order Date])\nEND'
            },
            {
                title: 'Last 30 Days',
                description: 'Boolean relative-date flag',
                formula: '[Order Date] >= DATEADD(\'day\', -30, TODAY())'
            },
            {
                title: 'Parse Text to Date',
                description: 'Read a date from a string with a format mask',
                formula: 'DATEPARSE("yyyy-MM-dd", [Date String])'
            },
            {
                title: 'Weekday Name',
                description: 'Day-of-week label for a date',
                formula: 'DATENAME(\'weekday\', [Order Date])'
            }
        ]
    },
    {
        category: 'String',
        calcs: [
            {
                title: 'Trim Whitespace',
                description: 'Strip leading and trailing spaces',
                formula: 'TRIM([Customer Name])'
            },
            {
                title: 'Proper Case First Letter',
                description: 'Capitalize the first character only',
                formula: 'UPPER(LEFT([Name], 1)) + MID([Name], 2)'
            },
            {
                title: 'Initials',
                description: 'First letters of first and last name',
                formula: 'LEFT([First Name], 1) + LEFT([Last Name], 1)'
            },
            {
                title: 'Email Domain',
                description: 'Take the part after the @ sign',
                formula: 'SPLIT([Email], "@", 2)'
            },
            {
                title: 'Contains Keyword',
                description: 'Boolean substring test',
                formula: 'CONTAINS([Notes], "urgent")'
            },
            {
                title: 'Digits Only',
                description: 'Strip every non-numeric character',
                formula: 'REGEXP_REPLACE([Phone], "[^0-9]", "")'
            }
        ]
    },
    {
        category: 'Number & Financial',
        calcs: [
            {
                title: 'Margin %',
                description: 'Gross margin as a share of sales',
                formula: '(SUM([Sales]) - SUM([Cost])) / SUM([Sales])'
            },
            {
                title: 'Round to Cents',
                description: 'Two-decimal rounding',
                formula: 'ROUND([Price], 2)'
            },
            {
                title: 'CAGR',
                description: 'Compound annual growth rate over N years',
                formula: 'POWER(SUM([Ending Value]) / SUM([Beginning Value]), 1 / [Years]) - 1'
            },
            {
                title: 'Abbreviate K / M',
                description: 'Format a measure as a short currency string',
                formula: 'IF ABS(SUM([Sales])) >= 1000000\nTHEN STR(ROUND(SUM([Sales]) / 1000000, 1)) + "M"\nELSEIF ABS(SUM([Sales])) >= 1000\nTHEN STR(ROUND(SUM([Sales]) / 1000, 1)) + "K"\nELSE STR(SUM([Sales]))\nEND'
            }
        ]
    },
    {
        category: 'Parameters & Dynamic',
        calcs: [
            {
                title: 'Measure Switcher',
                description: 'Swap the displayed measure from a parameter',
                formula: 'CASE [Parameters].[Measure Selector]\nWHEN "Sales" THEN SUM([Sales])\nWHEN "Profit" THEN SUM([Profit])\nWHEN "Quantity" THEN SUM([Quantity])\nELSE NULL\nEND'
            },
            {
                title: 'Top-N Flag',
                description: 'Keep marks ranked within a parameter value',
                formula: 'RANK(SUM([Sales])) <= [Parameters].[Top N]'
            },
            {
                title: 'Target Threshold',
                description: 'Boolean compare against a parameter target',
                formula: 'SUM([Sales]) >= [Parameters].[Target]'
            },
            {
                title: 'Dynamic Date Grain',
                description: 'Let a parameter drive the date truncation',
                formula: 'DATETRUNC([Parameters].[Date Grain], [Order Date])'
            }
        ]
    }
];
