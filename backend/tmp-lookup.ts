import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const rows = await prisma.studentRoster.findMany({
  where: { fullName: { contains: "test", mode: "insensitive" } },
  select: {
    fullName: true,
    lrn: true,
    section: { select: { name: true, adviser: { select: { email: true, role: true } } } },
  },
  take: 20,
});
console.log(JSON.stringify(rows, null, 2));
await prisma.$disconnect();
