import { prisma } from "./src/lib/prisma.js";
const all = await prisma.admParentMeeting.findMany({
  select: { id: true, attended: true, meetingDatetime: true, venue: true, referralId: true, admLearnerProfileId: true },
  orderBy: { meetingDatetime: "desc" },
});
console.log("ALL MEETINGS", all.length);
for (const m of all) console.log(JSON.stringify(m));
const byProfile = new Map<string, any[]>();
for (const m of all) {
  const k = m.admLearnerProfileId ?? `ref:${m.referralId}`;
  byProfile.set(k, [...(byProfile.get(k) ?? []), m]);
}
for (const [k, list] of byProfile) if (list.length > 1) console.log("MULTI", k, JSON.stringify(list));
await prisma.$disconnect();
