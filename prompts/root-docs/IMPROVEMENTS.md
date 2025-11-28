# Tableau LSP Extension Improvements

This document outlines the recommended improvements for the Tableau LSP extension based on the code review.

## 1. Update .vscodeignore

**File:** `.vscodeignore`

**Change:** Add the following lines to reduce package size:

```
# Git hooks and documentation
.husky/
docs/
```

**Rationale:** These directories contain development-only files that shouldn't be included in the published extension package.

## 2. Improve ZIP Stream Processing Error Handling

**File:** `src/extract/zip.ts`

**Current Issues:**
- No error handling for stream processing
- Hardcoded timeout of 50ms is unreliable
- No validation of file data

**Recommended Implementation:**

```typescript
import * as unzipper from 'unzipper';
import { workspace } from 'vscode';
import { ExtractedCalculation } from './types';
import { extractCalcsFromXml } from './xml';
import { normalize, filterAndDedupe } from './normalize';
import { basename } from 'path';
import { TextDecoder } from 'util';

export async function extractFromFile(uri: import('vscode').Uri): Promise<ExtractedCalculation[]> {
    try {
        if (uri.fsPath.toLowerCase().endsWith('.twbx')) {
            return await extractFromTwbx(uri);
        }
        if (uri.fsPath.toLowerCase().endsWith('.twb')) {
            const data = await workspace.fs.readFile(uri);
            const xml = new TextDecoder().decode(data);
            return processXml(xml, basename(uri.fsPath));
        }
        return [];
    } catch (error) {
        console.error(`Failed to extract from file ${uri.fsPath}:`, error);
        throw new Error(`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function extractFromTwbx(uri: import('vscode').Uri): Promise<ExtractedCalculation[]> {
    return new Promise<ExtractedCalculation[]>((resolve, reject) => {
        const calcs: ExtractedCalculation[] = [];
        const errors: Error[] = [];
        let processedEntries = 0;
        let totalEntries = 0;
        let hasFoundTwb = false;

        try {
            const stream = unzipper.Parse({ forceStream: true });
            
            stream.on('entry', (entry: any) => {
                totalEntries++;
                const fileName: string = entry.path;
                
                if (fileName.toLowerCase().endsWith('.twb')) {
                    hasFoundTwb = true;
                    let chunks: Buffer[] = [];
                    
                    entry.on('data', (chunk: Buffer) => {
                        chunks.push(chunk);
                    });
                    
                    entry.on('end', () => {
                        try {
                            const xml = Buffer.concat(chunks).toString('utf8');
                            const extracted = processXml(xml, basename(fileName));
                            calcs.push(...extracted);
                        } catch (error) {
                            errors.push(new Error(`Failed to process ${fileName}: ${error}`));
                        }
                        processedEntries++;
                        checkCompletion();
                    });
                    
                    entry.on('error', (error: Error) => {
                        errors.push(new Error(`Stream error for ${fileName}: ${error.message}`));
                        processedEntries++;
                        checkCompletion();
                    });
                } else {
                    entry.autodrain();
                    processedEntries++;
                    setImmediate(checkCompletion);
                }
            });

            stream.on('error', (error: Error) => {
                reject(new Error(`ZIP parsing failed: ${error.message}`));
            });

            stream.on('end', () => {
                if (!hasFoundTwb) {
                    reject(new Error('No .twb file found in the .twbx archive'));
                }
            });

            function checkCompletion() {
                if (processedEntries >= totalEntries) {
                    if (errors.length > 0) {
                        console.warn('Extraction completed with errors:', errors);
                    }
                    resolve(calcs);
                }
            }

            // Start processing
            workspace.fs.readFile(uri).then(fileData => {
                const buffer = Buffer.from(fileData);
                stream.end(buffer);
            }).catch(reject);

        } catch (error) {
            reject(new Error(`Failed to initialize ZIP processing: ${error}`));
        }
    });
}

