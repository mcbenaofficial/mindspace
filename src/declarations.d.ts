declare module "mammoth/mammoth.browser" {
  function extractRawText(options: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
  export { extractRawText };
}
