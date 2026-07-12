/** Stub for Workers — remote MCP uses file_base64 instead of local paths. */
async function readFile(): Promise<never> {
  throw new Error("Local file reads are unavailable on hosted MCP. Use upload_media with file_base64.");
}

async function stat(): Promise<never> {
  throw new Error("Local file reads are unavailable on hosted MCP. Use upload_media with file_base64.");
}

export { readFile, stat };
export default { readFile, stat };
