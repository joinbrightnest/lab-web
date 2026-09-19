/**
 * Streaming proxy for POST /lab/api/chat-api.
 * Bypasses Next rewrites (which buffer SSE) and pipes Flask bytes through.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = "http://127.0.0.1:5050/api/chat-api";

export async function POST(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const body = await req.text();

  const upstream = await fetch(UPSTREAM, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "Accept-Encoding": "identity",
      Cookie: cookie,
    },
    body,
    cache: "no-store",
    // @ts-expect-error Node fetch streaming
    duplex: "half",
  });

  const ct = upstream.headers.get("content-type") || "";
  if (!upstream.body || !ct.includes("text/event-stream")) {
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": ct || "application/json",
      },
    });
  }

  // Re-pipe chunk-by-chunk so the browser sees pending + growing body.
  const reader = upstream.body.getReader();
  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    cancel() {
      void reader.cancel();
    },
  });

  return new Response(stream, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Content-Encoding": "identity",
    },
  });
}
