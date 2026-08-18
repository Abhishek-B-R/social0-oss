/** Expected RPC failures — mapped to 4xx in routes/api/rpc.ts instead of 500. */
export function rpcHttpError(message: string, statusCode = 400): Error {
  const err = new Error(message);
  (err as Error & { statusCode: number }).statusCode = statusCode;
  return err;
}
