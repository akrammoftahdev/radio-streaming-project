const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const recs = await prisma.recording.findMany({ select: { id: true, localPath: true, presenterNameSnapshot: true, programTitleSnapshot: true }});
  console.log(JSON.stringify(recs, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
