/* eslint-disable @next/next/no-img-element -- blob previews are local and short-lived */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { humanize, StatusBadge } from "@/components/ui/primitives";
import {
  buildQuickUploadFormData,
  isPreviewableImage,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  uploadFileError,
} from "@/lib/quick-upload-files";

type Entity = { id: string; displayName: string };
type UploadResult = {
  referenceNumber: string;
  entity: string;
  category: string;
  status: string;
  receivedAt: string;
  receiptUrl?: string;
};
type Attachment = { id: number; file: File; previewUrl?: string; error: string | null };

const categories = [
  { value: "FAKTURA", label: "Faktura", hint: "Faktura kosztowa lub zakupowa" },
  { value: "RACHUNEK", label: "Rachunek", hint: "Rachunek bez faktury VAT" },
  { value: "PARAGON_Z_NIP", label: "Paragon z NIP", hint: "Paragon fiskalny z numerem NIP" },
  { value: "INNE", label: "Inny dokument", hint: "Pozostałe dokumenty księgowe" },
];
const steps = ["Telefon", "Podmiot", "Typ", "Pliki", "Potwierdź", "Status"];

function clientId() {
  const key = "wb_docs_client";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID().replaceAll("-", "");
    localStorage.setItem(key, value);
  }
  return value;
}

