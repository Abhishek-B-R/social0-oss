/** No-op in the Fastify BFF - the React SPA refetches after mutations. */
export function revalidatePath(
  _path: string,
  _type?: "layout" | "page",
): void {}
