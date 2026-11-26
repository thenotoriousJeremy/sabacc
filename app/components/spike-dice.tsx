'use client';

import React from 'react';
import { motion } from 'motion/react';
import { DiceStyleId } from '@/lib/progression';

function SpikeFaceGlyph({ value, size = 'lg' }: { value: number; size?: 'sm' | 'lg' }) {
  const cls = size === 'sm' ? 'h-4 w-4 sm:h-4.5 sm:w-4.5' : 'h-7 w-7 sm:h-8 sm:w-8';
  switch (value) {
    case 1:
      return (
        <svg viewBox="0 0 32 32" className={cls} aria-hidden>
          <polygon points="16,4 28,16 16,28 4,16" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <circle cx="16" cy="16" r="3.5" fill="currentColor" />
        </svg>
      );
    case 2:
      return (
        <svg viewBox="0 0 32 32" className={cls} aria-hidden>
          <rect x="7" y="6" width="5" height="20" rx="1" fill="currentColor" />
          <rect x="20" y="6" width="5" height="20" rx="1" fill="currentColor" />
        </svg>
      );
    case 3:
      return (
        <svg viewBox="0 0 32 32" className={cls} aria-hidden>
          <polygon points="16,4 28,25 4,25" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <circle cx="16" cy="18" r="3" fill="currentColor" />
        </svg>
      );
    case 4:
      return (
        <svg viewBox="0 0 32 32" className={cls} aria-hidden>
          <rect x="6" y="6" width="7" height="7" fill="currentColor" />
          <rect x="19" y="6" width="7" height="7" fill="currentColor" />
          <rect x="6" y="19" width="7" height="7" fill="currentColor" />
          <rect x="19" y="19" width="7" height="7" fill="currentColor" />
        </svg>
      );
    case 5:
      return (
        <svg viewBox="0 0 32 32" className={cls} aria-hidden>
          <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <line x1="16" y1="3" x2="16" y2="29" stroke="currentColor" strokeWidth="2.2" />
          <line x1="3" y1="16" x2="29" y2="16" stroke="currentColor" strokeWidth="2.2" />
          <circle cx="16" cy="16" r="2.5" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 32 32" className={cls} aria-hidden>
          <polygon
            points="16,3 27,9.5 27,22.5 16,29 5,22.5 5,9.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          />
          <polygon points="16,9 22,16 16,23 10,16" fill="currentColor" />
        </svg>
      );
  }
}

const DICE_FINISH: Record<DiceStyleId, string> = {
  'brass-aurebesh':
    'bg-gradient-to-br from-amber-300 via-amber-500 to-yellow-800 text-zinc-950 border-amber-200 shadow-[0_6px_20px_rgba(245,158,11,0.4)]',
  'tibanna-amber':
    'bg-gradient-to-br from-orange-400 via-red-600 to-amber-950 text-amber-100 border-orange-300 shadow-[0_6px_20px_rgba(249,115,22,0.4)]',
  'obsidian-gold':
    'bg-gradient-to-br from-slate-800 via-zinc-950 to-black text-amber-400 border-amber-400/80 shadow-[0_6px_22px_rgba(251,191,36,0.32)]',
};

/**
 * Physical Spike Dice docked on the holotable felt between rolls alongside the
 * 3-round indicator — gives the table tactile presence and shows the last roll.
 */
export function SpikeDiceCradle({
  roll,
  round,
  activeHand,
  diceStyle = 'brass-aurebesh',
}: {
  roll: [number, number] | null;
  round: number;
  activeHand: boolean;
  diceStyle?: DiceStyleId;
}) {
  const finish = DICE_FINISH[diceStyle] ?? DICE_FINISH['brass-aurebesh'];
  const d1 = roll ? roll[0] : 1;
  const d2 = roll ? roll[1] : 6;

  return (
    <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/45 px-3 py-1 backdrop-blur-sm">
      <div className="flex items-center gap-1.5" title={`Round ${round} of 3`}>
        {[1, 2, 3].map(r => {
          const lit = activeHand && r <= round;
          const current = activeHand && r === round;
          return (
            <span
              key={r}
              className={`h-2 w-2 rotate-45 border transition-all ${
                current
                  ? 'scale-115 border-amber-400 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]'
                  : lit
                    ? 'border-cyan-400 bg-cyan-400/70'
                    : 'border-white/25 bg-transparent'
              }`}
            />
          );
        })}
        <span className="ml-1 font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
          Rd {round}/3
        </span>
      </div>

      <div className="h-3.5 w-px bg-white/15" />

      <div className="flex items-center gap-1.5" title="Spike Dice (Doubles trigger a Sabacc Shift)">
        <div className={`flex h-6 w-6 items-center justify-center rounded border ${finish}`}>
          <SpikeFaceGlyph value={d1} size="sm" />
        </div>
        <div className={`flex h-6 w-6 items-center justify-center rounded border ${finish}`}>
          <SpikeFaceGlyph value={d2} size="sm" />
        </div>
      </div>
    </div>
  );
}

export interface SpikeDiceOverlayProps {
  roll: [number, number] | null;
  tumbleFirst: boolean;
  tumbleSecond: boolean;
  shiftTriggered?: boolean;
  diceStyle?: DiceStyleId;
}

export function SpikeDiceOverlay({
  roll,
  tumbleFirst,
  tumbleSecond,
  shiftTriggered,
  diceStyle = 'brass-aurebesh',
}: SpikeDiceOverlayProps) {
  const finish = DICE_FINISH[diceStyle] ?? DICE_FINISH['brass-aurebesh'];
  const isDoubles = !!roll && roll[0] === roll[1] && !tumbleSecond;

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.88, opacity: 0 }}
      className={`sw-cut pointer-events-none absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 border px-7 py-4 backdrop-blur-xl ${
        isDoubles || shiftTriggered
          ? 'border-rose-500 bg-[#180408]/95 shadow-[0_0_70px_rgba(244,63,94,0.65)]'
          : 'border-cyan-400/55 bg-[#060b12]/95 shadow-[0_0_50px_rgba(34,211,238,0.28)]'
      }`}
    >
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.3em] ${
          isDoubles ? 'text-rose-400' : 'text-cyan-300/80'
        }`}
      >
        {tumbleSecond ? 'ROLLING SPIKE DICE' : isDoubles ? '⚡ SABACC SHIFT!' : 'HANDS HOLD'}
      </span>

      <div className="flex items-center gap-4">
        {[0, 1].map(idx => {
          const tumbling = idx === 0 ? tumbleFirst : tumbleSecond;
          const val = roll ? roll[idx] : 1;
          return (
            <motion.div
              key={idx}
              animate={
                tumbling
                  ? {
                      rotate: idx === 0 ? [0, 120, 240, 360] : [360, 220, 100, 0],
                      scale: [1, 1.12, 0.96, 1.06],
                      y: [0, -7, 3, -3, 0],
                    }
                  : { rotate: 0, scale: isDoubles ? 1.08 : 1, y: 0 }
              }
              transition={
                tumbling
                  ? { repeat: Infinity, duration: 0.22, ease: 'linear' }
                  : { type: 'spring', stiffness: 450, damping: 22 }
              }
              className={`sw-cut-sm relative flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center border-2 ${finish}`}
            >
              {tumbling ? (
                <span className="font-mono text-xl font-bold opacity-80">◈</span>
              ) : (
                <SpikeFaceGlyph value={val} />
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
