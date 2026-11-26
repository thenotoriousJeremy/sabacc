'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Lock, RefreshCw, Send, Shield, Trash2, X } from 'lucide-react';
import { apiUrl } from '@/lib/api-base';
import { StakesTier } from '@/lib/game-logic';

interface AdminOverview {
  config: {
    hasSitePassword: boolean;
    sitePasswordEnvLocked: boolean;
    hasAdminPassword: boolean;
    publicLobby: boolean;
    defaultStakes: StakesTier;
    lockCreditsGlobal: boolean;
    serverNotice: string;
    publicUrl: string;
    hasDiscordWebhook: boolean;
    discordWebhookPreview: string;
    discordNotifyRoomCreate: boolean;
    discordNotifyShowdownJackpot: boolean;
    discordAllowPlayerShare: boolean;
  };
  rooms: {
    roomId: string;
    mode: string;
    isPublic: boolean;
    phase: string;
    round: number;
    handPot: number;
    sabaccPot: number;
    players: { id: string; name: string; isAI: boolean; credits: number; connected: boolean }[];
  }[];
  stats: {
    uptimeSeconds: number;
    memoryMb: number;
    connectedSockets: number;
  };
}

export interface AdminModalProps {
  open: boolean;
  isAdmin: boolean;
  canBootstrapAdmin: boolean;
  onClose: () => void;
  onAdminUnlocked: () => void;
}

