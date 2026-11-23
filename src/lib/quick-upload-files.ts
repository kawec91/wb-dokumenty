export const MAX_UPLOAD_FILES = 10;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const SUPPORTED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

export function uploadFileError(file: File) {
  const mimeType = file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (file.size === 0) return "Plik jest pusty. Zrób zdjęcie ponownie lub wybierz inny plik.";
  if (HEIC_TYPES.has(mimeType) || extension === "heic" || extension === "heif") {
    return "Format HEIC/HEIF nie jest obsługiwany. W aparacie wybierz format JPEG lub wyeksportuj zdjęcie jako JPG, PNG albo WebP.";
  }
  if (!SUPPORTED_UPLOAD_TYPES.has(mimeType)) {
    return mimeType
      ? `Format ${mimeType} nie jest obsługiwany. Dozwolone są JPG, PNG, WebP i PDF.`
      : "Nie udało się rozpoznać formatu pliku. Dozwolone są JPG, PNG, WebP i PDF.";
  }
  if (file.size > MAX_UPLOAD_BYTES) return "Ten plik przekracza limit 10 MB.";
  return null;
}

export function isPreviewableImage(file: File) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type.toLowerCase());
}

export function buildQuickUploadFormData(input: {
  entityId: string;
  category: string;
  note: string;
  files: File[];
}) {
  const body = new FormData();
  body.set("entityId", input.entityId);
  body.set("category", input.category);
  body.set("note", input.note);
  input.files.forEach((file) => body.append("files", file));
  return body;
}
