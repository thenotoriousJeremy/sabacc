'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, BookOpen, Check, Dices, Sparkles, X } from 'lucide-react';
import { CardSuit, CardType } from '@/lib/game-logic';
import { CreditIngotStack } from './credit-chips';
import { SabaccCard } from './sabacc-card';
import { SpikeDiceCradle } from './spike-dice';

export interface TutorialModalProps {
  open: boolean;
  lightMode?: boolean;
  onClose: () => void;
  onComplete: () => void;
  onOpenFullRules: () => void;
  onPlaySound?: (cue: 'click' | 'card' | 'dice' | 'win' | 'sabacc_shift') => void;
}

const C_NEG6 = { id: 't-n6', value: -6, type: CardType.NEGATIVE, suit: CardSuit.CIRCLE };
const C_POS6 = { id: 't-p6', value: 6, type: CardType.POSITIVE, suit: CardSuit.CIRCLE };
const C_POS8 = { id: 't-p8', value: 8, type: CardType.POSITIVE, suit: CardSuit.TRIANGLE };
const C_NEG3 = { id: 't-n3', value: -3, type: CardType.NEGATIVE, suit: CardSuit.SQUARE };

const SWAP_KEEP = { id: 't-n5', value: -5, type: CardType.NEGATIVE, suit: CardSuit.CIRCLE };
const SWAP_DROP = { id: 't-p9', value: 9, type: CardType.POSITIVE, suit: CardSuit.SQUARE };
const SWAP_TAKE = { id: 't-p5', value: 5, type: CardType.POSITIVE, suit: CardSuit.CIRCLE };
const SYLOP_CARD = { id: 't-0', value: 0, type: CardType.SYLOP, suit: CardSuit.NONE };

