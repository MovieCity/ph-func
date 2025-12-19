import type { Context } from "@netlify/functions";

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const path = url.pathname;

  const match = path.match(/\/xv\/([a-zA-Z0-9]+)/);
  if (!match) return new Response("Not Found", { status: 404 });

  const id = match[1];
  const target = `https://www.xvideos.com/embedframe/${id}`;

  try {
    const res = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const html = await res.text();

    /* ========= MAIN VIDEO ========= */

    const title =
      html.match(/property="og:title"\s+content="([^"]+)"/)?.[1] ??
      html.match(/video_title\s*=\s*"([^"]+)"/)?.[1] ??
      null;

    const poster =
      html.match(/property="og:image"\s+content="([^"]+)"/)?.[1] ?? null;

    const hls = extractExt(html, "m3u8");

    const mp4 = {
      low: extractNamedMP4(html, "low"),
      high: extractNamedMP4(html, "high")
    };

    /* ======== RECOMMENDATIONS ======== */

    const related = extractVideoRelated(html);

    const recommendations = await Promise.all(
      related.map(async (v: any) => ({
        id: v.id,
        eid: v.eid,
        title: v.tf || v.t,
        duration: v.d,
        views: v.n,
        rating: v.r,
        thumbnails: {
          small: v.i,
          large: v.il,
          fallback: v.if
        },
        preview_mp4: v.ipu,
        sprite: v.mu
          ? await deriveSprite(v.mu, parseDuration(v.d))
          : null,
        channel: {
          name: v.pn,
          url: v.pu
        }
      }))
    );

    return new Response(
      JSON.stringify(
        {
          success: true,
          id,
          main: {
            title,
            poster,
            hls,
            mp4
          },
          recommendations
        },
        null,
        2
      ),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }, null, 2),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

/* ============ HELPERS ============ */

function extractExt(text: string, ext: string): string[] {
  text = text.replace(/\\\//g, "/");
  const re = new RegExp(
    `(https?:\\/\\/[^\\s"'<>]+\\.${ext}(?:\\?[^\\s"'<>]*)?)`,
    "gi"
  );
  return [...new Set(text.match(re) || [])];
}

function extractNamedMP4(html: string, quality: "low" | "high") {
  const re = new RegExp(
    `setVideoUrl${quality === "high" ? "High" : "Low"}\\(['"]([^'"]+)`,
    "i"
  );
  return html.match(re)?.[1] ?? null;
}

function extractVideoRelated(html: string): any[] {
  const m = html.match(/video_related\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) return [];
  try {
    return JSON.parse(m[1]);
  } catch {
    return [];
  }
}

function parseDuration(d: string): number {
  const m = d?.match(/(\d+)\s*min/);
  return m ? parseInt(m[1], 10) * 60 : 0;
}

/* ===== SPRITE DERIVATION (XV STYLE) ===== */

async function deriveSprite(url: string, duration: number) {
  const res = await fetch(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  const { width, height } = readJpegSize(buf);

  const aspect = 9 / 16;
  const columnOptions = [5, 10];

  for (const cols of columnOptions) {
    const frameWidth = width / cols;
    const frameHeight = frameWidth * aspect;
    const rows = height / frameHeight;

    if (
      Number.isInteger(frameWidth) &&
      Number.isInteger(frameHeight) &&
      Number.isInteger(rows)
    ) {
      const total = cols * rows;
      return {
        image: url,
        image_width: width,
        image_height: height,
        frame_width: frameWidth,
        frame_height: frameHeight,
        columns: cols,
        rows,
        total_frames: total,
        seconds_per_frame:
          duration && total ? duration / total : null,
        method: "xvideos-derived"
      };
    }
  }

  return {
    image: url,
    image_width: width,
    image_height: height,
    method: "undetermined"
  };
}

/* ===== JPEG SIZE ===== */

function readJpegSize(data: Uint8Array) {
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0xff && (data[i + 1] === 0xc0 || data[i + 1] === 0xc2)) {
      return {
        height: (data[i + 5] << 8) + data[i + 6],
        width: (data[i + 7] << 8) + data[i + 8]
      };
    }
  }
  return { width: 0, height: 0 };
}

