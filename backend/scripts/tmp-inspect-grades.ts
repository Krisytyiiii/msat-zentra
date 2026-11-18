import { prisma } from "../src/lib/prisma.js";

async function main() {
  const grades = await prisma.finalGrade.findMany({
    select: {
      id: true,
      studentId: true,
      rosterId: true,
      termId: true,
      subjectId: true,
      computedAverage: true,
      transmutedGrade: true,
      lockStatus: true,
      finalizedAt: true,
      subject: { select: { name: true } },
      student: { select: { lrn: true, user: { select: { fullName: true } } } },
    },
    take: 50,
  });
  console.log("final grades:", grades.length);
  for (const g of grades) {
    console.log(
      g.student?.user.fullName ?? g.rosterId,
      g.student?.lrn,
      g.subject.name,
      "term", g.termId,
      "computed", g.computedAverage,
      "transmuted", g.transmutedGrade,
      "lock", g.lockStatus,
      "finalized", g.finalizedAt,
    );
  }

  const terms = await prisma.term.findMany({
    select: { id: true, termNumber: true, schoolYearId: true, schoolYear: { select: { name: true, isActive: true } } },
    orderBy: { termNumber: "asc" },
  });
  console.log("terms", terms);

  const sections = await prisma.section.findMany({
    select: {
      id: true,
      name: true,
      gradeLevel: true,
      students: { select: { userId: true, lrn: true, user: { select: { fullName: true } } } },
      rosterEntries: { select: { id: true, fullName: true, lrn: true } },
    },
  });
  console.dir(sections, { depth: 4 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
