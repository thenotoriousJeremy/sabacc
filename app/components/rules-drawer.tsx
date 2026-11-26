'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Pin, PinOff, X } from 'lucide-react';
import { HAND_CODEX_META } from '@/lib/game-logic';

export interface RulesDrawerProps {
  open: boolean;
  pinned: boolean;
  onClose: () => void;
  onTogglePin: () => void;
  onOpenTutorial?: () => void;
}

export function RulesDrawer({
  open,
  pinned,
  onClose,
  onTogglePin,
  onOpenTutorial,
}: RulesDrawerProps) {
  return (
    <>
      <AnimatePresence>
        {open && !pinned && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[75] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 12 }}
              onClick={e => e.stopPropagation()}
              className="sw-cut max-h-[85vh] w-full max-w-2xl overflow-y-auto border border-cyan-400/35 bg-[#070b12]/98 p-6 text-white shadow-2xl custom-scrollbar"
            >
              <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-cyan-300/70">
                    HOLOCRON REFERENCE
                  </div>
                  <h2 className="font-mono text-lg font-bold uppercase tracking-widest text-amber-400">
                    Corellian Spike Sabacc Rules
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {onOpenTutorial && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenTutorial();
                      }}
                      className="sw-cut-sm min-h-[40px] border border-amber-400/50 bg-amber-500/15 px-3 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300 hover:bg-amber-500/25"
                    >
                      Interactive Tutorial
                    </button>
                  )}
                  <button
                    onClick={onTogglePin}
                    className="sw-cut-sm hidden sm:flex min-h-[40px] items-center gap-1.5 border border-white/15 bg-white/5 px-3 font-mono text-[10px] uppercase tracking-wider text-slate-300 hover:text-amber-300"
                  >
                    <Pin className="h-3 w-3" /> Pin
                  </button>
                  <button
                    onClick={onClose}
                    aria-label="Close Rules"
                    className="flex h-11 w-11 items-center justify-center rounded text-white/50 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-5 text-xs leading-relaxed text-slate-300">
                {/* 1. Objective & Deck */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sw-cut-sm border border-white/10 bg-black/50 p-3.5">
                    <h3 className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-amber-400">
                      The Objective
                    </h3>
                    <p>
                      Build a hand summing as close to <strong className="text-amber-300">0 (Sabacc)</strong> as
                      possible over <strong>3 rounds</strong>. Any hand totaling 0 beats any non-zero hand (
                      <em>Nulrhek</em>).
                    </p>
                  </div>
                  <div className="sw-cut-sm border border-white/10 bg-black/50 p-3.5">
                    <h3 className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                      The 62-Card Deck
                    </h3>
                    <p>
                      <strong>30 Positive</strong> (+1 to +10 in 3 suits), <strong>30 Negative</strong> (-1 to -10 in 3
                      suits), and <strong>2 Sylops</strong> (value 0). Suits rank{' '}
                      <strong className="text-white">Circle &gt; Triangle &gt; Square</strong>.
                    </p>
                  </div>
                </div>

                {/* 2. Round Structure & All 4 Card Actions */}
                <div className="sw-cut-sm border border-white/10 bg-black/50 p-3.5">
                  <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-amber-400">
                    Round Flow (3 Rounds per Hand)
                  </h3>
                  <ul className="space-y-1.5 text-[11px]">
                    <li>
                      <strong className="text-white">1. Antes & Deal:</strong> Each player pays the Hand Ante into the{' '}
                      <span className="text-amber-300">Hand Pot</span> and the Sabacc Ante into the{' '}
                      <span className="text-rose-300">Sabacc Pot</span>, then receives 2 cards.
                    </li>
                    <li>
                      <strong className="text-white">2. Card Phase (Choose 1 of 4 actions):</strong>
                      <ul className="mt-1 grid grid-cols-1 gap-1 pl-3 sm:grid-cols-2">
                        <li>• <strong className="text-cyan-200">Draw:</strong> Gain 1 card from the Draw Shoe.</li>
                        <li>• <strong className="text-sky-200">Swap Shoe:</strong> Discard 1 card from your hand and draw 1 from the Shoe.</li>
                        <li>• <strong className="text-amber-200">Swap Discard:</strong> Trade 1 card from your hand for the face-up top Discard card.</li>
                        <li>• <strong className="text-white">Stand:</strong> Keep your current hand unchanged.</li>
                      </ul>
                    </li>
                    <li>
                      <strong className="text-white">3. Betting Phase:</strong> Check, Bet, Call, Raise (at least the
                      minimum raise), or Fold. Short all-ins or table-cap bets automatically form fair{' '}
                      <strong>Side Pots</strong>.
                    </li>
                    <li>
                      <strong className="text-white">4. Spike Dice Check:</strong> Two 6-sided Spike Dice are rolled at
                      the end of each round. Matching symbols (doubles, 1-in-6 chance) trigger a{' '}
                      <strong className="text-rose-400">SABACC SHIFT</strong>: every active player discards their entire
                      hand and receives the exact same number of new cards!
                    </li>
                  </ul>
                </div>

                {/* 3. Full 13-Rank Hierarchy */}
                <div>
                  <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-amber-400">
                    Complete 13-Hand Hierarchy (Highest → Lowest)
                  </h3>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {HAND_CODEX_META.map((h, i) => (
                      <div
                        key={h.key}
                        className="sw-cut-sm flex flex-col justify-between border border-white/10 bg-black/50 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                          <span>
                            <span className="mr-1.5 text-white/35">{i + 1}.</span>
                            <strong className={h.winsSabaccPot ? 'text-amber-300' : 'text-white'}>
                              {h.name}
                            </strong>
                          </span>
                          {h.winsSabaccPot && (
                            <span className="text-[9px] uppercase tracking-wider text-rose-400">
                              +Sabacc Pot
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-400">
                          <span>{h.formula}</span>
                          <span className="font-mono text-cyan-300/75">{h.example}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Tie-Breakers & Pots */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sw-cut-sm border border-white/10 bg-black/50 p-3.5">
                    <h4 className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                      Tie-Breaker Chain
                    </h4>
                    <ol className="list-decimal space-y-1 pl-4 text-[11px]">
                      <li>
                        <strong>Specialty Ties:</strong> Lower pair/set integer wins (e.g. +1/-1 beats +9/-9).
                      </li>
                      <li>
                        <strong>Nulrhek Ties:</strong> Closest to 0 wins; <strong>positive beats negative</strong> (+2
                        beats -2).
                      </li>
                      <li>
                        <strong>Most Cards:</strong> Hand with more cards wins.
                      </li>
                      <li>
                        <strong>Positive Sum:</strong> Higher total of all positive cards wins.
                      </li>
                      <li>
                        <strong>Highest Positive Card</strong>, then <strong>Suit</strong> (Circle &gt; Triangle &gt;
                        Square).
                      </li>
                      <li>
                        <strong>Exact Tie:</strong> Splits pot evenly (or Sudden-Death <strong>Single Blind Draw</strong>{' '}
                        if toggled by Host in Ledger &amp; Rules).
                      </li>
                    </ol>
                  </div>

                  <div className="sw-cut-sm border border-white/10 bg-black/50 p-3.5">
                    <h4 className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-rose-300">
                      Hand Pot vs. Sabacc Pot
                    </h4>
                    <ul className="list-disc space-y-1.5 pl-4 text-[11px]">
                      <li>
                        <strong className="text-amber-300">Hand Pot:</strong> Won every hand by the best surviving hand
                        (even if won with a Nulrhek or uncontested fold).
                      </li>
                      <li>
                        <strong className="text-rose-300">Sabacc Pot:</strong> Accumulates across hands! Only claimed if
                        the winning hand at Showdown is a named Specialty hand (<strong>Sabacc Pair</strong> or better).
                        A plain non-paired 0 Sabacc or Nulrhek leaves the Sabacc Pot to roll over!
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pinned Compact Reference */}
      <AnimatePresence>
        {open && pinned && (
          <motion.aside
            initial={{ x: 260, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 260, opacity: 0 }}
            className="sw-cut fixed bottom-20 right-3 top-14 z-40 w-60 overflow-y-auto border border-cyan-400/30 bg-[#070b12]/95 p-3.5 text-white shadow-2xl backdrop-blur-xl custom-scrollbar"
          >
            <div className="mb-2.5 flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-amber-400">
                13 Hand Ranks
              </span>
              <div className="flex items-center gap-1.5">
                <button onClick={onTogglePin} className="text-white/45 hover:text-white" title="Expand Modal">
                  <PinOff className="h-3.5 w-3.5" />
                </button>
                <button onClick={onClose} className="text-white/45 hover:text-white" title="Close">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <ol className="space-y-1 font-mono text-[10px]">
              {HAND_CODEX_META.map((h, idx) => (
                <li key={h.key} className="flex justify-between gap-1">
                  <span className={h.winsSabaccPot ? 'text-amber-300' : 'text-slate-300'}>
                    {idx + 1}. {h.name}
                  </span>
                  <span className="text-[9px] text-slate-500">{h.example.split(',')[0]}</span>
                </li>
              ))}
            </ol>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
