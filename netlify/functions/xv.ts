import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  context.waitUntil(logRequest(req));

  const url = new URL(req.url);
  const path = url.pathname;

  // Expecting /xv/{id}
  const match = path.match(/\/xv\/([a-zA-Z0-9]+)/);
  
  if (!match) {
    return new Response("Not Found", { status: 404 });
  }

  const id = match[1];
  const target = `https://www.xvideos.com/embedframe/${id}`;

  function extractM3U8(text: string): string[] {
    if (!text) return [];
    text = text.replace(/\\\//g, "/");

    const re = /(https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?)/gi;
    return [...new Set(text.match(re) || [])];
  }

  function extractVideoRelated(html: string) {
    const match = html.match(/video_related\s*=\s*(\[[\s\S]*?\]);/);
    if (!match) return [];

    try {
      return JSON.parse(match[1]);
    } catch {
      return [];
    }
  }

  try {
    const response = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = await response.text();

    const m3u8 = extractM3U8(html);
    const related = extractVideoRelated(html);

    const videos = related.map((v: any) => ({
      id: v.id,
      eid: v.eid,
      title: v.tf || v.t,
      duration: v.d,
      views: v.n,
      rating: v.r,
      thumbnails: {
        default: v.i,
        large: v.il,
        fallback: v.if
      },
      preview_mp4: v.ipu,
      mosaic: v.mu,
      channel: {
        name: v.pn,
        url: v.pu
      }
    }));

    return new Response(
      JSON.stringify(
        {
          success: true,
          id,
          video_count: videos.length,
          hls_count: m3u8.length,
          hls: m3u8,
          videos
        },
        null,
        2
      ),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify(
        {
          success: false,
          error: err.message
        },
        null,
        2
      ),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};

async function logRequest(req: Request) {
  await fetch("https://example.com/log", {
    method: "POST",
    body: JSON.stringify({
      url: req.url,
      timestamp: Date.now()
    }),
    headers: {
      "Content-Type": "application/json"
    }
  });
}
  
