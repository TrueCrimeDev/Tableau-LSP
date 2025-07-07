// src/common.ts

import { Diagnostic, Range, SymbolInformation, SymbolKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

// Define the types of symbols we can find in a calculation.
export enum SymbolType {
    FieldReference,
    ParameterReference, // For now, we'll treat them like Fields
    FunctionCall,
    LODExpression,
    Keyword,
    Comment,
    CalculationName,
    Variable,
}

// A simple interface to hold information about a parsed symbol.
export interface Symbol {
    name: string;
    type: SymbolType;
    range: Range;
    jsdocType?: string; // For variables with @type annotations
    // For function calls, we can store the arguments
    arguments?: ArgumentSymbol[];
    // For LODs, the inner expression
    children?: Symbol[];
}

export interface ArgumentSymbol {
    text: string;
    range: Range;
}

// A structure to hold the results of parsing a document.
export interface ParsedDocument {
    document: TextDocument;
    symbols: Symbol[];
    diagnostics: Diagnostic[];
}

// A cache to hold parsed documents to avoid re-parsing on every request.
export const parsedDocumentCache: Map<string, ParsedDocument> = new Map();

// Definition for built-in functions with their expected argument counts.
// [minArgs, maxArgs]. Use Infinity for variadic functions like IIF or CASE.
export const FUNCTION_SIGNATURES: Record<string, [number, number]> = {
    // Aggregate Functions
    'SUM': [1, 1], 'AVG': [1, 1], 'COUNT': [1, 1], 'COUNTD': [1, 1], 
    'MIN': [1, 2], 'MAX': [1, 2], // Can be aggregate MIN([Field]) or row-level MIN(a, b)
    'MEDIAN': [1, 1], 'STDEV': [1, 1], 'STDEVP': [1, 1], 'VAR': [1, 1], 'VARP': [1, 1],
    'PERCENTILE': [2, 2], 'ATTR': [1, 1], 'AGGREGATE': [1, 1],
    
    // String Functions
    'LEN': [1, 1], 'LEFT': [2, 2], 'RIGHT': [2, 2], 'MID': [2, 3], 'CONTAINS': [2, 2],
    'REPLACE': [3, 3], 'UPPER': [1, 1], 'LOWER': [1, 1], 'TRIM': [1, 1], 'LTRIM': [1, 1], 'RTRIM': [1, 1],
    'SPLIT': [3, 3], 'FIND': [2, 3], 'FINDNTH': [3, 3], 'ASCII': [1, 1], 'CHAR': [1, 1],
    'STARTSWITH': [2, 2], 'ENDSWITH': [2, 2], 'SUBSTITUTE': [3, 3], 'PROPER': [1, 1],
    'REGEXP_EXTRACT': [2, 3], 'REGEXP_MATCH': [2, 2], 'REGEXP_REPLACE': [3, 3],
    
    // Date Functions
    'DATEADD': [3, 3], 'DATEDIFF': [3, 4], 'DATEPART': [2, 3], 'DATETRUNC': [2, 3],
    'DATENAME': [2, 3], 'TODAY': [0, 0], 'NOW': [0, 0], 'YEAR': [1, 1], 'MONTH': [1, 1], 'DAY': [1, 1],
    'HOUR': [1, 1], 'MINUTE': [1, 1], 'SECOND': [1, 1], 'WEEKDAY': [1, 1], 'QUARTER': [1, 1],
    'MAKEDATE': [3, 3], 'MAKEDATETIME': [2, 2], 'MAKETIME': [3, 3],
    
    // Math Functions
    'ROUND': [1, 2], 'ABS': [1, 1], 'CEILING': [1, 1], 'FLOOR': [1, 1], 'SQRT': [1, 1],
    'POWER': [2, 2], 'EXP': [1, 1], 'LOG': [1, 2], 'LN': [1, 1], 'LOG10': [1, 1],
    'SIGN': [1, 1], 'PI': [0, 0], 'SIN': [1, 1], 'COS': [1, 1], 'TAN': [1, 1],
    'ASIN': [1, 1], 'ACOS': [1, 1], 'ATAN': [1, 1], 'ATAN2': [2, 2],
    'DEGREES': [1, 1], 'RADIANS': [1, 1], 'DIV': [2, 2], 'SQUARE': [1, 1],
    'COT': [1, 1], 'HEXBINX': [2, 2], 'HEXBINY': [2, 2],
    
    // Logical Functions
    'IF': [2, Infinity], 'IIF': [3, 4], 'CASE': [2, Infinity], 'ISNULL': [1, 1], 'IFNULL': [2, 2],
    'ZN': [1, 1], 'ISDATE': [1, 1], 'ISEMPTY': [1, 1],
    
    // Table Calculation Functions
    'FIRST': [0, 0], 'LAST': [0, 0], 'INDEX': [0, 0], 'SIZE': [0, 0],
    'LOOKUP': [1, 2], 'PREVIOUS_VALUE': [1, 1],
    'RANK': [1, 2], 'RANK_DENSE': [1, 2], 'RANK_UNIQUE': [1, 2],
    'RUNNING_SUM': [1, 1], 'RUNNING_AVG': [1, 1], 'RUNNING_COUNT': [1, 1],
    'RUNNING_MAX': [1, 1], 'RUNNING_MIN': [1, 1],
    'WINDOW_SUM': [1, 3], 'WINDOW_AVG': [1, 3], 'WINDOW_COUNT': [1, 3],
    'WINDOW_MAX': [1, 3], 'WINDOW_MIN': [1, 3],
    'TOTAL': [1, 1],
    
    // Type Conversion Functions
    'BOOL': [1, 1], 'DATE': [1, 1], 'DATETIME': [1, 1], 'FLOAT': [1, 1], 'INT': [1, 1], 'STR': [1, 1],
    
    // LOD Keywords (not functions, but good to have here)
    'FIXED': [1, Infinity], 'INCLUDE': [1, Infinity], 'EXCLUDE': [1, Infinity]
};