export function QuickUpload({ qrToken, qrName }: { qrToken: string; qrName: string }) {
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entityId, setEntityId] = useState("");
  const [category, setCategory] = useState("FAKTURA");
  const [note, setNote] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult>();
  const [history, setHistory] = useState<UploadResult[]>([]);
  const attachmentId = useRef(0);
  const previewUrls = useRef(new Set<string>());

  const total = useMemo(
    () => attachments.reduce((sum, attachment) => sum + attachment.file.size, 0),
    [attachments],
  );
  const entity = entities.find((item) => item.id === entityId);
  const hasInvalidFiles = attachments.some((attachment) => attachment.error);
  const tooManyFiles = attachments.length > MAX_UPLOAD_FILES;
  const tooLarge = total > MAX_UPLOAD_BYTES;
  const canContinue = attachments.length > 0 && !hasInvalidFiles && !tooManyFiles && !tooLarge;

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  async function identify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/quick/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Id": clientId() },
        body: JSON.stringify({ phoneNumber: phone, qrToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "Nie udało się potwierdzić dostępu.");
      const context = await fetch("/api/quick/context", { headers: { "X-Client-Id": clientId() } });
      const payload = await context.json();
      if (!context.ok) throw new Error(payload.error?.message ?? "Nie udało się pobrać danych.");
      setFirstName(payload.employee?.firstName ?? "");
      setEntities(payload.entities);
      setEntityId(payload.entities[0]?.id ?? "");
      setStep(1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wystąpił błąd.");
    } finally {
      setBusy(false);
    }
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    // FileList is live. Copy it before resetting the input so React state keeps the actual File objects.
    const selectedFiles = Array.from(input.files ?? []);
    input.value = "";
    if (selectedFiles.length === 0) return;

    const selectedAttachments = selectedFiles.map((file) => {
      const previewUrl = isPreviewableImage(file) ? URL.createObjectURL(file) : undefined;
      if (previewUrl) previewUrls.current.add(previewUrl);
      return { id: ++attachmentId.current, file, previewUrl, error: uploadFileError(file) };
    });
    setAttachments((current) => [...current, ...selectedAttachments]);
    setError("");
  }

  function removeAttachment(id: number) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
        previewUrls.current.delete(removed.previewUrl);
      }
      return current.filter((attachment) => attachment.id !== id);
    });
    setError("");
  }

  function clearAttachments() {
    attachments.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
        previewUrls.current.delete(attachment.previewUrl);
      }
    });
    setAttachments([]);
  }

  function move(index: number, delta: number) {
    setAttachments((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function fileValidationMessage() {
    if (attachments.length === 0) return "Dodaj co najmniej jedno zdjęcie lub plik.";
    if (tooManyFiles) return `Możesz dodać maksymalnie ${MAX_UPLOAD_FILES} stron. Usuń nadmiarowe pliki.`;
    if (hasInvalidFiles) return "Usuń lub zastąp pliki oznaczone jako nieobsługiwane.";
    if (tooLarge) return "Łączny rozmiar zgłoszenia przekracza 10 MB. Usuń lub zmniejsz plik.";
    return "";
  }

  async function upload() {
    const validationError = fileValidationMessage();
    if (validationError) {
      setError(validationError);
      setStep(3);
      return;
    }
    setBusy(true);
    setError("");
    const files = attachments.map((attachment) => attachment.file);
    const body = buildQuickUploadFormData({ entityId, category, note, files });
    try {
      const response = await fetch("/api/quick/upload", {
        method: "POST",
        headers: {
          "X-Client-Id": clientId(),
          "Idempotency-Key": crypto.randomUUID().replaceAll("-", ""),
        },
        body,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Nie udało się zapisać dokumentu.");
      setResult(payload);
      setHistory((current) => [payload, ...current]);
      setStep(5);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wystąpił błąd.");
    } finally {
      setBusy(false);
    }
  }

  function next(target: number) {
    setError("");
    if (target === 2 && !entityId) return setError("Wybierz podmiot.");
    if (target === 4) {
      const validationError = fileValidationMessage();
      if (validationError) return setError(validationError);
    }
    setStep(target);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-3 py-4 sm:px-5 sm:py-8">
      <header className="mb-5 flex items-center gap-3 px-1">
        <div className="brand-mark">WB</div>
        <div className="min-w-0">
          <p className="text-[.66rem] font-extrabold uppercase tracking-[.18em] text-amber-300">WB Dokumenty</p>
          <p className="mt-1 truncate text-xs text-slate-500">{qrName}</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-400/[.07] px-2.5 py-1.5 text-[.63rem] font-bold text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Bezpieczne
        </span>
      </header>

      <nav aria-label="Postęp wysyłania" className="mb-4 overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.018] p-2">
        <ol className="grid grid-cols-6 gap-1">
          {steps.map((label, index) => <li key={label} className="min-w-0 text-center">
            <span className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-[.65rem] font-black transition ${index < step ? "bg-emerald-400/15 text-emerald-300" : index === step ? "bg-amber-300 text-slate-950" : "bg-white/[.045] text-slate-600"}`}>
              {index < step ? <Icon name="check" className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span className={`mt-1.5 hidden truncate text-[.58rem] font-bold sm:block ${index === step ? "text-amber-200" : "text-slate-600"}`}>{label}</span>
          </li>)}
        </ol>
      </nav>

      <section className="card overflow-hidden">
        <div className="border-b border-white/[.06] bg-white/[.015] px-5 py-4">
          <p className="text-[.65rem] font-bold uppercase tracking-[.14em] text-amber-300/70">Krok {step + 1} z 6</p>
          <p className="mt-1 text-xs text-slate-500">{firstName && step > 0 ? `Cześć, ${firstName}. ` : ""}Wypełnienie zajmuje około minuty.</p>
        </div>
        <div className="p-5 sm:p-7">
          {step === 0 && <form onSubmit={identify}>
            <StepTitle icon="phone" title="Potwierdź numer telefonu" text="Wpisz numer przypisany do Twojego profilu pracownika. Nie wyślemy żadnego SMS-a." />
            <label className="mt-6 block"><span className="label">Numer telefonu</span><input className="field text-lg" type="tel" inputMode="tel" autoComplete="tel" placeholder="+48 500 000 000" value={phone} onChange={(event) => setPhone(event.target.value)} required /></label>
            <InlineError message={error} />
            <button className="button-primary mt-6 w-full" disabled={busy}>{busy ? "Sprawdzam…" : "Potwierdź i przejdź dalej"}<Icon name="arrow" className="h-4 w-4" /></button>
          </form>}

          {step === 1 && <div>
            <StepTitle icon="entities" title="Wybierz podmiot" text="Wskaż lokal lub spółkę, której dotyczy dokument." />
            <div className="mt-6 grid gap-2">{entities.map((item) => <label key={item.id} className="chip-check min-h-16"><input type="radio" name="entity" value={item.id} checked={entityId === item.id} onChange={() => setEntityId(item.id)} /><span><strong className="block">{item.displayName}</strong><span className="mt-1 block text-xs text-slate-500">Dokument trafi do właściwego folderu</span></span></label>)}</div>
            <InlineError message={error} /><StepActions back={() => setStep(0)} next={() => next(2)} />
          </div>}

          {step === 2 && <div>
            <StepTitle icon="documents" title="Wybierz typ dokumentu" text="Dzięki temu księgowość szybciej rozpozna zgłoszenie." />
            <div className="mt-6 grid gap-2 sm:grid-cols-2">{categories.map((item) => <label key={item.value} className="chip-check min-h-20"><input type="radio" name="category" value={item.value} checked={category === item.value} onChange={() => setCategory(item.value)} /><span><strong className="block">{item.label}</strong><span className="mt-1 block text-xs leading-4 text-slate-500">{item.hint}</span></span></label>)}</div>
            <StepActions back={() => setStep(1)} next={() => next(3)} />
          </div>}

          {step === 3 && <div>
            <StepTitle icon="upload" title="Dodaj zdjęcie lub PDF" text="Zrób zdjęcie każdej strony albo wybierz pliki zapisane na urządzeniu." />
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <label className="button-primary min-h-14">
                <Icon name="phone" className="h-4 w-4" />Zrób zdjęcie
                <input aria-label="Zrób zdjęcie" className="sr-only" type="file" accept="image/*" capture="environment" onChange={handleFileInput} />
              </label>
              <label className="button-secondary min-h-14">
                <Icon name="upload" className="h-4 w-4" />Wybierz z galerii / plików
                <input aria-label="Wybierz z galerii lub plików" className="sr-only" type="file" accept="image/*,application/pdf,.pdf" multiple onChange={handleFileInput} />
              </label>
            </div>
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">JPG, PNG, WebP lub PDF · maksymalnie 10 stron i 10 MB łącznie</p>

            <div className="mt-6 flex items-center justify-between">
              <h2 className="text-sm font-bold">Dodane strony: {attachments.length}</h2>
              <span className={`text-xs ${tooLarge ? "text-rose-300" : "text-slate-500"}`}>{(total / 1024 / 1024).toFixed(1)} MB / 10 MB</span>
            </div>
            {attachments.length === 0 && <div className="mt-3 rounded-2xl border border-dashed border-white/[.1] p-6 text-center text-xs text-slate-600">Po zrobieniu lub wybraniu zdjęcia zobaczysz je tutaj.</div>}
            {attachments.length > 0 && <ol className="mt-3 grid gap-3 sm:grid-cols-2">
              {attachments.map((attachment, index) => <li key={attachment.id} className={`overflow-hidden rounded-2xl border bg-white/[.025] ${attachment.error ? "border-rose-400/30" : "border-white/[.07]"}`}>
                <div className="relative aspect-[4/3] bg-black/20">
                  {attachment.previewUrl ? <img src={attachment.previewUrl} alt={`Miniatura strony ${index + 1}`} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-slate-500"><span className="text-center"><Icon name="file" className="mx-auto h-8 w-8" /><span className="mt-2 block text-xs">{attachment.file.type === "application/pdf" ? "Dokument PDF" : "Brak podglądu"}</span></span></div>}
                  <span className="absolute left-2 top-2 rounded-lg bg-black/70 px-2 py-1 text-[.65rem] font-bold">Strona {index + 1}</span>
                </div>
                <div className="p-3">
                  <p className="truncate text-xs font-bold" title={attachment.file.name}>{attachment.file.name || `Zdjęcie ${index + 1}`}</p>
                  <p className="mt-1 text-[.65rem] text-slate-500">{(attachment.file.size / 1024 / 1024).toFixed(2)} MB · {attachment.file.type || "nieznany format"}</p>
                  {attachment.error && <p role="alert" className="mt-2 text-xs leading-5 text-rose-300">{attachment.error}</p>}
                  <div className="mt-3 flex items-center gap-1 border-t border-white/[.06] pt-2">
                    <button type="button" className="button-ghost h-8 min-h-8 px-2" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Przesuń stronę ${index + 1} wyżej`}>↑</button>
                    <button type="button" className="button-ghost h-8 min-h-8 px-2" onClick={() => move(index, 1)} disabled={index === attachments.length - 1} aria-label={`Przesuń stronę ${index + 1} niżej`}>↓</button>
                    <button type="button" className="button-ghost ml-auto h-8 min-h-8 px-2 text-rose-300" onClick={() => removeAttachment(attachment.id)} aria-label={`Usuń stronę ${index + 1}`}><Icon name="close" className="h-4 w-4" />Usuń</button>
                  </div>
                </div>
              </li>)}
            </ol>}
            {tooManyFiles && <InlineError message={`Dodano ${attachments.length} stron. Limit wynosi ${MAX_UPLOAD_FILES}. Usuń nadmiarowe pliki.`} />}
            {tooLarge && <InlineError message="Łączny rozmiar przekracza 10 MB. Usuń lub zmniejsz plik." />}
            <InlineError message={error} />
            <StepActions back={() => setStep(2)} next={() => next(4)} nextLabel="Przejdź do podsumowania" disabled={!canContinue} />
          </div>}

          {step === 4 && <div>
            <StepTitle icon="check" title="Sprawdź i wyślij" text="Upewnij się, że dane zgłoszenia są poprawne." />
            <dl className="mt-6 divide-y divide-white/[.06] rounded-2xl border border-white/[.07] bg-white/[.02] px-4">
              {[["Podmiot", entity?.displayName ?? "—"], ["Typ dokumentu", humanize(category)], ["Liczba plików", `${attachments.length} (${(total / 1024 / 1024).toFixed(1)} MB)`]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 py-3.5 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right font-bold text-slate-200">{value}</dd></div>)}
            </dl>
            <label className="mt-5 block"><span className="label">Notatka <span className="font-normal text-slate-600">(opcjonalnie)</span></span><textarea className="field min-h-24 resize-y" maxLength={1000} placeholder="Dodatkowa informacja dla księgowości" value={note} onChange={(event) => setNote(event.target.value)} /></label>
            <InlineError message={error} />
            <div className="mt-6 grid grid-cols-[auto_1fr] gap-2"><button className="button-secondary" onClick={() => setStep(3)}>Wróć</button><button className="button-primary" disabled={busy} onClick={upload}>{busy ? "Bezpiecznie wysyłam…" : "Wyślij dokument"}<Icon name="upload" className="h-4 w-4" /></button></div>
          </div>}

          {step === 5 && result && <div>
            <div className="text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Icon name="check" className="h-8 w-8" /></span><h1 className="mt-5 text-2xl font-bold">Dokument został zapisany</h1><p className="mt-2 text-sm text-slate-400">Możesz bezpiecznie zamknąć tę stronę.</p></div>
            <div className="mt-6 rounded-2xl border border-emerald-400/10 bg-emerald-400/[.035] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[.65rem] font-bold uppercase tracking-wider text-emerald-300/60">Numer zgłoszenia</p><p className="mt-1 font-mono text-lg font-bold text-emerald-100">{result.referenceNumber}</p></div><StatusBadge status={result.status} /></div><p className="mt-3 text-xs text-emerald-100/50">{result.entity} · {humanize(result.category)} · {new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.receivedAt))}</p></div>
            {result.receiptUrl && <a href={result.receiptUrl} className="button-secondary mt-4 w-full">Otwórz potwierdzenie</a>}
            <button className="button-primary mt-2 w-full" onClick={() => { clearAttachments(); setNote(""); setResult(undefined); setStep(1); }}><Icon name="plus" className="h-4 w-4" />Dodaj kolejny dokument</button>
            {history.length > 0 && <details className="group mt-6 border-t border-white/[.06] pt-5"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold">Historia tej sesji <span className="flex items-center gap-2 text-xs text-slate-500">{history.length} zgłoszeń <Icon name="chevron" className="h-4 w-4 transition group-open:rotate-180" /></span></summary><div className="mt-3 grid gap-2">{history.map((item) => <div key={item.referenceNumber} className="flex items-center justify-between rounded-xl bg-white/[.025] p-3"><div><p className="font-mono text-xs font-bold">{item.referenceNumber}</p><p className="mt-1 text-[.65rem] text-slate-600">{item.entity} · {humanize(item.category)}</p></div><StatusBadge status={item.status} /></div>)}</div></details>}
          </div>}
        </div>
      </section>
      <p className="mt-5 text-center text-[.65rem] leading-5 text-slate-600">Połączenie szyfrowane · dokumenty dostępne wyłącznie dla uprawnionych osób</p>
    </main>
  );
}

function StepTitle({ icon, title, text }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; text: string }) {
  return <><span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-300/10 text-amber-300"><Icon name={icon} /></span><h1 className="mt-5 text-2xl font-bold tracking-[-.035em]">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></>;
}

function StepActions({ back, next, nextLabel = "Dalej", disabled = false }: { back: () => void; next: () => void; nextLabel?: string; disabled?: boolean }) {
  return <div className="mt-6 grid grid-cols-[auto_1fr] gap-2"><button className="button-secondary" onClick={back}>Wróć</button><button className="button-primary" onClick={next} disabled={disabled}>{nextLabel}<Icon name="arrow" className="h-4 w-4" /></button></div>;
}

function InlineError({ message }: { message: string }) {
  return message ? <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/10 bg-rose-400/[.07] p-3 text-xs leading-5 text-rose-200"><Icon name="warning" className="mt-0.5 h-4 w-4 flex-none" />{message}</p> : null;
}
