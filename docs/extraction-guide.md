# Calculation Extraction Guide

## Overview

The Tableau Language Support extension provides powerful calculation extraction features that help you analyze, document, and understand calculated fields across your Tableau workbooks.

## Features

### Calculation Extraction

The **Extract Calculations** command provides comprehensive extraction with advanced processing:

- **XML Cleaning**: Removes invalid characters and fixes malformed XML
- **Name Resolution**: Replaces internal IDs with human-readable captions
- **Datasource Extraction**: Lists all datasources in the workbook
- **Field Extraction**: Captures all fields with datatype and role metadata
- **Formula Normalization**: Standardizes whitespace and formatting
- **Keyword Uppercasing**: Converts all 66 Tableau keywords to uppercase
- **Smart Filtering**: Removes trivial calculations (literals, field references)
- **Deduplication**: Eliminates duplicate calculations (case-insensitive)
- **Structured Output**: Generates formatted `.twbl` file with statistics

## Usage

### Extracting Calculations

1. **Open a Workbook**: Open any `.twb` or `.twbx` file in VS Code
2. **Run the Command**:
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "Extract Calculations"
   - Select "Tableau: Extract Calculations"
3. **Review Output**: The generated `Extracted_Calculations.twbl` file will open automatically in your workspace root

### Output Format

The extraction generates a `.twbl` file with this structure:

```
Total workbooks: 1
Total datasources: 2
Total calculations: 3
Total fields: 15

=== DATASOURCES ===
Sample_Superstore | Sales.twb
Employee_Data | HR.twb

=== FIELDS ===
Order_ID | Sample_Superstore | integer | dimension | Sales.twb
Product_Name | Sample_Superstore | string | dimension | Sales.twb
Sales | Sample_Superstore | real | measure | Sales.twb
Profit | Sample_Superstore | real | measure | Sales.twb
Employee_ID | Employee_Data | integer | dimension | HR.twb
Hire_Date | Employee_Data | date | dimension | HR.twb

=== CALCULATIONS ===
// Profit Margin | Sample_Superstore | Sales.twb
IF SUM([Sales]) > 0 THEN SUM([Profit]) / SUM([Sales]) ELSE 0 END

// Profit Category | Sample_Superstore | Sales.twb
CASE
WHEN [Profit Margin] > 0.3 THEN "High"
WHEN [Profit Margin] > 0.1 THEN "Medium"
ELSE "Low"
END

// Years Employed | Employee_Data | HR.twb
DATEDIFF("year", [Hire Date], TODAY())
```

The output includes three sections:

1. **Datasources Section**:
   - Format: `Datasource_Name | workbook.twb`
   - Lists all datasources found in the workbook

2. **Fields Section**:
   - Format: `Field_Name | Datasource_Name | datatype | role | workbook.twb`
   - Lists all fields with their metadata (datatype, role)
   - Includes both dimensions and measures

3. **Calculations Section**:
   - Format: `// Caption | Datasource_Name | workbook.twb` followed by the formula
   - Normalized formulas with uppercased keywords
   - Blank line separator between calculations

## Processing Pipeline

### 1. XML Cleaning

Removes problematic content that can cause parsing issues:

- Invalid control characters (`\x00-\x08`, `\x0B`, `\x0C`, `\x0E-\x1F`, `\x7F`)
- Unescaped ampersands (converted to `&amp;`)
- XML declarations (removed for string processing)

### 2. Name Resolution

Replaces internal Tableau identifiers with human-readable names:

- **Datasource names**: `federated.123abc` → `Sample Superstore`
- **Calculation names**: `[Calculation_456]` → `[Profit Margin]`
- **Reference patterns**: `Calculation_789` → `Revenue`
- **Proxy removal**: `[sqlproxy.abc].[Field]` → `[Field]`

### 3. Formula Normalization

Standardizes formula formatting:

- Strips leading/trailing whitespace from each line
- Removes blank lines completely
- Normalizes line endings to `\n`
- Condenses multiple spaces to single spaces

### 4. Keyword Uppercasing

