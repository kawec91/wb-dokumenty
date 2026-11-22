import Link from "next/link";

export default function Home() {
  return <main className="grid min-h-screen place-items-center px-6 py-12"><section className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-white/[.04] p-8 shadow-2xl backdrop-blur"><div className="brand-mark">WB</div><p className="mt-8 text-xs font-bold uppercase tracking-[.28em] text-amber-300">WhiteBull</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Dokumenty</h1><p className="mt-4 text-slate-300">Bezpieczne przekazywanie faktur, rachunków i paragonów do księgowości.</p><div className="mt-8 grid gap-3"><Link className="button-primary" href="/api/auth/login">Zaloguj się przez WB Auth</Link><p className="text-center text-sm text-slate-400">Aby dodać dokument, zeskanuj przypisany kod QR.</p></div></section></main>;
}
