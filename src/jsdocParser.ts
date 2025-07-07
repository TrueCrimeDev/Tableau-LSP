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

export interface JSDocType {
    name: string;
    typeDef: string;
    description: string;
    properties?: JSDocTypeProperty[];
    templateParams?: string[];
}

export interface JSDocTypeProperty {
    name: string;
    type: string;
    description: string;
    optional?: boolean;
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
    typedef?: JSDocType;
}

export class JSDocParser {
    private symbolMap = new Map<string, JSDocSymbol>();
    private typeMap = new Map<string, JSDocType>();
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
            // --- Typedef support ---
            if (comment.content.includes('@typedef')) {
                const typedefInfo = this.parseTypedefDetail(comment.content);
                if (typedefInfo && typedefInfo.name) {
                    this.typeMap.set(typedefInfo.name, typedefInfo);
                }
                continue;
            }

            // --- Function support (existing logic) ---
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
                    continue;

                case 'returns':
                case 'return':
                    const returnTypeResult = this.parseType(content);
                    currentType = returnTypeResult.type;
                    content = returnTypeResult.remaining;
                    const returnDescription = content.trim();
                    if (currentType && returnDescription) {
                        (tags ??= {}).returns = `${currentType} - ${returnDescription}`;
                    } else {
                        (tags ??= {}).returns = currentType || returnDescription;
                    }
                    continue;

                case 'example':
                    const exampleContent = this.parseExampleContent(content);
                    (tags ??= {}).example = exampleContent;
                    continue;

                case 'deprecated':
                    (tags ??= {}).deprecated = true;
                    continue;

                case 'since':
                    (tags ??= {}).since = content.trim();
                    continue;

                case 'author':
                    (tags ??= {}).author = content.trim();
                    continue;

                default:
                    details.push(`*@${tagName}*${this.joinDetail(content)}`);
                    continue;
            }
        }

        const joinedDetail = details.join('\n\n');
        return { detail: joinedDetail, tags, vars };
    }

    private parseTypedefDetail(detail: string): JSDocType | null {
        // Clean up the comment content
        detail = detail.replace(/^[ \t]*(\*?[ \t]*(?=@)|\* ?)/gm, '')
            .replace(/^\/\*+\s*|\s*\**\/$/g, '');

        if (!detail) return null;

        let name = '';
        let typeDef = '';
        let description = '';
        let properties: JSDocTypeProperty[] = [];
        let templateParams: string[] = [];

        // Find @typedef line
        const typedefMatch = detail.match(/@typedef\s+\{([^}]+)\}\s+(\w+)/);
        if (typedefMatch) {
            typeDef = typedefMatch[1].trim();
            name = typedefMatch[2].trim();
            // Remove typedef line from detail
            detail = detail.replace(typedefMatch[0], '').trim();
        } else {
            // Try to match @typedef {object} TypeName
            const altMatch = detail.match(/@typedef\s+\{([^}]+)\}\s+(\w+)/);
            if (altMatch) {
                typeDef = altMatch[1].trim();
                name = altMatch[2].trim();
                detail = detail.replace(altMatch[0], '').trim();
            } else {
                // Try to match @typedef TypeName (no type)
                const nameMatch = detail.match(/@typedef\s+(\w+)/);
                if (nameMatch) {
                    name = nameMatch[1].trim();
                    typeDef = 'Any';
                    detail = detail.replace(nameMatch[0], '').trim();
                }
            }
        }

        // Find @template (generics)
        const templateMatch = detail.match(/@template\s+([A-Za-z0-9_, ]+)/);
        if (templateMatch) {
            templateParams = templateMatch[1].split(',').map(s => s.trim());
            detail = detail.replace(templateMatch[0], '').trim();
        }

        // Find @property lines
        const propertyRegex = /@property\s+\{([^}]+)\}\s+(\[?\w+\]?)(?:\s*-\s*([^\n]+))?/g;
        let propMatch: RegExpExecArray | null;
        while ((propMatch = propertyRegex.exec(detail)) !== null) {
            let propType = propMatch[1].trim();
            let propName = propMatch[2].replace(/[\[\]]/g, '').trim();
            let propDesc = propMatch[3]?.trim() || '';
            let optional = propMatch[2].startsWith('[') && propMatch[2].endsWith(']');
            properties.push({
                name: propName,
                type: propType,
                description: propDesc,
                optional
            });
        }

        // Remove all @property lines from description
        detail = detail.replace(/@property[^\n]*\n?/g, '').trim();

        description = detail;

        return {
            name,
            typeDef,
            description,
            properties: properties.length > 0 ? properties : undefined,
            templateParams: templateParams.length > 0 ? templateParams : undefined
        };
    }

    private parseExampleContent(content: string): string {
        content = content.trim();
        const lines = content.split('\n');
        const cleanedLines: string[] = [];

        for (const line of lines) {
            let cleaned = line.replace(/^\s*\*\s?/, '');
            if (cleanedLines.length === 0 && !cleaned.trim()) {
                continue;
            }
            cleanedLines.push(cleaned.trimEnd());
        }

        while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] === '') {
            cleanedLines.pop();
        }

        let result = cleanedLines.join('\n').trim();
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

    public getType(name: string): JSDocType | undefined {
        return this.typeMap.get(name);
    }

    public getAllTypes(): Map<string, JSDocType> {
        return new Map(this.typeMap);
    }

    public getSymbolCount(): number {
        return this.symbolMap.size;
    }

    public getTypeCount(): number {
        return this.typeMap.size;
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
