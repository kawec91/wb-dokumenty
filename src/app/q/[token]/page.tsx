import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/security";
import { QuickUpload } from "@/components/quick-upload";

export const dynamic = "force-dynamic";
export default async function QrUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; if (token.length < 32 || token.length > 200) notFound();
  const qr = await db.qrCode.findUnique({ where: { tokenHash: sha256(token) }, select: { name: true, isActive: true } });
  if (!qr?.isActive) notFound();
  return <QuickUpload qrToken={token} qrName={qr.name} />;
}
