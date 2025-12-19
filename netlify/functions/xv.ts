import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const path = url.pathname;

  // Extracts the alphanumeric ID (e.g., okbhbukcff5) from your request path
  const match = path.match(/\/xv\/([a-zA-Z0-9]+)/);
  if (!match) return new Response("Not Found", { status: 404 });

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

    /* ---------------------------
       1. Main Video Metadata
    ----------------------------*/
    const hls = pick(/html5player\.setVideoHLS\('([^']+)'\)/);
    const poster = pick(/html5player\.setThumbUrl\('([^']+)'\)/);
    const title = pick(/html5player\.setVideoTitle\('([^']+)'\)/);

    // Deriving the main sprite from the poster path (standard for this player)
    const mainSprite = poster ? poster.replace(/[^\/]+\.jpg$/, 'mozaique.jpg') : null;

    /* ---------------------------
       2. Recommendations (video_related)
       Targeting 'eid' for alphanumeric IDs and 'mu' for sprites
    ----------------------------*/
    const relatedRe = /var\s+video_related\s*=\s*(\[.*?\]);/s;
    const relatedMatch = html.match(relatedRe);
    
    let recommendations = [];
    if (relatedMatch) {
      const rawData = JSON.parse(relatedMatch[1]);
      recommendations = rawData.map((v: any) => ({
        id: v.eid,           // Alphanumeric ID (e.g., okbhbukcff5)
        title: v.tf || v.t,  // Full title
        duration: v.d,       // Video duration
        thumbs: {
          poster: v.if || v.i,
          preview_mp4: v.ipu, // Preview video MP4
          sprite_image: v.mu  // Mosaic/Sprite image URL
        },
        sprite_config: {
          columns: v.c || 10, // Column count from 'c' field
          rows: 10,           // Standard row count for 100-frame mosaics
          totalFrames: (v.c || 10) * 10
        }
      }));
    }

    return new Response(
      JSON.stringify({
        success: true,
        id,
        main: {
          title,
          poster,
          hls,
          sprite: {
            image: mainSprite,
            columns: 10, // Default for main player mosaics
            rows: 10,
            totalFrames: 100
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
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
