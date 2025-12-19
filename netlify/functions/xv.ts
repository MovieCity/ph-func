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

    const pick = (re: RegExp) => {
      const m = html.match(re);
      return m ? m[1] : null;
    };

    /* ---------------- MAIN VIDEO ---------------- */

    const title = pick(/var\s+video_title\s*=\s*"([^"]+)"/);

    const poster =
      pick(/var\s+video_thumb\s*=\s*"([^"]+)"/) ||
      pick(/var\s+video_bigthumb\s*=\s*"([^"]+)"/);

    const mp4_low = pick(/setVideoUrlLow\('([^']+)'\)/);
    const mp4_high = pick(/setVideoUrlHigh\('([^']+)'\)/);
    const hls = pick(/setVideoHLS\('([^']+)'\)/);

    /* ---------------- SPRITE ---------------- */

    const spriteUrl = pick(/video_sprite\s*=\s*{[^}]*url:\s*"([^"]+)"/);
    const spriteWidth = pick(/width:\s*(\d+)/);
    const spriteHeight = pick(/height:\s*(\d+)/);
    const spriteTotal = pick(/total:\s*(\d+)/);

    const sprite = spriteUrl ? {
      image: spriteUrl,
      frameWidth: Number(spriteWidth),
      frameHeight: Number(spriteHeight),
      totalFrames: Number(spriteTotal)
    } : null;

    /* ---------------- RECOMMENDATIONS ---------------- */

    const relatedMatch = html.match(/video_related\s*=\s*(\[[\s\S]*?\]);/);
    const related = relatedMatch ? JSON.parse(relatedMatch[1]) : [];

    const recommendations = related.map((v: any) => ({
      id: v.id,
      title: v.tf || v.t,
      duration: v.d,
      views: v.n,
      rating: v.r,
      thumbs: {
        small: v.i,
        medium: v.il,
        large: v.if
      },
      preview_mp4: v.ipu,
      sprite: v.mu
    }));

    return new Response(JSON.stringify({
      success: true,
      id,
      main: {
        title,
        poster,
        mp4: { low: mp4_low, high: mp4_high },
        hls,
        sprite
      },
      recommendations
    }, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({
      success: false,
      error: e.message
    }), { status: 500 });
  }
};
      
