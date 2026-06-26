"use client";

import { useEffect, useRef } from "react";

// Animated "silk ribbon" hero wave. Algorithm ported from the design handoff
// (README "Hero wave animation"): N-point ribbon, gold<->blue gradient driven by
// two travelling gaussian hotspots, white sheen + gold under-shadow for 3D look.
// rAF for 60fps + a ~90ms setInterval fallback so it keeps drawing when rAF throttles.
export default function HeroWave() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const draw = (elapsed: number) => {
      const W = cv.width;
      const H = cv.height;
      ctx.clearRect(0, 0, W, H);
      const TAU = Math.PI * 2;
      const ph = elapsed * 0.0002;
      const N = 150;
      const X: number[] = [];
      const TOP: number[] = [];
      const BOT: number[] = [];
      const CY: number[] = [];
      const TH: number[] = [];
      const ss = (a: number, b: number, x: number) => {
        x = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return x * x * (3 - 2 * x);
      };
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const x = u * W;
        const ang = u * TAU * 2.15 + ph;
        const cy =
          H * 0.5 + H * 0.205 * Math.sin(ang + 0.4) + H * 0.065 * Math.sin(ang * 2.0 + 1.1 + ph * 1.25);
        let th = H * (0.155 + 0.105 * (0.5 + 0.5 * Math.cos(ang + 0.9)));
        th *= ss(0, 0.04, u) * ss(0, 0.04, 1 - u);
        X[i] = x;
        CY[i] = cy;
        TH[i] = th;
        TOP[i] = cy - th / 2;
        BOT[i] = cy + th / 2;
      }
      const band = (tf: (i: number) => number, bf: (i: number) => number) => {
        ctx.beginPath();
        ctx.moveTo(X[0], tf(0));
        for (let i = 1; i <= N; i++) ctx.lineTo(X[i], tf(i));
        for (let i = N; i >= 0; i--) ctx.lineTo(X[i], bf(i));
        ctx.closePath();
      };
      const gz = (u: number, c: number, w: number) => {
        const d = Math.min(Math.abs(u - c), Math.abs(u - c - 1), Math.abs(u - c + 1));
        return Math.exp(-(d * d) / (w * w));
      };
      const gold = [247, 200, 96];
      const blue = [86, 158, 244];
      const g = ctx.createLinearGradient(0, 0, W, 0);
      const c1 = (((0.3 + ph * 0.05) % 1) + 1) % 1;
      const c2 = (((0.62 + ph * 0.05) % 1) + 1) % 1;
      for (let s = 0; s <= 30; s++) {
        const u = s / 30;
        const b = Math.min(1, 0.95 * gz(u, c1, 0.06) + 0.9 * gz(u, c2, 0.055));
        const c = [
          gold[0] + (blue[0] - gold[0]) * b,
          gold[1] + (blue[1] - gold[1]) * b,
          gold[2] + (blue[2] - gold[2]) * b,
        ];
        g.addColorStop(u, `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`);
      }
      ctx.save();
      ctx.filter = "blur(2.5px)";
      band((i) => TOP[i], (i) => BOT[i]);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.filter = "blur(7px)";
      ctx.globalAlpha = 0.55;
      band((i) => CY[i] - TH[i] * 0.3, (i) => CY[i] + TH[i] * 0.04);
      ctx.fillStyle = "rgb(255,253,247)";
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.filter = "blur(9px)";
      ctx.globalAlpha = 0.2;
      band((i) => CY[i] + TH[i] * 0.18, (i) => BOT[i] + 2);
      ctx.fillStyle = "rgb(206,150,40)";
      ctx.fill();
      ctx.restore();
    };

    const t0 = performance.now();
    let raf = 0;
    const loop = (t: number) => {
      draw(t - t0);
      raf = requestAnimationFrame(loop);
    };
    draw(0);
    raf = requestAnimationFrame(loop);
    const iv = window.setInterval(() => draw(performance.now() - t0), 90);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(iv);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      width={1480}
      height={560}
      style={{ width: "100%", height: "auto", display: "block", pointerEvents: "none" }}
    />
  );
}
