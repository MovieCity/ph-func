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

    /* ---------- MAIN VIDEO ---------- */

    const title = pick(/var\s+video_title\s*=\s*"([^"]+)"/);

    const poster =
      pick(/var\s+video_thumb\s*=\s*"([^"]+)"/) ||
      pick(/var\s+video_bigthumb\s*=\s*"([^"]+)"/);

    const mp4_low = pick(/setVideoUrlLow\('([^']+)'\)/);
    const mp4_high = pick(/setVideoUrlHigh\('([^']+)'\)/);
    const hls = pick(/setVideoHLS\('([^']+)'\)/);

    /* ---------- SPRITE (MAIN VIDEO) ---------- */

    const sprite = {
      image: pick(/var\s+video_sprite_url\s*=\s*"([^"]+)"/),
      frameWidth: Number(pick(/var\s+video_sprite_width\s*=\s*(\d+)/)),
      frameHeight: Number(pick(/var\s+video_sprite_height\s*=\s*(\d+)/)),
      totalFrames: Number(pick(/var\s+video_sprite_nb_frames\s*=\s*(\d+)/))
    };

    if (!sprite.image) {
      // sprite not present on some videos
      sprite.image = null;
    }

    /* ---------- RECOMMENDATIONS ---------- */

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
    
