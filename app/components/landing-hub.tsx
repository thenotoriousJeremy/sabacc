'use client';

import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Coins,
  Compass,
  Gift,
  Globe,
  HelpCircle,
  Lock,
  LogOut,
  Moon,
  Play,
  Radio,
  Shield,
  ShieldCheck,
  Sun,
  Users,
} from 'lucide-react';
import { CardSuit, CardType, GameMode, LobbySnapshot, StakesTier } from '@/lib/game-logic';
import { PilotDossier } from '@/lib/progression';
import { DossierTab } from './dossier-modal';
import { SabaccCard } from './sabacc-card';

export interface LandingHubProps {
  playerName: string;
  onPlayerNameChange: (v: string) => void;
  roomId: string;
  onRoomIdChange: (v: string) => void;
  isSpectator: boolean;
  onToggleSpectator: () => void;
  needsServerUrl: boolean;
  serverUrl: string;
  onServerUrlChange: (v: string) => void;
  onServerUrlBlur: () => void;
  errorMessage: string | null;
  dossier: PilotDossier;
  todayKey: string;
  lobby: LobbySnapshot | null;
  authInfo: {
    oidcEnabled: boolean;
    oidcProviderName: string;
    user: { name: string; isAdmin: boolean } | null;
  };
  onToggleTheme: () => void;
  onClaimStipend: () => void;
  onOpenDossier: (tab?: DossierTab) => void;
  onOpenTutorial: () => void;
  onOpenRules: () => void;
  onOpenLegal: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
  onJoinRoom: (explicitCode?: string) => void;
  onCreateRoom: (mode: GameMode, stakesTier?: StakesTier, isPublic?: boolean) => void;
}

const HERO_SYLOP = { id: 'hero-0', value: 0, type: CardType.SYLOP, suit: CardSuit.NONE };
const HERO_POS = { id: 'hero-6', value: 6, type: CardType.POSITIVE, suit: CardSuit.CIRCLE };
const HERO_NEG = { id: 'hero-n6', value: -6, type: CardType.NEGATIVE, suit: CardSuit.CIRCLE };

