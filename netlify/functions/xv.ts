import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const path = url.pathname;

  const match = path.match(/\/xv\/([a-zA-Z0-9]+)/);
  if (!match) return new Response("Not Found", { status: 404 });

  const id = match[1];
  const target = `https://www.xvideos.com/embedframe/${id}`;

  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html"
      }
    });

    const html = await res.text();

    const pick = (re: RegExp): string | null => {
      const m = html.match(re);
      return m ? m[1] : null;
    };

    /* ---------------------------
       1. Main HLS & Poster
       These are set via html5player methods in the script
    ----------------------------*/
    const hls = pick(/html5player\.setVideoHLS\('([^']+)'\)/);
    const poster = pick(/html5player\.setThumbUrl\('([^']+)'\)/);
    const title = pick(/html5player\.setVideoTitle\('([^']+)'\)/) || pick(/<title>(.*?)<\/title>/);

    /* ---------------------------
       2. Sprite (Mosaic) Configuration
       The sprite is the "mozaique.jpg" file used for scrubbing
    ----------------------------*/
    // Extract sprite image URL directly or derive it from the thumb path
    const spriteImage = poster ? poster.replace(/[^\/]+\.jpg$/, 'mozaique.jpg') : null;

    // These specific keys are often in a separate script config block
    const sprite_cols = parseInt(pick(/thumbsPerRow\s*:\s*(\d+)/) || "10");
    const sprite_rows = parseInt(pick(/thumbsPerColumn\s*:\s*(\d+)/) || "10");
    const sprite_total = parseInt(pick(/thumbsTotal\s*:\s*(\d+)/) || "100");

    /* ---------------------------
       3. Related Videos (Recommendations)
    ----------------------------*/
    const relatedRe = /var\s+video_related\s*=\s*(\[.*?\]);/s;
    const relatedMatch = html.match(relatedRe);
    const recommendations = relatedMatch ? JSON.parse(relatedMatch[1]).map((v: any) => ({
      id: v.id,
      title: v.tf || v.t,
      poster: v.if || v.i,
      sprite: v.mu, // Related videos use 'mu' for mosaic
      columns: v.c || 10,
      preview_mp4: v.ipu
    })) : [];

    return new Response(
      JSON.stringify({
        success: true,
        id,
        main: {
          title,
          poster,
          hls,
          sprite: {
            image: spriteImage,
            columns: sprite_cols,
            rows: sprite_rows,
            totalFrames: sprite_total
          }
        },
        recommendations
      }, null, 2),
      {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
