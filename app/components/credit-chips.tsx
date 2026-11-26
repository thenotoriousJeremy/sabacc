'use client';

import React from 'react';

/**
 * Renders a small physical stack of Star Wars Corellian credit ingots/chips
 * scaled by credit amount (Bronze 1-24, Silver 25-99, Gold 100-499, Beskar/Aurodium 500+).
 */
export function CreditIngotStack({
  amount,
  variant = 'gold',
  size = 'md',
}: {
  amount: number;
  variant?: 'gold' | 'crimson' | 'cyan';
  size?: 'sm' | 'md';
}) {
  if (amount <= 0) return null;

  const layers = Math.min(5, Math.max(1, Math.ceil(Math.log2(amount / 5 + 1))));
  const colors =
    variant === 'crimson'
      ? { top: '#fb7185', side: '#881337', rim: '#fda4af' }
      : variant === 'cyan'
        ? { top: '#38bdf8', side: '#0c4a6e', rim: '#bae6fd' }
        : { top: '#fbbf24', side: '#78350f', rim: '#fde68a' };

  const w = size === 'sm' ? 20 : 28;
  const layerH = size === 'sm' ? 3.2 : 4;
  const totalH = 10 + layers * layerH;

  return (
    <svg
      width={w}
      height={totalH}
      viewBox={`0 0 ${w} ${totalH}`}
      className="shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]"
      aria-hidden
    >
      {Array.from({ length: layers }).map((_, i) => {
        const y = totalH - 6 - i * layerH;
        const rx = w * 0.44;
        const cx = w / 2;
        return (
          <g key={i}>
            <ellipse cx={cx} cy={y + 2.2} rx={rx} ry={3.4} fill={colors.side} />
            <ellipse
              cx={cx}
              cy={y}
              rx={rx}
              ry={3.4}
              fill={colors.top}
              stroke={colors.rim}
              strokeWidth="0.6"
            />
          </g>
        );
      })}
    </svg>
  );
}
