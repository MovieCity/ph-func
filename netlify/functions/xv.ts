// netlify/functions/xv.ts
// ONE-PAGE, RECHECKED AGAINST EMBED HTML + INLINE JS
// - Main video title/poster from JS
// - Main sprite (mu) detected if present
// - MP4 low/high preserved
// - Sprite grid derived the same way embed JS does

import type { Context } from "@netlify/functions";

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const m = url.pathname.match(/\/xv\/([a-zA-Z0-9]+)/);
  if (!m) return new Response("Not Found", { status: 404 });

  const id = m[1];
  const target = `https://www.xvideos.com/embedframe/${id}`;

  try {
    const r = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await r.text();

    // ---------- MAIN (JS ONLY) ----------
    const xvConf = extractXVConf(html);

    const mainTitle = jsVar(html, "video_title");
    const mainPoster = jsVar(html, "video_thumb") || jsVar(html, "thumb_url");

    const hls = extractExt(html, "m3u8");

    const mp4 = {
      low: namedMP4(html, "low"),
      high: namedMP4(html, "high")
    };

    // main sprite (optional)
    const mainMu =
      jsVar(html, "video_sprite") ||
      xvConf?.video?.sprite ||
      null;

    const mainDurationSec =
      typeof xvConf?.video?.duration === "number"
        ? xvConf.video.duration
        : parseDuration(jsVar(html, "video_duration"));

    const mainSprite = mainMu
      ? await deriveSprite(mainMu, mainDurationSec)
      : null;

    // ---------- RELATED ----------
    const relatedRaw = extractVideoRelated(html);

    const recommendations = await Promise.all(
      relatedRaw.map(async (v: any) => ({
        id: v.id,
        eid: v.eid,
        title: v.tf || v.t || null,
        duration: v.d || null,
        views: v.n || null,
        rating: v.r || null,
        thumbnails: {
          small: v.i || null,
          large: v.il || null,
          fallback: v.if || null
        },
        preview_mp4: v.ipu || null,
        sprite: v.mu ? await deriveSprite(v.mu, parseDuration(v.d)) : null,
        channel: { name: v.pn || null, url: v.pu || null }
      }))
    );

    return new Response(
      JSON.stringify(
        {
          success: true,
          id,
          main: {
            title: mainTitle,
            poster: mainPoster,
            hls,
            mp4,
            sprite: mainSprite
          },
          recommendations
        },
        null,
        2
      ),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

// ---------------- HELPERS ----------------

function jsVar(html: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i");
  return html.match(re)?.[1] ?? null;
}

function extractXVConf(html: string): any {
  const m = html.match(/window\\.xv\\.conf\\s*=\\s*({[\\s\\S]*?});/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function extractExt(text: string, ext: string): string[] {
  const t = text.replace(/\\\//g, "/");
  const re = new RegExp(`(https?:\\/\\/[^\\s'"<>]+\\.${ext}(?:\\?[^\\s'"<>]*)?)`, "gi");
  return [...new Set(t.match(re) || [])];
}

function namedMP4(html: string, q: "low" | "high") {
  const re = new RegExp(`setVideoUrl${q === "high" ? "High" : "Low"}\\(['"]([^'"]+)`, "i");
  return html.match(re)?.[1] ?? null;
}

function extractVideoRelated(html: string): any[] {
  const m = html.match(/video_related\\s*=\\s*(\\[[\\s\\S]*?\\]);/);
  if (!m) return [];
  try { return JSON.parse(m[1]); } catch { return []; }
}

function parseDuration(d?: string | null): number {
  if (!d) return 0;
  const mm = d.match(/(\\d+)\\s*min/i);
  if (mm) return parseInt(mm[1], 10) * 60;
  const ss = d.match(/(\\d+)\\s*s/i);
  if (ss) return parseInt(ss[1], 10);
  return 0;
}

// ---- SPRITE DERIVATION (MATCHES EMBED JS) ----
// Assumptions used by embed:
// - 16:9 frames
// - fixed column counts (5, 10)
// - derive rows from image height

async function deriveSprite(url: string, duration: number) {
  const r = await fetch(url);
  const buf = new Uint8Array(await r.arrayBuffer());
  const { width, height } = readJpegSize(buf);

  const aspect = 9 / 16;
  const columnsList = [5, 10];

  for (const cols of columnsList) {
    const fw = width / cols;
    const fh = fw * aspect;
    const rows = height / fh;

    if (isInt(fw) && isInt(fh) && isInt(rows)) {
      const total = cols * rows;
      return {
        image: url,
        image_width: width,
        image_height: height,
        frame_width: fw,
        frame_height: fh,
        columns: cols,
        rows,
        total_frames: total,
        seconds_per_frame: duration && total ? duration / total : null,
        derived_by: "embed-js-equivalent"
      };
    }
  }

  return { image: url, image_width: width, image_height: height, derived_by: "unknown" };
}

function isInt(n: number) {
  return Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-6;
}

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

