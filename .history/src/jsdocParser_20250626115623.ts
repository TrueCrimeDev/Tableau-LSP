import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface JSDocSymbol {
    name: string;
    type: string;
    description: string;
    parameters?: JSDocParam[];
    returns?: string;
    example?: string;
    markdown_detail?: string;
    deprecated?: boolean;
    since?: string;
    author?: string;
}

export interface JSDocParam {
    name: string;
    type: string;
    description: string;
    optional?: boolean;
    defaultValue?: string;
}

interface JSDocParseResult {
    detail: string;
    tags?: Partial<JSDocSymbol>;
    vars?: {
        [name: string]: {
            detail: string;
            type_str?: string;
        }
    };
}

export class JSDocParser {
    private symbolMap = new Map<string, JSDocSymbol>();
    private comments = new Map<number, { content: string; data?: any; offset: number }>();

    constructor(private filePath: string) {
        this.parseDefinitionFile();
    }

    private parseDefinitionFile() {
        try {
            const content = readFileSync(this.filePath, 'utf-8');
            this.extractComments(content);
            this.parseComments(content);
        } catch (error) {
            console.error(`Failed to parse definition file ${this.filePath}:`, error);
        }
    }

    private extractComments(content: string) {
        const lines = content.split(/\r?\n/);
        let currentComment = '';
        let commentStart = -1;
        let inBlockComment = false;
        let inJSDocComment = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Start of JSDoc comment
            if (trimmedLine.startsWith('/**')) {
                inJSDocComment = true;
                inBlockComment = true;
                commentStart = i;
                currentComment = line;
                continue;
            }

            // Start of regular block comment
            if (trimmedLine.startsWith('/*') && !inBlockComment) {
                inBlockComment = true;
                commentStart = i;
                currentComment = line;
                continue;
            }

            // End of block comment
            if (trimmedLine.endsWith('*/') && inBlockComment) {
                currentComment += '\n' + line;
                if (inJSDocComment || commentStart >= 0) {
                    this.comments.set(commentStart, {
                        content: currentComment,
                        offset: commentStart
                    });
                }
                inBlockComment = false;
                inJSDocComment = false;
                currentComment = '';
                commentStart = -1;
                continue;
            }

            // Inside block comment
            if (inBlockComment) {
                currentComment += '\n' + line;
                continue;
            }

            // Line comment
            if (trimmedLine.startsWith('//')) {
                this.comments.set(i, {
                    content: line,
                    offset: i
                });
            }
        }
    }

    private parseComments(content: string) {
        const lines = content.split(/\r?\n/);
        
        for (const [lineIndex, comment] of this.comments) {
            if (!comment.content.includes('@') && !this.isFollowedByFunction(lines, lineIndex)) {
                continue;
            }

            const nextNonCommentLine = this.findNextNonCommentLine(lines, lineIndex);
            if (nextNonCommentLine) {
                // Try to match function signature with return type
                let functionMatch = nextNonCommentLine.match(/^(\w+)\((.*?)\)\s*=>\s*(.+)$/);
                let name: string, params: string, returnType: string;
                
                if (functionMatch) {
                    [, name, params, returnType] = functionMatch;
                } else {
                    // Try to match function signature without return type (malformed)
                    const malformedMatch = nextNonCommentLine.match(/^(\w+)\((.*?)\)\s*$/);
                    if (malformedMatch) {
                        [, name, params] = malformedMatch;
                        returnType = 'Any'; // Default return type for malformed signatures
                        console.warn(`Function ${name} has malformed signature - missing return type`);
                    } else {
                        continue; // Not a function signature
                    }
                }

                const jsDocInfo = this.parseJSDocDetail(comment.content, name);
                
                const symbol: JSDocSymbol = {
                    name,
                    type: 'function',
                    description: jsDocInfo.detail,
                    returns: returnType.trim(),
                    markdown_detail: jsDocInfo.detail,
                    parameters: this.parseParameters(params, jsDocInfo)
                };

                if (jsDocInfo.tags) {
                    Object.assign(symbol, jsDocInfo.tags);
                    // Override return type if specified in JSDoc
                    if (jsDocInfo.tags.returns) {
                        symbol.returns = jsDocInfo.tags.returns;
                    }
                }

                this.symbolMap.set(name.toUpperCase(), symbol);
            }
        }
    }

    private isFollowedByFunction(lines: string[], commentLineIndex: number): boolean {
        const nextLine = this.findNextNonCommentLine(lines, commentLineIndex);
        return nextLine ? /^\w+\(.*?\)\s*=>\s*.+$/.test(nextLine) : false;
    }

    private findNextNonCommentLine(lines: string[], startIndex: number): string | null {
        for (let i = startIndex + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*') && !line.startsWith('*/')) {
                return line;
            }
        }
        return null;
    }

    private parseParameters(paramsString: string, jsDocInfo: JSDocParseResult): JSDocParam[] {
        if (!paramsString.trim()) return [];

        const params = paramsString.split(',').map(p => {
            const [name, type] = p.trim().split(':');
            return {
                name: name?.trim() || '',
                type: type?.trim() || 'Any',
                description: '',
                optional: name?.includes('?') || false
            };
        }).filter(p => p.name);

        // Enhance with JSDoc parameter information
        if (jsDocInfo.vars) {
            params.forEach(param => {
                const jsDocParam = jsDocInfo.vars![param.name.toUpperCase()];
                if (jsDocParam) {
                    param.description = jsDocParam.detail;
                    if (jsDocParam.type_str) {
                        param.type = jsDocParam.type_str;
                    }
                }
            });
        }

        return params;
    }

    private parseJSDocDetail(detail: string, symbolName: string): JSDocParseResult {
        // Clean up the comment content
        detail = detail.replace(/^[ \t]*(\*?[ \t]*(?=@)|\* ?)/gm, '')
            .replace(/^\/\*+\s*|\s*\**\/$/g, '');

        if (!detail) {
            return { detail: '' };
        }

        const details: string[] = [];
        let vars: { [name: string]: { detail: string; type_str?: string } } | undefined;
        let tags: Partial<JSDocSymbol> | undefined;
        let currentType = '';

        // Split on @tags but preserve the content that follows
        const sections = detail.split(/\n(?=@)/);
        
        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            const tagMatch = section.match(/^@(\w*)/);
            
            if (!tagMatch) {
                details.push(section);
                continue;
            }

            const tagName = tagMatch[1].toLowerCase();
            let content = section.substring(tagName.length + 1);

            switch (tagName) {
                case 'param':
                case 'parameter':
                    const paramTypeResult = this.parseType(content);
                    currentType = paramTypeResult.type;
                    content = paramTypeResult.remaining;
                    const paramMatch = content.match(/^\s*(\w+)/);
                    if (paramMatch) {
                        const paramName = paramMatch[1];
                        content = content.substring(paramMatch[0].length);
                        (vars ??= {})[paramName.toUpperCase()] = {
                            detail: content.trim(),
                            type_str: currentType
                        };
                    }
                    // Don't add to details - we handle parameters in structured format
                    continue;

                case 'returns':
                case 'return':
                    const returnTypeResult = this.parseType(content);
                    currentType = returnTypeResult.type;
                    content = returnTypeResult.remaining;
                    // Combine type and description for returns
                    const returnDescription = content.trim();
                    if (currentType && returnDescription) {
                        (tags ??= {}).returns = `${currentType} - ${returnDescription}`;
                    } else {
                        (tags ??= {}).returns = currentType || returnDescription;
                    }
                    // Don't add to details - we handle returns in structured format
                    continue;

                case 'example':
                    // Handle multi-line examples properly
                    const exampleContent = this.parseExampleContent(content);
                    (tags ??= {}).example = exampleContent;
                    // Don't add to details for @example, we handle it specially
                    continue;

                case 'deprecated':
                    (tags ??= {}).deprecated = true;
                    // Don't add to details - we handle deprecation as a visual indicator
                    continue;

                case 'since':
                    (tags ??= {}).since = content.trim();
                    // Don't add to details - we handle this as metadata
                    continue;

                case 'author':
                    (tags ??= {}).author = content.trim();
                    // Don't add to details - we handle this as metadata
                    continue;

                default:
                    // For unhandled tags, add them to details
                    details.push(`*@${tagName}*${this.joinDetail(content)}`);
                    continue;
            }

            // This line should never be reached due to continues above
            // details.push(`*@${tagName}*${this.joinDetail(content)}`);
        }

        const joinedDetail = details.join('\n\n');
        return { detail: joinedDetail, tags, vars };
    }

    private parseExampleContent(content: string): string {
        // Remove leading/trailing whitespace and normalize line breaks
        content = content.trim();
        
        // For multi-line examples, clean up each line
        const lines = content.split('\n');
        const cleanedLines: string[] = [];

        for (const line of lines) {
            // Remove leading asterisk and whitespace from JSDoc continuation lines
            let cleaned = line.replace(/^\s*\*\s?/, '');
            
            // Handle special case where the example starts right after @example
            if (cleanedLines.length === 0 && !cleaned.trim()) {
                continue; // Skip the first empty line after @example
            }
            
            cleanedLines.push(cleaned.trimEnd());
        }

        // Remove trailing empty lines
        while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] === '') {
            cleanedLines.pop();
        }

        // Join with newlines and clean up any extra spacing
        let result = cleanedLines.join('\n').trim();
        
        // If it's a single line or very short, return as-is
        if (!result.includes('\n') || result.length < 50) {
            return result;
        }

        return result;
    }

    private parseType(str: string): { type: string; remaining: string } {
        const typeMatch = str.match(/^\s*\{([^}]+)\}/);
        if (typeMatch) {
            return {
                type: typeMatch[1].trim(),
                remaining: str.substring(typeMatch[0].length)
            };
        }
        return {
            type: '',
            remaining: str
        };
    }

    private joinDetail(str: string): string {
        str = str.replace(/^[ \t]*[-—]/, '');
        const trimmed = str.trim();
        return trimmed ? ` — ${trimmed}` : '';
    }

    public getSymbol(name: string): JSDocSymbol | undefined {
        return this.symbolMap.get(name.toUpperCase());
    }

    public getAllSymbols(): Map<string, JSDocSymbol> {
        return new Map(this.symbolMap);
    }

    public getSymbolCount(): number {
        return this.symbolMap.size;
    }

    public static findDefinitionFile(basePath: string): string | null {
        const possiblePaths = [
            resolve(basePath, 'syntaxes/twbl.d.twbl'),
            resolve(basePath, '../syntaxes/twbl.d.twbl'),
            resolve(basePath, '../../syntaxes/twbl.d.twbl')
        ];

        for (const path of possiblePaths) {
            try {
                readFileSync(path, 'utf-8');
                return path;
            } catch {
                continue;
            }
        }

        return null;
    }
}