export function LandingHub({
  playerName,
  onPlayerNameChange,
  roomId,
  onRoomIdChange,
  isSpectator,
  onToggleSpectator,
  needsServerUrl,
  serverUrl,
  onServerUrlChange,
  onServerUrlBlur,
  errorMessage,
  dossier,
  todayKey,
  lobby,
  authInfo,
  onToggleTheme,
  onClaimStipend,
  onOpenDossier,
  onOpenTutorial,
  onOpenRules,
  onOpenLegal,
  onOpenAdmin,
  onLogout,
  onJoinRoom,
  onCreateRoom,
}: LandingHubProps) {
  const [showFriendsPanel, setShowFriendsPanel] = useState(false);
  const [soloStakes, setSoloStakes] = useState<StakesTier>('medium');
  const [publicRoom, setPublicRoom] = useState(true);

  useEffect(() => {
    if (roomId.length >= 4) {
      Promise.resolve().then(() => setShowFriendsPanel(true));
    }
  }, [roomId]);

  const hasName = playerName.trim().length > 0;
  const openRooms = lobby?.rooms ?? [];
  const stipendAvailable = dossier.lastStipendDate !== todayKey;
  const nextStipendAmount = Math.min(500, 150 + dossier.loginStreak * 50);
  const isLight = dossier.colorMode === 'light';

  return (
    <div className="holotable-stage safe-top safe-bottom relative flex min-h-[100dvh] flex-col items-center justify-between overflow-x-hidden px-4 py-3 sm:py-5">
      {/* Subtle Background Holotable Geometry */}
      <svg
        className="pointer-events-none absolute top-1/2 left-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 text-cyan-400/[0.06]"
        viewBox="0 0 400 400"
        aria-hidden
      >
        <circle cx="200" cy="200" r="185" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="4 8" />
        <circle cx="200" cy="200" r="142" fill="none" stroke="currentColor" strokeWidth="0.8" />
        <polygon points="200,28 372,200 200,372 28,200" fill="none" stroke="currentColor" strokeWidth="0.7" />
      </svg>

      {/* Clean Top Utility Row (All buttons >= 44x44px touch targets, legible mobile text) */}
      <div className="relative z-10 flex w-full max-w-md items-center justify-between gap-1.5">
        <div>
          {openRooms.length > 0 ? (
            <button
              onClick={() => setShowFriendsPanel(true)}
              className="sw-cut-sm flex min-h-[44px] items-center gap-1.5 whitespace-nowrap border border-emerald-400/45 bg-emerald-500/15 px-3 font-mono text-xs sm:text-sm font-bold text-emerald-300 hover:bg-emerald-500/25"
            >
              <Radio className="h-3.5 w-3.5 shrink-0 animate-pulse" />
              <span>
                {openRooms.length} {openRooms.length === 1 ? 'Table' : 'Tables'} Live
              </span>
            </button>
          ) : authInfo.user ? (
            <button
              onClick={onLogout}
              className="sw-cut-sm flex min-h-[44px] items-center gap-1.5 whitespace-nowrap border border-white/15 bg-black/40 px-3 font-mono text-xs sm:text-sm text-cyan-300 hover:text-white"
              title="Sign Out"
            >
              <span>{authInfo.user.name}</span>
              <LogOut className="h-4 w-4 opacity-70" />
            </button>
          ) : authInfo.oidcEnabled ? (
            <a
              href="/api/auth/oidc/login"
              className="sw-cut-sm flex min-h-[44px] items-center gap-1.5 whitespace-nowrap border border-cyan-400/35 bg-cyan-500/10 px-3 font-mono text-xs sm:text-sm text-cyan-300 hover:bg-cyan-500/20"
            >
              <ShieldCheck className="h-4 w-4" /> {authInfo.oidcProviderName}
            </a>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Unified Profile & Credits Pill */}
          <button
            onClick={() => onOpenDossier('vault')}
            aria-label="Open Pilot Profile and Credits"
            className="sw-cut-sm relative flex min-h-[44px] items-center gap-1.5 whitespace-nowrap border border-amber-400/40 bg-amber-500/12 px-3 font-mono text-xs sm:text-sm font-bold text-amber-300 hover:bg-amber-500/20"
          >
            <Coins className="h-4 w-4 shrink-0 text-amber-400" />
            <span>{dossier.vaultCredits.toLocaleString()} CR</span>
            {stipendAvailable && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            )}
          </button>

          <button
            onClick={onToggleTheme}
            aria-label={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            className="sw-cut-sm flex h-11 w-11 items-center justify-center border border-white/15 bg-black/40 text-slate-300 hover:text-amber-400"
          >
            {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          {!needsServerUrl && (
            <button
              onClick={onOpenAdmin}
              aria-label="Server Settings"
              className="sw-cut-sm flex h-11 w-11 items-center justify-center border border-white/15 bg-black/40 text-slate-300 hover:text-amber-400"
            >
              <Shield className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Center Stage: Hero Cards + Title + Clean Streamlined Console */}
      <div className="relative z-10 my-auto flex w-full max-w-md flex-col items-center gap-4 py-2">
        {/* Visual Card Fan Emblem + Wordmark */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-2 flex items-end justify-center -space-x-3">
            <div className="-rotate-10 translate-y-1">
              <SabaccCard
                card={HERO_POS}
                detail="numeral"
                lightMode={isLight}
                className="h-18 w-12.5 text-[28px] pointer-events-none"
              />
            </div>
            <div className="z-10 -translate-y-1">
              <SabaccCard
                card={HERO_SYLOP}
                detail="numeral"
                lightMode={isLight}
                className="h-20 w-14 text-[32px] pointer-events-none"
              />
            </div>
            <div className="rotate-10 translate-y-1">
              <SabaccCard
                card={HERO_NEG}
                detail="numeral"
                lightMode={isLight}
                className="h-18 w-12.5 text-[28px] pointer-events-none"
              />
            </div>
          </div>

          <h1 className="text-5xl font-bold uppercase tracking-[0.18em] text-amber-400 drop-shadow-[0_0_24px_rgba(245,158,11,0.28)]">
            SABACC
          </h1>
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-300/80">
            Corellian Spike
          </div>

          {lobby?.serverNotice && (
            <div className="mt-2 rounded border border-amber-400/35 bg-amber-500/10 px-3.5 py-1 font-mono text-xs sm:text-sm text-amber-300">
              {lobby.serverNotice}
            </div>
          )}
        </div>

        {/* One-Tap Daily Bonus Pill (disappears cleanly once claimed!) */}
        {stipendAvailable && (
          <button
            onClick={onClaimStipend}
            className="sw-cut-sm flex min-h-[50px] w-full items-center justify-between border border-amber-400/55 bg-gradient-to-r from-amber-500/20 to-cyan-500/15 px-4 py-2 font-mono text-sm shadow-[0_0_24px_rgba(251,191,36,0.16)] transition-all hover:border-amber-300"
          >
            <span className="flex items-center gap-2 font-bold uppercase tracking-wider text-amber-300">
              <Gift className="h-4 w-4 text-amber-400" />
              Claim Daily Bonus
            </span>
            <span className="sw-cut-sm bg-amber-400 px-3 py-1 text-xs font-bold text-zinc-950">
              +{nextStipendAmount} CR
            </span>
          </button>
        )}

        {/* Streamlined Main Console */}
        <div className="sw-cut w-full border border-cyan-400/25 bg-[#080d14]/92 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-xl space-y-4">
          {/* Simple Name Input */}
          <div>
            <label
              htmlFor="pilot-callsign"
              className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-[0.18em] text-slate-300"
            >
              Player Name
            </label>
            <input
              id="pilot-callsign"
              type="text"
              value={playerName}
              onChange={e => onPlayerNameChange(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              className="sw-cut-sm min-h-[50px] w-full border border-white/15 bg-black/60 px-4 font-mono text-base tracking-wider text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {!showFriendsPanel ? (
            <>
              {/* Stakes Selector + Big Primary Play CTA */}
              <div className="space-y-3">
                <div className="flex items-center justify-between font-mono text-xs sm:text-sm text-slate-300">
                  <span>Table Stakes</span>
                  <div className="flex gap-1.5">
                    {(
                      [
                        { id: 'low', label: 'Casual' },
                        { id: 'medium', label: 'Standard' },
                        { id: 'high', label: 'High' },
                      ] as const
                    ).map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSoloStakes(s.id)}
                        className={`rounded px-3 py-1.5 text-xs font-bold uppercase transition-colors ${
                          soloStakes === s.id
                            ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/50'
                            : 'bg-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  disabled={!hasName}
                  onClick={() => onCreateRoom('quick_solo', soloStakes)}
                  className="sw-cut flex min-h-[56px] w-full items-center justify-center gap-2.5 bg-amber-400 font-mono text-lg font-bold uppercase tracking-[0.18em] text-zinc-950 shadow-[0_0_30px_rgba(251,191,36,0.3)] transition-all hover:bg-amber-300 active:scale-[0.99] disabled:bg-white/10 disabled:text-slate-500 disabled:shadow-none"
                >
                  <Play className="h-5 w-5 fill-current" /> Play Sabacc
                </button>
              </div>

              {/* 3 Clean Secondary Mode Tiles */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  disabled={!hasName}
                  onClick={() => onCreateRoom('cantina_tour')}
                  className="sw-cut-sm flex min-h-[72px] flex-col items-center justify-center gap-1 border border-white/12 bg-black/45 p-2.5 text-center transition-colors hover:border-amber-400/50 disabled:opacity-45"
                >
                  <Compass className="h-4.5 w-4.5 text-amber-400" />
                  <span className="font-mono text-sm font-bold uppercase text-white">Tour</span>
                  <span className="font-mono text-xs text-slate-400">
                    {dossier.cantinaHighestStage}/5 Planets
                  </span>
                </button>

                <button
                  disabled={!hasName}
                  onClick={() => onCreateRoom('daily_kessel')}
                  className="sw-cut-sm flex min-h-[72px] flex-col items-center justify-center gap-1 border border-white/12 bg-black/45 p-2.5 text-center transition-colors hover:border-cyan-400/50 disabled:opacity-45"
                >
                  <Calendar className="h-4.5 w-4.5 text-cyan-300" />
                  <span className="font-mono text-sm font-bold uppercase text-white">Daily</span>
                  <span className="font-mono text-xs text-slate-400">
                    {dossier.dailyBestByDate[todayKey]
                      ? `${dossier.dailyBestByDate[todayKey].finalCredits} CR`
                      : '5 Hands'}
                  </span>
                </button>

                <button
                  onClick={() => setShowFriendsPanel(true)}
                  className="sw-cut-sm relative flex min-h-[72px] flex-col items-center justify-center gap-1 border border-white/12 bg-black/45 p-2.5 text-center transition-colors hover:border-emerald-400/50"
                >
                  <Users className="h-4.5 w-4.5 text-emerald-300" />
                  <span className="font-mono text-sm font-bold uppercase text-white">Friends</span>
                  <span className="font-mono text-xs text-slate-400">
                    {openRooms.length > 0 ? `${openRooms.length} Open` : 'Host / Join'}
                  </span>
                </button>
              </div>
            </>
          ) : (
            /* Clean Friends / Multiplayer Sub-View */
            <div className="space-y-3.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-mono text-sm font-bold uppercase tracking-wider text-cyan-300">
                  Multiplayer Tables
                </span>
                <button
                  onClick={() => setShowFriendsPanel(false)}
                  className="min-h-[40px] px-2 font-mono text-sm text-slate-300 hover:text-white"
                >
                  ← Back
                </button>
              </div>

              {needsServerUrl && (
                <div>
                  <label className="mb-1 block font-mono text-xs uppercase tracking-wider text-slate-300">
                    Host Server Address
                  </label>
                  <input
                    type="url"
                    inputMode="url"
                    value={serverUrl}
                    onChange={e => onServerUrlChange(e.target.value)}
                    onBlur={onServerUrlBlur}
                    placeholder="http://192.168.1.100:3000"
                    className="sw-cut-sm min-h-[48px] w-full border border-white/15 bg-black/60 px-3.5 font-mono text-base text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
              )}

              {openRooms.length > 0 && (
                <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
                  {openRooms.map(rm => (
                    <div
                      key={rm.roomId}
                      className="sw-cut-sm flex items-center justify-between border border-cyan-400/25 bg-black/50 px-3.5 py-2.5 font-mono text-sm"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold tracking-widest text-amber-300">{rm.roomId}</span>
                          <span className="truncate text-slate-200">{rm.hostName}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          {rm.seatedCount}/{rm.maxPlayers} Players
                        </div>
                      </div>
                      <button
                        disabled={!hasName}
                        onClick={() => onJoinRoom(rm.roomId)}
                        className="sw-cut-sm min-h-[42px] bg-cyan-400 px-4 text-xs font-bold uppercase text-zinc-950 hover:bg-cyan-300 disabled:opacity-40"
                      >
                        Join
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomId}
                  onChange={e =>
                    onRoomIdChange(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 6)
                    )
                  }
                  placeholder="ROOM CODE"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  className="sw-cut-sm min-h-[48px] flex-1 border border-white/15 bg-black/60 px-3.5 font-mono text-base tracking-[0.22em] text-amber-300 placeholder:tracking-wider placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
                <button
                  disabled={!hasName || roomId.length < 4}
                  onClick={() => onJoinRoom()}
                  className="sw-cut-sm min-h-[48px] bg-amber-400 px-5 font-mono text-sm font-bold uppercase tracking-widest text-zinc-950 hover:bg-amber-300 disabled:bg-white/10 disabled:text-slate-500"
                >
                  Join
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  disabled={!hasName}
                  onClick={() => onCreateRoom('party', 'medium', publicRoom)}
                  className="sw-cut-sm min-h-[48px] flex-1 border border-cyan-400/45 bg-cyan-500/15 font-mono text-sm font-bold uppercase tracking-wider text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-45"
                >
                  Host Table
                </button>
                <button
                  onClick={() => setPublicRoom(v => !v)}
                  className="sw-cut-sm flex min-h-[48px] items-center gap-1.5 border border-white/15 bg-black/40 px-3 font-mono text-xs uppercase text-slate-200"
                  title={publicRoom ? 'Visible on server lobby' : 'Private — code only'}
                >
                  {publicRoom ? <Globe className="h-4 w-4 text-emerald-400" /> : <Lock className="h-4 w-4 text-amber-400" />}
                  <span>{publicRoom ? 'Public' : 'Private'}</span>
                </button>
                <button
                  onClick={onToggleSpectator}
                  className={`sw-cut-sm min-h-[48px] border px-3 font-mono text-xs uppercase transition-colors ${
                    isSpectator
                      ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                      : 'border-white/15 bg-black/40 text-slate-300 hover:text-white'
                  }`}
                >
                  {isSpectator ? 'Watch' : 'Play'}
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="sw-cut-sm border border-rose-500/40 bg-rose-950/40 px-3.5 py-2 text-center font-mono text-xs text-rose-300"
            >
              {errorMessage}
            </div>
          )}
        </div>
      </div>

      {/* First-Time Friendly Tutorial Invite */}
      {!dossier.tutorialCompleted && dossier.handsPlayed === 0 && (
        <button
          onClick={onOpenTutorial}
          className="sw-cut-sm relative z-10 flex min-h-[46px] w-full max-w-md items-center justify-center gap-2 border border-cyan-400/45 bg-cyan-500/12 px-4 font-mono text-xs font-bold uppercase tracking-wider text-cyan-200 active:scale-[0.98]"
        >
          <HelpCircle className="h-4 w-4 text-cyan-300" /> New to Sabacc? Try 30s Interactive Tutorial
        </button>
      )}

      {/* Clean Footer: Instant Tutorial, Hand Ranks & App Store Privacy/Fair-Play Disclosure */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-4 font-mono text-sm text-slate-400">
        <button
          onClick={onOpenTutorial}
          className="inline-flex min-h-[44px] items-center gap-1.5 hover:text-amber-300"
        >
          <HelpCircle className="h-4 w-4" /> Tutorial
        </button>
        <span className="opacity-30">•</span>
        <button
          onClick={onOpenRules}
          className="inline-flex min-h-[44px] items-center gap-1.5 hover:text-cyan-300"
        >
          13 Hand Ranks
        </button>
        <span className="opacity-30">•</span>
        <button
          onClick={onOpenLegal}
          className="inline-flex min-h-[44px] items-center gap-1.5 hover:text-cyan-300"
        >
          Privacy &amp; Fair Play
        </button>
      </div>
    </div>
  );
}
