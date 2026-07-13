# Tableau LSP Snippets Guide

This guide provides comprehensive documentation for all available code snippets in the Tableau Language Support extension.

## Overview

The Tableau LSP extension includes over 100 pre-built code snippets organized into categories:

- **Basic Calculations**: IF/CASE statements, aggregations, common functions
- **Slash Commands**: Quick insertion via `/` prefix
- **Advanced Patterns**: Business analytics, statistical calculations, and complex formulas

## How to Use Snippets

### Method 1: IntelliSense (Recommended)
1. Start typing the snippet prefix (e.g., `if`, `sum`, `cohort`)
2. Select the snippet from the IntelliSense dropdown
3. Press `Tab` to insert and navigate through placeholders
4. Fill in the placeholder values

### Method 2: Keyboard Shortcut
1. Press `Ctrl+Shift+S` (`Cmd+Shift+S` on Mac)
2. Select from the snippet picker
3. Fill in the placeholder values

### Method 3: Slash Commands
1. Type `/` followed by the command (e.g., `/if`, `/case`, `/lod`)
2. Select from the completion list
3. Fill in the placeholder values

## Basic Calculations

### Control Flow

#### IF Statement (`if`)
```tableau
IF condition THEN value
ELSE value
END
```

#### IF-ELSEIF Statement (`ifelseif`)
```tableau
IF condition THEN value
ELSEIF condition THEN value
ELSE value
END
```

#### Nested IF (`nestedif`)
```tableau
IF condition THEN
    IF condition THEN value
    ELSE value
    END
ELSE value
END
```

#### CASE Statement (`case`)
```tableau
CASE field
    WHEN 'value' THEN result
    WHEN 'value' THEN result
    ELSE default
END
```

#### CASE WHEN Statement (`casewhen`)
```tableau
CASE
    WHEN condition THEN result
    WHEN condition THEN result
    ELSE default
END
```

### Aggregate Functions

| Prefix | Function | Description |
|--------|----------|-------------|
| `sum` | `SUM([Field])` | Sum aggregate |
| `avg` | `AVG([Field])` | Average aggregate |
| `count` | `COUNT([Field])` | Count aggregate |
| `countd` | `COUNTD([Field])` | Count distinct |
| `min` | `MIN([Field])` | Minimum value |
| `max` | `MAX([Field])` | Maximum value |
| `median` | `MEDIAN([Field])` | Median value |
| `stdev` | `STDEV([Field])` | Standard deviation |
| `var` | `VAR([Field])` | Variance |

### Date Functions

| Prefix | Function | Description |
|--------|----------|-------------|
| `datepart` | `DATEPART('year', [Date])` | Extract date part |
| `dateadd` | `DATEADD('month', 1, [Date])` | Add time interval |
| `datediff` | `DATEDIFF('day', [Start], [End])` | Calculate difference |
| `datetrunc` | `DATETRUNC('month', [Date])` | Truncate to period |
| `today` | `TODAY()` | Current date |
| `now` | `NOW()` | Current date/time |
| `makedate` | `MAKEDATE(year, month, day)` | Create date |
| `year` | `YEAR([Date])` | Extract year |
| `month` | `MONTH([Date])` | Extract month |
| `day` | `DAY([Date])` | Extract day |

### String Functions

| Prefix | Function | Description |
|--------|----------|-------------|
| `left` | `LEFT([String], number)` | Left characters |
| `right` | `RIGHT([String], number)` | Right characters |
| `mid` | `MID([String], start, length)` | Middle characters |
| `len` | `LEN([String])` | String length |
| `upper` | `UPPER([String])` | Convert to uppercase |
| `lower` | `LOWER([String])` | Convert to lowercase |
| `trim` | `TRIM([String])` | Remove spaces |
| `contains` | `CONTAINS([String], 'text')` | Check if contains |
| `startswith` | `STARTSWITH([String], 'prefix')` | Check if starts with |
| `endswith` | `ENDSWITH([String], 'suffix')` | Check if ends with |
| `replace` | `REPLACE([String], 'old', 'new')` | Replace text |
| `split` | `SPLIT([String], 'delimiter', position)` | Split string |

### Mathematical Functions

