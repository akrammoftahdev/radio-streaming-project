import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL
});

async function main() {
  console.log("Connecting to DB to kill ghost sessions...");
  const updated = await prisma.liveSession.updateMany({
    where: { disconnectedAt: null },
    data: { disconnectedAt: new Date(), status: 'IDLE', currentMicState: false }
  });
  console.log(`Killed ${updated.count} ghost sessions.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
