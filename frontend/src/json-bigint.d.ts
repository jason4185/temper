declare module "json-bigint" {
  interface JsonBigParser {
    parse(value: string): unknown;
    stringify(value: unknown): string;
  }

  interface JsonBigOptions {
    useNativeBigInt?: boolean;
  }

  function createJsonBigParser(options?: JsonBigOptions): JsonBigParser;
  export default createJsonBigParser;
}
