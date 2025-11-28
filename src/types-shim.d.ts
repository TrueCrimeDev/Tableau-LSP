// Shims for optional runtime dependencies used only in beta extraction scaffolds.
declare module 'fast-xml-parser' {
  export class XMLParser {
    constructor(options?: unknown);
    parse(input: string): unknown;
  }
}

declare module 'unzipper' {
  export const Parse: unknown;
  export function Extract(options: unknown): unknown;
  export namespace Open {
    function buffer(source: Buffer | Uint8Array): Promise<{
      files: Array<{
        path: string;
        buffer(): Promise<Buffer>;
      }>;
    }>;
  }
}