export function AdminModal({
  open,
  isAdmin,
  canBootstrapAdmin,
  onClose,
  onAdminUnlocked,
}: AdminModalProps) {
  const [adminPassword, setAdminPassword] = useState('');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable draft fields
  const [newSitePassword, setNewSitePassword] = useState('');
  const [clearSitePw, setClearSitePw] = useState(false);
  const [publicLobby, setPublicLobby] = useState(true);
  const [defaultStakes, setDefaultStakes] = useState<StakesTier>('medium');
  const [lockCreditsGlobal, setLockCreditsGlobal] = useState(false);
  const [serverNotice, setServerNotice] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [webhookInput, setWebhookInput] = useState('');
  const [notifyRooms, setNotifyRooms] = useState(true);
  const [notifyJackpots, setNotifyJackpots] = useState(true);
  const [allowShare, setAllowShare] = useState(true);

  const fetchOverview = useCallback(async () => {
    try {
      const resp = await fetch(apiUrl('/api/admin/overview'), { credentials: 'include' });
      if (!resp.ok) return;
      const data = (await resp.json()) as AdminOverview;
      setOverview(data);
      setPublicLobby(data.config.publicLobby);
      setDefaultStakes(data.config.defaultStakes);
      setLockCreditsGlobal(data.config.lockCreditsGlobal);
      setServerNotice(data.config.serverNotice);
      setPublicUrl(data.config.publicUrl);
      setNotifyRooms(data.config.discordNotifyRoomCreate);
      setNotifyJackpots(data.config.discordNotifyShowdownJackpot);
      setAllowShare(data.config.discordAllowPlayerShare);
    } catch {
      // Ignore offline mode.
    }
  }, []);

  useEffect(() => {
    if (open && isAdmin) {
      Promise.resolve().then(() => fetchOverview());
    }
  }, [open, isAdmin, fetchOverview]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const resp = await fetch(apiUrl('/api/admin/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password: adminPassword }),
    });
    const data = (await resp.json()) as { ok?: boolean; error?: string };
    if (!resp.ok || !data.ok) {
      setError(data.error ?? 'Admin authentication failed.');
      return;
    }
    setAdminPassword('');
    onAdminUnlocked();
    fetchOverview();
  };

  const handleSave = async () => {
    setError(null);
    setStatusMsg(null);
    const body: Record<string, unknown> = {
      publicLobby,
      defaultStakes,
      lockCreditsGlobal,
      serverNotice,
      publicUrl,
      discordNotifyRoomCreate: notifyRooms,
      discordNotifyShowdownJackpot: notifyJackpots,
      discordAllowPlayerShare: allowShare,
    };
    if (clearSitePw) body.newSitePassword = '';
    else if (newSitePassword.trim()) body.newSitePassword = newSitePassword.trim();
    if (webhookInput.trim()) body.discordWebhookUrl = webhookInput.trim();

    const resp = await fetch(apiUrl('/api/admin/config'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      setError('Failed to save configuration.');
      return;
    }
    setNewSitePassword('');
    setClearSitePw(false);
    setWebhookInput('');
    setStatusMsg('Settings saved and persisted.');
    fetchOverview();
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleTestDiscord = async () => {
    setError(null);
    setStatusMsg(null);
    const resp = await fetch(apiUrl('/api/admin/discord-test'), {
      method: 'POST',
      credentials: 'include',
    });
    const data = (await resp.json()) as { ok?: boolean; error?: string };
    if (!resp.ok || !data.ok) {
      setError(data.error ?? 'Discord test ping failed.');
    } else {
      setStatusMsg('Test embed delivered to Discord!');
      setTimeout(() => setStatusMsg(null), 3000);
    }
  };

  const handleCloseRoom = async (roomId: string) => {
    await fetch(apiUrl('/api/admin/close-room'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ roomId }),
    });
    fetchOverview();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 10 }}
            onClick={e => e.stopPropagation()}
            className="sw-cut max-h-[88vh] w-full max-w-2xl overflow-y-auto border border-cyan-400/35 bg-[#070b12]/98 p-6 text-white shadow-2xl custom-scrollbar"
          >
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <Shield className="h-5 w-5 text-amber-400" />
                <div>
                  <h2 className="font-mono text-base font-bold uppercase tracking-widest text-amber-400">
                    Server Command & Security
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Password gate, OIDC, Discord webhooks, lobby discovery, and live rooms
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!isAdmin ? (
              <form onSubmit={handleUnlock} className="space-y-4 py-2">
                <p className="text-xs text-slate-300">
                  {canBootstrapAdmin
                    ? 'Localhost initial setup: choose an Admin Password (6+ chars) to unlock server administration, or set ADMIN_PASSWORD in your environment.'
                    : 'Enter your server ADMIN_PASSWORD (or sign in via OIDC with an admin group/email).'}
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    placeholder={canBootstrapAdmin ? 'Create Admin Password (6+ chars)' : 'ADMIN_PASSWORD'}
                    className="sw-cut-sm flex-1 border border-white/15 bg-black/60 px-3.5 py-2.5 font-mono text-sm text-white focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="sw-cut-sm bg-amber-400 px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-zinc-950 hover:bg-amber-300"
                  >
                    Unlock
                  </button>
                </div>
                {error && <p className="font-mono text-xs text-rose-400">{error}</p>}
              </form>
            ) : (
              <div className="space-y-5 text-xs">
                {/* Server Telemetry */}
                {overview && (
                  <div className="grid grid-cols-3 gap-2 font-mono">
                    <div className="sw-cut-sm border border-white/10 bg-black/40 p-2.5">
                      <div className="text-[9px] uppercase text-slate-400">Active Tables</div>
                      <div className="text-lg font-bold text-amber-300">{overview.rooms.length}</div>
                    </div>
                    <div className="sw-cut-sm border border-white/10 bg-black/40 p-2.5">
                      <div className="text-[9px] uppercase text-slate-400">Connections</div>
                      <div className="text-lg font-bold text-cyan-300">
                        {overview.stats.connectedSockets}
                      </div>
                    </div>
                    <div className="sw-cut-sm border border-white/10 bg-black/40 p-2.5">
                      <div className="text-[9px] uppercase text-slate-400">Memory / Uptime</div>
                      <div className="text-sm font-bold text-slate-200">
                        {overview.stats.memoryMb} MB • {Math.floor(overview.stats.uptimeSeconds / 60)}m
                      </div>
                    </div>
                  </div>
                )}

                {/* 1. Password Gate & Server Policy */}
                <div className="sw-cut-sm space-y-3 border border-white/10 bg-black/40 p-4">
                  <div className="flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">
                    <span className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5" /> Access Control & Lobby Policy
                    </span>
                    <span>
                      {overview?.config.hasSitePassword ? '🔒 PASSWORD ACTIVE' : '🌐 OPEN ACCESS'}
                    </span>
                  </div>

                  {overview?.config.sitePasswordEnvLocked ? (
                    <p className="text-[11px] text-slate-400">
                      Site password is set via <code>SITE_PASSWORD</code> environment variable.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="password"
                        value={newSitePassword}
                        onChange={e => {
                          setNewSitePassword(e.target.value);
                          setClearSitePw(false);
                        }}
                        placeholder={
                          overview?.config.hasSitePassword
                            ? 'Enter new password to rotate...'
                            : 'Set a password to lock entire server...'
                        }
                        className="sw-cut-sm flex-1 border border-white/15 bg-black/60 px-3 py-2 font-mono text-xs text-white focus:border-amber-400 focus:outline-none"
                      />
                      {overview?.config.hasSitePassword && (
                        <button
                          type="button"
                          onClick={() => {
                            setClearSitePw(v => !v);
                            setNewSitePassword('');
                          }}
                          className={`sw-cut-sm border px-3 py-2 font-mono text-[10px] uppercase ${
                            clearSitePw
                              ? 'border-rose-400 bg-rose-500/20 text-rose-300'
                              : 'border-white/15 text-slate-300'
                          }`}
                        >
                          {clearSitePw ? 'Will Remove Lock' : 'Remove Password'}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                    <label className="flex cursor-pointer items-center gap-2 text-slate-200">
                      <input
                        type="checkbox"
                        checked={publicLobby}
                        onChange={e => setPublicLobby(e.target.checked)}
                        className="accent-amber-400"
                      />
                      <span>List active Party tables on home screen</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-slate-200">
                      <input
                        type="checkbox"
                        checked={lockCreditsGlobal}
                        onChange={e => setLockCreditsGlobal(e.target.checked)}
                        className="accent-amber-400"
                      />
                      <span>Lock starting bankrolls across all tables</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block font-mono text-[10px] uppercase text-slate-400">
                        Server Banner Notice
                      </label>
                      <input
                        type="text"
                        value={serverNotice}
                        onChange={e => setServerNotice(e.target.value)}
                        placeholder="Friday Cantina Night — 8PM!"
                        className="sw-cut-sm w-full border border-white/15 bg-black/60 px-3 py-2 font-mono text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-mono text-[10px] uppercase text-slate-400">
                        Public Server URL (for Links & OIDC)
                      </label>
                      <input
                        type="url"
                        value={publicUrl}
                        onChange={e => setPublicUrl(e.target.value)}
                        placeholder="https://sabacc.example.com"
                        className="sw-cut-sm w-full border border-white/15 bg-black/60 px-3 py-2 font-mono text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Discord Webhook Settings */}
                <div className="sw-cut-sm space-y-3 border border-white/10 bg-black/40 p-4">
                  <div className="flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                    <span>Discord Webhook Integration</span>
                    <button
                      type="button"
                      onClick={handleTestDiscord}
                      className="sw-cut-sm flex items-center gap-1 border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1 text-[10px] text-cyan-200 hover:bg-cyan-500/25"
                    >
                      <Send className="h-3 w-3" /> Test Ping
                    </button>
                  </div>

                  <input
                    type="url"
                    value={webhookInput}
                    onChange={e => setWebhookInput(e.target.value)}
                    placeholder={
                      overview?.config.hasDiscordWebhook
                        ? `Configured (${overview.config.discordWebhookPreview}) — paste to replace`
                        : 'https://discord.com/api/webhooks/...'
                    }
                    className="sw-cut-sm w-full border border-white/15 bg-black/60 px-3 py-2 font-mono text-xs text-white"
                  />

                  <div className="flex flex-wrap gap-4">
                    <label className="flex cursor-pointer items-center gap-1.5 text-slate-200">
                      <input
                        type="checkbox"
                        checked={notifyRooms}
                        onChange={e => setNotifyRooms(e.target.checked)}
                        className="accent-cyan-400"
                      />
                      <span>New Table Opened</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-slate-200">
                      <input
                        type="checkbox"
                        checked={notifyJackpots}
                        onChange={e => setNotifyJackpots(e.target.checked)}
                        className="accent-cyan-400"
                      />
                      <span>Sabacc Pot Jackpots</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-slate-200">
                      <input
                        type="checkbox"
                        checked={allowShare}
                        onChange={e => setAllowShare(e.target.checked)}
                        className="accent-cyan-400"
                      />
                      <span>Player Score Shares</span>
                    </label>
                  </div>
                </div>

                {/* Save Button + Status */}
                <div className="flex items-center justify-between gap-3">
                  <div className="font-mono text-xs">
                    {statusMsg && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Check className="h-3.5 w-3.5" /> {statusMsg}
                      </span>
                    )}
                    {error && <span className="text-rose-400">{error}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="sw-cut-sm bg-amber-400 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-zinc-950 hover:bg-amber-300"
                  >
                    Save Settings
                  </button>
                </div>

                {/* 3. Live Rooms Table */}
                {overview && overview.rooms.length > 0 && (
                  <div className="sw-cut-sm space-y-2 border border-white/10 bg-black/40 p-4">
                    <div className="flex items-center justify-between font-mono text-[11px] font-bold uppercase text-slate-300">
                      <span>Active Server Tables ({overview.rooms.length})</span>
                      <button onClick={fetchOverview} className="text-slate-400 hover:text-white">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="divide-y divide-white/10">
                      {overview.rooms.map(r => (
                        <div key={r.roomId} className="flex items-center justify-between py-2 font-mono text-[11px]">
                          <div>
                            <span className="font-bold text-amber-300">{r.roomId}</span>
                            <span className="ml-2 text-slate-400">
                              {r.mode} • {r.phase} • {r.players.map(p => p.name).join(', ')}
                            </span>
                          </div>
                          <button
                            onClick={() => handleCloseRoom(r.roomId)}
                            className="flex items-center gap-1 text-rose-400 hover:text-rose-300"
                            title="Force-close room"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Close
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
