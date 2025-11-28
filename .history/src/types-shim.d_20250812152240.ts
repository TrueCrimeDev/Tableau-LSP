// Shims for optional runtime dependencies used only in beta extraction scaffolds.
declare module 'fast-xml-parser' {
  export class XMLParser {
    constructor(options?: any);
    parse(input: string): any;
  }
}

declare module 'unzipper' {
  export const Parse: any;
  export function Extract(opts: any): any;
}
