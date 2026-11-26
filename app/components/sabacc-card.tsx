'use client';

import React from 'react';
import { Card, CardSuit, CardType } from '@/lib/game-logic';
import { CardBackId } from '@/lib/progression';

type Detail = 'pip' | 'numeral';

function SuitGlyph({ suit, className }: { suit: CardSuit; className?: string }) {
  const common = { className, viewBox: '0 0 12 12', 'aria-hidden': true } as const;
  switch (suit) {
    case CardSuit.CIRCLE:
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="6" cy="6" r="1.8" fill="currentColor" />
        </svg>
      );
    case CardSuit.TRIANGLE:
      return (
        <svg {...common}>
          <polygon points="6,1.2 11,10.2 1,10.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="6" cy="7.4" r="1.3" fill="currentColor" />
        </svg>
      );
    case CardSuit.SQUARE:
      return (
        <svg {...common}>
          <rect x="1.6" y="1.6" width="8.8" height="8.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <rect x="4.5" y="4.5" width="3" height="3" fill="currentColor" />
        </svg>
      );
    default:
      return null;
  }
}

function SylopSunCrest({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <polygon
        points="24,2 29.5,16.5 44,24 29.5,31.5 24,46 18.5,31.5 4,24 18.5,16.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <polygon
        points="24,9 27.5,19.5 38,24 27.5,28.5 24,39 20.5,28.5 10,24 20.5,19.5"
        fill="currentColor"
        opacity="0.22"
      />
      <circle cx="24" cy="24" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.85" />
      <circle cx="24" cy="24" r="3.6" fill="currentColor" />
    </svg>
  );
}