export function TutorialModal({
  open,
  lightMode = false,
  onClose,
  onComplete,
  onOpenFullRules,
  onPlaySound,
}: TutorialModalProps) {
  const [step, setStep] = useState(0);
  const [swapped, setSwapped] = useState(false);
  const [rolledDoubles, setRolledDoubles] = useState(false);

  const resetAndClose = () => {
    setStep(0);
    setSwapped(false);
    setRolledDoubles(false);
    onClose();
  };

  const finishTutorial = () => {
    setStep(0);
    setSwapped(false);
    setRolledDoubles(false);
    onComplete();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[92] flex items-end sm:items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-md"
          onClick={resetAndClose}
        >
          <motion.div
            initial={{ y: 28, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 24, scale: 0.97 }}
            onClick={e => e.stopPropagation()}
            className="sw-cut safe-bottom w-full max-w-md border border-cyan-400/35 bg-[#070b12]/98 p-5 sm:p-6 text-white shadow-2xl space-y-5"
          >
            {/* Header + Step Dots */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {[0, 1, 2, 3].map(i => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    aria-label={`Tutorial Step ${i + 1}`}
                    className={`h-2.5 rounded-full transition-all ${
                      step === i ? 'w-7 bg-amber-400' : i < step ? 'w-2.5 bg-cyan-400' : 'w-2.5 bg-white/20'
                    }`}
                  />
                ))}
                <span className="ml-1 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                  {step + 1} / 4
                </span>
              </div>

              <button
                onClick={resetAndClose}
                aria-label="Close Tutorial"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* STEP 1: Goal = Zero */}
            {step === 0 && (
              <div className="space-y-4 text-center">
                <div>
                  <h2 className="text-2xl font-bold uppercase tracking-wider text-amber-400">
                    Goal: Hit Zero
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">
                    Blue <strong className="text-cyan-300">(+)</strong> and Red{' '}
                    <strong className="text-rose-300">(–)</strong> cards cancel each other out. Get your hand
                    total as close to <strong className="text-amber-300">0 (Sabacc)</strong> as possible!
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="sw-cut-sm flex flex-col items-center gap-2 border border-amber-400/60 bg-amber-500/12 p-3">
                    <div className="flex gap-1.5">
                      <SabaccCard card={C_NEG6} detail="numeral" lightMode={lightMode} className="h-20 w-14 text-[30px]" />
                      <SabaccCard card={C_POS6} detail="numeral" lightMode={lightMode} className="h-20 w-14 text-[30px]" />
                    </div>
                    <span className="font-mono text-xs font-bold uppercase text-amber-300">
                      ★ Total 0 · Wins!
                    </span>
                  </div>

                  <div className="sw-cut-sm flex flex-col items-center gap-2 border border-white/12 bg-black/45 p-3 opacity-80">
                    <div className="flex gap-1.5">
                      <SabaccCard card={C_POS8} detail="numeral" lightMode={lightMode} className="h-20 w-14 text-[30px]" />
                      <SabaccCard card={C_NEG3} detail="numeral" lightMode={lightMode} className="h-20 w-14 text-[30px]" />
                    </div>
                    <span className="font-mono text-xs text-slate-400">Total +5</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Interactive Card Swap */}
            {step === 1 && (
              <div className="space-y-4 text-center">
                <div>
                  <h2 className="text-2xl font-bold uppercase tracking-wider text-amber-400">
                    Swap Cards to Improve
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">
                    On your turn, <strong>Draw</strong>, <strong>Stand</strong>, or <strong>Swap</strong> one
                    of your cards with the Deck or the face-up Discard pile.
                  </p>
                </div>

                <div className="sw-cut-sm flex flex-col items-center gap-3 border border-cyan-400/30 bg-black/50 p-4">
                  <div className="flex w-full items-center justify-around">
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="font-mono text-[10px] uppercase text-slate-400">Your Hand</span>
                      <div className="flex gap-2">
                        <SabaccCard
                          card={SWAP_KEEP}
                          detail="numeral"
                          lightMode={lightMode}
                          className="h-22 w-15 text-[34px]"
                        />
                        <SabaccCard
                          card={swapped ? SWAP_TAKE : SWAP_DROP}
                          selected={!swapped}
                          detail="numeral"
                          lightMode={lightMode}
                          onClick={() => {
                            if (!swapped) {
                              onPlaySound?.('win');
                              setSwapped(true);
                            }
                          }}
                          className="h-22 w-15 text-[34px]"
                        />
                      </div>
                    </div>

                    {!swapped && (
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="font-mono text-[10px] uppercase text-amber-300">Discard</span>
                        <SabaccCard
                          card={SWAP_TAKE}
                          detail="numeral"
                          lightMode={lightMode}
                          onClick={() => {
                            onPlaySound?.('win');
                            setSwapped(true);
                          }}
                          className="h-22 w-15 text-[34px] ring-2 ring-amber-400"
                        />
                      </div>
                    )}
                  </div>

                  {swapped ? (
                    <div className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase text-emerald-300">
                      <Sparkles className="h-4 w-4 text-amber-400" /> Nice! -5 + 5 = 0 Sabacc (Pair)!
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        onPlaySound?.('win');
                        setSwapped(true);
                      }}
                      className="sw-cut-sm min-h-[46px] w-full border border-amber-400 bg-amber-400/20 font-mono text-xs font-bold uppercase tracking-wider text-amber-300 active:scale-[0.98]"
                    >
                      Tap Here: Trade +9 for +5 → Make 0!
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* STEP 3: Two Pots & Sylops */}
            {step === 2 && (
              <div className="space-y-4 text-center">
                <div>
                  <h2 className="text-2xl font-bold uppercase tracking-wider text-amber-400">
                    Two Pots &amp; Wild Zero
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">
                    Every hand builds two pots in the center of the table:
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-left">
                  <div className="sw-cut-sm border border-amber-400/35 bg-black/50 p-3.5 space-y-1.5">
                    <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase text-amber-300">
                      <CreditIngotStack amount={40} variant="gold" size="sm" /> Hand Pot
                    </div>
                    <p className="text-xs text-slate-300">
                      Won <strong>every hand</strong> by whichever unfolded player is closest to 0.
                    </p>
                  </div>

                  <div className="sw-cut-sm border border-rose-400/35 bg-black/50 p-3.5 space-y-1.5">
                    <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase text-rose-300">
                      <CreditIngotStack amount={80} variant="crimson" size="sm" /> Sabacc Pot
                    </div>
                    <p className="text-xs text-slate-300">
                      Rollover jackpot! Won when you hit 0 with a <strong>Pair</strong> or wild{' '}
                      <strong>Sylop (0)</strong>.
                    </p>
                  </div>
                </div>

                <div className="sw-cut-sm flex items-center justify-center gap-3 border border-white/10 bg-black/45 p-3">
                  <SabaccCard
                    card={SYLOP_CARD}
                    detail="numeral"
                    lightMode={lightMode}
                    className="h-16 w-11 text-[26px] shrink-0"
                  />
                  <p className="text-left text-xs text-slate-300">
                    The gold <strong className="text-amber-300">Sylop (0)</strong> is worth zero—two Sylops
                    make <strong className="text-amber-300">Pure Sabacc</strong>, the unbeatable best hand!
                  </p>
                </div>
              </div>
            )}

            {/* STEP 4: 3 Rounds & Sabacc Shift */}
            {step === 3 && (
              <div className="space-y-4 text-center">
                <div>
                  <h2 className="text-2xl font-bold uppercase tracking-wider text-amber-400">
                    Beware the Sabacc Shift!
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">
                    Each hand lasts <strong>3 rounds</strong> of Cards + Betting. At the end of each round, the{' '}
                    <strong>Spike Dice</strong> roll—if they match, <em>everyone&apos;s cards get replaced!</em>
                  </p>
                </div>

                <div className="sw-cut-sm flex flex-col items-center gap-3 border border-cyan-400/30 bg-black/50 p-4">
                  <SpikeDiceCradle
                    roll={rolledDoubles ? [4, 4] : [2, 5]}
                    round={3}
                    activeHand
                  />

                  {rolledDoubles ? (
                    <span className="font-mono text-xs font-bold uppercase text-rose-300">
                      ⚡ Doubles! Sabacc Shift deals fresh cards!
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-slate-400">
                      Different symbols = Everyone keeps their cards
                    </span>
                  )}

                  <button
                    onClick={() => {
                      onPlaySound?.(rolledDoubles ? 'dice' : 'sabacc_shift');
                      setRolledDoubles(v => !v);
                    }}
                    className="sw-cut-sm flex min-h-[44px] items-center justify-center gap-2 border border-white/15 bg-white/5 px-4 font-mono text-xs uppercase text-cyan-200 active:scale-[0.98]"
                  >
                    <Dices className="h-4 w-4" /> Test Spike Dice Roll
                  </button>
                </div>

                <button
                  onClick={() => {
                    resetAndClose();
                    onOpenFullRules();
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1.5 font-mono text-xs text-cyan-300 hover:underline"
                >
                  <BookOpen className="h-3.5 w-3.5" /> View Full 13-Hand Cheat Sheet
                </button>
              </div>
            )}

            {/* Comfy Right-Handed Bottom Navigation */}
            <div className="flex items-center gap-2.5 pt-1">
              {step > 0 ? (
                <button
                  onClick={() => {
                    onPlaySound?.('click');
                    setStep(s => s - 1);
                  }}
                  className="sw-cut-sm min-h-[52px] border border-white/15 bg-white/5 px-5 font-mono text-xs uppercase text-slate-300 active:scale-[0.98]"
                >
                  Back
                </button>
              ) : (
                <button
                  onClick={finishTutorial}
                  className="sw-cut-sm min-h-[52px] border border-white/15 bg-white/5 px-5 font-mono text-xs uppercase text-slate-400 active:scale-[0.98]"
                >
                  Skip
                </button>
              )}

              {step < 3 ? (
                <button
                  onClick={() => {
                    onPlaySound?.('click');
                    setStep(s => s + 1);
                  }}
                  className="sw-cut-sm flex min-h-[52px] flex-1 items-center justify-center gap-2 bg-amber-400 font-mono text-sm font-bold uppercase tracking-wider text-zinc-950 shadow-[0_0_24px_rgba(251,191,36,0.28)] active:scale-[0.98]"
                >
                  Next <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    onPlaySound?.('win');
                    finishTutorial();
                  }}
                  className="sw-cut-sm flex min-h-[52px] flex-1 items-center justify-center gap-2 bg-amber-400 font-mono text-sm font-bold uppercase tracking-wider text-zinc-950 shadow-[0_0_24px_rgba(251,191,36,0.3)] active:scale-[0.98]"
                >
                  <Check className="h-4 w-4" /> Got It — Let&apos;s Play!
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
