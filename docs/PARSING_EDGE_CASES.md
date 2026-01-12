# Tableau Workbook Parsing Edge Cases

This document outlines edge cases, known limitations, and special handling in the Tableau workbook parsing implementation.

## Table of Contents
1. [XML Parsing Edge Cases](#xml-parsing-edge-cases)
2. [Data Type Edge Cases](#data-type-edge-cases)
3. [Calculation Extraction Edge Cases](#calculation-extraction-edge-cases)
4. [Parameter Extraction Edge Cases](#parameter-extraction-edge-cases)
5. [Filter Extraction Edge Cases](#filter-extraction-edge-cases)
6. [Dashboard Extraction Edge Cases](#dashboard-extraction-edge-cases)
7. [Connection Parsing Edge Cases](#connection-parsing-edge-cases)
8. [Performance and Memory Considerations](#performance-and-memory-considerations)
9. [Known Limitations](#known-limitations)

---

## XML Parsing Edge Cases

### 1. Malformed XML
**Issue**: Control characters, unescaped ampersands, missing declarations

**Handling**:
- `xmlCleaner.ts` removes control characters (`\x00-\x08`, `\x0B-\x0C`, `\x0E-\x1F`, `\x7F`)
- Escapes unescaped `&` while preserving valid entities (`&amp;`, `&#123;`, `&#x41;`)
- Strips leading XML declarations

**Test Coverage**: `src/extract/__tests__/xmlCleaner.test.ts` (40+ test cases)

### 2. Case Sensitivity
**Issue**: Tableau XML may use `<workbook>` or `<Workbook>`, `<datasources>` or `<Datasources>`

**Handling**:
```typescript
const workbookNode = toNode(root.workbook) ?? toNode(root.Workbook) ?? root;
const datasourceContainer = toNode(workbookNode.datasources) ?? toNode(workbookNode.Datasources);
```

### 3. Single vs Array Nodes
**Issue**: XML parser returns single objects for one child, arrays for multiple

**Handling**: `toNodeArray()` function normalizes both cases:
```typescript
function toNodeArray(value: unknown): XmlNode[] {
    if (Array.isArray(value)) {
        return value.map(toNode).filter(item => Boolean(item));
    }
    const single = toNode(value);
    return single ? [single] : [];
}
```

### 4. Nested Text Content
**Issue**: Text can be in `#text`, `$text`, `text`, or nested `<formula>` elements

**Handling**: Cascading fallback in `toStringValue()`:
```typescript
return toStringValue(record['#text'])
    ?? toStringValue(record['$text'])
    ?? toStringValue(record['text'])
    ?? undefined;
```

### 5. Empty/Missing Attributes
**Issue**: Optional attributes may be `undefined`, empty string, or missing

**Handling**: `coalesceString()` function finds first non-empty value:
```typescript
function coalesceString(...values: Array<string | undefined>): string {
    for (const value of values) {
        if (value && value.trim()) {
            return value.trim();
        }
    }
    return '';
}
```

---

## Data Type Edge Cases

### 1. Bracketed vs Unbracketed Field Names
**Issue**: Fields can be `[Sales]` or `Sales`

**Handling**: `stripBrackets()` function handles both:
```typescript
const trimmed = value.trim();
if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.substring(1, trimmed.length - 1);
}
return trimmed;
```

### 2. Numeric Values as Strings
**Issue**: XML attributes like `width="800"` are parsed as strings

**Handling**: Explicit conversion in dashboard extraction:
```typescript
const width = sizeNode ? Number(getString(sizeNode, 'width')) : undefined;
```

### 3. Boolean Attributes
**Issue**: Boolean attributes may be `'true'`, `'false'`, `1`, `0`, or missing

**Handling**: Parser options configured with `allowBooleanAttributes: true`

---

## Calculation Extraction Edge Cases

### 1. Multiple Formula Locations
**Issue**: Formulas can appear in:
- `<calculation formula="...">`
- `<calculation><formula>...</formula></calculation>`
- `<calculation>#text</calculation>`

**Handling**: `extractFormula()` checks all three locations:
```typescript
const fromAttribute = toStringValue(node['formula']);
if (fromAttribute) return fromAttribute;

const nestedNode = toNode(node['formula']);
if (nestedNode) {
    const nested = toStringValue(nestedNode['formula'])
        ?? toStringValue(nestedNode['#text'])
        ?? toStringValue(nestedNode['text']);
    if (nested) return nested;
}

return toStringValue(node['#text']) ?? toStringValue(node['text']);
```

### 2. Duplicate Calculations
**Issue**: Same calculation may appear in datasource and worksheet levels

**Handling**: Deduplication in `normalize.ts`:
```typescript
export function deduplicate(formulas: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const formula of formulas) {
        const normalized = formula.trim().replace(/\s+/g, ' ').toLowerCase();
        if (!seen.has(normalized)) {
            seen.add(normalized);
            result.push(formula);
        }
    }

    return result;
}
```

### 3. Trivial Calculations
**Issue**: Some "calculations" are just field references like `[Sales]` or literals like `42`

**Handling**: `isTrivialFormula()` filters these out:
```typescript
function isTrivialFormula(formula: string): boolean {
    const trimmed = formula.trim();

    // Quoted strings
    if (/^['"].*['"]$/.test(trimmed)) return true;

    // Field references
    if (/^\[.+\]$/.test(trimmed)) return true;

    // Integer literals
    if (/^-?\d+$/.test(trimmed)) return true;

    return false;
}
```

### 4. Worksheet-Level vs Datasource-Level Calculations
**Issue**: Calculations may be defined at different levels with different scopes

**Handling**: Extract both, then check `isColumnInDatasource()` to avoid duplicates:
```typescript
for (const column of allColumns) {
    if (isColumnInDatasource(column, datasources)) {
        continue; // Skip already processed datasource columns
    }
    // Process worksheet-level calculation
}
```

---

## Parameter Extraction Edge Cases

### 1. Parameter Datasource Detection
**Issue**: Parameters are in a special "Parameters" datasource, but name may vary

**Handling**: Multiple detection methods:
```typescript
const isParameterDatasource = datasourceName?.toLowerCase().includes('parameter') ||
                              datasourceLabel.toLowerCase().includes('parameter');

// Also check for param-domain-type attribute
const paramDomainType = getString(column, 'param-domain-type');
if (paramDomainType || isParameterDatasource) {
    // Extract parameter
}
```

### 2. Range vs List Parameters
**Issue**: Different domain types have different structures

**Handling**: Conditional extraction:
```typescript
// Range parameters
const rangeNode = toNode(column.range);
const minValue = rangeNode ? getString(rangeNode, 'min') : undefined;
const maxValue = rangeNode ? getString(rangeNode, 'max') : undefined;

// List parameters
const membersNode = toNode(column.members) ?? toNode(column['calculation:members']);
if (membersNode) {
    const members = getChildNodes(membersNode, 'member');
    for (const member of members) {
        const memberValue = getString(member, 'value') ?? toStringValue(member);
        if (memberValue) allowableValues.push(memberValue);
    }
}
```

### 3. Default Values
**Issue**: Default value can be in `value` attribute or `<calculation>` formula

**Handling**: Extract both:
```typescript
const value = getString(column, 'value');
const calculations = getChildNodes(column, 'calculation');
let formula: string | undefined;
if (calculations.length > 0) {
    formula = extractFormula(calculations[0]);
}
```

---

## Filter Extraction Edge Cases

### 1. Filter Location Variability
**Issue**: Filters are nested deeply: `worksheet > table > view > filter`

**Handling**: Careful traversal with null checks:
```typescript
const tableNode = toNode(worksheet.table);
if (tableNode) {
    const viewNode = toNode(tableNode.view);
    if (viewNode) {
        const filterNodes = getChildNodes(viewNode, 'filter');
        // Process filters
    }
}
```

### 2. Categorical vs Quantitative Filters
**Issue**: Different filter types have different structures

**Handling**: Conditional extraction based on `class`:
```typescript
// Categorical filters have members
const groupfilterNodes = getChildNodes(filter, 'groupfilter');
for (const groupfilter of groupfilterNodes) {
    const member = getString(groupfilter, 'member');
    if (member) members.push(member);
}

// Quantitative filters have min/max
const minValue = getString(filter, 'min');
const maxValue = getString(filter, 'max');
```

### 3. Complex Group Filters
**Issue**: Group filters can be nested with union/intersection operations

**Handling**: Current implementation extracts members at first level only (limitation)

---

## Dashboard Extraction Edge Cases

### 1. Nested Zones
**Issue**: Dashboard zones can be nested recursively for layouts

**Handling**: Recursive extraction function:
```typescript
const extractZones = (node: XmlNode): void => {
    const zoneNodes = getChildNodes(node, 'zone');
    for (const zone of zoneNodes) {
        zones.push({...});
        extractZones(zone); // Recursive call
    }
};
extractZones(dashboard);
```

### 2. Zone Type Identification
**Issue**: Zones can be worksheets, images, text, containers, etc.

**Handling**: Extract type and conditionally extract worksheet name:
```typescript
const zoneType = getString(zone, 'type') || 'unknown';
zones.push({
    worksheet: zoneType === 'worksheet' ? zoneName : undefined
});
```

### 3. Size Units
**Issue**: Width/height can be in different units or missing

**Handling**: Store as numbers with fallback:
```typescript
const width = sizeNode ? Number(getString(sizeNode, 'width')) : undefined;
const height = sizeNode ? Number(getString(sizeNode, 'height')) : undefined;
```

**Limitation**: Unit conversion not implemented (assumes pixels)

---

## Connection Parsing Edge Cases

### 1. Connection Type Variability
**Issue**: Different connection classes have different attributes

**Handling**: Extract all common attributes, ignore type-specific ones:
```typescript
connection = {
    class: connClass,
    server: getString(connectionNode, 'server'),
    dbname: getString(connectionNode, 'dbname'),
    username: getString(connectionNode, 'username'),
    filename: getString(connectionNode, 'filename'),
    schema: getString(connectionNode, 'schema'),
    authentication: getString(connectionNode, 'authentication'),
    port: getString(connectionNode, 'port')
};
```

### 2. Nested Connections
**Issue**: Some datasources have federated or named connections

**Handling**: Current implementation only extracts top-level connection (limitation)

### 3. Embedded Credentials
**Issue**: Passwords and sensitive data may be in connection strings

**Handling**: Passwords are extracted but not processed (shown as-is in output)

**Security Note**: Output files may contain sensitive connection information

---

## Performance and Memory Considerations

### 1. Large Workbooks
**Issue**: Workbooks with 1000+ calculations can consume significant memory

**Handling**:
- Stream-based ZIP extraction in `zip.ts`
- Per-entry processing with error isolation
- No caching across multiple files

**Limitation**: Full XML loaded into memory for parsing (no streaming XML parser)

### 2. Deeply Nested Structures
**Issue**: Recursive functions (findAllColumns, extractZones) can stack overflow

**Handling**: JavaScript call stack limit (~10,000 frames) typically sufficient

**Limitation**: No depth limit implemented

### 3. Duplicate Detection Performance
**Issue**: O(n²) comparison for duplicate formulas

**Handling**: Normalized lowercase comparison with Set-based deduplication:
```typescript
const seen = new Set<string>();
for (const formula of formulas) {
    const normalized = formula.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(formula);
    }
}
```

**Performance**: O(n) with Set lookup

---

## Known Limitations

### 1. Not Implemented
- **Actions**: Dashboard actions and worksheet actions not extracted
- **Sets**: Calculated sets not distinguished from calculations
- **Custom SQL**: Custom SQL expressions not extracted
- **Table Calculations**: Table calc formulas not identified separately
- **LOD Expressions**: No special handling for FIXED/INCLUDE/EXCLUDE
- **Parameters in Calculations**: Parameter references not tracked
- **User Filters**: User-based filters not extracted
- **Data Blending**: Blend relationships not captured
- **Aliases**: Field aliases not fully tracked
- **Groups**: Field grouping information not extracted

### 2. Partial Implementation
- **Hierarchies**: Only extracts from datasource-level `drill-path` and `layout > hierarchy`
- **Filters**: Complex group filters only extract first-level members
- **Connections**: Nested/federated connections only show top-level
- **Worksheets**: Calculated field count is approximate (may miss some types)

### 3. Format-Specific Limitations
- **.twbx**: Extracts all .twb files found, may process unintended workbooks
- **Large Files**: Files >100MB may cause memory issues
- **Binary Data**: Embedded data extracts and images not processed
- **Thumbnails**: Base64 thumbnails ignored

### 4. Tableau Version Compatibility
- **Tested**: Tableau 2023.2 format (version 18.1)
- **Older Versions**: May have different XML structure (untested)
- **Newer Versions**: New features may not be recognized

### 5. Name Resolution
- **Internal IDs**: Federated IDs (e.g., `federated.123abc`) resolved best-effort
- **Calculation References**: `[Calculation_12345]` patterns replaced if mapping exists
- **SqlProxy**: Stripped from field names but connection not traced

### 6. Output Format
- **No JSON Export**: Only custom `.twbl` text format
- **No CSV Export**: Structured data not available in tabular format
- **Fixed Column Order**: Summary, datasources, parameters, filters, dashboards, worksheets, hierarchies, fields, calculations

---

## Edge Case Test Coverage

### Comprehensive Tests
- `xml.test.ts`: 4 core extraction tests
- `xmlCleaner.test.ts`: 40+ malformed XML tests
- `normalize.test.ts`: 50+ normalization tests
- `nameResolver.test.ts`: 70+ name resolution tests
- `outputGenerator.test.ts`: 50+ output formatting tests
- `zip.test.ts`: 6 archive handling tests

### Test Scenarios Covered
- Empty workbooks
- Malformed XML
- Unicode characters
- Control characters
- Nested calculations
- Duplicate formulas
- Trivial formulas
- Bracketed field names
- Missing attributes
- Case sensitivity
- Single vs array nodes

### Untested Edge Cases
- Very large workbooks (>100MB)
- Deeply nested zones (>50 levels)
- Workbooks with 10,000+ calculations
- Non-English character sets (partial coverage)
- Corrupted ZIP archives (partial coverage)

---

## Recommendations for Robust Parsing

### 1. Always Use Preprocessing Pipeline
```typescript
const preprocessor = {
    clean: cleanXml,
    resolveNames: (xml) => resolveNamesInXml(xml, nameMappings)
};

const calcs = extractCalcsFromXml(xml, workbookName, preprocessor);
```

### 2. Handle Missing Data Gracefully
All extraction functions return empty arrays for invalid input:
```typescript
if (!processedXml) return [];
if (!root) return [];
if (!workbookNode) return [];
```

### 3. Validate Extracted Data
Check summary counts match expectations:
```typescript
const result = extractAll(xml, workbookName);
console.log(`Extracted ${result.calculations.length} calculations`);
console.log(`Summary reports ${result.summary.calculations} calculations`);
```

### 4. Test with Real Workbooks
Use Test_LSP.twb as reference:
- Excel-direct connection
- Datasource-level calculations
- Worksheet-level filters
- Mixed field types

---

## Future Improvements

### 1. Performance
- Streaming XML parser for large files
- Parallel processing of multiple .twb files in .twbx
- Caching of name resolutions across files
- Depth limits for recursive functions

### 2. Feature Completeness
- Dashboard actions extraction
- Table calculation identification
- Set formulas extraction
- User filter tracking
- Data blend relationships

### 3. Output Formats
- JSON export option
- CSV export for tabular data
- HTML report generation
- Markdown documentation format

### 4. Error Handling
- Detailed error messages with line numbers
- Partial extraction on parse errors
- Warning logs for skipped elements
- Validation report generation

---

## Sources
- [Tableau Workbook Structure (Medium)](https://medium.com/@yaron.lirase/unraveling-tableau-workbook-structure-twbx-twb-bdc3b2a93492)
- [Fully Documented Tableau XML (GitHub)](https://github.com/ranvithm/tableau.xml)
- [Tableau XML Metadata (COENTerprise)](https://www.coenterprise.com/blog/uncovering-the-value-of-tableaus-workbook-xml-metadata/)