/** Precision diegetic Star Wars FUI bezel matching `.hex-card` (20%/80%/14%/86%). */
function HexFuiFrame({ strokeClass, accentFill }: { strokeClass: string; accentFill?: string }) {
  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${strokeClass}`}
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* Top & bottom metallic cap plates */}
      {accentFill && (
        <>
          <polygon points="20,1.5 80,1.5 91,11 9,11" fill={accentFill} opacity="0.28" />
          <polygon points="9,129 91,129 80,138.5 20,138.5" fill={accentFill} opacity="0.28" />
        </>
      )}
      {/* Outer precision hull */}
      <polygon
        points="20,1.5 80,1.5 98.5,19.6 98.5,120.4 80,138.5 20,138.5 1.5,120.4 1.5,19.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      {/* Inner telemetry hairline */}
      <polygon
        points="22.5,6.5 77.5,6.5 93.5,22.2 93.5,117.8 77.5,133.5 22.5,133.5 6.5,117.8 6.5,22.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.75"
        opacity="0.45"
      />
      {/* Side FUI calibration ticks */}
      <line x1="1.5" y1="64" x2="6.5" y2="64" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
      <line x1="1.5" y1="70" x2="8.5" y2="70" stroke="currentColor" strokeWidth="1.5" opacity="0.9" />
      <line x1="1.5" y1="76" x2="6.5" y2="76" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />

      <line x1="93.5" y1="64" x2="98.5" y2="64" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
      <line x1="91.5" y1="70" x2="98.5" y2="70" stroke="currentColor" strokeWidth="1.5" opacity="0.9" />
      <line x1="93.5" y1="76" x2="98.5" y2="76" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
    </svg>
  );
}

const BACK_STYLES: Record<
  CardBackId,
  { bg: string; stroke: string; motif: string; holo?: boolean }
> = {
  'spike-classic': {
    bg: 'from-[#18120a] via-[#0c0905] to-[#060503]',
    stroke: 'text-amber-500/75',
    motif: 'text-amber-400/60',
  },
  'worn-copper': {
    bg: 'from-[#24120a] via-[#130905] to-[#080402]',
    stroke: 'text-orange-400/75',
    motif: 'text-orange-300/55',
  },
  'beskar-steel': {
    bg: 'from-[#1b2432] via-[#0d131d] to-[#06090e]',
    stroke: 'text-cyan-300/65',
    motif: 'text-slate-300/55',
  },
  'crimson-dawn': {
    bg: 'from-[#290911] via-[#130408] to-[#070203]',
    stroke: 'text-rose-500/75',
    motif: 'text-amber-300/60',
  },
  'halcyon-holo': {
    bg: 'from-[#17122b] via-[#0c1424] to-[#06080f]',
    stroke: 'text-amber-300/85',
    motif: 'text-cyan-200/70',
    holo: true,
  },
};

function CardBack({
  className,
  cardBack = 'spike-classic',
  interactive = false,
  onClick,
  title,
}: {
  className?: string;
  cardBack?: CardBackId;
  interactive?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const spec = BACK_STYLES[cardBack] ?? BACK_STYLES['spike-classic'];
  return (
    <div
      onClick={onClick}
      title={title}
      className={`hex-card relative select-none overflow-hidden bg-gradient-to-b ${spec.bg} shadow-[0_8px_22px_rgba(0,0,0,0.85)] transition-all duration-150 ${
        interactive
          ? 'cursor-pointer hover:-translate-y-1 hover:brightness-125 ring-1 ring-cyan-400/50'
          : onClick
            ? 'cursor-pointer'
            : ''
      } ${className ?? ''}`}
    >
      {spec.holo && <div className="holo-shimmer pointer-events-none absolute inset-0 opacity-65" />}
      <HexFuiFrame strokeClass={spec.stroke} />
      <svg
        className={`pointer-events-none absolute inset-0 h-full w-full ${spec.motif}`}
        viewBox="0 0 100 140"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <polygon points="50,18 82,70 50,122 18,70" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
        <polygon points="50,33 72,70 50,107 28,70" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.75" />
        <polygon points="50,48 61,70 50,92 39,70" fill="currentColor" opacity="0.22" />
        <line x1="50" y1="12" x2="50" y2="128" stroke="currentColor" strokeWidth="0.75" opacity="0.35" />
        <circle cx="50" cy="70" r="4" fill="currentColor" />
      </svg>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_42%)]" />
    </div>
  );
}

function Pips({ card, className }: { card: Card; className?: string }) {
  const count = Math.abs(card.value);
  if (count === 0 || count > 10) return null;
  return (
    <div className={`flex flex-wrap items-center justify-center gap-[2.5px] ${className ?? ''}`} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <SuitGlyph key={i} suit={card.suit} className="h-[0.15em] w-[0.15em] shrink-0" />
      ))}
    </div>
  );
}

export interface SabaccCardProps {
  card?: Card;
  className?: string;
  faceDown?: boolean;
  selected?: boolean;
  interactiveHint?: boolean;
  detail?: Detail;
  cardBack?: CardBackId;
  lightMode?: boolean;
  onClick?: () => void;
  title?: string;
}

export function SabaccCard({
  card,
  className,
  faceDown = false,
  selected = false,
  interactiveHint = false,
  detail = 'pip',
  cardBack = 'spike-classic',
  lightMode = false,
  onClick,
  title,
}: SabaccCardProps) {
  if (faceDown || !card || card.hidden) {
    return (
      <CardBack
        className={className}
        cardBack={cardBack}
        interactive={interactiveHint}
        onClick={onClick}
        title={title}
      />
    );
  }

  const isSylop = card.type === CardType.SYLOP;
  const label = card.value > 0 ? `+${card.value}` : String(card.value);

  const palette = lightMode
    ? isSylop
      ? {
          bg: 'from-[#221908] via-[#120d05] to-[#090703]',
          text: '!text-amber-300',
          bezel: selected ? '!text-amber-300' : '!text-amber-400/90',
          capFill: '#f59e0b',
          glow: 'drop-shadow-[0_0_10px_rgba(251,191,36,0.55)]',
        }
      : card.type === CardType.POSITIVE
        ? {
            bg: 'from-[#f8fafc] via-[#e2e8f0] to-[#cbd5e1]',
            text: '!text-[#0c4a6e]',
            bezel: selected ? '!text-amber-500' : '!text-[#0284c7]',
            capFill: '#0284c7',
            glow: 'drop-shadow-[0_1px_0_rgba(255,255,255,0.85)]',
          }
        : {
            bg: 'from-[#f8fafc] via-[#e7e2e8] to-[#d4ccd6]',
            text: '!text-[#881337]',
            bezel: selected ? '!text-amber-500' : '!text-[#be123c]',
            capFill: '#e11d48',
            glow: 'drop-shadow-[0_1px_0_rgba(255,255,255,0.85)]',
          }
    : isSylop
      ? {
          bg: 'from-[#261c08] via-[#110d04] to-[#070502]',
          text: 'text-amber-200',
          bezel: selected ? 'text-amber-300' : 'text-amber-400/85',
          capFill: '#f59e0b',
          glow: 'drop-shadow-[0_0_12px_rgba(251,191,36,0.7)]',
        }
      : card.type === CardType.POSITIVE
        ? {
            bg: 'from-[#092230] via-[#06131c] to-[#03080d]',
            text: 'text-cyan-200',
            bezel: selected ? 'text-amber-300' : 'text-cyan-400/80',
            capFill: '#22d3ee',
            glow: 'drop-shadow-[0_0_10px_rgba(34,211,238,0.55)]',
          }
        : {
            bg: 'from-[#2e0913] via-[#18050a] to-[#090204]',
            text: 'text-rose-200',
            bezel: selected ? 'text-amber-300' : 'text-rose-500/80',
            capFill: '#f43f5e',
            glow: 'drop-shadow-[0_0_10px_rgba(244,63,94,0.55)]',
          };

  return (
    <div
      onClick={onClick}
      title={title ?? (isSylop ? 'Sylop (0)' : `${label} ${card.suit.toLowerCase()}`)}
      className={`hex-card relative flex select-none flex-col items-center justify-center overflow-hidden bg-gradient-to-b ${palette.bg} ${palette.text} transition-all duration-150 ${
        selected
          ? 'brightness-125 shadow-[0_0_28px_rgba(251,191,36,0.6)]'
          : 'shadow-[0_8px_22px_rgba(0,0,0,0.85)]'
      } ${onClick ? 'cursor-pointer hover:-translate-y-1 hover:brightness-115' : ''} ${className ?? ''}`}
    >
      {isSylop && <div className="holo-shimmer pointer-events-none absolute inset-0 opacity-75" />}
      <HexFuiFrame strokeClass={palette.bezel} accentFill={palette.capFill} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.12),transparent_38%)]" />

      {isSylop ? (
        <div className="relative z-10 flex flex-col items-center gap-[2px]">
          <SylopSunCrest className={`h-[0.74em] w-[0.74em] text-amber-300 ${palette.glow}`} />
          <span className="font-mono text-[0.24em] font-bold leading-none tracking-[0.18em] text-amber-100">
            0
          </span>
        </div>
      ) : (
        <>
          {detail === 'pip' && (
            <>
              <div className="absolute left-[20%] top-[8%] flex items-center gap-[2px]">
                <span className="font-mono text-[0.2em] font-bold leading-none opacity-90">{label}</span>
                <SuitGlyph suit={card.suit} className="h-[0.15em] w-[0.15em] opacity-85" />
              </div>
              <div className="absolute bottom-[8%] right-[20%] flex rotate-180 items-center gap-[2px]">
                <span className="font-mono text-[0.2em] font-bold leading-none opacity-90">{label}</span>
                <SuitGlyph suit={card.suit} className="h-[0.15em] w-[0.15em] opacity-85" />
              </div>
            </>
          )}

          <div className="relative z-10 flex flex-col items-center gap-[4px] px-1">
            <span className={`font-mono text-[0.58em] font-bold leading-none tracking-tight ${palette.glow}`}>
              {label}
            </span>
            {detail === 'pip' && <Pips card={card} className="max-w-[78%]" />}
          </div>
        </>
      )}
    </div>
  );
}

export default SabaccCard;
