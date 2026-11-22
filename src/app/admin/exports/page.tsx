import { db } from "@/lib/db";
import { adminPageContext } from "@/lib/admin-page";
import { ExportForm } from "@/components/admin-forms";
import { formatWarsaw } from "@/lib/time";

export const dynamic = "force-dynamic";
export default async function ExportsPage() { const context = await adminPageContext("DOCUMENT_EXPORT"); const [entities, exports] = await Promise.all([db.entity.findMany({ where: { id: { in: [...context.entityIds] }, isActive: true }, orderBy: { displayName: "asc" } }), db.accountingExport.findMany({ where: { requestedById: context.membership.id }, orderBy: { createdAt: "desc" }, take: 50, include: { entity: true } })]); return <><h1 className="text-3xl font-semibold">Eksporty</h1><p className="mt-2 text-slate-400">Oryginały w strukturze podmiotów wraz z manifestem CSV.</p><div className="mt-6"><ExportForm entities={entities} /></div><div className="mt-6 grid gap-2">{exports.map((item) => <div key={item.id} className="card flex flex-wrap justify-between gap-2 p-4 text-sm"><span>{item.entity?.displayName ?? "Wszystkie podmioty"} · {item.year}{item.month ? `/${String(item.month).padStart(2, "0")}` : ""}</span><span className="text-slate-400">{item.status} · {item.fileCount} plików · {formatWarsaw(item.createdAt)}</span></div>)}</div></>; }