Converts all 66 Tableau keywords to uppercase:

**Functions**: ABS, ACOS, ASIN, ATAN, ATAN2, AVG, CEILING, COS, COT, DEGREES, DIV, EXP, FLOOR, SQUARE, ZN

**String Functions**: LOWER, UPPER, ASCII, CHAR, CONTAINS, ENDSWITH, FIND, LEFT, RIGHT, LEN, TRIM, LTRIM, MID, REPLACE, RTRIM, SPACE, SPLIT, STARTSWITH

**User Functions**: USERNAME, ISUSERNAME, ISMEMBEROF, USERDOMAIN, FULLNAME, ISFULLNAME

**Control**: IF, ELSE, ELSEIF, CASE, AND, OR, NOT, THEN, WHEN, END

**Aggregates**: VAR, VARP, SUM, STDEV, STDEVP, PERCENTILE, MIN, MEDIAN, MAX, COVARP, COUNT, COUNTD, CORR, COLLECT, ATTR

**Spatial**: DISTANCE, MAKELINE, MAKEPOINT

### 5. Filtering

Removes trivial calculations:

- **String literals**: `"Hello World"`
- **Numeric literals**: `42`, `-100`
- **Field references**: `[Sales]`, `[Product Name]`
- **Empty formulas**: Whitespace only

Complex calculations with functions, operators, or logic are preserved.

### 6. Deduplication

Eliminates duplicate calculations:

- Case-insensitive comparison
- Whitespace-normalized matching
- Preserves first occurrence

## Tips and Best Practices

### Working with Multiple Workbooks

To extract calculations from multiple workbooks:

1. Open each workbook file in VS Code
2. Run the extraction command for each
3. The `Extracted_Calculations.twbl` file accumulates results from all extractions

### Analyzing Output

The `Extracted_Calculations.twbl` file is plain text and can be:

- Searched with `Cmd+F` / `Ctrl+F`
- Filtered using VS Code's search features
- Processed with text analysis tools
- Version controlled with git
- Shared with team members

### Customizing Output Location

Currently, the output file is always generated in the workspace root. To save to a different location:

1. Run the extraction command
2. Copy/move `Extracted_Calculations.twbl` to desired location
3. Rename as needed

## Troubleshooting

### No Calculations Found

**Cause**: Workbook contains no calculated fields or only trivial calculations

**Solutions**:
- Verify the workbook actually contains calculations in Tableau Desktop
- Check if calculations are simple field references (these are filtered out)
- Review the filtering rules to understand what's considered "trivial"

### Malformed XML Errors

**Cause**: Workbook XML contains severe corruption

**Solutions**:
- Try opening and re-saving the workbook in Tableau Desktop
- Check if the `.twb` file is valid XML (open in a text editor)
- Report the issue if the file works fine in Tableau Desktop

### Missing Workspace Folder

**Cause**: No folder is open in VS Code

**Solution**:
- Open a folder: `File > Open Folder`
- The extraction requires a workspace to determine output location

### Incorrect Name Resolution

**Cause**: Complex calculation references may not be fully resolved

**Investigation**:
- Check the comment header for the datasource name
- Verify field names in Tableau Desktop
- Complex nested calculations may retain internal IDs

## File Reference

- **src/commands/extractCalculationsPython.ts**: Main command handler
- **src/extract/xmlCleaner.ts**: XML preprocessing
- **src/extract/nameResolver.ts**: Name resolution logic
- **src/extract/normalize.ts**: Formula normalization and filtering
- **src/extract/outputGenerator.ts**: Output file generation

## Related Documentation

- [Snippets Guide](./snippets-guide.md): Working with calculation templates
- [Keyboard Shortcuts](./keyboard-shortcuts.md): Quick access to features

## Support

For issues or feature requests related to calculation extraction:

1. Check existing [GitHub Issues](https://github.com/your-repo/issues)
2. Create a new issue with:
   - VS Code version
   - Extension version
   - Sample `.twb` file (if possible)
   - Error message or unexpected output
