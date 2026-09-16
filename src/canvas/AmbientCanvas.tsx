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
import {
  BpmTransitionManager,
  DEFAULT_BPM,
  paceFactor,
  gradientCycleSeconds,
  breathMultipliers,
  breathPhaseIncrement,
  energyTrailFactor,
} from '../tempo/pace';
import type { TempoInfo } from '../tempo/lookup';

export type PlaybackPhase = 'playing' | 'paused' | 'quiet'; // quiet = idle or unavailable

const RESIZE_DEBOUNCE_MS = 150;
const SPEED_EASE_MS = 2000;
const BASE_SPEED_PX_PER_SEC = 18;
const BASE_ALPHA = 0.5;
const BASE_TRAIL_FADE_ALPHA = 0.12;
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

export function AmbientCanvas({
  palette,
  phase,
  tempo,
  breathEnabled = true,
}: {
  palette: Palette;
  phase: PlaybackPhase;
  /** Defaults to an unknown tempo (DEFAULT_BPM, no breath/energy) when omitted. */
  tempo?: TempoInfo;
  breathEnabled?: boolean;
}) {
  const gradientCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const transitionRef = useRef<PaletteTransitionManager | null>(null);
  const bpmManagerRef = useRef<BpmTransitionManager | null>(null);
  const fieldRef = useRef<ParticleField | null>(null);
  const gradientSpecsRef = useRef<GradientSpec[]>([]);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const speedRef = useRef(targetSpeedFor(phase));
  const dimRef = useRef(targetDimFor(phase));
  const phaseRef = useRef(phase);
  const paletteRef = useRef(palette);
  const tempoRef = useRef<TempoInfo>(tempo ?? { bpm: null, source: 'none' });
  const breathEnabledRef = useRef(breathEnabled);
  const lastEffectiveBpmRef = useRef(tempo?.bpm ?? DEFAULT_BPM);
  const noiseTRef = useRef(0);
  const gradientTRef = useRef(0);
  const breathPhaseRef = useRef(0);
  const frameTimesRef = useRef<number[]>([]);
  const particleTargetRef = useRef(MIN_PARTICLES);
  const reducedMotion = usePrefersReducedMotion();

  phaseRef.current = phase;
  paletteRef.current = palette;
  tempoRef.current = tempo ?? { bpm: null, source: 'none' };
  breathEnabledRef.current = breathEnabled;

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

  // Tempo changes (song change or a lookup resolving) crossfade the effective BPM in log space,
  // never a jump — see HANDOVER-tempo.md section 4.
  useEffect(() => {
    const effectiveBpm = tempo?.bpm ?? DEFAULT_BPM;
    const now = performance.now();
    if (!bpmManagerRef.current) {
      bpmManagerRef.current = new BpmTransitionManager(effectiveBpm, now);
    } else if (effectiveBpm !== lastEffectiveBpmRef.current) {
      bpmManagerRef.current.setTarget(effectiveBpm, now);
    }
    lastEffectiveBpmRef.current = effectiveBpm;
  }, [tempo?.bpm]);

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
      const dtSec = dt / 1000;
      const transition = transitionRef.current;
      const bpmManager = bpmManagerRef.current;
      const { width, height } = sizeRef.current;
      if (!transition || !bpmManager || width === 0) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      const frame = transition.sample(now);
      const currentBpm = bpmManager.sample(now);
      const pace = paceFactor(currentBpm);
      // Reduced motion ignores tempo for everything except the gradient cycle length
      // (HANDOVER-tempo.md section 3), so gradients still drift a little slower for a slow song.
      const cycleSeconds = gradientCycleSeconds(currentBpm);

      // Integrate accumulators (never derive phase directly from elapsed wall time) so a
      // changing rate never teleports the field.
      gradientTRef.current += dtSec / cycleSeconds;
      drawGradients(gCtx!, width, height, frame, gradientSpecsRef.current, gradientTRef.current);

      if (!reducedMotion && fieldRef.current) {
        const tempoInfo = tempoRef.current;
        const targetSpeed = targetSpeedFor(phaseRef.current);
        const targetDim = targetDimFor(phaseRef.current);
        const ease = Math.min(1, dt / SPEED_EASE_MS);
        speedRef.current += (targetSpeed - speedRef.current) * ease;
        dimRef.current += (targetDim - dimRef.current) * ease;

        const breathActive =
          breathEnabledRef.current && tempoInfo.bpm !== null && phaseRef.current !== 'paused';
        if (breathActive) {
          breathPhaseRef.current += breathPhaseIncrement(dtSec, currentBpm);
        }
        const breath = breathActive ? breathMultipliers(breathPhaseRef.current) : { speed: 1, alpha: 1 };

        noiseTRef.current += dtSec * pace * breath.speed;

        const trailFadeAlpha = BASE_TRAIL_FADE_ALPHA / energyTrailFactor(tempoInfo.energy);
        const bgRgb = oklabToRgb(frame.background);
        pCtx!.fillStyle = `rgba(${bgRgb.r},${bgRgb.g},${bgRgb.b},${trailFadeAlpha})`;
        pCtx!.fillRect(0, 0, width, height);

        stepAndDrawParticles(
          pCtx!,
          fieldRef.current,
          width,
          height,
          frame,
          noiseTRef.current,
          BASE_SPEED_PX_PER_SEC * speedRef.current * pace * breath.speed * (dt / 16.67),
          BASE_ALPHA * dimRef.current * breath.alpha,
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
    // Palette/phase/tempo changes are read via refs inside the loop so the render loop itself
    // never restarts (which would cause visible stutter on every song change).
  }, [reducedMotion]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
      <canvas ref={gradientCanvasRef} style={{ position: 'absolute', inset: 0 }} />
      <canvas ref={particleCanvasRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
