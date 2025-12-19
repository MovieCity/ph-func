import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const path = url.pathname;

  // /xv/{id}
  const match = path.match(/\/xv\/([a-zA-Z0-9]+)/);
  if (!match) return new Response("Not Found", { status: 404 });

  const id = match[1];
  const target = `https://www.xvideos.com/embedframe/${id}`;

  try {
    const res = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const html = await res.text();

    /* ---------------------------
       Helpers
    ----------------------------*/
    const pick = (re: RegExp): string | null => {
      const m = html.match(re);
      return m ? m[1] : null;
    };

    const parseInitObject = () => {
      const m = html.match(/html5player\.init\(\s*({[\s\S]*?})\s*\)/);
      return m ? JSON.parse(m[1]) : {};
    };

    const parseJSArray = (name: string) => {
      const m = html.match(new RegExp(`${name}\\s*=\\s*(\\[.*?\\]);`, "s"));
      return m ? JSON.parse(m[1]) : [];
    };

    /* ---------------------------
       MAIN VIDEO (JS ONLY)
    ----------------------------*/
    const title = pick(/html5player\.setVideoTitle\("([^"]+)"\)/);

    const poster = pick(/html5player\.setPoster\("([^"]+)"\)/);

    const mp4_low = pick(/setVideoUrlLow\('([^']+)'\)/);
    const mp4_high = pick(/setVideoUrlHigh\('([^']+)'\)/);
    const hls = pick(/setVideoHLS\('([^']+)'\)/);

    /* ---------------------------
       SPRITE (MAIN VIDEO)
    ----------------------------*/
    const sprite_image =
      pick(/html5player\.setThumbUrl\('([^']+)'\)/);

    const init = parseInitObject();

    const sprite = {
      image: sprite_image,
      columns: init.thumbsPerRow ?? null,
      rows: init.thumbsPerColumn ?? null,
      totalFrames: init.thumbsTotal ?? null,
      frameWidth: init.thumbWidth ?? null,
      frameHeight: init.thumbHeight ?? null
    };

    /* ---------------------------
       RECOMMENDATIONS (UNCHANGED)
    ----------------------------*/
    const relatedRaw = parseJSArray("video_related");

    const recommendations = relatedRaw.map((v: any) => ({
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
       RESPONSE
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
          sprite
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

