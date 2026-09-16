import { useEffect, useRef } from 'react';
import type { Palette } from '../palette/extract';
import { PaletteTransitionManager } from './transition';
import {
  createParticleField,
  assignParticleColors,
  stepAndDrawParticles,
  particleCountFor,
  MIN_PARTICLES,
  type ParticleField,
} from './flowField';
import { createGradientSpecs, drawGradients, type GradientSpec } from './gradients';
import { oklabToRgb } from '../palette/oklab';

export type PlaybackPhase = 'playing' | 'paused' | 'quiet'; // quiet = idle or unavailable

const GRADIENT_CYCLE_SECONDS = 75;
const REDUCED_MOTION_GRADIENT_CYCLE_SECONDS = 600;
const RESIZE_DEBOUNCE_MS = 150;
const SPEED_EASE_MS = 2000;
const BASE_SPEED_PX_PER_SEC = 18;
const BASE_ALPHA = 0.5;
const FRAME_SAMPLE_SIZE = 60;
const SLOW_FRAME_MS = 20;

function targetSpeedFor(phase: PlaybackPhase): number {
  return phase === 'playing' ? 1 : 0.15;
}

function targetDimFor(phase: PlaybackPhase): number {
  return phase === 'paused' ? 0.4 : 1;
}

function usePrefersReducedMotion(): boolean {
  const ref = useRef(false);
  if (typeof window !== 'undefined') {
    ref.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return ref.current;
}

export function AmbientCanvas({ palette, phase }: { palette: Palette; phase: PlaybackPhase }) {
  const gradientCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const transitionRef = useRef<PaletteTransitionManager | null>(null);
  const fieldRef = useRef<ParticleField | null>(null);
  const gradientSpecsRef = useRef<GradientSpec[]>([]);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const speedRef = useRef(targetSpeedFor(phase));
  const dimRef = useRef(targetDimFor(phase));
  const phaseRef = useRef(phase);
  const paletteRef = useRef(palette);
  const frameTimesRef = useRef<number[]>([]);
  const particleTargetRef = useRef(MIN_PARTICLES);
  const reducedMotion = usePrefersReducedMotion();

  phaseRef.current = phase;
  paletteRef.current = palette;

  // Palette changes drive the crossfade; particle positions are untouched.
  useEffect(() => {
    if (!transitionRef.current) {
      transitionRef.current = new PaletteTransitionManager(palette, performance.now());
    } else {
      transitionRef.current.setTarget(palette, performance.now());
    }
    if (fieldRef.current) {
      assignParticleColors(fieldRef.current, palette.colors.length, palette.seed);
    }
    gradientSpecsRef.current = createGradientSpecs(palette.seed, Math.min(4, Math.max(3, palette.colors.length)));
  }, [palette]);

  useEffect(() => {
    const gradientCanvas = gradientCanvasRef.current;
    const particleCanvas = particleCanvasRef.current;
    if (!gradientCanvas || !particleCanvas) return;
    const gCtx = gradientCanvas.getContext('2d');
    const pCtx = particleCanvas.getContext('2d');
    if (!gCtx || !pCtx) return;

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = window.innerWidth;
      const height = window.innerHeight;
      sizeRef.current = { width, height, dpr };

      for (const canvas of [gradientCanvas, particleCanvas]) {
        canvas!.width = width * dpr;
        canvas!.height = height * dpr;
        canvas!.style.width = `${width}px`;
        canvas!.style.height = `${height}px`;
      }
      gCtx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      pCtx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      particleTargetRef.current = particleCountFor(width, height);
      fieldRef.current = createParticleField(particleTargetRef.current, width, height, paletteRef.current.seed);
      assignParticleColors(fieldRef.current, paletteRef.current.colors.length, paletteRef.current.seed);
      frameTimesRef.current = [];
    }

    resize();

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    function onResize() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, RESIZE_DEBOUNCE_MS);
    }
    window.addEventListener('resize', onResize);

    let rafId: number | null = null;
    let lastTime = performance.now();

    function loop(now: number) {
      const dt = now - lastTime;
      lastTime = now;
      const transition = transitionRef.current;
      const { width, height } = sizeRef.current;
      if (!transition || width === 0) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      const frame = transition.sample(now);
      const cycleSeconds = reducedMotion ? REDUCED_MOTION_GRADIENT_CYCLE_SECONDS : GRADIENT_CYCLE_SECONDS;
      drawGradients(gCtx!, width, height, frame, gradientSpecsRef.current, now / 1000, cycleSeconds);

      if (!reducedMotion && fieldRef.current) {
        const targetSpeed = targetSpeedFor(phaseRef.current);
        const targetDim = targetDimFor(phaseRef.current);
        const ease = Math.min(1, dt / SPEED_EASE_MS);
        speedRef.current += (targetSpeed - speedRef.current) * ease;
        dimRef.current += (targetDim - dimRef.current) * ease;

        // Fade previous trails toward the background color instead of hard-clearing.
        const bgRgb = oklabToRgb(frame.background);
        pCtx!.fillStyle = `rgba(${bgRgb.r},${bgRgb.g},${bgRgb.b},0.12)`;
        pCtx!.fillRect(0, 0, width, height);

        stepAndDrawParticles(
          pCtx!,
          fieldRef.current,
          width,
          height,
          frame,
          now / 1000,
          BASE_SPEED_PX_PER_SEC * speedRef.current * (dt / 16.67),
          BASE_ALPHA * dimRef.current,
        );

        frameTimesRef.current.push(dt);
        if (frameTimesRef.current.length >= FRAME_SAMPLE_SIZE) {
          const avg = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
          frameTimesRef.current = [];
          if (avg > SLOW_FRAME_MS && particleTargetRef.current > MIN_PARTICLES) {
            const next = Math.max(MIN_PARTICLES, Math.floor(particleTargetRef.current * 0.75));
            if (next !== particleTargetRef.current) {
              particleTargetRef.current = next;
              fieldRef.current = createParticleField(next, width, height, paletteRef.current.seed);
              assignParticleColors(fieldRef.current, frame.colors.length, paletteRef.current.seed);
            }
          }
        }
      } else {
        pCtx!.clearRect(0, 0, width, height);
      }

      rafId = requestAnimationFrame(loop);
    }

    function handleVisibility() {
      if (document.hidden) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
      } else if (rafId === null) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(loop);
      }
    }

    if (!document.hidden) {
      rafId = requestAnimationFrame(loop);
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // Palette/phase changes are read via refs inside the loop so the render loop itself never
    // restarts (which would cause visible stutter on every song change).
  }, [reducedMotion]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
      <canvas ref={gradientCanvasRef} style={{ position: 'absolute', inset: 0 }} />
      <canvas ref={particleCanvasRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
