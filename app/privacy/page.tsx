import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy & Fair Play — Corellian Spike Sabacc',
  description: 'Privacy policy, data controls, and simulated card game disclosures for Sabacc.',
};

export default function PrivacyPage() {
  return (
    <div className="holotable-stage safe-top safe-bottom min-h-[100dvh] px-4 py-10 text-slate-200">
      <div className="sw-cut mx-auto max-w-2xl border border-cyan-400/30 bg-[#080d14]/95 p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-300">
              LEGAL &amp; DATA DISCLOSURE
            </div>
            <h1 className="mt-1 text-2xl font-bold uppercase tracking-wider text-amber-400">
              Privacy Policy &amp; Fair Play
            </h1>
          </div>
          <Link
            href="/"
            className="sw-cut-sm border border-white/15 bg-white/5 px-4 py-2 font-mono text-xs uppercase text-cyan-200 hover:bg-white/10"
          >
            ← Back to Table
          </Link>
        </div>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-amber-300">
            1. Entertainment-Only Credits (No Real-Money Gambling)
          </h2>
          <p>
            Corellian Spike Sabacc is a free, recreational sci-fi card game. All in-game credits (
            <code>CR</code>), pots, bounties, and daily bonuses are fictional scorekeeping points with{' '}
            <strong>zero real-world monetary value</strong>. You cannot purchase credits with real money,
            wager real currency, or redeem credits for cash, prizes, or goods. Success in this card game
            does not imply future success at real-money gambling.
          </p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-amber-300">
            2. Data We Store &amp; Zero Third-Party Tracking
          </h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>No Trackers or Ads:</strong> This app contains zero advertising SDKs, zero third-party
              analytics scripts, and never sells or shares personal data.
            </li>
            <li>
              <strong>On-Device Storage:</strong> Your chosen display name (callsign), game preferences,
              unlocked card/table cosmetics, and local solo statistics are stored locally on your device via{' '}
              <code>localStorage</code>.
            </li>
            <li>
              <strong>Optional Self-Hosted Multiplayer:</strong> When you connect to a multiplayer host
              server, your display name, active table actions, and optional server leaderboard score are
              transmitted only to that host server. If your server administrator enables OpenID Connect (SSO),
              only a signed <code>HttpOnly</code> session cookie is used to authenticate your session.
            </li>
          </ul>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-amber-300">
            3. Multiplayer Safety &amp; Moderation
          </h2>
          <p>
            Multiplayer tables enforce automated text filtering on callsigns and chat messages. Players can
            disable multiplayer chat entirely in the in-game Menu, or tap any opponent seat in a multiplayer
            game to <strong>Mute</strong> or <strong>Report</strong> disruptive behavior to the server host.
          </p>
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-amber-300">
            4. Deleting Your Data
          </h2>
          <p>
            You can permanently erase all local profile data and remove your pilot record from a connected
            server at any time inside the app via <strong>Profile → Erase Profile &amp; Data</strong> (or{' '}
            <strong>Privacy &amp; Fair Play → Erase All Data</strong>).
          </p>
        </section>

        <div className="border-t border-white/10 pt-4 font-mono text-[11px] text-slate-400">
          Open-source MIT software • Unofficial fan-made card game inspired by Star Wars™ lore.
        </div>
      </div>
    </div>
  );
}
