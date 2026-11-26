'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Award,
  BookOpen,
  Check,
  Copy,
  Flame,
  Gift,
  Lock,
  Palette,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import {
  DAILY_SWEEP_BONUS_CREDITS,
  getDailyBounties,
  getRepProgress,
} from '@/lib/bounties';
import { HAND_CODEX_META, LobbySnapshot } from '@/lib/game-logic';
import {
  CARD_BACKS,
  CardBackId,
  CreditHistoryPoint,
  DICE_STYLES,
  DiceStyleId,
  FELT_THEMES,
  FeltThemeId,
  PilotDossier,
} from '@/lib/progression';
import { SabaccCard } from './sabacc-card';

export type DossierTab = 'vault' | 'bounties' | 'codex' | 'loadout';

export interface DossierModalProps {
  open: boolean;
  initialTab?: DossierTab;
  dossier: PilotDossier;
  todayKey: string;
  lobby?: LobbySnapshot | null;
  onClaimStipend: () => void;
  onOpenLegal?: () => void;
  onClose: () => void;
  onUpdateDossier: (patch: Partial<PilotDossier>) => void;
}

const RARITY_STYLES: Record<string, string> = {
  Mythic: 'border-amber-400/60 bg-amber-500/15 text-amber-300',
  Legendary: 'border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-300',
  Epic: 'border-purple-400/45 bg-purple-500/15 text-purple-300',
  Rare: 'border-cyan-400/45 bg-cyan-500/15 text-cyan-300',
  Uncommon: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300',
  Common: 'border-white/20 bg-white/10 text-white/70',
};