| Prefix | Function | Description |
|--------|----------|-------------|
| `abs` | `ABS([Number])` | Absolute value |
| `round` | `ROUND([Number], decimals)` | Round to decimals |
| `ceiling` | `CEILING([Number])` | Round up |
| `floor` | `FLOOR([Number])` | Round down |
| `sqrt` | `SQRT([Number])` | Square root |
| `power` | `POWER([Number], exponent)` | Raise to power |
| `exp` | `EXP([Number])` | Exponential |
| `log` | `LOG([Number])` | Natural logarithm |
| `log10` | `LOG10([Number])` | Base-10 logarithm |
| `sign` | `SIGN([Number])` | Sign of number |

### Logical Functions

| Prefix | Function | Description |
|--------|----------|-------------|
| `isnull` | `ISNULL([Field])` | Check if null |
| `ifnull` | `IFNULL([Field], replacement)` | Replace null |
| `zn` | `ZN([Field])` | Convert null to zero |
| `and` | `condition AND condition` | Logical AND |
| `or` | `condition OR condition` | Logical OR |
| `not` | `NOT condition` | Logical NOT |
| `in` | `[Field] IN (value1, value2)` | Value in list |

## Level of Detail (LOD) Expressions

### Basic LOD (`fixed`, `include`, `exclude`)

#### FIXED LOD (`fixed`)
```tableau
{ FIXED [Dimension] : AGG([Measure]) }
```
Computes values at a specific dimension level, ignoring view-level filters.

#### INCLUDE LOD (`include`)
```tableau
{ INCLUDE [Dimension] : AGG([Measure]) }
```
Includes additional dimensions beyond the view level.

#### EXCLUDE LOD (`exclude`)
```tableau
{ EXCLUDE [Dimension] : AGG([Measure]) }
```
Excludes dimensions from the view level calculation.

#### Multiple Dimensions (`fixedmulti`)
```tableau
{ FIXED [Dimension1], [Dimension2] : AGG([Measure]) }
```

## Table Calculations

| Prefix | Function | Description |
|--------|----------|-------------|
| `runningsum` | `RUNNING_SUM(SUM([Measure]))` | Running sum |
| `runningavg` | `RUNNING_AVG(AVG([Measure]))` | Running average |
| `windowsum` | `WINDOW_SUM(SUM([Measure]), start, end)` | Window sum |
| `windowavg` | `WINDOW_AVG(AVG([Measure]), start, end)` | Window average |
| `rank` | `RANK(SUM([Measure]))` | Rank calculation |
| `denserank` | `RANK_DENSE(SUM([Measure]))` | Dense rank |
| `percenttotal` | `SUM([Measure]) / TOTAL(SUM([Measure]))` | Percent of total |
| `percentchange` | `(Current - Previous) / Previous` | Percent change |
| `lookup` | `LOOKUP(expression, offset)` | Lookup value |
| `index` | `INDEX()` | Row index |
| `size` | `SIZE()` | Partition size |
| `first` | `FIRST()` | First row |
| `last` | `LAST()` | Last row |

## Common Calculation Patterns

### Business Metrics

#### Profit Ratio (`profitratio`)
```tableau
SUM([Profit]) / SUM([Sales])
```

#### Growth Rate (`growthrate`)
```tableau
(SUM([Current]) - SUM([Previous])) / SUM([Previous])
```

#### Year-over-Year Comparison (`yoy`)
```tableau
IF YEAR([Order Date]) = YEAR(TODAY()) THEN SUM([Sales])
ELSEIF YEAR([Order Date]) = YEAR(TODAY()) - 1 THEN SUM([Sales])
ELSE 0
END
```

#### Customer Segmentation (`customerseg`)
```tableau
IF SUM([Sales]) > 100000 THEN 'Premium'
ELSEIF SUM([Sales]) > 50000 THEN 'Standard'
ELSE 'Basic'
END
```

#### Weekday vs Weekend (`weekdayweekend`)
```tableau
IF DATEPART('weekday', [Date Field]) IN (1, 7) THEN 'Weekend'
ELSE 'Weekday'
END
```

#### Current Year Filter (`currentyear`)
```tableau
IF DATETRUNC('year', [Order Date]) = DATETRUNC('year', TODAY())
THEN SUM([Sales])
ELSE 0
END
```

