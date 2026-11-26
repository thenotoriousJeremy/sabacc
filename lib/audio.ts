/**
 * Procedural WebAudio sound effects and optional Outer Rim cantina ambience.
 * Zero binary audio assets — everything is synthesized in real time.
 */

export type SoundCue =
  | 'deal'
  | 'card'
  | 'flip'
  | 'chips'
  | 'dice'
  | 'win'
  | 'sabacc_pot'
  | 'bounty'
  | 'rank_up'
  | 'fold'
  | 'click'
  | 'check'
  | 'sabacc_shift'
  | 'no_shift'
  | 'turn'
  | 'lose'
  | 'join'
  | 'error';

export function triggerHaptic(pattern: number | number[], enabled = true): void {
  if (!enabled || typeof navigator === 'undefined') return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Ignore unsupported vibration APIs.
  }
}

let ctx: AudioContext | null = null;
let ambientNodes: { stop: () => void; gain: GainNode } | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function armAudio(): void {
  getContext();
}

function noiseBurst(
  ac: AudioContext,
  out: AudioNode,
  opts: {
    at: number;
    duration: number;
    freqStart: number;
    freqEnd?: number;
    q?: number;
    gain: number;
    type?: BiquadFilterType;
  }
): void {
  const frames = Math.max(1, Math.floor(ac.sampleRate * opts.duration));
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const source = ac.createBufferSource();
  source.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freqStart, opts.at);
  if (opts.freqEnd) {
    filter.frequency.exponentialRampToValueAtTime(opts.freqEnd, opts.at + opts.duration);
  }
  filter.Q.setValueAtTime(opts.q ?? 1.2, opts.at);

  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, opts.at);
  env.gain.linearRampToValueAtTime(opts.gain, opts.at + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, opts.at + opts.duration);

  source.connect(filter);
  filter.connect(env);
  env.connect(out);
  source.start(opts.at);
  source.stop(opts.at + opts.duration);
}

function partialTone(
  ac: AudioContext,
  out: AudioNode,
  opts: {
    at: number;
    duration: number;
    freqStart: number;
    freqEnd?: number;
    gain: number;
    type?: OscillatorType;
  }
): void {
  const osc = ac.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freqStart, opts.at);
  if (opts.freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, opts.at + opts.duration);
  }

  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, opts.at);
  env.gain.linearRampToValueAtTime(opts.gain, opts.at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, opts.at + opts.duration);

  osc.connect(env);
  env.connect(out);
  osc.start(opts.at);
  osc.stop(opts.at + opts.duration);
}

