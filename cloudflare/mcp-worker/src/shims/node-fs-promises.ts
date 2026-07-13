/** Stub for Workers — remote MCP uses url or data (base64), not local paths. */
async function readFile(): Promise<never> {
  throw new Error(
    "Local file reads are unavailable on hosted MCP. Use upload_media with url or data (base64).",
  );
}

async function stat(): Promise<never> {
  throw new Error(
    "Local file reads are unavailable on hosted MCP. Use upload_media with url or data (base64).",
  );
}

export { readFile, stat };
export default { readFile, stat };
