import { randomUUID, createHash } from "node:crypto";
import { lstat, mkdir, open, realpath, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { storageFolderSchema } from "@/lib/validation";
import { HttpError } from "@/lib/security";

const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  "application/pdf": (b) => Buffer.from(b.subarray(0, 5)).toString() === "%PDF-",
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => Buffer.from(b.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  "image/webp": (b) => Buffer.from(b.subarray(0, 4)).toString() === "RIFF" && Buffer.from(b.subarray(8, 12)).toString() === "WEBP",
};
const extensions: Record<string, string> = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

export async function validateUploadFiles(files: File[]) {
  if (files.length < 1 || files.length > 10) throw new HttpError(400, "INVALID_FILE_COUNT", "Dodaj od 1 do 10 plików.");
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > 10 * 1024 * 1024) throw new HttpError(413, "UPLOAD_TOO_LARGE", "Zgłoszenie może mieć maksymalnie 10 MB.");
  const validated: Array<{ file: File; bytes: Buffer; mimeType: string; extension: string }> = [];
  for (const file of files) {
    const mimeType = file.type.toLowerCase(); const check = signatures[mimeType];
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!check || !check(bytes)) throw new HttpError(415, "INVALID_FILE_TYPE", "Dozwolone są pliki JPG, PNG, WEBP i PDF.");
    validated.push({ file, bytes, mimeType, extension: extensions[mimeType] });
  }
  return validated;
}

async function ensureSafeDirectory(folder: string, year: number, month: number) {
  storageFolderSchema.parse(folder);
  const root = path.resolve(env().STORAGE_ROOT); await mkdir(root, { recursive: true });
  const rootReal = await realpath(root);
  const segments = [folder, String(year), String(month).padStart(2, "0")];
  const target = path.resolve(root, ...segments);
  if (!target.startsWith(`${root}${path.sep}`)) throw new HttpError(400, "UNSAFE_PATH", "Nieprawidłowa ścieżka magazynu.");
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment); await mkdir(current, { recursive: true });
    const info = await lstat(current);
    if (info.isSymbolicLink()) {
      const linked = await realpath(current);
      if (linked !== rootReal && !linked.startsWith(`${rootReal}${path.sep}`)) throw new HttpError(500, "UNSAFE_STORAGE", "Magazyn zawiera niedozwolone dowiązanie symboliczne.");
    }
  }
  const targetReal = await realpath(target);
  if (targetReal !== rootReal && !targetReal.startsWith(`${rootReal}${path.sep}`)) throw new HttpError(500, "UNSAFE_STORAGE", "Magazyn plików ma nieprawidłową konfigurację.");
  return { root, target };
}

export async function storageUsage() {
  const root = path.resolve(env().STORAGE_ROOT);
  let used = 0;
  async function walk(directory: string): Promise<void> {
    const { readdir } = await import("node:fs/promises");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(full); else if (entry.isFile()) used += (await stat(full)).size;
    }
  }
  try { await walk(root); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return { used, limit: env().STORAGE_LIMIT_BYTES, percent: Math.round((used / env().STORAGE_LIMIT_BYTES) * 1000) / 10 };
}

export async function persistFiles(input: { folder: string; year: number; month: number; reference: string; files: Awaited<ReturnType<typeof validateUploadFiles>> }) {
  const usage = await storageUsage(); const incoming = input.files.reduce((sum, item) => sum + item.bytes.length, 0);
  if (usage.used + incoming > usage.limit) throw new HttpError(507, "STORAGE_FULL", "Brak miejsca na zapis dokumentu. Skontaktuj się z administratorem.");
  const { root, target } = await ensureSafeDirectory(input.folder, input.year, input.month);
  const written: string[] = [];
  try {
    const records = [];
    for (const [index, item] of input.files.entries()) {
      const storedName = `${input.reference}-${String(index + 1).padStart(2, "0")}-${randomUUID()}${item.extension}`;
      const absolute = path.join(target, storedName);
      const handle = await open(absolute, "wx", 0o640);
      try { await handle.writeFile(item.bytes); await handle.sync(); } finally { await handle.close(); }
      written.push(absolute);
      records.push({ sequence: index + 1, originalName: item.file.name.slice(0, 255), storedName, relativePath: path.relative(root, absolute).replaceAll("\\", "/"), mimeType: item.mimeType, sizeBytes: item.bytes.length, sha256: createHash("sha256").update(item.bytes).digest("hex") });
    }
    return { records, cleanup: async () => Promise.allSettled(written.map((file) => unlink(file))) };
  } catch (error) { await Promise.allSettled(written.map((file) => unlink(file))); throw error; }
}

export async function resolveStoredFile(relativePath: string) {
  const root = path.resolve(env().STORAGE_ROOT); const rootReal = await realpath(root);
  const target = path.resolve(root, relativePath);
  if (!target.startsWith(`${root}${path.sep}`)) throw new HttpError(404, "FILE_NOT_FOUND", "Nie znaleziono pliku.");
  const resolved = await realpath(target);
  if (!resolved.startsWith(`${rootReal}${path.sep}`)) throw new HttpError(404, "FILE_NOT_FOUND", "Nie znaleziono pliku.");
  return resolved;
}
