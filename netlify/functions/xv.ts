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
      const re = new RegExp(`var\\s+${name}\\s*=\\s*(\\[.*?\\]);`, "s");
      const m = html.match(re);
      return m ? JSON.parse(m[1]) : [];
    };

    /* ---------------------------
       Main Video Extraction
    ----------------------------*/
    const title = pick(/html5player\.setVideoTitle\('([^']+)'\)/) || pick(/<title>(.*?)<\/title>/);
    const poster = pick(/html5player\.setThumbUrl\('([^']+)'\)/);
    
    // Attempting to extract main sprite info from config if it exists
    const mainSprite = pick(/html5player\.setThumbUrl\('([^']+)'\)/)?.replace(/\/\d+\.jpg$/, '/mozaique_listing.jpg');
    
    // Main video sprite details often follow a standard 10x10 or 5x6 pattern
    // If not found in HTML, these are the common defaults for Xvideos
    const sprite_cols = parseInt(pick(/thumbsPerRow\s*:\s*(\d+)/) || "10");
    const sprite_rows = parseInt(pick(/thumbsPerColumn\s*:\s*(\d+)/) || "10");
    const sprite_total = parseInt(pick(/thumbsTotal\s*:\s*(\d+)/) || "100");

    /* ---------------------------
       Recommendations (video_related)
    ----------------------------*/
    const relatedRaw = parseJSArray("video_related");

    const recommendations = relatedRaw.map(v => ({
      id: v.id,
      title: v.tf || v.t,
      duration: v.d,
      thumbs: {
        poster: v.if || v.i,
        preview_mp4: v.ipu, // Preview MP4 URL
        sprite_image: v.mu  // The 'mu' field is the mosaic/sprite
      },
      sprite_config: {
        columns: v.c || 10, // The 'c' field represents columns
        rows: 10,           // Usually matching columns for 100 frames total
        totalFrames: (v.c || 10) * 10 
      }
    }));

    return new Response(
      JSON.stringify({
        success: true,
        id,
        main: {
          title,
          poster,
          sprite: {
            image: mainSprite,
            columns: sprite_cols,
            rows: sprite_rows,
            totalFrames: sprite_total
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
      JSON.stringify({ success: false, error: err.message }, null, 2),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
