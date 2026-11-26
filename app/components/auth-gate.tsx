'use client';

import React, { useState } from 'react';
import { KeyRound, Lock, ShieldCheck, Sun, Moon } from 'lucide-react';
import { apiUrl } from '@/lib/api-base';
import { ColorMode } from '@/lib/progression';

export interface AuthGateProps {
  passwordEnabled: boolean;
  oidcEnabled: boolean;
  oidcProviderName: string;
  colorMode: ColorMode;
  onToggleTheme: () => void;
  onAuthenticated: (callsign: string) => void;
}

export function AuthGate({
  passwordEnabled,
  oidcEnabled,
  oidcProviderName,
  colorMode,
  onToggleTheme,
  onAuthenticated,
}: AuthGateProps) {
  const [callsign, setCallsign] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password, callsign: callsign.trim() || 'Pilot' }),
      });
      const data = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok || !data.ok) {
        setError(data.error ?? 'Access denied.');
      } else {
        onAuthenticated(callsign.trim());
      }
    } catch {
      setError('Could not reach server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="holotable-stage safe-top safe-bottom relative flex min-h-[100dvh] flex-col items-center justify-center p-4">
      <button
        onClick={onToggleTheme}
        className="sw-cut-sm absolute right-4 top-4 border border-white/15 bg-black/40 p-2 text-slate-300 hover:text-amber-400"
        title="Toggle Light / Dark Theme"
      >
        {colorMode === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>

      <div className="sw-cut w-full max-w-sm border border-cyan-400/30 bg-[#080d14]/90 p-6 shadow-2xl backdrop-blur-xl space-y-5">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-400">
            <Lock className="h-5 w-5" />
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-cyan-300/75">
            RESTRICTED SECTOR
          </div>
          <h1 className="mt-1 font-mono text-xl font-bold uppercase tracking-widest text-amber-400">
            Cantina Clearance
          </h1>
        </div>

        {oidcEnabled && (
          <a
            href="/api/auth/oidc/login"
            className="sw-cut-sm flex w-full items-center justify-center gap-2 bg-cyan-400 py-3 font-mono text-xs font-bold uppercase tracking-[0.2em] text-zinc-950 hover:bg-cyan-300"
          >
            <ShieldCheck className="h-4 w-4" /> Sign In with {oidcProviderName}
          </a>
        )}

        {oidcEnabled && passwordEnabled && (
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-slate-400">
            <div className="h-px flex-1 bg-white/10" />
            <span>OR ACCESS CODE</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
        )}

        {passwordEnabled && (
          <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
            <div>
              <label className="mb-1 block font-mono text-xs uppercase tracking-[0.18em] text-cyan-300/80">
                Pilot Callsign
              </label>
              <input
                type="text"
                value={callsign}
                onChange={e => setCallsign(e.target.value)}
                placeholder="Han Solo"
                maxLength={20}
                className="sw-cut-sm min-h-[48px] w-full border border-white/15 bg-black/60 px-3.5 font-mono text-base text-white focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block font-mono text-xs uppercase tracking-[0.18em] text-cyan-300/80">
                Site Password
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="sw-cut-sm min-h-[48px] w-full border border-white/15 bg-black/60 pl-9 pr-3.5 font-mono text-base text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            {error && (
              <div className="sw-cut-sm border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-center font-mono text-xs text-rose-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !password}
              className="sw-cut-sm min-h-[50px] w-full bg-amber-400 font-mono text-sm font-bold uppercase tracking-[0.2em] text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
            >
              {busy ? 'Verifying...' : 'Unlock Holotable'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
