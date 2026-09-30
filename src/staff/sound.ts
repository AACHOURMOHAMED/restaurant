import { storage } from '@/lib/storage';

const KEY = 'bb-staff-sound';
let ctx: AudioContext | null = null;

export const soundPreference = {
  get: () => storage.get(KEY) === 'on',
  set: (on: boolean) => storage.set(KEY, on ? 'on' : 'off'),
};

/** Must be called from a click (browsers only allow audio after a user gesture). */
export async function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
}

/** A soft two-note bell, generated on the fly (no audio file to load). */
export function playChime() {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  [
    [880, 0],
    [1318.5, 0.16],
  ].forEach(([freq, delay]) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq!;
    gain.gain.setValueAtTime(0.0001, now + delay!);
    gain.gain.exponentialRampToValueAtTime(0.25, now + delay! + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay! + 0.9);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(now + delay!);
    osc.stop(now + delay! + 1);
  });
}
