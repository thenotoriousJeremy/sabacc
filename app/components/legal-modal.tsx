'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ExternalLink, ShieldCheck, Trash2, X } from 'lucide-react';

export interface LegalModalProps {
  open: boolean;
  onClose: () => void;
  onEraseAllData: () => Promise<void> | void;
}

export function LegalModal({ open, onClose, onEraseAllData }: LegalModalProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [erased, setErased] = useState(false);

  const handleErase = async () => {
    await onEraseAllData();
    setConfirmReset(false);
    setErased(true);
    setTimeout(() => {
      setErased(false);
      onClose();
    }, 1200);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 10 }}
            onClick={e => e.stopPropagation()}
            className="sw-cut max-h-[88vh] w-full max-w-lg overflow-y-auto border border-cyan-400/30 bg-[#070b12]/98 p-6 text-white shadow-2xl space-y-5 custom-scrollbar"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-5 w-5 text-cyan-300" />
                <h2 className="font-mono text-base font-bold uppercase tracking-widest text-amber-400">
                  Privacy, Safety &amp; Fair Play
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close Privacy Modal"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm leading-relaxed text-slate-200">
              <div className="sw-cut-sm border border-amber-400/30 bg-amber-500/10 p-3.5">
                <div className="font-mono text-xs font-bold uppercase tracking-wider text-amber-300">
                  Play-Only Virtual Credits (Zero Real-Money Value)
                </div>
                <p className="mt-1">
                  Credits (<code>CR</code>) are free scorekeeping points for entertainment only. There are{' '}
                  <strong>no real-money wagers, cash-outs, prizes, or paid chip purchases</strong>.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Privacy &amp; Data Storage
                </div>
                <p>
                  No ad networks, analytics trackers, or third-party SDKs are used. Your callsign, settings,
                  and career progress stay on your device in <code>localStorage</code> (and on your chosen
                  self-hosted server when playing multiplayer).
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Multiplayer Safety
                </div>
                <p>
                  Multiplayer chat and callsigns are filtered automatically. You can turn off table chat in
                  the Menu or tap any player at a multiplayer table to <strong>Mute</strong> or{' '}
                  <strong>Report</strong> them.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4">
              <a
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1.5 font-mono text-xs text-cyan-300 hover:underline"
              >
                Full Privacy Policy <ExternalLink className="h-3.5 w-3.5" />
              </a>

              {erased ? (
                <span className="inline-flex min-h-[44px] items-center gap-1.5 font-mono text-xs font-bold text-emerald-400">
                  <Check className="h-4 w-4" /> Profile &amp; Data Erased
                </span>
              ) : !confirmReset ? (
                <button
                  onClick={() => setConfirmReset(true)}
                  className="sw-cut-sm inline-flex min-h-[44px] items-center gap-1.5 border border-rose-500/40 bg-rose-950/30 px-3.5 font-mono text-xs uppercase text-rose-300 hover:bg-rose-900/40"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Erase My Data
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="sw-cut-sm min-h-[44px] border border-white/15 px-3 font-mono text-xs uppercase text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleErase}
                    className="sw-cut-sm min-h-[44px] bg-rose-500 px-3.5 font-mono text-xs font-bold uppercase text-white hover:bg-rose-400"
                  >
                    Confirm Erase
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
