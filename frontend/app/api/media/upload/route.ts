export async function POST() {
  return Response.json(
    {
      error:
        "This endpoint is deprecated. Use /api/media/presign + /api/media/confirm",
    },
    { status: 410 },
  );
}
