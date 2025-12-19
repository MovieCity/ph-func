import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const path = url.pathname;

  // Expecting /xv/{id}
  const match = path.match(/\/xv\/([a-zA-Z0-9]+)/);
  if (!match) {
    return new Response("Not Found", { status: 404 });
  }

  const id = match[1];
  const target = `https://www.xvideos.com/embedframe/${id}`;

  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html"
      }
    });

    const html = await res.text();

    /* ---------------------------
       Helpers
    ----------------------------*/
    const pick = (re: RegExp): string | null => {
      const m = html.match(re);
      return m ? m[1] : null;
    };

    const pickAll = (re: RegExp): string[] => {
      return [...new Set(html.match(re) || [])];
    };

    const parseJSArray = (name: string): any[] => {
      const re = new RegExp(`${name}\\s*=\\s*(\\[.*?\\]);`, "s");
      const m = html.match(re);
      return m ? JSON.parse(m[1]) : [];
    };

    /* ---------------------------
       Main video
    ----------------------------*/
    const title =
      pick(/"video_title"\s*:\s*"([^"]+)"/) ||
      pick(/<title>(.*?)<\/title>/);

    const poster =
      pick(/poster:\s*"(https?:\/\/[^"]+)"/) ||
      pick(/og:image"\s+content="([^"]+)"/);

    const mp4_low =
      pick(/html5player\.setVideoUrlLow\('([^']+)'\)/);

    const mp4_high =
      pick(/html5player\.setVideoUrlHigh\('([^']+)'\)/);

    const hls =
      pick(/html5player\.setVideoHLS\('([^']+)'\)/) ||
      pick(/(https?:\/\/[^\s"'<>]+\.m3u8)/);

    /* ---------------------------
       Sprite / preview
    ----------------------------*/
    const sprite_image =
      pick(/html5player\.setThumbUrl\('([^']+)'\)/);

    const sprite_cols =
      parseInt(pick(/thumbsPerRow\s*:\s*(\d+)/) || "");

    const sprite_rows =
      parseInt(pick(/thumbsPerColumn\s*:\s*(\d+)/) || "");

    const sprite_total =
      parseInt(pick(/thumbsTotal\s*:\s*(\d+)/) || "");

    /* ---------------------------
       Recommendations
    ----------------------------*/
    const relatedRaw = parseJSArray("video_related");

    const recommendations = relatedRaw.map(v => ({
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

    /* ---------------------------
       Response
    ----------------------------*/
    return new Response(
      JSON.stringify({
        success: true,
        id,
        main: {
          title,
          poster,
          mp4: {
            low: mp4_low,
            high: mp4_high
          },
          hls,
          sprite: {
            image: sprite_image,
            columns: Number.isNaN(sprite_cols) ? null : sprite_cols,
            rows: Number.isNaN(sprite_rows) ? null : sprite_rows,
            totalFrames: Number.isNaN(sprite_total) ? null : sprite_total
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
        error: err.message
      }, null, 2),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};

