import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  context.waitUntil(logRequest(req));

  const url = new URL(req.url);
  const path = url.pathname;

  // Expecting /ph/{id}
  const match = path.match(/\/ph\/([a-zA-Z0-9]+)/);
  if (!match) {
    return new Response("Not Found", { status: 404 });
  }

  const id = match[1];
  const target = `https://www.pornhub.org/embed/${id}`;

  function extractM3U8(text: string): string[] {
    if (!text) return [];
    text = text.replace(/\\\//g, "/");

    const re = /(https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?)/gi;
    return [...new Set(text.match(re) || [])];
  }

  try {
    const response = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = await response.text();
    const m3u8 = extractM3U8(html);

    return new Response(
      JSON.stringify({
        success: m3u8.length > 0,
        id,
        count: m3u8.length,
        m3u8
      }, null, 2),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

async function logRequest(req: Request) {
  await fetch("https://example.com/log", {
    method: "POST",
    body: JSON.stringify({ url: req.url, timestamp: Date.now() }),
    headers: { "Content-Type": "application/json" },
  });
      }
        
