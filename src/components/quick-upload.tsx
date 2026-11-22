"use client";

import { useMemo, useState } from "react";

type Entity = { id: string; displayName: string };
type UploadResult = { referenceNumber: string; entity: string; category: string; status: string; receivedAt: string; receiptUrl: string };
const categories = [{ value: "FAKTURA", label: "Faktura" }, { value: "RACHUNEK", label: "Rachunek" }, { value: "PARAGON_Z_NIP", label: "Paragon z NIP" }, { value: "INNE", label: "Inne" }];

function clientId() {
  const key = "wb_docs_client"; let value = localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID().replaceAll("-", ""); localStorage.setItem(key, value); }
  return value;
}

export function QuickUpload({ qrToken, qrName }: { qrToken: string; qrName: string }) {
  const [step, setStep] = useState<"phone" | "document" | "success">("phone");
  const [phone, setPhone] = useState(""); const [entities, setEntities] = useState<Entity[]>([]); const [entityId, setEntityId] = useState("");
  const [category, setCategory] = useState("FAKTURA"); const [note, setNote] = useState(""); const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [result, setResult] = useState<UploadResult>();
  const total = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  async function identify(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/quick/identify", { method: "POST", headers: { "Content-Type": "application/json", "X-Client-Id": clientId() }, body: JSON.stringify({ phoneNumber: phone, qrToken }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? "Nie udało się potwierdzić dostępu.");
      const context = await fetch("/api/quick/context", { headers: { "X-Client-Id": clientId() } }); const payload = await context.json();
      if (!context.ok) throw new Error(payload.error?.message); setEntities(payload.entities); setEntityId(payload.entities[0]?.id ?? ""); setStep("document");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Wystąpił błąd."); } finally { setBusy(false); }
  }

  function addFiles(list: FileList | null) { if (list) setFiles((current) => [...current, ...Array.from(list)].slice(0, 10)); }
  function move(index: number, delta: number) { setFiles((current) => { const next = [...current]; const target = index + delta; if (target < 0 || target >= next.length) return next; [next[index], next[target]] = [next[target], next[index]]; return next; }); }

  async function upload(event: React.FormEvent) {
    event.preventDefault(); if (!files.length) return setError("Dodaj co najmniej jeden plik."); if (total > 10 * 1024 * 1024) return setError("Zgłoszenie może mieć maksymalnie 10 MB.");
    setBusy(true); setError(""); const body = new FormData(); body.set("entityId", entityId); body.set("category", category); body.set("note", note); files.forEach((file) => body.append("files", file));
    try {
      const response = await fetch("/api/quick/upload", { method: "POST", headers: { "X-Client-Id": clientId(), "Idempotency-Key": crypto.randomUUID().replaceAll("-", "") }, body });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "Nie udało się zapisać dokumentu."); setResult(payload); setStep("success");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Wystąpił błąd."); } finally { setBusy(false); }
  }

  return <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 py-6 sm:py-10"><header className="mb-6 flex items-center gap-3"><div className="brand-mark">WB</div><div><p className="text-xs font-bold uppercase tracking-[.2em] text-amber-300">WB Dokumenty</p><p className="text-sm text-slate-400">{qrName}</p></div></header><section className="card p-5 sm:p-7">
    {step === "phone" && <form onSubmit={identify}><p className="text-sm font-bold text-amber-300">Krok 1 z 2</p><h1 className="mt-2 text-2xl font-semibold">Podaj numer telefonu</h1><p className="mt-2 text-sm leading-6 text-slate-400">Numer musi być wcześniej dodany przez administratora. Służy tylko do zgłoszenia dokumentu.</p><label className="mt-6 block"><span className="label">Numer telefonu</span><input className="field text-lg" inputMode="tel" autoComplete="tel" placeholder="+48 500 000 000" value={phone} onChange={(e) => setPhone(e.target.value)} required /></label>{error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}<button className="button-primary mt-6 w-full" disabled={busy}>{busy ? "Sprawdzam…" : "Dalej"}</button></form>}
    {step === "document" && <form onSubmit={upload}><p className="text-sm font-bold text-amber-300">Krok 2 z 2</p><h1 className="mt-2 text-2xl font-semibold">Dodaj dokument</h1><div className="mt-6 grid gap-5"><label><span className="label">Podmiot</span><select className="field" value={entityId} onChange={(e) => setEntityId(e.target.value)}>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.displayName}</option>)}</select></label><label><span className="label">Rodzaj dokumentu</span><select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><div><span className="label">Zdjęcia lub PDF · maks. 10 MB</span><div className="grid grid-cols-2 gap-3"><label className="button-secondary cursor-pointer text-center">Zrób zdjęcie<input className="sr-only" type="file" accept="image/*" capture="environment" onChange={(e) => addFiles(e.target.files)} /></label><label className="button-secondary cursor-pointer text-center">Wybierz pliki<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(e) => addFiles(e.target.files)} /></label></div></div>{files.length > 0 && <ol className="grid gap-2">{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-2 rounded-xl bg-white/[.04] p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-300 text-sm font-black text-slate-950">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm">{file.name}</span><button type="button" className="px-1 text-slate-400" onClick={() => move(index, -1)} aria-label="Przesuń wyżej">↑</button><button type="button" className="px-1 text-slate-400" onClick={() => move(index, 1)} aria-label="Przesuń niżej">↓</button><button type="button" className="px-1 text-red-300" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} aria-label="Usuń">×</button></li>)}</ol>}<p className="text-right text-xs text-slate-500">{files.length}/10 · {(total / 1024 / 1024).toFixed(1)} MB</p><label><span className="label">Notatka (opcjonalnie)</span><textarea className="field min-h-24 resize-y" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label></div>{error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}<button className="button-primary mt-6 w-full" disabled={busy || !entityId}>{busy ? "Zapisuję…" : "Wyślij dokument"}</button></form>}
    {step === "success" && result && <div className="text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-400/15 text-3xl text-emerald-300">✓</div><h1 className="mt-5 text-2xl font-semibold">Dokument został zapisany.</h1><dl className="mt-6 divide-y divide-white/10 rounded-2xl bg-white/[.04] px-4 text-left">{[["Numer", result.referenceNumber], ["Podmiot", result.entity], ["Kategoria", categories.find((x) => x.value === result.category)?.label ?? result.category], ["Status", result.status], ["Data", new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.receivedAt))]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3"><dt className="text-slate-400">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>)}</dl><a href={result.receiptUrl} className="button-secondary mt-5 w-full">Otwórz potwierdzenie</a><button className="button-primary mt-3 w-full" onClick={() => { setFiles([]); setNote(""); setResult(undefined); setStep("document"); }}>Dodaj kolejny dokument</button></div>}
  </section><p className="mt-5 text-center text-xs leading-5 text-slate-500">Połączenie szyfrowane · dokumenty dostępne wyłącznie dla uprawnionych osób</p></main>;
}
