// Shims for optional runtime dependencies used only in beta extraction scaffolds.
declare module 'fast-xml-parser' {
  export class XMLParser {
    constructor(options?: unknown);
    parse(input: string): unknown;
  }
}
