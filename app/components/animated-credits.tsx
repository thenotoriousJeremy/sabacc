'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

/**
 * Smoothly ticks numeric values (credits & pots) and flashes a brief +/- delta badge
 * so every ante, bet, and pot win feels physically rewarding.
 */
export function AnimatedCredits({
  value,
  className = '',
  showDelta = false,
}: {
  value: number;
  className?: string;
  showDelta?: boolean;
}) {
  const [displayed, setDisplayed] = useState(value);
  const [deltaPopup, setDeltaPopup] = useState<{ id: number; diff: number } | null>(null);
  const prevRef = useRef(value);

  useEffect(() => {
    const start = prevRef.current;
    const diff = value - start;
    prevRef.current = value;

    if (diff === 0) return;

    if (showDelta && Math.abs(diff) > 0) {
      const id = Date.now();
      Promise.resolve().then(() => setDeltaPopup({ id, diff }));
      const clear = setTimeout(() => {
        setDeltaPopup(curr => (curr?.id === id ? null : curr));
      }, 1500);
      // Clean up popup timer only when overwritten or unmounted
      void clear;
    }

    const duration = 360;
    const t0 = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayed(Math.round(start + diff * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, showDelta]);

  return (
    <span className={`relative inline-flex items-center tabular-nums ${className}`}>
      {displayed.toLocaleString()}
      <AnimatePresence>
        {showDelta && deltaPopup && (
          <motion.span
            key={deltaPopup.id}
            initial={{ opacity: 0, y: 6, scale: 0.85 }}
            animate={{ opacity: 1, y: -18, scale: 1 }}
            exit={{ opacity: 0, y: -28 }}
            transition={{ duration: 0.4 }}
            className={`pointer-events-none absolute -top-2 right-0 font-mono text-xs font-bold whitespace-nowrap drop-shadow ${
              deltaPopup.diff > 0 ? 'text-emerald-300' : 'text-rose-400'
            }`}
          >
            {deltaPopup.diff > 0 ? `+${deltaPopup.diff}` : deltaPopup.diff}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
