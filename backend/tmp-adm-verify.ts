import { prisma } from "./src/lib/prisma.js";
import { getMyCases } from "./src/services/adm/overview.mycases.service.js";

async function main() {
  const advisers = await prisma.section.findMany({
    where: { adviserId: { not: null } },
    select: { adviserId: true, name: true, adviser: { select: { fullName: true } } },
  });
  if (advisers.length === 0) {
    console.log("no adviser section");
    return;
  }
  const year = await prisma.schoolYear.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  const term = await prisma.term.findFirst({
    where: { schoolYearId: year?.id ?? "" },
    select: { id: true, schoolYearId: true },
    orderBy: { termNumber: "asc" },
  });

  for (const adviser of advisers) {
    if (!adviser.adviserId) continue;
    const res: any = await getMyCases(
      {
        userId: adviser.adviserId,
        role: "adviser",
        termId: term?.id ?? null,
        schoolYearId: term?.schoolYearId ?? null,
      },
      { q: "", page: 1, pageSize: 15, highlight: "", hasPaginationParams: true },
    );
    if (res.total === 0) continue;
    console.log("=== adviser:", adviser.adviser?.fullName, "| section:", adviser.name);
    console.log("total:", res.total, "| monitoring:", res.summary.monitoring);
    for (const c of res.cases) {
      console.log(
        [c.studentName, c.stageLabel, c.referralStatus, c.hasCase ? "case" : "no-case", c.gradeLevel, c.section].join(" | "),
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
