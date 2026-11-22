import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/security";
import { formatWarsaw, receiptCutoff } from "@/lib/time";

export const dynamic = "force-dynamic";
export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const document = token.length >= 32 ? await db.document.findUnique({ where: { receiptTokenHash: sha256(token) }, include: { entity: true } }) : null;
  if (!document || document.receivedAt < receiptCutoff()) notFound();
  return <main className="grid min-h-screen place-items-center px-4 py-10"><section className="card w-full max-w-lg p-7"><div className="brand-mark">WB</div><p className="mt-7 text-sm font-bold text-emerald-300">Potwierdzenie zapisu</p><h1 className="mt-2 text-3xl font-semibold">{document.referenceNumber}</h1><dl className="mt-6 divide-y divide-white/10">{[["Podmiot", document.entity.displayName], ["Kategoria", document.category.replaceAll("_", " ")], ["Status", document.status], ["Data", formatWarsaw(document.receivedAt)]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3"><dt className="text-slate-400">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl><p className="mt-5 text-sm leading-6 text-slate-400">Ten adres jest krótkotrwałym potwierdzeniem bieżącego zgłoszenia. Nie umożliwia pobrania dokumentu ani dostępu do historii.</p><Link className="button-secondary mt-6 w-full" href="/">Zamknij</Link></section></main>;
}
