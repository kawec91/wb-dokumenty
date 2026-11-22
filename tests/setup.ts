import path from "node:path";
import os from "node:os";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "test-session-secret-with-more-than-32-characters";
process.env.HASH_SECRET ??= "test-hash-secret-with-more-than-16-characters";
process.env.STORAGE_ROOT ??= path.join(os.tmpdir(), "wb-dokumenty-tests");
process.env.STORAGE_LIMIT_BYTES ??= String(50 * 1024 * 1024);
process.env.WB_AUTH_BASE_URL ??= "https://auth.example.test";
process.env.WB_AUTH_ISSUER ??= "https://auth.example.test";
process.env.WB_AUTH_AUDIENCE ??= "wb-api";
process.env.WB_AUTH_CLIENT_ID ??= "wb-dokumenty";
process.env.WB_AUTH_REDIRECT_URI ??= "http://localhost:3000/api/auth/callback";