#### Age Group Classification (`agegroup`)
```tableau
IF [Age] < 25 THEN '18-24'
ELSEIF [Age] < 35 THEN '25-34'
ELSEIF [Age] < 45 THEN '35-44'
ELSEIF [Age] < 55 THEN '45-54'
ELSE '55+'
END
```

## Advanced Analytics Patterns

### Customer Analytics

#### Cohort Analysis (`cohort`)
```tableau
// Customer Acquisition by Month
IF DATETRUNC('month', [First Purchase Date]) = DATETRUNC('month', [Order Date])
THEN COUNTD([Customer ID])
ELSE 0
END
```

#### Customer Retention Rate (`retention`)
```tableau
COUNTD(IF [Order Date] >= DATEADD('month', -1, TODAY()) THEN [Customer ID] END) /
COUNTD(IF [Order Date] >= DATEADD('month', -2, TODAY()) AND [Order Date] < DATEADD('month', -1, TODAY()) THEN [Customer ID] END)
```

#### Customer Churn Rate (`churn`)
```tableau
1 - (COUNTD(IF [Last Order Date] >= DATEADD('month', -3, TODAY()) THEN [Customer ID] END) /
COUNTD([Customer ID]))
```

#### Customer Lifetime Value (`clv`)
```tableau
{ FIXED [Customer ID] : SUM([Sales]) } *
{ FIXED [Customer ID] : DATEDIFF('day', MIN([Order Date]), MAX([Order Date])) } / 365 *
average_customer_lifespan_years
```

#### RFM Analysis (`rfm`)
```tableau
// Combines Recency, Frequency, Monetary scores
STR(recency_score) + STR(frequency_score) + STR(monetary_score)
```

### Statistical Analysis

#### Z-Score (`zscore`)
```tableau
(SUM([Sales]) - WINDOW_AVG(SUM([Sales]), FIRST(), LAST())) /
WINDOW_STDEV(SUM([Sales]), FIRST(), LAST())
```

#### Moving Average (`movingavg`)
```tableau
WINDOW_AVG(SUM([Sales]), -2, 0)  // 3-period moving average
```

#### Outlier Detection (`outlier`)
```tableau
// Using IQR method
IF value < (Q1 - 1.5 * IQR) OR value > (Q3 + 1.5 * IQR)
THEN 'Outlier'
ELSE 'Normal'
END
```

#### Correlation Coefficient (`correlation`)
```tableau
CORR(SUM([Sales]), SUM([Profit]))
```

#### Percentile Rank (`percentilerank`)
```tableau
RANK_PERCENTILE(SUM([Sales]), 'desc')
```

### Business Intelligence

#### ABC Analysis (`abc`)
```tableau
IF RUNNING_SUM(SUM([Sales])) / TOTAL(SUM([Sales])) <= 0.8 THEN 'A'
ELSEIF RUNNING_SUM(SUM([Sales])) / TOTAL(SUM([Sales])) <= 0.95 THEN 'B'
ELSE 'C'
END
```

#### Market Basket Analysis (`basket`)
```tableau
COUNTD(IF CONTAINS([Products], 'Product A') AND CONTAINS([Products], 'Product B') THEN [Order ID] END) /
COUNTD(IF CONTAINS([Products], 'Product A') THEN [Order ID] END)
```

#### Conversion Funnel (`funnel`)
```tableau
CASE [Funnel Stage]
    WHEN 'Awareness' THEN COUNTD([Visitor ID])
    WHEN 'Interest' THEN COUNTD(IF [Page Views] > 1 THEN [Visitor ID] END)
    WHEN 'Consideration' THEN COUNTD(IF [Time on Site] > 300 THEN [Visitor ID] END)
    WHEN 'Purchase' THEN COUNTD(IF [Orders] > 0 THEN [Visitor ID] END)
END
```

#### Net Promoter Score (`nps`)
```tableau
(COUNTD(IF [Rating] >= 9 THEN [Customer ID] END) - COUNTD(IF [Rating] <= 6 THEN [Customer ID] END)) /
COUNTD([Customer ID]) * 100
```

## Slash Commands

Slash commands provide quick access to common patterns:

