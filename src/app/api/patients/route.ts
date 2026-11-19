import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const digits = q.replace(/\D/g, "");
  const patients = await db.patient.findMany({
    where: {
      clinicId: user.clinicId,
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] }
        : {}),
    },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  return NextResponse.json({ patients });
}
