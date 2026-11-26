'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, FastForward, Lock, RotateCcw, Scale, ShieldAlert, Unlock, X } from 'lucide-react';
import { ClientGameState, StakesTier, TieRule } from '@/lib/game-logic';

export interface LedgerModalProps {
  open: boolean;
  gameState: ClientGameState;
  isHost: boolean;
  onClose: () => void;
  onUpdateSettings: (patch: {
    stakesTier?: StakesTier;
    tieRule?: TieRule;
    turnSeconds?: number;
    lockedCredits?: boolean;
    isPublic?: boolean;
  }) => void;
  onSkipTurn: () => void;
  onResetTable: () => void;
}

export function LedgerModal({
  open,
  gameState,
  isHost,
  onClose,
  onUpdateSettings,
  onSkipTurn,
  onResetTable,
}: LedgerModalProps) {
  const entries = Object.values(gameState.ledger).sort((a, b) => b.net - a.net);
  const canEditRules =
    isHost &&
    (gameState.mode === 'party' || gameState.mode === 'quick_solo') &&
    (gameState.currentPhase === 'JOINING' || gameState.currentPhase === 'SHOWDOWN');
  const isHandLive = gameState.currentPhase === 'CARD' || gameState.currentPhase === 'BETTING';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.93, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.93, y: 12 }}
            onClick={e => e.stopPropagation()}
            className="sw-cut max-h-[85vh] w-full max-w-xl overflow-y-auto border border-cyan-400/30 bg-[#070b12]/98 p-6 text-white shadow-2xl custom-scrollbar"
          >
            <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <Scale className="h-5 w-5 text-amber-400" />
                <div>
                  <h2 className="font-mono text-base font-bold uppercase tracking-widest text-amber-400">
                    Session Ledger & Table Rules
                  </h2>
                  <p className="text-xs text-white/55">
                    Honest net credit audit across every buy-in and pot this session
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close Table Rules"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Session Ledger Table */}
            <div className="mb-6 overflow-x-auto rounded-xl border border-white/10 bg-black/50">
              <table className="w-full text-left font-mono text-xs sm:text-sm">
                <thead className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wider text-white/55">
                  <tr>
                    <th className="px-3 py-2.5">Seat</th>
                    <th className="px-3 py-2.5 text-right">Buy-In</th>
                    <th className="px-3 py-2.5 text-right">Stack</th>
                    <th className="px-3 py-2.5 text-right">Net +/-</th>
                    <th className="px-3 py-2.5 text-right">Won</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {entries.map(row => (
                    <tr key={row.playerId} className="hover:bg-white/[0.03]">
                      <td className="px-3 py-2 font-sans font-medium text-white">
                        <div className="flex items-center gap-1.5">
                          {gameState.hostId === row.playerId && (
                            <Crown className="h-3 w-3 text-amber-400" aria-label="Host" />
                          )}
                          <span>{row.name}</span>
                          {row.isAI && (
                            <span className="rounded bg-white/10 px-1 py-0.5 font-mono text-[9px] text-white/45">
                              AI
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-white/50">{row.buyInTotal}</td>
                      <td className="px-3 py-2 text-right text-amber-300">{row.credits}</td>
                      <td
                        className={`px-3 py-2 text-right font-bold ${
                          row.net > 0 ? 'text-emerald-400' : row.net < 0 ? 'text-rose-400' : 'text-white/40'
                        }`}
                      >
                        {row.net > 0 ? `+${row.net}` : row.net}
                      </td>
                      <td className="px-3 py-2 text-right text-white/60">
                        {row.handsWon}/{row.handsPlayed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Table Rules & Host Controls */}
            <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-amber-400">
                  Table Configuration
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                  {isHost ? 'Host Controls Active' : 'View Only (Host Sets Rules)'}
                </span>
              </div>

              {/* Stakes Tier */}
              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-white/45">
                  Stakes & Hand Cap
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      { id: 'low', label: 'Low', sub: '5/2 • 150 cap' },
                      { id: 'medium', label: 'Medium', sub: '10/5 • 1k cap' },
                      { id: 'high', label: 'High', sub: '50/25 • 5k cap' },
                      { id: 'no_limit', label: 'No-Limit', sub: '25/15 • Uncapped' },
                    ] as const
                  ).map(t => (
                    <button
                      key={t.id}
                      disabled={!canEditRules}
                      onClick={() => onUpdateSettings({ stakesTier: t.id })}
                      className={`rounded-lg border p-2 text-left transition-all ${
                        gameState.settings.stakesTier === t.id
                          ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                          : 'border-white/10 bg-black/40 text-white/60 hover:text-white'
                      } disabled:cursor-not-allowed disabled:opacity-55`}
                    >
                      <div className="font-mono text-xs font-bold">{t.label}</div>
                      <div className="text-[9px] text-white/45">{t.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tie-Breaker Rule & Turn Clock */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-white/45">
                    Exact Tie Resolution
                  </label>
                  <div className="flex gap-1.5">
                    {(
                      [
                        { id: 'split', label: 'Split Pot' },
                        { id: 'blind_draw', label: 'Blind Draw' },
                      ] as const
                    ).map(opt => (
                      <button
                        key={opt.id}
                        disabled={!canEditRules}
                        onClick={() => onUpdateSettings({ tieRule: opt.id })}
                        className={`flex-1 rounded-lg border py-2 font-mono text-[11px] font-bold transition-colors ${
                          gameState.settings.tieRule === opt.id
                            ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                            : 'border-white/10 bg-black/40 text-white/55'
                        } disabled:cursor-not-allowed disabled:opacity-55`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-white/45">
                    Turn Clock
                  </label>
                  <div className="flex gap-1.5">
                    {[0, 30, 45, 60].map(sec => (
                      <button
                        key={sec}
                        disabled={!canEditRules}
                        onClick={() => onUpdateSettings({ turnSeconds: sec })}
                        className={`flex-1 rounded-lg border py-2 font-mono text-[11px] font-bold transition-colors ${
                          gameState.settings.turnSeconds === sec
                            ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                            : 'border-white/10 bg-black/40 text-white/55'
                        } disabled:cursor-not-allowed disabled:opacity-55`}
                      >
                        {sec === 0 ? 'Off' : `${sec}s`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Lock Credits Toggle + Emergency Host Actions */}
              {isHost && (gameState.mode === 'party' || gameState.mode === 'quick_solo') && (
                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                  <button
                    disabled={!canEditRules}
                    onClick={() => onUpdateSettings({ lockedCredits: !gameState.settings.lockedCredits })}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-[11px] font-bold transition-colors ${
                      gameState.settings.lockedCredits
                        ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                        : 'border-white/10 bg-black/40 text-white/60 hover:text-white'
                    } disabled:opacity-50`}
                  >
                    {gameState.settings.lockedCredits ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                    {gameState.settings.lockedCredits ? 'Bankrolls Locked' : 'Allow Re-Buys'}
                  </button>

                  {gameState.mode === 'party' && (
                    <button
                      disabled={!canEditRules}
                      onClick={() => onUpdateSettings({ isPublic: gameState.isPublic === false })}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-[11px] font-bold transition-colors ${
                        gameState.isPublic !== false
                          ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                          : 'border-white/10 bg-black/40 text-white/60 hover:text-white'
                      } disabled:opacity-50`}
                    >
                      {gameState.isPublic !== false ? 'Listed on Lobby' : 'Private (Unlisted)'}
                    </button>
                  )}

                  {isHandLive && (
                    <button
                      onClick={() => {
                        onSkipTurn();
                        onClose();
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-500/15 px-3 py-2 font-mono text-[11px] font-bold text-sky-300 hover:bg-sky-500/25"
                    >
                      <FastForward className="h-3.5 w-3.5" /> Skip Slow Turn
                    </button>
                  )}

                  {isHandLive && (
                    <button
                      onClick={() => {
                        onResetTable();
                        onClose();
                      }}
                      className="ml-auto flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 font-mono text-[11px] font-bold text-rose-300 hover:bg-rose-500/25"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Refund & Reset Hand
                    </button>
                  )}
                </div>
              )}

              {(gameState.mode === 'cantina_tour' || gameState.mode === 'daily_kessel') && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
                  Challenge rules & bankrolls are locked for fair progression.
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
