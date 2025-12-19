import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const match = url.pathname.match(/\/xv\/([a-zA-Z0-9]+)/);
  if (!match) return new Response("Not Found", { status: 404 });

  const id = match[1];
  const target = `https://www.xvideos.com/embedframe/${id}`;

  try {
    const res = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const html = await res.text();

    // Extract main JS variables
    const mainTitle = extractVar(html, "video_title");
    const mainPoster = extractVar(html, "video_thumb");
    const m3u8 = extractVar(html, "m3u8");
    const mp4_low = extractVar(html, "mp4_low");
    const mp4_high = extractVar(html, "mp4_high");

    // Sprite info
    const muUrl = extractVar(html, "mu"); // may be null
    let sprite = null;
    if (muUrl) {
      const size = await getImageSize(muUrl);
      if (size) {
        // Xvideos uses 1-row sprite normally
        const frameCount = extractVar(html, "vtt_frames") || 1; 
        sprite = {
          url: muUrl,
          width: size.width / frameCount,
          height: size.height,
          frames: frameCount
        };
      }
    }

    // Recommendations
    const related = extractVar(html, "video_related") || [];
    const recommendations = related.map((r: any) => ({
      id: r.id,
      title: r.title,
      thumbnail: r.thumb,
      duration: r.duration,
      mu: r.mu || null
    }));

    return new Response(JSON.stringify({
      success: true,
      main: { id, title: mainTitle, poster: mainPoster, m3u8, mp4_low, mp4_high, sprite },
      recommendations
    }, null, 2), { headers: { "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};

// Extract JS variable from HTML
function extractVar(html: string, name: string) {
  const re = new RegExp(`${name}\\s*[:=]\\s*["']([^"']+)["']`, "i");
  const match = html.match(re);
  return match ? match[1] : null;
}

// Get image size
async function getImageSize(url: string) {
  try {
    const res = await fetch(url);
    const buffer = Buffer.from(await res.arrayBuffer());
    const sizeOf = (await import("image-size")).default;
    return sizeOf(buffer);
  } catch { return null; }
}

