import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32),
  HASH_SECRET: z.string().min(16),
  STORAGE_ROOT: z.string().min(1),
  STORAGE_LIMIT_BYTES: z.coerce.number().int().positive().default(5 * 1024 ** 3),
  WB_AUTH_BASE_URL: z.string().url(),
  WB_AUTH_ISSUER: z.string().url(),
  WB_AUTH_AUDIENCE: z.string().min(1).default("wb-api"),
  WB_AUTH_CLIENT_ID: z.string().min(1),
  WB_AUTH_CLIENT_SECRET: z.string().optional().default(""),
  WB_AUTH_REDIRECT_URI: z.string().url(),
  WB_AUTH_TENANT_ID: z.string().uuid().optional().or(z.literal("")),
  WB_AUTH_APPLICATION_ID: z.string().uuid().optional().or(z.literal("")),
  WB_AUTH_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(8_000),
});

let cached: z.infer<typeof schema> | undefined;
export function env() {
  cached ??= schema.parse(process.env);
  return cached;
}

export function resetEnvForTests() { cached = undefined; }
