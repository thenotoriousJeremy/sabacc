'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Copy, QrCode, Wifi, X } from 'lucide-react';
import { encodeQrMatrix } from '@/lib/qr';

export interface QrInviteModalProps {
  open: boolean;
  roomId: string;
  onClose: () => void;
}

export function QrInviteModal({ open, roomId, onClose }: QrInviteModalProps) {
  const [lanAddresses, setLanAddresses] = useState<string[]>([]);
  const [lanPort, setLanPort] = useState<number>(3000);
  const [selectedHostIdx, setSelectedHostIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/lan-info')
      .then(r => (r.ok ? r.json() : null))
      .then((data: { port?: number; addresses?: string[] } | null) => {
        if (data?.addresses?.length) setLanAddresses(data.addresses);
        if (data?.port) setLanPort(data.port);
      })
      .catch(() => {});
  }, [open]);

  const joinUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const loc = window.location;
    const isLoopback = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
    const host =
      isLoopback && lanAddresses.length > 0
        ? `${lanAddresses[selectedHostIdx] ?? lanAddresses[0]}:${loc.port || lanPort}`
        : loc.host;
    return `${loc.protocol}//${host}/?room=${encodeURIComponent(roomId)}`;
  }, [roomId, lanAddresses, lanPort, selectedHostIdx]);

  const matrix = useMemo(() => (joinUrl ? encodeQrMatrix(joinUrl) : null), [joinUrl]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
            initial={{ scale: 0.92, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 12 }}
            onClick={e => e.stopPropagation()}
            className="sw-cut w-full max-w-sm border border-cyan-400/35 bg-[#070b12]/98 p-6 text-white shadow-[0_0_60px_rgba(0,0,0,0.9)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-amber-400" />
                <h2 className="font-mono text-base font-bold uppercase tracking-widest text-amber-400">
                  Cantina Holo-Invite
                </h2>
              </div>
              <button onClick={onClose} className="rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex flex-col items-center rounded-xl border border-amber-500/20 bg-black/60 p-4">
              <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">Sector Code</span>
              <span className="mb-3 font-mono text-3xl font-black tracking-[0.3em] text-amber-400">{roomId}</span>

              {matrix ? (
                <div className="rounded-xl bg-amber-50 p-3 shadow-inner">
                  <svg
                    viewBox={`0 0 ${matrix.length} ${matrix.length}`}
                    className="h-44 w-44"
                    shapeRendering="crispEdges"
                    role="img"
                    aria-label={`QR code to join room ${roomId}`}
                  >
                    <rect width={matrix.length} height={matrix.length} fill="#fffbeb" />
                    {matrix.map((row, r) =>
                      row.map((dark, c) =>
                        dark ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#09090b" /> : null
                      )
                    )}
                  </svg>
                </div>
              ) : (
                <p className="py-6 text-center text-xs text-white/50">
                  URL exceeds compact QR length — share the link below directly.
                </p>
              )}

              <p className="mt-3 text-center text-[11px] text-white/50">
                Scan with any phone camera on the same Wi-Fi to sit straight at this table.
              </p>
            </div>

            {lanAddresses.length > 1 && (
              <div className="mb-3">
                <label className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40">
                  <Wifi className="h-3 w-3 text-amber-400" /> Network Adapter
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {lanAddresses.map((addr, idx) => (
                    <button
                      key={addr}
                      onClick={() => setSelectedHostIdx(idx)}
                      className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                        selectedHostIdx === idx
                          ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                          : 'border-white/10 bg-white/5 text-white/50 hover:text-white'
                      }`}
                    >
                      {addr}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 p-2">
              <span className="flex-1 truncate font-mono text-[11px] text-white/70">{joinUrl}</span>
              <button
                onClick={handleCopy}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-black hover:bg-amber-400"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