export function playCue(cue: SoundCue, volume = 0.8): void {
  if (volume <= 0) return;
  try {
    const ac = getContext();
    if (!ac) return;
    const now = ac.currentTime + 0.005;
    const master = ac.createGain();
    master.gain.setValueAtTime(Math.min(1, Math.max(0, volume)) * 0.55, now);
    master.connect(ac.destination);

    switch (cue) {
      case 'click':
        noiseBurst(ac, master, { at: now, duration: 0.03, freqStart: 2100, q: 3, gain: 0.22 });
        partialTone(ac, master, { at: now, duration: 0.04, freqStart: 920, gain: 0.08 });
        break;

      case 'deal':
        for (let i = 0; i < 4; i++) {
          noiseBurst(ac, master, {
            at: now + i * 0.06,
            duration: 0.09,
            freqStart: 2600 + i * 160,
            freqEnd: 950,
            q: 0.9,
            gain: 0.3,
          });
        }
        break;

      case 'card':
        noiseBurst(ac, master, {
          at: now,
          duration: 0.11,
          freqStart: 2500,
          freqEnd: 850,
          q: 0.9,
          gain: 0.34,
        });
        break;

      case 'flip':
        noiseBurst(ac, master, {
          at: now,
          duration: 0.08,
          freqStart: 1600,
          freqEnd: 3200,
          q: 1.4,
          gain: 0.28,
        });
        break;

      case 'chips':
        for (let i = 0; i < 3; i++) {
          const t = now + i * 0.035;
          noiseBurst(ac, master, { at: t, duration: 0.06, freqStart: 1500 + i * 300, q: 3.5, gain: 0.22 });
          partialTone(ac, master, { at: t, duration: 0.09, freqStart: 2950 + i * 240, gain: 0.14 });
          partialTone(ac, master, { at: t, duration: 0.07, freqStart: 4120 + i * 190, gain: 0.09 });
        }
        break;

      case 'check':
        noiseBurst(ac, master, { at: now, duration: 0.055, freqStart: 540, q: 2.2, gain: 0.35 });
        noiseBurst(ac, master, { at: now + 0.11, duration: 0.055, freqStart: 500, q: 2.2, gain: 0.32 });
        break;

      case 'fold':
        noiseBurst(ac, master, { at: now, duration: 0.16, freqStart: 420, freqEnd: 180, q: 1.1, gain: 0.38 });
        partialTone(ac, master, { at: now, duration: 0.18, freqStart: 95, freqEnd: 38, gain: 0.25 });
        break;

      case 'dice':
        for (let i = 0; i < 7; i++) {
          const t = now + i * 0.065 + Math.random() * 0.015;
          noiseBurst(ac, master, {
            at: t,
            duration: 0.055,
            freqStart: 1300 + Math.random() * 900,
            q: 4,
            gain: 0.26 * (1 - i * 0.09),
          });
          partialTone(ac, master, {
            at: t,
            duration: 0.05,
            freqStart: 210 - i * 14,
            freqEnd: 90,
            gain: 0.16,
            type: 'triangle',
          });
        }
        break;

      case 'sabacc_shift':
        // Electromagnetic disruption + sub-bass drop + high static sweep
        partialTone(ac, master, {
          at: now,
          duration: 0.95,
          freqStart: 190,
          freqEnd: 34,
          gain: 0.45,
          type: 'sawtooth',
        });
        partialTone(ac, master, {
          at: now + 0.04,
          duration: 0.7,
          freqStart: 880,
          freqEnd: 110,
          gain: 0.2,
          type: 'square',
        });
        noiseBurst(ac, master, {
          at: now,
          duration: 0.55,
          freqStart: 3800,
          freqEnd: 320,
          q: 2.4,
          gain: 0.35,
        });
        break;

      case 'no_shift':
        partialTone(ac, master, { at: now, duration: 0.16, freqStart: 440, gain: 0.12 });
        partialTone(ac, master, { at: now + 0.07, duration: 0.2, freqStart: 554.37, gain: 0.12 });
        break;

      case 'turn':
        [659.25, 987.77].forEach((f, i) => {
          partialTone(ac, master, {
            at: now + i * 0.11,
            duration: 0.32,
            freqStart: f,
            gain: 0.22,
            type: 'triangle',
          });
        });
        break;

      case 'win':
        [523.25, 659.25, 783.99, 1174.66].forEach((f, i) => {
          partialTone(ac, master, {
            at: now + i * 0.08,
            duration: 0.48,
            freqStart: f,
            gain: 0.2,
            type: 'triangle',
          });
        });
        break;

      case 'sabacc_pot':
        [523.25, 659.25, 783.99, 987.77, 1318.5, 1567.98].forEach((f, i) => {
          partialTone(ac, master, {
            at: now + i * 0.065,
            duration: 0.55,
            freqStart: f,
            gain: 0.22,
          });
        });
        break;

      case 'bounty':
        [587.33, 880, 1174.66].forEach((f, i) => {
          partialTone(ac, master, {
            at: now + i * 0.075,
            duration: 0.42,
            freqStart: f,
            gain: 0.21,
            type: 'triangle',
          });
        });
        break;

      case 'rank_up':
        [440, 554.37, 659.25, 880, 1108.73, 1318.51].forEach((f, i) => {
          partialTone(ac, master, {
            at: now + i * 0.07,
            duration: 0.6,
            freqStart: f,
            gain: 0.24,
            type: 'triangle',
          });
        });
        break;

      case 'lose':
        [392.0, 311.13, 261.63].forEach((f, i) => {
          partialTone(ac, master, {
            at: now + i * 0.14,
            duration: 0.42,
            freqStart: f,
            gain: 0.15,
          });
        });
        break;

      case 'join':
        partialTone(ac, master, { at: now, duration: 0.16, freqStart: 520, freqEnd: 780, gain: 0.14 });
        break;

      case 'error':
        partialTone(ac, master, { at: now, duration: 0.11, freqStart: 170, gain: 0.14, type: 'square' });
        partialTone(ac, master, { at: now + 0.09, duration: 0.14, freqStart: 125, gain: 0.14, type: 'square' });
        break;
    }
  } catch {
    // Ignore browser autoplay / audio errors gracefully.
  }
}

/** Subtle warm Outer Rim lounge synth room-tone (optional toggle). */
export function setCantinaAmbience(enabled: boolean, volume = 0.8): void {
  if (!enabled || volume <= 0) {
    if (ambientNodes) {
      ambientNodes.stop();
      ambientNodes = null;
    }
    return;
  }

  try {
    const ac = getContext();
    if (!ac) return;
    if (ambientNodes) {
      ambientNodes.gain.gain.setTargetAtTime(volume * 0.035, ac.currentTime, 0.2);
      return;
    }

    const master = ac.createGain();
    master.gain.setValueAtTime(0.0001, ac.currentTime);
    master.gain.linearRampToValueAtTime(volume * 0.035, ac.currentTime + 1.2);
    master.connect(ac.destination);

    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 190;
    filter.connect(master);

    const osc1 = ac.createOscillator();
    const osc2 = ac.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.value = 55; // A1
    osc2.frequency.value = 82.41; // E2
    osc2.detune.value = 6;

    osc1.connect(filter);
    osc2.connect(filter);
    osc1.start();
    osc2.start();

    ambientNodes = {
      gain: master,
      stop: () => {
        try {
          osc1.stop();
          osc2.stop();
          master.disconnect();
        } catch {
          // Ignore.
        }
      },
    };
  } catch {
    // Ignore.
  }
}