function MiniSparkline({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) return <span className="text-[10px] text-white/30">—</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const w = 68;
  const h = 20;
  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="inline-block overflow-visible">
      <path
        d={d}
        fill="none"
        stroke={positive ? '#34d399' : '#fb7185'}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CreditEquityChart({
  history,
  metric,
  currentVault,
  currentNet,
}: {
  history: CreditHistoryPoint[];
  metric: 'vault' | 'net';
  currentVault: number;
  currentNet: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const series = useMemo(() => {
    if (history.length === 0) {
      return [
        {
          ts: 0,
          vault: currentVault,
          careerNet: currentNet,
          delta: 0,
          mode: 'quick_solo' as const,
          rankName: 'Starting Stack',
        },
      ];
    }
    return history;
  }, [history, currentVault, currentNet]);

  const values = series.map(p => (metric === 'vault' ? p.vault : p.careerNet));
  const rawMin = Math.min(...values, metric === 'net' ? 0 : values[0]);
  const rawMax = Math.max(...values, metric === 'net' ? 0 : values[0]);
  const pad = Math.max(25, Math.round((rawMax - rawMin) * 0.12));
  const minY = metric === 'vault' ? Math.max(0, rawMin - pad) : rawMin - pad;
  const maxY = rawMax + pad;
  const spanY = Math.max(1, maxY - minY);

  const W = 560;
  const H = 164;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 14;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const coords = series.map((pt, i) => {
    const val = metric === 'vault' ? pt.vault : pt.careerNet;
    const x = series.length === 1 ? W / 2 : padL + (i / (series.length - 1)) * plotW;
    const y = padT + (1 - (val - minY) / spanY) * plotH;
    return { x, y, val, pt, idx: i };
  });

  const linePath =
    coords.length === 1
      ? `M ${padL},${coords[0].y.toFixed(1)} L ${W - padR},${coords[0].y.toFixed(1)}`
      : coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  const baselineY =
    metric === 'net' && minY <= 0 && maxY >= 0
      ? padT + (1 - (0 - minY) / spanY) * plotH
      : H - padB;

  const areaPath =
    coords.length === 1
      ? `${linePath} L ${W - padR},${baselineY.toFixed(1)} L ${padL},${baselineY.toFixed(1)} Z`
      : `${linePath} L ${coords[coords.length - 1].x.toFixed(1)},${(H - padB).toFixed(1)} L ${coords[0].x.toFixed(1)},${(H - padB).toFixed(1)} Z`;

  const lastVal = values[values.length - 1] ?? 0;
  const isPositive = metric === 'vault' ? lastVal >= 1000 : lastVal >= 0;
  const strokeColor = metric === 'vault' ? '#fbbf24' : isPositive ? '#22d3ee' : '#fb7185';
  const activePoint = hoverIdx !== null && coords[hoverIdx] ? coords[hoverIdx] : coords[coords.length - 1];

  return (
    <div className="sw-cut-sm border border-cyan-400/25 bg-black/55 p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">
            {hoverIdx !== null ? `Hand #${hoverIdx + 1}` : `Latest (${series.length} pts)`}:
          </span>
          <span className="font-bold text-amber-300">
            {metric === 'vault'
              ? `${activePoint.val} CR`
              : `${activePoint.val >= 0 ? `+${activePoint.val}` : activePoint.val} CR`}
          </span>
          {activePoint.pt.delta !== 0 && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                activePoint.pt.delta > 0
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {activePoint.pt.delta > 0 ? `+${activePoint.pt.delta}` : activePoint.pt.delta} ({activePoint.pt.rankName})
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400">
          Range: {Math.min(...values)} → {Math.max(...values)} CR
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-36 w-full select-none overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="holoEquityGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.32" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Subtle FUI Horizontal Grid */}
        {[0.25, 0.5, 0.75].map(f => (
          <line
            key={f}
            x1={padL}
            x2={W - padR}
            y1={padT + f * plotH}
            y2={padT + f * plotH}
            stroke="currentColor"
            className="text-white/10"
            strokeWidth="0.7"
          />
        ))}

        {/* Zero Baseline for Net P&L */}
        {metric === 'net' && minY <= 0 && maxY >= 0 && (
          <line
            x1={padL}
            x2={W - padR}
            y1={baselineY}
            y2={baselineY}
            stroke="#94a3b8"
            strokeOpacity="0.45"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
        )}

        <path d={areaPath} fill="url(#holoEquityGrad)" />
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Active Highlight Cursor */}
        {activePoint && (
          <>
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={padT}
              y2={H - padB}
              stroke={strokeColor}
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="4.5"
              fill={strokeColor}
              stroke="#05070b"
              strokeWidth="1.5"
            />
          </>
        )}

        {/* Invisible Hover Columns for Smooth Scrubbing */}
        {coords.map((c, idx) => {
          const colW = plotW / Math.max(1, coords.length);
          return (
            <rect
              key={idx}
              x={c.x - colW / 2}
              y={0}
              width={Math.max(8, colW)}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(idx)}
              onClick={() => setHoverIdx(idx)}
            />
          );
        })}
      </svg>
    </div>
  );
}