function processXml(xml: string, workbook: string): ExtractedCalculation[] {
    try {
        const raw = extractCalcsFromXml(xml, workbook);
        const normalized = normalize(raw);
        return filterAndDedupe(normalized);
    } catch (error) {
        console.error(`Failed to process XML for workbook ${workbook}:`, error);
        return [];
    }
}
```

**Key Improvements:**
- Proper Promise-based error handling
- Validation that .twb files exist in .twbx archives
- Error collection and reporting
- Proper completion detection instead of arbitrary timeout
- Comprehensive try-catch blocks

## 3. Add Unit Tests for Normalization Functions

**File:** `src/extract/normalize.test.ts` (new file)

**Recommended Test Implementation:**

```typescript
import { normalize, filterAndDedupe } from './normalize';
import { ExtractedCalculation } from './types';

describe('Normalization Functions', () => {
    describe('normalize', () => {
        it('should uppercase keywords', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Test Calc',
                formula: 'if [Field] = "value" then "yes" else "no" end'
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('IF [Field] = "value" THEN "yes" ELSE "no" END');
        });

        it('should condense whitespace', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Test Calc',
                formula: 'IF    [Field]   =   "value"\n\n\nTHEN\t\t"yes"\nELSE "no" END'
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('IF [Field] = "value"\n\nTHEN "yes"\nELSE "no" END');
        });

        it('should handle empty formulas', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Empty Calc',
                formula: '   \n\t  '
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('');
        });
    });

    describe('filterAndDedupe', () => {
        it('should remove trivial calculations', () => {
            const input: ExtractedCalculation[] = [
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'String Literal',
                    formula: '"Hello World"'
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Number Literal',
                    formula: '42'
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Field Reference',
                    formula: '[Sales]'
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Complex Calc',
                    formula: 'SUM([Sales]) / COUNT([Orders])'
                }
            ];

            const result = filterAndDedupe(input);
            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('Complex Calc');
        });

        it('should deduplicate identical formulas', () => {
            const input: ExtractedCalculation[] = [
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Calc 1',
                    formula: 'SUM([Sales])'
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Calc 2',
                    formula: 'sum([sales])'  // Different case
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Calc 3',
                    formula: 'AVG([Profit])'
                }
            ];

            const result = filterAndDedupe(input);
            expect(result).toHaveLength(2);
            expect(result.map(c => c.title)).toContain('Calc 1');
            expect(result.map(c => c.title)).toContain('Calc 3');
        });

        it('should handle empty input', () => {
            const result = filterAndDedupe([]);
            expect(result).toEqual([]);
        });
    });

    describe('isTrivial helper', () => {
        const testCases = [
            { formula: '', expected: true, description: 'empty string' },
            { formula: '   ', expected: true, description: 'whitespace only' },
            { formula: '"Hello"', expected: true, description: 'quoted string' },
            { formula: '42', expected: true, description: 'integer' },
            { formula: '[Field]', expected: true, description: 'field reference' },
            { formula: 'SUM([Field])', expected: false, description: 'function call' },
            { formula: '[Field1] + [Field2]', expected: false, description: 'expression' }
        ];

        testCases.forEach(({ formula, expected, description }) => {
            it(`should return ${expected} for ${description}`, () => {
                // Access the private function through the module
                const input: ExtractedCalculation[] = [{
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Test',
                    formula
                }];
                
                const result = filterAndDedupe(input);
                const wasFiltered = result.length === 0;
                expect(wasFiltered).toBe(expected);
            });
        });
    });
});
```

**Test Setup Requirements:**

Add to `package.json`:
```json
{
  "devDependencies": {
    "@types/jest": "^29.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  },
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

Create `jest.config.js`:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/test/**'
  ]
};
```

## Implementation Priority

1. **High Priority:** Update `.vscodeignore` - Simple change with immediate benefit
2. **High Priority:** Add error handling to ZIP processing - Critical for reliability
3. **Medium Priority:** Add unit tests - Important for maintainability

## Benefits

| Improvement | Benefit |
|-------------|---------|
| Updated .vscodeignore | Smaller package size, faster installs |
| Better error handling | More reliable extraction, better user experience |
| Unit tests | Easier maintenance, regression prevention |