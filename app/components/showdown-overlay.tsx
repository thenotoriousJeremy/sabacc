'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Coins, Copy, Flame, Play, Rocket, RotateCcw, Send, Zap } from 'lucide-react';
import { formatKesselShareCard } from '@/lib/daily-seed';
import { ClientGameState, GameMode } from '@/lib/game-logic';

export interface ShowdownOverlayProps {
  gameState: ClientGameState;
  myPlayerId: string | null;
  currentStreak?: number;
  discordShareEnabled?: boolean;
  onNextHand: () => void;
  onAdvanceTour: () => void;
  onRequestCredits: () => void;
  onLeaveRoom: () => void;
  onStartFreshMode: (mode: GameMode) => void;
}

/**
 * Compact diegetic Showdown Banner inside the holotable center — opponent hands
 * reveal directly at their seats, keeping the table spacious and uncluttered.
 */
export function ShowdownOverlay({
  gameState,
  myPlayerId,
  currentStreak = 0,
  discordShareEnabled = false,
  onNextHand,
  onAdvanceTour,
  onRequestCredits,
  onLeaveRoom,
  onStartFreshMode,
}: ShowdownOverlayProps) {
  const [copiedShare, setCopiedShare] = useState(false);
  const [postedDiscord, setPostedDiscord] = useState(false);

  const me = gameState.players.find(p => p.id === myPlayerId);
  const reqAnte = gameState.settings.ante + gameState.settings.sabaccAnte;
  const result = gameState.showdownResult;
  const tour = gameState.tour;
  const daily = gameState.daily;

  const topStanding = result?.standings[0];
  const shareCardText = daily && me ? formatKesselShareCard(daily, me.credits) : '';
  const myNetDelta =
    myPlayerId && result?.netByPlayer?.[myPlayerId] !== undefined
      ? result.netByPlayer[myPlayerId]
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="sw-cut z-20 mx-auto flex w-full max-w-md flex-col items-center gap-2.5 border border-amber-400/50 bg-[#070b12]/92 px-5 py-4 text-center shadow-[0_0_55px_rgba(245,158,11,0.22)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-300/75">
        <span>
          {tour?.tourCompleted
            ? 'CHAMPIONSHIP WON'
            : tour?.stageCleared
              ? 'PLANET STAGE CLEARED'
              : tour?.runFailed
                ? 'BANKROLL DEPLETED'
                : daily?.finished
                  ? 'KESSEL RUN COMPLETE'
                  : 'SHOWDOWN'}
        </span>
        {currentStreak >= 2 && (
          <span className="inline-flex items-center gap-1 rounded border border-orange-400/50 bg-orange-500/20 px-1.5 py-0.5 tracking-wider text-orange-300">
            <Flame className="h-3 w-3" /> {currentStreak}×
          </span>
        )}
      </div>

      {topStanding ? (
        <div>
          <div className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-amber-300">
            {result!.payouts[0]?.winnerNames.join(' & ') ?? topStanding.name}
          </div>
          <div className="font-mono text-xs text-cyan-200/90">{topStanding.evaluation.rankName}</div>
        </div>
      ) : (
        <div className="font-mono text-sm text-white/70">Pot Uncontested</div>
      )}

      {/* Crisp Payout Pills + Personal Hand Net */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {result?.payouts.map((pay, idx) => (
          <span
            key={idx}
            className={`sw-cut-sm border px-2.5 py-0.5 font-mono text-[10px] uppercase ${
              pay.label === 'Sabacc Pot'
                ? 'border-rose-400/45 bg-rose-500/15 text-rose-200'
                : 'border-amber-400/40 bg-amber-500/15 text-amber-200'
            }`}
          >
            {pay.label} +{pay.amount} CR
          </span>
        ))}
        {myNetDelta !== null && !me?.isSpectator && (
          <span
            className={`sw-cut-sm border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
              myNetDelta > 0
                ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                : myNetDelta < 0
                  ? 'border-white/15 bg-black/50 text-slate-300'
                  : 'border-white/15 bg-black/50 text-slate-400'
            }`}
          >
            You {myNetDelta > 0 ? `+${myNetDelta}` : myNetDelta} CR
          </span>
        )}
      </div>

      {/* Carryover Sabacc Pot Hook ("One More Hand" Magnet) */}
      {result?.sabaccPotCarried && gameState.sabaccPot > 0 && !daily?.finished && !tour?.runFailed && (
        <div className="sw-cut-sm flex items-center gap-1.5 border border-rose-400/40 bg-rose-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-rose-200">
          <Zap className="h-3 w-3 text-rose-400" />
          <span>{gameState.sabaccPot} CR Sabacc Pot rolls into next hand</span>
        </div>
      )}

      {result && result.blindDrawRounds.length > 0 && (
        <div className="font-mono text-[10px] text-cyan-300">
          Blind Draw:{' '}
          {result.blindDrawRounds[result.blindDrawRounds.length - 1].draws
            .map(d => `${d.name} (${d.card.value > 0 ? `+${d.card.value}` : d.card.value})`)
            .join(' vs ')}
        </div>
      )}

      {/* Daily Kessel Run Share Box (only after final 5th hand) */}
      {daily?.finished && shareCardText && (
        <div className="w-full space-y-2 border-t border-white/10 pt-2.5 text-left">
          <pre className="sw-cut-sm overflow-x-auto whitespace-pre-wrap bg-black/70 p-2.5 font-mono text-[10px] leading-relaxed text-cyan-100">
            {shareCardText}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(shareCardText);
                setCopiedShare(true);
                setTimeout(() => setCopiedShare(false), 2000);
              }}
              className="sw-cut-sm flex flex-1 items-center justify-center gap-1.5 bg-cyan-400 py-2 font-mono text-xs font-bold uppercase tracking-widest text-zinc-950 hover:bg-cyan-300"
            >
              {copiedShare ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedShare ? 'Copied' : 'Copy Score'}
            </button>
            {discordShareEnabled && (
              <button
                disabled={postedDiscord}
                onClick={async () => {
                  const resp = await fetch('/api/discord/share', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pilot: me?.name ?? 'Pilot', shareText: shareCardText }),
                  });
                  if (resp.ok) setPostedDiscord(true);
                }}
                className="sw-cut-sm flex flex-1 items-center justify-center gap-1.5 border border-cyan-400/50 bg-cyan-500/20 py-2 font-mono text-xs font-bold uppercase tracking-wider text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> {postedDiscord ? 'Sent!' : 'Post to Discord'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Single Clear Primary CTA */}
      <div className="flex w-full gap-2 pt-1">
        {tour?.tourCompleted ? (
          <>
            <button
              onClick={() => onStartFreshMode('cantina_tour')}
              className="sw-cut-sm flex flex-1 items-center justify-center gap-2 bg-amber-400 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-zinc-950 hover:bg-amber-300"
            >
              <RotateCcw className="h-3.5 w-3.5" /> New Tour
            </button>
            <button
              onClick={onLeaveRoom}
              className="sw-cut-sm border border-white/15 px-3.5 py-2.5 font-mono text-xs uppercase text-white/70 hover:text-white"
            >
              Hub
            </button>
          </>
        ) : tour?.stageCleared ? (
          <>
            <button
              onClick={onAdvanceTour}
              className="sw-cut-sm flex flex-1 items-center justify-center gap-2 bg-amber-400 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-zinc-950 shadow-[0_0_24px_rgba(251,191,36,0.4)] hover:bg-amber-300"
            >
              <Rocket className="h-3.5 w-3.5" /> Next Planet
            </button>
            <button
              onClick={onNextHand}
              className="sw-cut-sm border border-white/15 px-3 py-2.5 font-mono text-[11px] uppercase text-white/70 hover:text-white"
            >
              Stay
            </button>
          </>
        ) : tour?.runFailed ? (
          <>
            <button
              onClick={() => onStartFreshMode('cantina_tour')}
              className="sw-cut-sm flex flex-1 items-center justify-center gap-2 bg-amber-400 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-zinc-950 hover:bg-amber-300"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Retry Tour
            </button>
            <button
              onClick={onLeaveRoom}
              className="sw-cut-sm border border-white/15 px-3.5 py-2.5 font-mono text-xs uppercase text-white/70 hover:text-white"
            >
              Hub
            </button>
          </>
        ) : daily?.finished ? (
          <>
            <button
              onClick={() => onStartFreshMode('quick_solo')}
              className="sw-cut-sm flex flex-1 items-center justify-center gap-2 bg-amber-400 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-zinc-950 hover:bg-amber-300"
            >
              <Play className="h-3.5 w-3.5 fill-current" /> Quick Play
            </button>
            <button
              onClick={onLeaveRoom}
              className="sw-cut-sm border border-white/15 px-3.5 py-2.5 font-mono text-xs uppercase text-white/70 hover:text-white"
            >
              Hub
            </button>
          </>
        ) : (me?.credits ?? 0) < reqAnte && !me?.isSpectator && !gameState.settings.lockedCredits ? (
          <button
            onClick={onRequestCredits}
            className="sw-cut-sm flex flex-1 items-center justify-center gap-2 bg-amber-400 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-zinc-950 hover:bg-amber-300"
          >
            <Coins className="h-3.5 w-3.5" /> Buy Chips
          </button>
        ) : (
          <button
            onClick={onNextHand}
            disabled={me?.isReady && !me?.isSpectator}
            className="sw-cut-sm flex flex-1 items-center justify-center gap-2 bg-amber-400 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.22em] text-zinc-950 transition-all hover:bg-amber-300 disabled:bg-white/10 disabled:text-white/40"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            {me?.isReady && !me?.isSpectator ? 'Waiting on Table...' : 'Next Hand [Space]'}
          </button>
        )}
      </div>
    </motion.div>
  );
}
