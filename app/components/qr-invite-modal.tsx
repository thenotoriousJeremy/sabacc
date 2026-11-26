'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Copy, QrCode, Share2, Wifi, X } from 'lucide-react';
import {
  apiUrl,
  getConfiguredServerUrl,
  isLoopbackOrPackagedHost,
  normalizeBaseUrl,
} from '@/lib/api-base';
import { encodeQrMatrix } from '@/lib/qr';

export interface QrInviteModalProps {
  open: boolean;
  roomId: string;
  serverUrl?: string;
  onClose: () => void;
}

export function QrInviteModal({ open, roomId, serverUrl, onClose }: QrInviteModalProps) {
  const [lanAddresses, setLanAddresses] = useState<string[]>([]);
  const [lanPort, setLanPort] = useState<number>(3000);
  const [configuredPublicUrl, setConfiguredPublicUrl] = useState<string>('');
  const [inferredPublicUrl, setInferredPublicUrl] = useState<string>('');
  const [selectedHostIdx, setSelectedHostIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(apiUrl('/api/lan-info'), { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            port?: number;
            addresses?: string[];
            publicUrl?: string;
            configuredPublicUrl?: string;
          } | null
        ) => {
          if (data?.addresses?.length) setLanAddresses(data.addresses);
          if (data?.port) setLanPort(data.port);
          if (data?.configuredPublicUrl) {
            setConfiguredPublicUrl(normalizeBaseUrl(data.configuredPublicUrl));
          }
          if (data?.publicUrl) {
            setInferredPublicUrl(normalizeBaseUrl(data.publicUrl));
          }
        }
      )
      .catch(() => {});
  }, [open, serverUrl]);

  const joinUrl = useMemo(() => {
    const codeParam = `/?room=${encodeURIComponent(roomId)}`;
    const clientBase = normalizeBaseUrl(serverUrl) || getConfiguredServerUrl();

    const candidates = [
      // 1. Explicit PUBLIC_URL set by server admin (.env / Admin Console):
      configuredPublicUrl,
      // 2. Explicit Host Server Address configured in the mobile app / client:
      clientBase,
      // 3. Browser / PWA origin when opened via a real hostname or LAN IP:
      typeof window !== 'undefined' &&
      (window.location.protocol === 'http:' || window.location.protocol === 'https:') &&
      !isLoopbackOrPackagedHost(window.location.hostname)
        ? window.location.origin
        : '',
      // 4. Reverse-proxy / Host header URL inferred by the server:
      inferredPublicUrl,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const parsed = new URL(candidate);
        if (!isLoopbackOrPackagedHost(parsed.hostname)) {
          return `${candidate.replace(/\/+$/, '')}${codeParam}`;
        }
      } catch {
        // Ignore malformed URL candidate.
      }
    }

    if (typeof window === 'undefined') return '';
    const loc = window.location;

    // 5. Localhost on the host machine itself -> fall back to detected LAN IPv4:
    if (lanAddresses.length > 0) {
      const addr = lanAddresses[selectedHostIdx] ?? lanAddresses[0];
      return `http://${addr}:${loc.port || lanPort}${codeParam}`;
    }

    return `${loc.origin}${codeParam}`;
  }, [roomId, serverUrl, configuredPublicUrl, inferredPublicUrl, lanAddresses, lanPort, selectedHostIdx]);

  const matrix = useMemo(() => (joinUrl ? encodeQrMatrix(joinUrl) : null), [joinUrl]);

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCopy = () => {
    navigator.clipboard?.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: `Join Sabacc Room ${roomId}`,
        text: `Sit at my Sabacc table (Room ${roomId}):`,
        url: joinUrl,
      });
    } catch {
      // User dismissed share sheet.
    }
  };

  // Only show manual LAN adapter picker when relying on raw LAN IP fallback:
  const usingLanFallback =
    !configuredPublicUrl &&
    !inferredPublicUrl &&
    !normalizeBaseUrl(serverUrl) &&
    !getConfiguredServerUrl() &&
    typeof window !== 'undefined' &&
    isLoopbackOrPackagedHost(window.location.hostname) &&
    lanAddresses.length > 1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 18 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 18 }}
            onClick={e => e.stopPropagation()}
            className="sw-cut safe-bottom w-full max-w-md border border-cyan-400/35 bg-[#070b12]/98 p-5 sm:p-6 text-white shadow-[0_0_60px_rgba(0,0,0,0.9)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <QrCode className="h-5 w-5 text-amber-400" />
                <h2 className="font-mono text-lg font-bold uppercase tracking-widest text-amber-400">
                  Invite Players
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close Invite Modal"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex flex-col items-center rounded-xl border border-amber-500/25 bg-black/60 p-4 sm:p-5">
              <span className="font-mono text-xs uppercase tracking-[0.25em] text-slate-400">
                Room Code
              </span>
              <span className="mb-3.5 font-mono text-4xl font-black tracking-[0.28em] text-amber-400">
                {roomId}
              </span>

              {matrix ? (
                <div className="rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                  <svg
                    viewBox={`0 0 ${matrix.length} ${matrix.length}`}
                    className="h-64 w-64 sm:h-72 sm:w-72"
                    shapeRendering="crispEdges"
                    role="img"
                    aria-label={`QR code to join room ${roomId}`}
                  >
                    <rect width={matrix.length} height={matrix.length} fill="#ffffff" />
                    {matrix.map((row, r) =>
                      row.map((dark, c) =>
                        dark ? (
                          <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#09090b" />
                        ) : null
                      )
                    )}
                  </svg>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-slate-400">
                  Share the invite link below directly with your table.
                </p>
              )}

              <p className="mt-3.5 text-center text-sm text-slate-300">
                Scan with any phone camera to join Room <strong className="text-amber-300">{roomId}</strong>
              </p>
            </div>

            {usingLanFallback && (
              <div className="mb-3">
                <label className="mb-1.5 flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-slate-400">
                  <Wifi className="h-3.5 w-3.5 text-amber-400" /> Network Adapter
                </label>
                <div className="flex flex-wrap gap-2">
                  {lanAddresses.map((addr, idx) => (
                    <button
                      key={addr}
                      onClick={() => setSelectedHostIdx(idx)}
                      className={`min-h-[40px] rounded-lg border px-3 font-mono text-xs transition-colors ${
                        selectedHostIdx === idx
                          ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                          : 'border-white/15 bg-white/5 text-slate-300 hover:text-white'
                      }`}
                    >
                      {addr}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              <div className="rounded-lg border border-white/15 bg-black/60 px-3.5 py-2.5 text-center font-mono text-xs sm:text-sm break-all text-cyan-200">
                {joinUrl}
              </div>

              <div className="flex gap-2">
                {canNativeShare && (
                  <button
                    onClick={handleNativeShare}
                    className="sw-cut-sm flex min-h-[48px] flex-1 items-center justify-center gap-2 border border-cyan-400/50 bg-cyan-500/20 font-mono text-sm font-bold uppercase tracking-wider text-cyan-100 active:scale-[0.98]"
                  >
                    <Share2 className="h-4 w-4" /> Share
                  </button>
                )}

                <button
                  onClick={handleCopy}
                  className="sw-cut-sm flex min-h-[48px] flex-1 items-center justify-center gap-2 bg-amber-400 font-mono text-sm font-bold uppercase tracking-wider text-zinc-950 hover:bg-amber-300 active:scale-[0.98]"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Link Copied!' : 'Copy Invite Link'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
