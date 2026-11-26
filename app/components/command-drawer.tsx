'use client';

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Award,
  Eye,
  HelpCircle,
  LogOut,
  MessageSquare,
  MessageSquareOff,
  Moon,
  QrCode,
  Scale,
  Shield,
  ShieldCheck,
  Sun,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ClientGameState } from '@/lib/game-logic';
import { PilotDossier } from '@/lib/progression';

export interface CommandDrawerProps {
  open: boolean;
  gameState: ClientGameState;
  dossier: PilotDossier;
  mutedNames: string[];
  isSpectator: boolean;
  isLocalSolo?: boolean;
  chatMessage: string;
  onChatChange: (v: string) => void;
  onSendChat: (e: React.FormEvent) => void;
  onClose: () => void;
  onUpdateDossier: (patch: Partial<PilotDossier>) => void;
  onOpenQr: () => void;
  onOpenLedger: () => void;
  onOpenDossier: () => void;
  onOpenTutorial: () => void;
  onOpenRules: () => void;
  onOpenLegal: () => void;
  onOpenAdmin: () => void;
  onToggleSpectator: () => void;
  onLeaveRoom: () => void;
}

export function CommandDrawer({
  open,
  gameState,
  dossier,
  mutedNames,
  isSpectator,
  isLocalSolo = false,
  chatMessage,
  onChatChange,
  onSendChat,
  onClose,
  onUpdateDossier,
  onOpenQr,
  onOpenLedger,
  onOpenDossier,
  onOpenTutorial,
  onOpenRules,
  onOpenLegal,
  onOpenAdmin,
  onToggleSpectator,
  onLeaveRoom,
}: CommandDrawerProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, gameState.logs.length, gameState.messages.length]);

  const visibleMessages = dossier.chatEnabled
    ? gameState.messages.filter(m => !mutedNames.includes(m.sender))
    : [];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex justify-end bg-black/65 backdrop-blur-xs"
          onClick={onClose}
        >
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            onClick={e => e.stopPropagation()}
            className="safe-top safe-bottom flex h-full w-80 sm:w-96 flex-col border-l border-cyan-400/25 bg-[#070b12]/98 px-5 py-4 text-white shadow-2xl"
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <div className="font-mono text-xs uppercase tracking-[0.22em] text-cyan-300/75">
                  TABLE MENU
                </div>
                <div className="font-mono text-base font-bold uppercase tracking-widest text-amber-400">
                  {gameState.mode === 'party' ? `Room ${gameState.roomId}` : 'Solo Holotable'}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close Menu"
                className="sw-cut-sm flex h-11 w-11 items-center justify-center border border-white/10 bg-white/5 text-white/65 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Clean 2x2 Quick Actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  onClose();
                  onOpenDossier();
                }}
                className="sw-cut-sm flex min-h-[60px] flex-col items-start justify-center gap-0.5 border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-left hover:bg-amber-500/20"
              >
                <span className="flex items-center gap-1.5 font-mono text-sm font-bold uppercase text-white">
                  <Award className="h-4 w-4 text-amber-400" /> Profile
                </span>
                <span className="font-mono text-xs text-amber-300/85">Vault, Chart &amp; Skins</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenLedger();
                }}
                className="sw-cut-sm flex min-h-[60px] flex-col items-start justify-center gap-0.5 border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-left hover:bg-cyan-500/20"
              >
                <span className="flex items-center gap-1.5 font-mono text-sm font-bold uppercase text-white">
                  <Scale className="h-4 w-4 text-cyan-300" /> Table Rules
                </span>
                <span className="font-mono text-xs text-cyan-300/85">Scores &amp; Stakes</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenTutorial();
                }}
                className="sw-cut-sm flex min-h-[48px] items-center gap-2 border border-white/12 bg-white/[0.04] px-3 font-mono text-xs sm:text-sm font-semibold uppercase text-white/90 hover:bg-white/10 active:scale-[0.98]"
              >
                <HelpCircle className="h-4 w-4 text-amber-300" /> Tutorial
              </button>

              {gameState.mode === 'party' ? (
                <button
                  onClick={() => {
                    onClose();
                    onOpenQr();
                  }}
                  className="sw-cut-sm flex min-h-[48px] items-center gap-2 border border-amber-400/35 bg-amber-500/10 px-3 font-mono text-xs sm:text-sm font-bold uppercase text-amber-300 hover:bg-amber-500/20 active:scale-[0.98]"
                >
                  <QrCode className="h-4 w-4" /> Invite QR
                </button>
              ) : (
                <button
                  onClick={() => {
                    onClose();
                    onOpenRules();
                  }}
                  className="sw-cut-sm flex min-h-[48px] items-center gap-2 border border-white/12 bg-white/[0.04] px-3 font-mono text-xs sm:text-sm font-semibold uppercase text-white/85 hover:bg-white/10 active:scale-[0.98]"
                >
                  <ShieldCheck className="h-4 w-4 text-cyan-300" /> Hand Ranks
                </button>
              )}
            </div>

            {/* Preferences Row */}
            <div className="mt-3 space-y-2.5 border-y border-white/10 py-3">
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    onUpdateDossier({
                      colorMode: dossier.colorMode === 'light' ? 'dark' : 'light',
                    })
                  }
                  className="sw-cut-sm flex min-h-[44px] flex-1 items-center justify-center gap-1.5 border border-white/15 bg-black/40 font-mono text-xs uppercase text-slate-200 hover:border-amber-400/50"
                >
                  {dossier.colorMode === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  {dossier.colorMode === 'light' ? 'Dark' : 'Light'}
                </button>

                {gameState.mode === 'party' && (
                  <button
                    onClick={() => onUpdateDossier({ chatEnabled: !dossier.chatEnabled })}
                    className={`sw-cut-sm flex min-h-[44px] flex-1 items-center justify-center gap-1.5 border font-mono text-xs uppercase ${
                      dossier.chatEnabled
                        ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
                        : 'border-white/15 bg-black/40 text-slate-400'
                    }`}
                  >
                    {dossier.chatEnabled ? (
                      <MessageSquare className="h-4 w-4" />
                    ) : (
                      <MessageSquareOff className="h-4 w-4" />
                    )}
                    {dossier.chatEnabled ? 'Chat On' : 'Chat Off'}
                  </button>
                )}

                {!isLocalSolo && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenAdmin();
                    }}
                    className="sw-cut-sm flex min-h-[44px] items-center justify-center gap-1.5 border border-white/15 bg-black/40 px-3 font-mono text-xs uppercase text-slate-200 hover:border-cyan-400/50"
                  >
                    <Shield className="h-4 w-4 text-amber-400" /> Admin
                  </button>
                )}
              </div>

              {/* Comfy 3-Button Sound Selector (No Finicky Mobile Slider) */}
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { label: 'Mute', val: 0, active: dossier.volume === 0 },
                    { label: 'Sound Low', val: 0.45, active: dossier.volume > 0 && dossier.volume <= 0.55 },
                    { label: 'Sound High', val: 0.9, active: dossier.volume > 0.55 },
                  ] as const
                ).map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => onUpdateDossier({ volume: opt.val })}
                    className={`sw-cut-sm flex min-h-[44px] items-center justify-center gap-1.5 border font-mono text-xs uppercase active:scale-[0.98] ${
                      opt.active
                        ? 'border-amber-400 bg-amber-500/20 font-bold text-amber-300'
                        : 'border-white/12 bg-black/40 text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.val === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    <span>{opt.label.replace('Sound ', '')}</span>
                  </button>
                ))}
              </div>

              {gameState.mode === 'party' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      onToggleSpectator();
                      onClose();
                    }}
                    className="sw-cut-sm flex min-h-[44px] flex-1 items-center justify-center gap-1.5 border border-white/12 bg-black/40 font-mono text-xs uppercase text-white/80 hover:text-white"
                  >
                    <Eye className="h-4 w-4" /> {isSpectator ? 'Join Next Hand' : 'Spectate'}
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenLegal();
                    }}
                    className="sw-cut-sm flex min-h-[44px] items-center justify-center gap-1.5 border border-white/12 bg-black/40 px-3 font-mono text-xs uppercase text-white/80 hover:text-white"
                  >
                    <ShieldCheck className="h-4 w-4 text-cyan-300" /> Safety
                  </button>
                </div>
              )}
            </div>

            {/* Activity Log & Filtered Multiplayer Chat */}
            <div className="mt-3 flex min-h-0 flex-1 flex-col">
              <span className="mb-1.5 font-mono text-xs uppercase tracking-[0.2em] text-white/50">
                Table Log
              </span>
              <div className="flex-1 space-y-1.5 overflow-y-auto rounded border border-white/10 bg-black/55 p-3 font-mono text-xs custom-scrollbar">
                {gameState.logs.slice(-16).map((log, i) => (
                  <div key={`l-${i}`} className="leading-snug text-slate-300">
                    {log}
                  </div>
                ))}
                {visibleMessages.map((msg, i) => (
                  <div key={`m-${i}`} className="leading-snug">
                    <span className="text-amber-400">{msg.sender}: </span>
                    <span className="text-white">{msg.text}</span>
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              {gameState.mode === 'party' && dossier.chatEnabled && (
                <form onSubmit={onSendChat} className="mt-2 flex gap-1.5">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={e => onChatChange(e.target.value)}
                    placeholder="Message table..."
                    className="sw-cut-sm min-h-[46px] flex-1 border border-white/15 bg-black/60 px-3 font-mono text-base text-white focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="sw-cut-sm min-h-[46px] bg-cyan-400 px-4 font-mono text-xs font-bold uppercase text-zinc-950 hover:bg-cyan-300"
                  >
                    Send
                  </button>
                </form>
              )}
            </div>

            <button
              onClick={onLeaveRoom}
              className="sw-cut-sm mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 border border-rose-500/35 bg-rose-950/30 font-mono text-sm font-bold uppercase tracking-widest text-rose-300 hover:bg-rose-900/40"
            >
              <LogOut className="h-4 w-4" /> Leave Table
            </button>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