export function DossierModal({
  open,
  initialTab = 'vault',
  dossier,
  todayKey,
  lobby,
  onClaimStipend,
  onOpenLegal,
  onClose,
  onUpdateDossier,
}: DossierModalProps) {
  const [tab, setTab] = useState<DossierTab>(initialTab);
  const [chartMetric, setChartMetric] = useState<'vault' | 'net'>('vault');
  const [copiedDaily, setCopiedDaily] = useState(false);

  useEffect(() => {
    if (open) {
      Promise.resolve().then(() => setTab(initialTab));
    }
  }, [open, initialTab]);

  const discoveredCount = Object.keys(dossier.codex).length;
  const winRate =
    dossier.handsPlayed > 0 ? Math.round((dossier.handsWon / dossier.handsPlayed) * 100) : 0;
  const todayBest = dossier.dailyBestByDate[todayKey];
  const rep = getRepProgress(dossier.repXp);

  const dailyBounties = useMemo(() => getDailyBounties(todayKey), [todayKey]);
  const bountyState = dossier.bountiesByDate[todayKey] ?? {
    progress: {},
    completedIds: [],
    sweepClaimed: false,
  };
  const stipendAvailable = dossier.lastStipendDate !== todayKey;
  const nextStreakPreview = dossier.loginStreak + 1;
  const nextStipendAmount = Math.min(500, 150 + (nextStreakPreview - 1) * 50);

  const recentDays = useMemo(() => {
    return Object.entries(dossier.dailyNetByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10);
  }, [dossier.dailyNetByDate]);

  const topRivals = useMemo(() => {
    return Object.values(dossier.rivals)
      .sort((a, b) => b.hands - a.hands)
      .slice(0, 4);
  }, [dossier.rivals]);

  const serverLeaders = lobby?.leaderboard ?? [];
  const dailyLeaders = lobby?.dailyLeaderboard ?? [];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 12 }}
            onClick={e => e.stopPropagation()}
            className="sw-cut flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden border border-cyan-400/30 bg-[#070b12]/98 text-white shadow-[0_0_70px_rgba(0,0,0,0.9)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 bg-black/40 px-4 py-3.5 sm:px-6">
              <div className="flex items-center gap-3 min-w-0">
                <div className="sw-cut-sm flex h-10 w-10 shrink-0 items-center justify-center border border-amber-400/45 bg-amber-500/15 text-amber-400">
                  <Award className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-mono text-base sm:text-lg font-bold uppercase tracking-widest text-amber-400">
                      {dossier.callsign || 'PILOT'} {'//'} DOSSIER
                    </h2>
                    <span
                      className={`rounded border px-2 py-0.5 font-mono text-xs font-bold uppercase ${rep.badgeColor}`}
                    >
                      Lv.{rep.level} {rep.title}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2.5">
                    <div className="h-1.5 w-28 sm:w-40 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 to-amber-400 transition-all"
                        style={{ width: `${rep.pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-white/60">
                      {rep.nextXp ? `${rep.xp}/${rep.nextXp} REP` : `${rep.xp} REP (MAX)`}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {onOpenLegal && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenLegal();
                    }}
                    className="min-h-[44px] px-2.5 font-mono text-xs uppercase tracking-wider text-slate-300 hover:text-rose-300"
                  >
                    Data &amp; Reset
                  </button>
                )}
                <button
                  onClick={onClose}
                  aria-label="Close Profile"
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* 4-Tab Bar */}
            <div className="grid grid-cols-4 border-b border-white/10 bg-black/30 px-2 sm:px-6 pt-1.5">
              {(
                [
                  { id: 'vault', label: 'Vault & Chart', short: 'Vault', icon: TrendingUp },
                  {
                    id: 'bounties',
                    label: `Bounties (${bountyState.completedIds.length}/3)`,
                    short: `Daily ${bountyState.completedIds.length}/3`,
                    icon: Target,
                  },
                  { id: 'codex', label: `Codex (${discoveredCount}/13)`, short: `Codex`, icon: BookOpen },
                  { id: 'loadout', label: 'Table & Skins', short: 'Skins', icon: Palette },
                ] as const
              ).map(t => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex min-h-[44px] items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
                      active
                        ? 'border-amber-400 text-amber-300'
                        : 'border-transparent text-white/55 hover:text-white/85'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">{t.label}</span>
                    <span className="sm:hidden">{t.short}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
              {tab === 'vault' && (
                <div className="space-y-5">
                  {/* Top Credit Summary Cards */}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <div className="sw-cut-sm border border-amber-400/35 bg-amber-500/10 p-3">
                      <div className="font-mono text-xs uppercase tracking-wider text-amber-200/80">
                        Smuggler Vault
                      </div>
                      <div className="mt-1 font-mono text-xl font-black text-amber-300">
                        {dossier.vaultCredits.toLocaleString()} CR
                      </div>
                      <div className="font-mono text-xs text-white/55">
                        Peak: {dossier.peakVaultCredits.toLocaleString()} CR
                      </div>
                    </div>

                    <div className="sw-cut-sm border border-cyan-400/30 bg-cyan-500/10 p-3">
                      <div className="font-mono text-xs uppercase tracking-wider text-cyan-200/80">
                        Honest Career Net
                      </div>
                      <div
                        className={`mt-1 font-mono text-xl font-black ${
                          dossier.careerNetCredits >= 0 ? 'text-emerald-300' : 'text-rose-400'
                        }`}
                      >
                        {dossier.careerNetCredits >= 0
                          ? `+${dossier.careerNetCredits.toLocaleString()}`
                          : dossier.careerNetCredits.toLocaleString()}{' '}
                        CR
                      </div>
                      <div className="font-mono text-xs text-white/55">
                        Pure pot P&amp;L ({dossier.handsPlayed} hands)
                      </div>
                    </div>

                    <div className="sw-cut-sm border border-white/12 bg-black/50 p-3">
                      <div className="font-mono text-xs uppercase tracking-wider text-white/55">
                        Win Rate &amp; Streak
                      </div>
                      <div className="mt-1 font-mono text-xl font-black text-white">
                        {winRate}%
                      </div>
                      <div className="font-mono text-xs text-amber-300">
                        Best Streak: {dossier.bestStreak}× (Now {dossier.currentStreak}×)
                      </div>
                    </div>

                    <div className="sw-cut-sm border border-white/12 bg-black/50 p-3">
                      <div className="font-mono text-xs uppercase tracking-wider text-white/55">
                        Biggest Pot / Jackpots
                      </div>
                      <div className="mt-1 font-mono text-xl font-black text-rose-300">
                        {dossier.biggestPotWon} CR
                      </div>
                      <div className="font-mono text-xs text-white/55">
                        {dossier.sabaccPotsWon} Sabacc Pots • {dossier.cantinaTitlesWon} Tours
                      </div>
                    </div>
                  </div>

                  {/* Interactive Credit History Over Time Chart */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold uppercase tracking-widest text-cyan-300">
                        Credits Over Time Trajectory
                      </span>
                      <div className="flex gap-1 font-mono text-[10px]">
                        <button
                          onClick={() => setChartMetric('vault')}
                          className={`sw-cut-sm border px-2.5 py-1 uppercase ${
                            chartMetric === 'vault'
                              ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                              : 'border-white/15 bg-black/40 text-slate-400'
                          }`}
                        >
                          Vault Balance
                        </button>
                        <button
                          onClick={() => setChartMetric('net')}
                          className={`sw-cut-sm border px-2.5 py-1 uppercase ${
                            chartMetric === 'net'
                              ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                              : 'border-white/15 bg-black/40 text-slate-400'
                          }`}
                        >
                          Career Net P&amp;L
                        </button>
                      </div>
                    </div>

                    <CreditEquityChart
                      history={dossier.creditHistory}
                      metric={chartMetric}
                      currentVault={dossier.vaultCredits}
                      currentNet={dossier.careerNetCredits}
                    />
                  </div>

                  {/* Daily Net Earnings Calendar Strip */}
                  {recentDays.length > 0 && (
                    <div>
                      <div className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-amber-400">
                        Daily Session Ledger (Recent UTC Days)
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {recentDays.map(([day, rec]) => (
                          <div
                            key={day}
                            className="sw-cut-sm border border-white/10 bg-black/45 px-3 py-2 font-mono text-xs"
                          >
                            <div className="text-[10px] text-slate-400">{day.slice(5)}</div>
                            <div
                              className={`font-bold ${
                                rec.net >= 0 ? 'text-emerald-300' : 'text-rose-400'
                              }`}
                            >
                              {rec.net >= 0 ? `+${rec.net}` : rec.net} CR
                            </div>
                            <div className="text-[9px] text-white/40">
                              {rec.wins}/{rec.hands} won
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Server-Wide Persistent Cantina Hall of Fame */}
                  {serverLeaders.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-mono text-xs font-bold uppercase tracking-widest text-amber-400">
                          Server Cantina Standings (All-Time Net CR)
                        </span>
                        <span className="font-mono text-[10px] text-white/45">
                          Persisted on Server
                        </span>
                      </div>
                      <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/50">
                        <table className="w-full text-left font-mono text-xs">
                          <thead className="border-b border-white/10 bg-white/5 text-[10px] uppercase text-white/45">
                            <tr>
                              <th className="px-3 py-2">#</th>
                              <th className="px-3 py-2">Pilot</th>
                              <th className="px-3 py-2 text-right">Trend</th>
                              <th className="px-3 py-2 text-right">Net CR</th>
                              <th className="px-3 py-2 text-right">Won</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {serverLeaders.slice(0, 8).map((row, i) => (
                              <tr key={row.idHash} className="hover:bg-white/[0.03]">
                                <td className="px-3 py-2 text-amber-300/80">{i + 1}</td>
                                <td className="px-3 py-2 font-sans font-semibold text-white">
                                  {row.callsign}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <MiniSparkline
                                    points={row.recentNetCurve}
                                    positive={row.careerNet >= 0}
                                  />
                                </td>
                                <td
                                  className={`px-3 py-2 text-right font-bold ${
                                    row.careerNet >= 0 ? 'text-emerald-300' : 'text-rose-400'
                                  }`}
                                >
                                  {row.careerNet >= 0 ? `+${row.careerNet}` : row.careerNet}
                                </td>
                                <td className="px-3 py-2 text-right text-white/55">
                                  {row.handsWon}/{row.handsPlayed}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Rival Nemesis Head-to-Head */}
                  {topRivals.length > 0 && (
                    <div>
                      <div className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-slate-300">
                        Frequent Table Rivals
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {topRivals.map(r => (
                          <div
                            key={r.name}
                            className="sw-cut-sm border border-white/10 bg-black/40 p-2.5 font-mono text-xs"
                          >
                            <div className="truncate font-sans font-semibold text-white">{r.name}</div>
                            <div className="mt-0.5 text-[10px] text-slate-400">
                              <span className="text-emerald-300">{r.winsAgainst}W</span>
                              {' – '}
                              <span className="text-rose-400">{r.lossesTo}L</span>
                              {' • '}
                              {r.hands}h
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'bounties' && (
                <div className="space-y-5">
                  {/* Daily Login Streak & Stipend */}
                  <div className="sw-cut-sm flex flex-wrap items-center justify-between gap-3 border border-amber-400/45 bg-gradient-to-r from-amber-500/15 via-black/60 to-black/60 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-400/40 bg-amber-500/20 text-amber-300">
                        <Flame className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold uppercase tracking-wider text-amber-300">
                          Daily HoloNet Streak • {dossier.loginStreak}d (Best {dossier.bestLoginStreak}d)
                        </div>
                        <div className="text-xs text-slate-300">
                          {stipendAvailable
                            ? `Return daily to escalate your free Syndicate Stipend up to +500 CR!`
                            : `Today's stipend claimed. Come back tomorrow for Day ${dossier.loginStreak + 1}!`}
                        </div>
                      </div>
                    </div>
                    {stipendAvailable ? (
                      <button
                        onClick={onClaimStipend}
                        className="sw-cut-sm flex items-center gap-1.5 bg-amber-400 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-zinc-950 shadow-[0_0_20px_rgba(251,191,36,0.35)] hover:bg-amber-300"
                      >
                        <Gift className="h-3.5 w-3.5" /> Claim +{nextStipendAmount} CR
                      </button>
                    ) : (
                      <span className="sw-cut-sm border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 font-mono text-[11px] font-bold uppercase text-emerald-300">
                        ✓ Claimed Today
                      </span>
                    )}
                  </div>

                  {/* Today's 3 Seeded Syndicate Bounties */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold uppercase tracking-widest text-cyan-300">
                        Syndicate Contracts ({todayKey})
                      </span>
                      <span
                        className={`font-mono text-[11px] font-bold ${
                          bountyState.sweepClaimed ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        {bountyState.sweepClaimed
                          ? `✓ +${DAILY_SWEEP_BONUS_CREDITS} CR SWEEP CLAIMED`
                          : `Clear All 3 → +${DAILY_SWEEP_BONUS_CREDITS} CR Bonus`}
                      </span>
                    </div>

                    {dailyBounties.map(b => {
                      const prog = Math.min(b.target, bountyState.progress[b.id] ?? 0);
                      const done = bountyState.completedIds.includes(b.id);
                      const pct = Math.round((prog / b.target) * 100);
                      return (
                        <div
                          key={b.id}
                          className={`sw-cut-sm border p-3.5 transition-all ${
                            done
                              ? 'border-emerald-400/45 bg-emerald-500/10'
                              : 'border-white/12 bg-black/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {done ? (
                                <Check className="h-4 w-4 text-emerald-400" />
                              ) : (
                                <Target className="h-4 w-4 text-cyan-300" />
                              )}
                              <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                                {b.title}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] font-bold text-amber-300">
                              +{b.rewardCredits} CR • +{b.rewardXp} REP
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-300">{b.description}</p>
                          <div className="mt-2.5 flex items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                              <div
                                className={`h-full transition-all ${
                                  done ? 'bg-emerald-400' : 'bg-cyan-400'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] text-white/70">
                              {prog}/{b.target}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Daily Kessel Run Personal + Server Standings */}
                  <div className="space-y-2.5">
                    {todayBest ? (
                      <div className="sw-cut-sm border border-cyan-500/35 bg-cyan-950/20 p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-mono text-xs font-bold uppercase tracking-widest text-cyan-300">
                            Your Kessel Run ({todayKey})
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard?.writeText(todayBest.shareText);
                              setCopiedDaily(true);
                              setTimeout(() => setCopiedDaily(false), 2000);
                            }}
                            className="sw-cut-sm flex items-center gap-1.5 bg-cyan-400 px-3 py-1 font-mono text-[11px] font-bold text-zinc-950 hover:bg-cyan-300"
                          >
                            {copiedDaily ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedDaily ? 'Copied!' : 'Copy Share'}
                          </button>
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-black/60 p-3 font-mono text-xs text-white/85">
                          {todayBest.shareText}
                        </pre>
                      </div>
                    ) : (
                      <div className="sw-cut-sm border border-white/10 bg-black/40 p-4 text-center font-mono text-xs text-white/55">
                        Today&apos;s seeded 5-hand Daily Kessel Run ({todayKey}) is waiting!
                      </div>
                    )}

                    {dailyLeaders.length > 0 && (
                      <div className="sw-cut-sm border border-white/10 bg-black/45 p-3.5">
                        <div className="mb-2 flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-amber-300">
                          <Trophy className="h-3.5 w-3.5" /> Today&apos;s Server Kessel Standings
                        </div>
                        <div className="space-y-1 font-mono text-xs">
                          {dailyLeaders.map((d, i) => (
                            <div key={d.idHash} className="flex items-center justify-between py-0.5">
                              <span>
                                <span className="text-amber-300">#{i + 1}</span>{' '}
                                <span className="font-sans font-semibold text-white">{d.callsign}</span>
                              </span>
                              <span className="text-cyan-200">
                                {d.finalCredits} CR ({d.net >= 0 ? `+${d.net}` : d.net})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'codex' && (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {HAND_CODEX_META.map((entry, idx) => {
                    const hit = dossier.codex[entry.key];
                    return (
                      <div
                        key={entry.key}
                        className={`sw-cut-sm relative flex flex-col justify-between border p-3.5 transition-all ${
                          hit
                            ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/[0.1] to-black/60'
                            : 'border-white/10 bg-black/40 opacity-65'
                        }`}
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-white/35">#{idx + 1}</span>
                            <span className="font-mono text-sm font-bold text-white">
                              {entry.name}
                            </span>
                          </div>
                          <span
                            className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${RARITY_STYLES[entry.rarity]}`}
                          >
                            {entry.rarity}
                          </span>
                        </div>
                        <p className="text-xs text-white/65">{entry.formula}</p>
                        <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-2 font-mono text-[10px]">
                          <span className="text-cyan-300/75">e.g. {entry.example}</span>
                          {hit ? (
                            <span className="flex items-center gap-1 font-bold text-amber-400">
                              <Sparkles className="h-3 w-3" /> Logged ×{hit.count}
                            </span>
                          ) : (
                            <span className="text-white/30">Undiscovered</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {tab === 'loadout' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-2.5 font-mono text-xs font-bold uppercase tracking-widest text-amber-400">
                      Cantina Table Felt
                    </h3>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      {FELT_THEMES.map(felt => {
                        const unlocked = felt.isUnlocked(dossier);
                        const active = dossier.selectedFelt === felt.id;
                        return (
                          <button
                            key={felt.id}
                            disabled={!unlocked}
                            onClick={() => onUpdateDossier({ selectedFelt: felt.id as FeltThemeId })}
                            className={`sw-cut-sm relative flex flex-col items-start border p-3 text-left transition-all ${
                              active
                                ? 'border-amber-400 ring-1 ring-amber-400/50'
                                : 'border-white/10 hover:border-white/25'
                            } ${!unlocked ? 'cursor-not-allowed opacity-50' : ''}`}
                            style={{ background: felt.feltStyle }}
                          >
                            <div className="mb-1 flex w-full items-center justify-between">
                              <span className="font-mono text-xs font-bold text-white">
                                {felt.name}
                              </span>
                              {active ? (
                                <Check className="h-4 w-4 text-amber-400" />
                              ) : !unlocked ? (
                                <Lock className="h-3.5 w-3.5 text-white/40" />
                              ) : null}
                            </div>
                            <span className="text-[10px] text-white/60">
                              {unlocked ? 'Unlocked' : felt.unlockRequirement}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2.5 font-mono text-xs font-bold uppercase tracking-widest text-amber-400">
                      Corellian Deck Back
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      {CARD_BACKS.map(back => {
                        const unlocked = back.isUnlocked(dossier);
                        const active = dossier.selectedCardBack === back.id;
                        return (
                          <button
                            key={back.id}
                            disabled={!unlocked}
                            onClick={() =>
                              onUpdateDossier({ selectedCardBack: back.id as CardBackId })
                            }
                            className={`sw-cut-sm flex flex-col items-center gap-2 border p-3 transition-all ${
                              active
                                ? 'border-amber-400 bg-amber-500/15'
                                : 'border-white/10 bg-black/40 hover:border-white/25'
                            } ${!unlocked ? 'cursor-not-allowed opacity-45' : ''}`}
                          >
                            <SabaccCard
                              faceDown
                              cardBack={back.id}
                              className="h-20 w-14 pointer-events-none"
                            />
                            <span className="text-center font-mono text-[11px] font-bold text-white">
                              {back.name}
                            </span>
                            <span className="text-center text-[9px] leading-tight text-white/45">
                              {unlocked ? (active ? 'Equipped' : 'Unlocked') : back.unlockRequirement}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2.5 font-mono text-xs font-bold uppercase tracking-widest text-amber-400">
                      Spike Dice Finish
                    </h3>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      {DICE_STYLES.map(d => {
                        const unlocked = d.isUnlocked(dossier);
                        const active = dossier.selectedDice === d.id;
                        return (
                          <button
                            key={d.id}
                            disabled={!unlocked}
                            onClick={() => onUpdateDossier({ selectedDice: d.id as DiceStyleId })}
                            className={`sw-cut-sm flex items-center justify-between border p-3 text-left transition-all ${
                              active
                                ? 'border-amber-400 bg-amber-500/15'
                                : 'border-white/10 bg-black/40 hover:border-white/25'
                            } ${!unlocked ? 'cursor-not-allowed opacity-45' : ''}`}
                          >
                            <div>
                              <div className="font-mono text-xs font-bold text-white">{d.name}</div>
                              <div className="text-[10px] text-white/50">
                                {unlocked ? 'Unlocked' : d.unlockRequirement}
                              </div>
                            </div>
                            {active ? (
                              <Check className="h-4 w-4 text-amber-400" />
                            ) : !unlocked ? (
                              <Lock className="h-3.5 w-3.5 text-white/40" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
