const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    include: { profile: true },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(admins.map(a => ({
    username: a.username,
    avatarUrl: a.profile?.avatarUrl
  })), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
