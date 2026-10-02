'use client';
import { useEffect, useRef } from 'react';
import { pose, step, type BeamMode } from '@/lib/pharosBeam';

/**
 * The scene behind the AI bar: a lighthouse on a rock, the sea and some fog. The beam
 * turns around the tower (it looks short and flares when it points at you), turns to the
 * box while you type, spins quickly while the AI thinks, and flashes when the answer comes.
 * Drawn with SVG + CSS and moved by one requestAnimationFrame loop that writes styles
 * straight to the DOM (no React render per frame). With reduced motion it stands still,
 * pointed at the box.
 */
export function PharosScene({ mode, flashKey, target }: { mode: BeamMode; flashKey: number; target: React.RefObject<HTMLElement | null> }) {
  const lampRef = useRef<HTMLDivElement>(null);
  const beamA = useRef<HTMLDivElement>(null);
  const beamB = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  const flashRef = useRef(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    if (flashKey > 0) flashRef.current = 1;
  }, [flashKey]);

  useEffect(() => {
    const lamp = lampRef.current;
    if (!lamp) return;
    let raf = 0;
    let last = performance.now();
    let state = { theta: 1.2, phi: 0, flash: 0 };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Elevation from the lamp to the middle of the box, in radians up from horizontal.
    const aim = () => {
      const box = target.current?.getBoundingClientRect();
      const l = lamp.getBoundingClientRect();
      if (!box) return Math.PI / 3;
      const dx = box.left + box.width / 2 - (l.left + l.width / 2);
      const dy = l.top + l.height / 2 - (box.top + box.height / 2);
      return Math.max(0, Math.min(Math.PI * 0.48, Math.atan2(dy, Math.max(1, dx))));
    };

    const draw = () => {
      const l = lamp.getBoundingClientRect();
      const x = l.left + l.width / 2;
      const y = l.top + l.height / 2;
      const phiDeg = (-state.phi * 180) / Math.PI;
      for (const [el, theta, main] of [
        [beamA.current, state.theta, true],
        [beamB.current, state.theta + Math.PI, false],
      ] as const) {
        if (!el) continue;
        const p = pose(theta);
        // The second beam fades out while the first one points at the box.
        const fade = main ? 1 : 1 - Math.min(1, state.phi / 0.6);
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.transform = `translateY(-50%) rotate(${phiDeg}deg) scaleX(${p.side * p.length}) scaleY(${1 + state.flash * 0.35})`;
        el.style.opacity = String(Math.min(1, (p.brightness + state.flash * 0.6) * fade));
      }
      if (haloRef.current) {
        const flare = Math.max(pose(state.theta).flare, pose(state.theta + Math.PI).flare);
        haloRef.current.style.opacity = String(Math.min(1, 0.35 + flare * 0.65 + state.flash));
        haloRef.current.style.transform = `translate(-50%, -50%) scale(${1 + flare * 0.8 + state.flash * 1.2})`;
      }
    };

    if (reduce) {
      state = { theta: 0.28, phi: aim(), flash: 0 };
      draw();
      const onResize = () => {
        state.phi = aim();
        draw();
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (flashRef.current > 0) {
        state.flash = flashRef.current;
        flashRef.current = 0;
      }
      state = step(state, modeRef.current, aim(), dt);
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return (
    <div aria-hidden className="pharos-scene pointer-events-none absolute inset-0 overflow-hidden">
      {/* Night sky glow and fog banks */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 50% 110%, color-mix(in srgb, var(--color-cyan) 10%, transparent), transparent 60%)' }} />
      <div className="pharos-fog absolute -left-[20%] bottom-[12%] h-[30vh] w-[70vw] rounded-full" />
      <div className="pharos-fog pharos-fog-2 absolute -right-[15%] bottom-[20%] h-[24vh] w-[60vw] rounded-full" />

      {/* The beams, drawn from the lamp (positioned by the loop) */}
      <div ref={beamA} className="pharos-beam absolute" style={{ left: -9999 }} />
      <div ref={beamB} className="pharos-beam absolute" style={{ left: -9999 }} />

      {/* Lighthouse on its rock */}
      <div className="pharos-tower absolute bottom-[9vh]" style={{ height: 'clamp(170px, 36vh, 340px)', aspectRatio: '120 / 300' }}>
        <svg viewBox="0 0 120 300" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="ph-tower" x1="0" x2="1">
              <stop offset="0" stopColor="color-mix(in srgb, var(--color-text) 55%, var(--color-bg))" />
              <stop offset="0.55" stopColor="color-mix(in srgb, var(--color-text) 85%, var(--color-bg))" />
              <stop offset="1" stopColor="color-mix(in srgb, var(--color-text) 40%, var(--color-bg))" />
            </linearGradient>
            <linearGradient id="ph-stripe" x1="0" x2="1">
              <stop offset="0" stopColor="color-mix(in srgb, var(--color-red) 55%, var(--color-bg))" />
              <stop offset="0.55" stopColor="var(--color-red)" />
              <stop offset="1" stopColor="color-mix(in srgb, var(--color-red) 45%, var(--color-bg))" />
            </linearGradient>
            <clipPath id="ph-body">
              <path d="M44 96 L76 96 L88 262 L32 262 Z" />
            </clipPath>
          </defs>
          {/* rock */}
          <path d="M6 300 C14 270 30 258 52 260 C74 256 98 262 116 300 Z" fill="color-mix(in srgb, var(--color-text) 18%, var(--color-bg))" />
          {/* tower with two stripes */}
          <path d="M44 96 L76 96 L88 262 L32 262 Z" fill="url(#ph-tower)" />
          <g clipPath="url(#ph-body)">
            <rect x="20" y="130" width="80" height="26" fill="url(#ph-stripe)" />
            <rect x="20" y="196" width="80" height="26" fill="url(#ph-stripe)" />
          </g>
          {/* door and window */}
          <rect x="54" y="236" width="12" height="26" rx="6" fill="color-mix(in srgb, var(--color-bg) 70%, var(--color-text))" />
          <rect x="56" y="168" width="8" height="12" rx="3" fill="color-mix(in srgb, var(--color-gold) 70%, var(--color-bg))" />
          {/* gallery */}
          <rect x="36" y="88" width="48" height="8" rx="2" fill="color-mix(in srgb, var(--color-text) 35%, var(--color-bg))" />
          {/* lantern room */}
          <rect x="46" y="58" width="28" height="30" rx="3" fill="color-mix(in srgb, var(--color-cyan) 25%, var(--color-bg))" />
          <rect x="50" y="62" width="20" height="22" rx="2" fill="color-mix(in srgb, #fff 75%, var(--color-cyan))" />
          {/* roof */}
          <path d="M42 58 L60 36 L78 58 Z" fill="color-mix(in srgb, var(--color-text) 30%, var(--color-bg))" />
          <circle cx="60" cy="33" r="3" fill="color-mix(in srgb, var(--color-text) 30%, var(--color-bg))" />
        </svg>
        {/* the lamp: halo + the point the beams start from (73 = lantern centre in the 300 box) */}
        <div ref={lampRef} className="absolute left-1/2 h-1 w-1" style={{ top: `${(73 / 300) * 100}%` }} />
        <div ref={haloRef} className="pharos-halo absolute left-1/2" style={{ top: `${(73 / 300) * 100}%` }} />
      </div>

      {/* Sea: two wave bands drifting at different speeds */}
      <div className="absolute inset-x-0 bottom-0 h-[13vh]">
        <svg className="pharos-wave absolute bottom-0 h-full w-[200%]" viewBox="0 0 1200 100" preserveAspectRatio="none">
          <path d="M0 40 Q75 20 150 40 T300 40 T450 40 T600 40 T750 40 T900 40 T1050 40 T1200 40 V100 H0 Z" fill="color-mix(in srgb, var(--color-cyan) 16%, var(--color-bg))" />
        </svg>
        <svg className="pharos-wave pharos-wave-2 absolute bottom-0 h-[75%] w-[200%]" viewBox="0 0 1200 100" preserveAspectRatio="none">
          <path d="M0 45 Q100 25 200 45 T400 45 T600 45 T800 45 T1000 45 T1200 45 V100 H0 Z" fill="color-mix(in srgb, var(--color-cyan) 9%, var(--color-bg))" />
        </svg>
      </div>
    </div>
  );
}
