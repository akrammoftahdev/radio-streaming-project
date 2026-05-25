const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function main() {
  const passwordHash = await bcrypt.hash('presenter123', 10);
  const user = await prisma.user.create({
    data: {
      username: 'test_presenter',
      passwordHash,
      role: 'PRESENTER',
      name: 'Test Presenter',
      isActive: true,
      canBroadcast: true
    }
  });

  const now = new Date();
  const later = new Date(now.getTime() + 1000 * 60 * 60); // 1 hour from now

  await prisma.broadcastSchedule.create({
    data: {
      presenterId: user.id,
      startDatetime: new Date(now.getTime() - 1000 * 60 * 10), // 10 mins ago
      endDatetime: later,
      allowConnectMinutesBefore: 5,
    }
  });
  console.log('Test presenter seeded.');
}
main().catch(console.error).finally(() => prisma.$disconnect());
