import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { geoCircle, geoDistance, geoGraticule10, geoInterpolate, geoMercator, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import world from "world-atlas/countries-50m.json";
import { T } from "../theme";
import { Chip, Icon, clamp, ease } from "../common";
import type { LonLat, Scene } from "../types";

const COUNTRIES: any[] = (feature(world as any, (world as any).objects.countries) as any).features;
const GRATICULE = geoGraticule10();
const ALIASES: Record<string, string> = { USA: "United States of America", "United States": "United States of America", UK: "United Kingdom", Russia: "Russia" };

export const MapScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const vertical = H > W;
  const D = scene.durationInFrames;
  const center = scene.center ?? [0, 20];
  const globe = scene.projection !== "flat";

  // Camera: ease from the start view to the target over the first ~55% of the scene, then drift slowly.
  const camT = ease(interpolate(frame, [0, D * 0.55], [0, 1], clamp));
  const drift = interpolate(frame, [D * 0.55, D], [0, 1], clamp);
  const z0 = scene.zoomFrom ?? 1;
  const z1 = scene.zoomTo ?? 1.6;
  const zoom = z0 * Math.pow(z1 / z0, camT) * (1 + drift * 0.04);

  let projection: any;
  if (globe) {
    const from = scene.rotateFrom ?? [center[0] - 60, center[1] * 0.3];
    const rot = geoInterpolate(from, center)(camT);
    projection = geoOrthographic().rotate([-rot[0] - drift * 4, -rot[1]]).scale((vertical ? 470 : 430) * zoom).translate([W / 2, H / 2 + (vertical ? -60 : 20)]).clipAngle(90);
  } else {
    projection = geoMercator().center(center as LonLat).scale((vertical ? 330 : 300) * zoom).translate([W / 2, H / 2 - (vertical ? 60 : 0)]);
    projection.center([center[0] + drift * 2, center[1]]);
  }
  const path = geoPath(projection);
  const rotCenter: LonLat = globe ? [-projection.rotate()[0], -projection.rotate()[1]] : center;
  const visible = (p: LonLat) => !globe || geoDistance(p, rotCenter) < Math.PI / 2 - 0.05;

  const wanted = new Set((scene.highlight ?? []).map((n) => ALIASES[n] ?? n));
  const hl = interpolate(frame, [15, 40], [0, 1], clamp);
  const pulse = 0.5 + 0.5 * Math.sin(frame / 6);

  const markers = scene.markers ?? [];
  const routes = scene.routes ?? [];
  const n = markers.length + routes.length;
  const stagger = (i: number) => Math.round(D * 0.25 + (i * D * 0.5) / Math.max(1, n));

  // Place labels so nearby places don't overlap: try right, left, then shifted up/down.
  // Dots and their icons count as obstacles too.
  const placed: { x: number; y: number; w: number }[] = markers
    .filter((m) => visible(m.lonlat))
    .flatMap((m) => {
      const [x, y] = projection(m.lonlat);
      return [{ x: x - 20, y: y - 10, w: 40 }, ...(m.icon ? [{ x: x - 35, y: y - 75, w: 70 }] : [])];
    });
  const labelPos = markers.map((m) => {
    if (!visible(m.lonlat)) return null;
    const [x, y] = projection(m.lonlat);
    const w = 40 + m.label.length * 21;
    const tries = [0, 60, -60, 120, -120, 180, -180].flatMap((dy) => [{ right: x < W * 0.7, dy }, { right: !(x < W * 0.7), dy }]);
    const hit = (bx: number, by: number) => placed.some((p) => Math.abs(p.y - by) < 60 && bx < p.x + p.w && bx + w > p.x);
    const pick = tries.find((t) => !hit(t.right ? x + 40 : x - 40 - w, y - 30 + t.dy)) ?? tries[0];
    const bx = Math.max(20, Math.min(W - w - 20, pick.right ? x + 40 : x - 40 - w)); // never off-screen
    placed.push({ x: bx, y: y - 30 + pick.dy, w });
    return { left: bx, top: y - 30 + pick.dy };
  });

  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 45%, #1b2c44 0%, #070b12 75%)` }}>
      <svg width={W} height={H}>
        <defs>
          <radialGradient id="sea" cx="40%" cy="35%" r="75%">
            <stop offset="0%" stopColor={T.oceanLight} />
            <stop offset="100%" stopColor={T.ocean} />
          </radialGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="6" /></filter>
        </defs>
        {globe ? (
          <>
            <path d={path({ type: "Sphere" })} fill="none" stroke={T.accent2} strokeOpacity={0.25} strokeWidth={18} filter="url(#glow)" />
            <path d={path({ type: "Sphere" })} fill="url(#sea)" />
          </>
        ) : (
          <rect width={W} height={H} fill="url(#sea)" />
        )}
        <path d={path(GRATICULE)} fill="none" stroke="#ffffff" strokeOpacity={0.07} strokeWidth={1} />
        {COUNTRIES.map((c, i) => {
          const on = wanted.has(c.properties.name);
          return (
            <path key={i} d={path(c) ?? ""} fill={on ? mix(T.land, T.accent, hl) : T.land} stroke={on ? T.white : T.border}
              strokeWidth={on ? 1.5 + pulse * 1.5 * hl : 0.6} strokeOpacity={on ? 0.9 : 0.6} />
          );
        })}

        {scene.rings &&
          new Array(scene.rings.count ?? 3).fill(0).map((_, i) => {
            const cyc = 90;
            const t = ((frame - 20 + (i * cyc) / (scene.rings!.count ?? 3)) % cyc) / cyc;
            if (frame < 20) return null;
            const ring = geoCircle().center(scene.rings!.center).radius(Math.max(0.1, t * scene.rings!.maxRadius))();
            return <path key={`r${i}`} d={path(ring) ?? ""} fill={T.accent2} fillOpacity={0.06 * (1 - t)} stroke={T.accent2} strokeWidth={4} strokeOpacity={1 - t} />;
          })}

        {routes.map((r, i) => {
          const start = stagger(markers.length + i);
          const t = ease(interpolate(frame, [start, start + 45], [0, 1], clamp));
          if (t <= 0) return null;
          const interp = geoInterpolate(r.from, r.to);
          const pts = new Array(41).fill(0).map((_, k) => interp((k / 40) * t));
          return (
            <path key={`rt${i}`} d={path({ type: "LineString", coordinates: pts } as any) ?? ""} fill="none" stroke={T.accent}
              strokeWidth={6} strokeDasharray="14 10" strokeDashoffset={-frame * 2} strokeLinecap="round" />
          );
        })}
      </svg>

      {routes.map((r, i) => {
        const start = stagger(markers.length + i);
        const t = ease(interpolate(frame, [start, start + 45], [0, 1], clamp));
        if (t <= 0 || !r.icon) return null;
        const p = geoInterpolate(r.from, r.to)(t) as LonLat;
        if (!visible(p)) return null;
        const [x, y] = projection(p);
        return <Icon key={`ri${i}`} icon={r.icon} size={70} delay={start} style={{ position: "absolute", left: x - 35, top: y - 80 }} />;
      })}

      {markers.map((m, i) => {
        if (!visible(m.lonlat)) return null;
        const [x, y] = projection(m.lonlat);
        const d = stagger(i);
        const show = interpolate(frame, [d, d + 10], [0, 1], clamp);
        if (show <= 0) return null;
        const ping = ((frame - d) % 40) / 40;
        const right = x < W * 0.7;
        return (
          <React.Fragment key={`m${i}`}>
            <div style={{ position: "absolute", left: x - 40, top: y - 40, width: 80, height: 80, borderRadius: 40,
              border: `4px solid ${T.accent}`, transform: `scale(${0.3 + ping})`, opacity: 1 - ping }} />
            <div style={{ position: "absolute", left: x - 11, top: y - 11, width: 22, height: 22, borderRadius: 11, background: T.accent,
              border: `4px solid ${T.white}`, transform: `scale(${show})` }} />
            {m.icon && <Icon icon={m.icon} size={64} delay={d} style={{ position: "absolute", left: x - 32, top: y - 100 }} />}
            <div style={{ position: "absolute", top: labelPos[i]?.top ?? y - 30, left: labelPos[i]?.left ?? x + 40,
              opacity: show, transform: `translateX(${(1 - show) * (right ? -30 : 30)}px)`, background: T.paper, color: T.ink,
              fontFamily: T.font, fontWeight: 800, fontSize: 36, padding: "6px 18px", borderRadius: 10, whiteSpace: "nowrap",
              boxShadow: "0 6px 20px rgba(0,0,0,0.4)" }}>
              {m.label}
            </div>
          </React.Fragment>
        );
      })}
      <Chip text={scene.caption} />
    </AbsoluteFill>
  );
};

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}