| Command | Description | Template |
|---------|-------------|----------|
| `/if` | IF statement | `IF condition THEN value ELSE value END` |
| `/case` | CASE statement | `CASE field WHEN 'value' THEN result END` |
| `/when` | CASE WHEN | `CASE WHEN condition THEN result END` |
| `/lod` | LOD expression | `{ FIXED [Dimension] : AGG([Measure]) }` |
| `/iif` | Nested IIF | `IIF(condition, value, IIF(...))` |
| `/running` | Running calculation | `RUNNING_SUM(expression)` |
| `/window` | Window calculation | `WINDOW_SUM(expression, start, end)` |
| `/date` | Date part | `DATEPART('year', [Date])` |

## Comments and Documentation

### Single Line Comment (`//`)
```tableau
// This is a comment
```

### Multi-line Comment (`/*`)
```tableau
/*
 * Multi-line comment
 * with description
 */
```

### Documentation Comment (`/**`)
```tableau
/**
 * Function description
 * @param parameter description
 * @returns description
 */
```

## Field References

### Basic Field Reference (`field`)
```tableau
[Field Name]
```

### Calculated Field Template (`calc`)
```tableau
// Calculation Name
calculation_expression
```

### Parameter Reference (`param`)
```tableau
[Parameters].[Parameter Name]
```

## Best Practices

### Snippet Usage Tips

1. **Start with prefixes**: Type the first few letters of what you want (e.g., `if`, `sum`, `date`)
2. **Use Tab navigation**: Press Tab to move between placeholders
3. **Customize placeholders**: Replace placeholder text with your actual field names
4. **Combine snippets**: Use multiple snippets together for complex calculations
5. **Learn shortcuts**: Memorize common prefixes for faster development

### Naming Conventions

1. **Use descriptive names**: Choose field names that clearly indicate their purpose
2. **Follow patterns**: Maintain consistent naming across your calculations
3. **Add comments**: Use comment snippets to document complex logic
4. **Group related calculations**: Use consistent prefixes for related metrics

### Performance Considerations

1. **Prefer LOD over table calculations**: When possible, use LOD expressions for better performance
2. **Minimize nested calculations**: Avoid deeply nested IF statements
3. **Use appropriate aggregations**: Choose the right aggregation function for your data
4. **Consider data types**: Ensure calculations use appropriate data types

## Customization

### Adding Custom Snippets

1. Open VS Code settings
2. Search for "snippets"
3. Click "Edit in settings.json"
4. Add your custom snippets following the JSON format

### Modifying Existing Snippets

1. Navigate to the extension installation directory
2. Edit the snippet files in the `snippets/` folder
3. Restart VS Code to apply changes

### Sharing Snippets

1. Export your custom snippets from VS Code settings
2. Share the JSON configuration with your team
3. Import into other VS Code installations

## Troubleshooting

### Snippets Not Appearing

1. **Check file extension**: Ensure you're working in a `.twbl` file
2. **Verify IntelliSense**: Make sure IntelliSense is enabled
3. **Restart extension**: Disable and re-enable the Tableau LSP extension
4. **Check settings**: Verify snippet settings in VS Code preferences

### Placeholder Navigation Issues

1. **Use Tab key**: Press Tab to move to the next placeholder
2. **Use Shift+Tab**: Press Shift+Tab to move to the previous placeholder
3. **Escape to exit**: Press Escape to exit snippet mode

### Performance Issues

1. **Limit snippet scope**: Use specific prefixes to reduce suggestion list
2. **Disable unused extensions**: Other extensions might interfere with snippets
3. **Check system resources**: Ensure adequate memory and CPU availability

## Integration with Other Features

### IntelliSense Integration

Snippets work seamlessly with other IntelliSense features:
- Function signatures appear after snippet insertion
- Field name completion works within snippet placeholders
- Error checking validates snippet content

### Formatting Integration

- Snippets are automatically formatted when inserted
- Use `Ctrl+Shift+F` to format after customizing snippet content
- Indentation follows your VS Code settings

### Validation Integration

- Snippets are validated in real-time as you type
- Error indicators appear for invalid syntax
- Hover information provides context for snippet functions

This comprehensive snippet library accelerates Tableau calculation development by providing tested, optimized patterns for common analytical scenarios.