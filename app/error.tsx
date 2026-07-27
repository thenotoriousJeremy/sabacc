'use client';

// Without this, one thrown render blanks the table with no way back.
export default function GameError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#050505] p-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#140809] p-8 text-center">
        <h1 className="mb-2 text-xl font-bold uppercase tracking-widest text-red-400">Something broke</h1>
        <p className="mb-6 text-sm text-white/50">
          The table stopped responding. Rejoining keeps your seat if the room is still open.
        </p>
        <p className="mb-6 break-words font-mono text-[11px] text-white/30">{error.message}</p>
        <button
          onClick={reset}
          className="w-full rounded-lg bg-amber-500 py-3 font-bold uppercase tracking-widest text-black transition-colors hover:bg-amber-400"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
