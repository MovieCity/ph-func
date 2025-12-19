import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const path = url.pathname;

  const match = path.match(/\/xv\/([a-zA-Z0-9]+)/);
  if (!match) {
    return new Response("Not Found", { status: 404 });
  }

  const id = match[1];
  const target = `https://www.xvideos.com/embedframe/${id}`;

  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
        "Accept": "text/html"
      }
    });

    const html = await res.text();

    const pick = (re: RegExp): string | null => {
      const m = html.match(re);
      return m ? m[1] : null;
    };

    const parseJSArray = (name: string): any[] => {
      // Updated regex to handle 'var name = [...]'
      const re = new RegExp(`var\\s+${name}\\s*=\\s*(\\[.*?\\]);`, "s");
      const m = html.match(re);
      return m ? JSON.parse(m[1]) : [];
    };

    /* ---------------------------
       Main video extraction
       Note: Values are often set via html5player methods in the script
    ----------------------------*/
    const title = 
      pick(/html5player\.setVideoTitle\('([^']+)'\)/) || 
      pick(/<title>(.*?)<\/title>/);

    const poster = 
      pick(/html5player\.setThumbUrl\('([^']+)'\)/) || 
      pick(/meta\s+property="og:image"\s+content="([^"]+)"/);

    const mp4_low = pick(/html5player\.setVideoUrlLow\('([^']+)'\)/);
    const mp4_high = pick(/html5player\.setVideoUrlHigh\('([^']+)'\)/);
    const hls = pick(/html5player\.setVideoHLS\('([^']+)'\)/);

    /* ---------------------------
       Sprite / preview
    ----------------------------*/
    // Extracting sprite metadata if available in the global config
    const sprite_image = poster; // Often the same base or derived from html5player.setThumbUrl
    const sprite_cols = parseInt(pick(/thumbsPerRow\s*:\s*(\d+)/) || "0");
    const sprite_rows = parseInt(pick(/thumbsPerColumn\s*:\s*(\d+)/) || "0");
    const sprite_total = parseInt(pick(/thumbsTotal\s*:\s*(\d+)/) || "0");

    /* ---------------------------
       Recommendations (video_related)
    ----------------------------*/
    const relatedRaw = parseJSArray("video_related");

    const recommendations = relatedRaw.map(v => ({
      id: v.id,
      title: v.tf || v.t, // 'tf' is full title, 't' is short
      duration: v.d,
      views: v.n,
      rating: v.r,
      thumbs: {
        small: v.i,
        medium: v.il,
        large: v.if
      },
      preview_mp4: v.ipu, // Preview video URL
      sprite: v.mu      // Sprite image URL
    }));

    return new Response(
      JSON.stringify({
        success: true,
        id,
        main: {
          title,
          poster,
          mp4: { low: mp4_low, high: mp4_high },
          hls,
          sprite: {
            image: sprite_image,
            columns: sprite_cols || null,
            rows: sprite_rows || null,
            totalFrames: sprite_total || null
          }
        },
        recommendations
      }, null, 2),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message // Fixed typo here
      }, null, 2),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};
