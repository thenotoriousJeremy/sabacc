'use client';

import React from 'react';
import { Card, CardSuit, CardType } from '@/lib/game-logic';

/**
 * A Corellian Spike card.
 *
 * The physical deck marks a card's value by repeating its suit symbol that many
 * times, so the pip cluster here is the real read and the numeral is the
 * shorthand. Suits are circle, triangle and square; the two Sylops are value
 * zero and carry no suit.
 */

type Detail = 'pip' | 'numeral';

const SUIT_TINT: Record<string, string> = {
  [CardType.POSITIVE]: 'text-sky-300',
  [CardType.NEGATIVE]: 'text-rose-300',
  [CardType.SYLOP]: 'text-amber-200',
};

// Filled shapes rather than outline icons: at pip size an outline turns to mush.
function SuitGlyph({ suit, className }: { suit: CardSuit; className?: string }) {
  const common = { className, viewBox: '0 0 10 10', 'aria-hidden': true } as const;
  switch (suit) {
    case CardSuit.CIRCLE:
      return <svg {...common}><circle cx="5" cy="5" r="4" fill="currentColor" /></svg>;
    case CardSuit.TRIANGLE:
      return <svg {...common}><polygon points="5,1 9.2,8.5 0.8,8.5" fill="currentColor" /></svg>;
    case CardSuit.SQUARE:
      return <svg {...common}><rect x="1.2" y="1.2" width="7.6" height="7.6" rx="0.8" fill="currentColor" /></svg>;
    default:
      return null;
  }
}

// The Sylop is one of only two in the deck, so it gets its own mark rather than
// a suit: a hollow ring around a solid core.
function SylopMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </svg>
  );
}

function CardBack({ className }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border-2 border-amber-600/40 bg-[#0c0a08] shadow-[0_2px_10px_rgba(0,0,0,0.6),inset_0_0_16px_rgba(245,158,11,0.08)] ${className ?? ''}`}
    >
      {/* Concentric spikes: the motif the variant is named for. */}
      <svg className="absolute inset-0 h-full w-full text-amber-500/40" viewBox="0 0 40 56" preserveAspectRatio="none" aria-hidden>
        <rect x="2.5" y="2.5" width="35" height="51" rx="3" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.6" />
        {[13, 9.5, 6].map((r, i) => (
          <polygon
            key={r}
            points={`20,${28 - r * 1.5} ${20 + r},28 20,${28 + r * 1.5} ${20 - r},28`}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.7"
            opacity={0.35 + i * 0.2}
          />
        ))}
        <circle cx="20" cy="28" r="1.6" fill="currentColor" />
      </svg>
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_45%)]" />
    </div>
  );
}

function Pips({ card, className }: { card: Card; className?: string }) {
  const count = Math.abs(card.value);
  if (count === 0 || count > 10) return null;
  return (
    <div className={`flex flex-wrap items-center justify-center gap-[2px] ${className ?? ''}`} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <SuitGlyph key={i} suit={card.suit} className="h-[0.15em] w-[0.15em] shrink-0" />
      ))}
    </div>
  );
}

export interface SabaccCardProps {
  card?: Card;
  /** Dimension classes, e.g. "w-14 h-20 sm:w-20 sm:h-28". */
  className?: string;
  faceDown?: boolean;
  selected?: boolean;
  /** "numeral" drops the pip cluster, for cards too small to read it. */
  detail?: Detail;
  onClick?: () => void;
  title?: string;
}

export function SabaccCard({
  card,
  className,
  faceDown = false,
  selected = false,
  detail = 'pip',
  onClick,
  title,
}: SabaccCardProps) {
  if (faceDown || !card) return <CardBack className={className} />;

  const isSylop = card.type === CardType.SYLOP;
  const tint = SUIT_TINT[card.type] ?? 'text-white';
  // Positive values carry an explicit + so the sign is never inferred from colour alone.
  const label = card.value > 0 ? `+${card.value}` : String(card.value);

  const face =
    card.type === CardType.POSITIVE
      ? 'from-sky-950/80 to-[#05080d] border-sky-400/40'
      : card.type === CardType.NEGATIVE
        ? 'from-rose-950/80 to-[#0d0506] border-rose-400/40'
        : 'from-amber-900/60 to-[#0d0a05] border-amber-400/50';

  return (
    <div
      onClick={onClick}
      title={title ?? (isSylop ? 'Sylop' : `${label} ${card.suit.toLowerCase()}`)}
      className={`relative flex flex-col items-center justify-center overflow-hidden rounded-lg border-2 bg-gradient-to-br shadow-[0_2px_10px_rgba(0,0,0,0.6)] ${face} ${tint} ${
        selected ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-black' : ''
      } ${onClick ? 'cursor-pointer' : ''} ${className ?? ''}`}
    >
      {/* Bevel and sheen, so the card reads as a physical object. */}
      <div className="pointer-events-none absolute inset-0 rounded-[6px] border border-white/10" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.10),transparent_40%)]" />

      {isSylop ? (
        <div className="flex flex-col items-center gap-[2px]">
          <SylopMark className="h-[0.66em] w-[0.66em]" />
          <span className="text-[0.17em] font-bold uppercase tracking-[0.18em] opacity-70">Sylop</span>
        </div>
      ) : (
        <>
          {detail === 'pip' && (
            <>
              <span className="absolute left-1 top-0.5 font-mono text-[0.24em] font-bold leading-none opacity-80">{label}</span>
              <SuitGlyph suit={card.suit} className="absolute right-1 top-1.5 h-[0.18em] w-[0.18em] opacity-60" />
              <span className="absolute bottom-0.5 right-1 rotate-180 font-mono text-[0.24em] font-bold leading-none opacity-80">
                {label}
              </span>
            </>
          )}

          <div className="flex flex-col items-center gap-[3px] px-1">
            <span className="font-mono text-[0.62em] font-bold leading-none tracking-tight drop-shadow-[0_0_6px_currentColor]">
              {label}
            </span>
            {detail === 'pip' && <Pips card={card} className="max-w-[86%]" />}
          </div>

        </>
      )}
    </div>
  );
}

export default SabaccCard;
