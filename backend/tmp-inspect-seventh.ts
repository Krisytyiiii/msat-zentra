import { prisma } from "./src/lib/prisma.js";
const rs = await prisma.referral.findMany({
  where: { OR: [ { roster: { lrn: "123245653423" } }, { student: { lrn: "123245653423" } } ] },
  select: { id: true, status: true, referredToRole: true, studentId: true, rosterId: true, anecdotalRecordId: true, consultReviewer: true, referredBy: true, anecdotalRecord: { select: { observationDatetime: true, category: true } } },
  orderBy: { id: "asc" },
});
for (const r of rs) console.log(JSON.stringify(r));
await prisma.$disconnect();
