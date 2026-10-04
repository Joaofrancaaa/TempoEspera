"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-lg font-semibold">Algo deu errado ao abrir o app.</p>
      <p className="text-sm text-zinc-600">Tente de novo. Se continuar, recarregue a página.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
      >
        Tentar de novo
      </button>
    </div>
  );
}
