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

    /* ---------- extract flashvars ---------- */
    const fvMatch = html.match(/var\s+flashvars\s*=\s*({[\s\S]*?});/);
    if (!fvMatch) {
      return new Response(JSON.stringify({
        success: false,
        error: "flashvars not found"
      }), { status: 500 });
    }

    // make it JSON-safe
    const flashvars = JSON.parse(
      fvMatch[1]
        .replace(/(\w+)\s*:/g, '"$1":')
        .replace(/'/g, '"')
    );

    /* ---------- MAIN VIDEO ---------- */
    const main = {
      title: flashvars.video_title || null,
      poster: flashvars.video_thumb || null,
      mp4: {
        low: flashvars.video_url || null,
        high: flashvars.video_url_hd || null
      },
      hls: flashvars.video_hls || null,
      sprite: flashvars.video_sprite_url ? {
        image: flashvars.video_sprite_url,
        frameWidth: Number(flashvars.video_sprite_width),
        frameHeight: Number(flashvars.video_sprite_height),
        totalFrames: Number(flashvars.video_sprite_nb_frames)
      } : null
    };

    /* ---------- RECOMMENDATIONS ---------- */
    const relMatch = html.match(/video_related\s*=\s*(\[[\s\S]*?\]);/);
    const related = relMatch ? JSON.parse(relMatch[1]) : [];

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
      main,
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

