import { parsePhoneNumberFromString } from "libphonenumber-js";
import { z } from "zod";

export const storageFolderSchema = z.string().trim().min(1).max(120).refine((value) =>
  !value.includes("/") && !value.includes("\\") && !value.includes("..") && !/[\u0000-\u001f<>:"|?*]/.test(value), "Nieprawidłowa nazwa folderu");
export const entityCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,40}$/);
export const prefixSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/);

export function normalizePhone(value: string) {
  const trimmed = value.trim();
  const parsed = parsePhoneNumberFromString(trimmed.startsWith("+") ? trimmed : trimmed.replace(/^00/, "+"), trimmed.startsWith("+") || trimmed.startsWith("00") ? undefined : "PL");
  if (!parsed?.isValid()) throw new Error("INVALID_PHONE");
  return parsed.number;
}

export const entityInputSchema = z.object({
  code: entityCodeSchema,
  displayName: z.string().trim().min(1).max(120),
  legalName: z.string().trim().min(1).max(200),
  storageFolderName: storageFolderSchema,
  numberingPrefix: prefixSchema,
  taxId: z.string().trim().max(20).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const employeeInputSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phoneNumber: z.string().transform(normalizePhone),
  entityIds: z.array(z.string().uuid()).min(1),
});
