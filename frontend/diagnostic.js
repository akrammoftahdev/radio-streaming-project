const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const djs = await prisma.user.findMany({
    where: { role: 'PRESENTER', presenterMode: 'DIRECT_DJ' },
    include: {
      directDjRadios: true,
      liveSessions: { orderBy: { connectedAt: 'desc' }, take: 5 },
      recordings: { orderBy: { startedAt: 'desc' }, take: 5 }
    }
  });

  for (const dj of djs) {
    if (dj.directDjRadios.length > 0 || dj.liveSessions.length > 0) {
      console.log("\n=== USER ===");
      console.log(`id: ${dj.id}, username: ${dj.username}, role: ${dj.role}, mode: ${dj.presenterMode}, active: ${dj.isActive}`);

      console.log("=== RADIOS ===");
      dj.directDjRadios.forEach(r => {
        console.log(`id: ${r.id}, name: ${r.radioName}, host: ${r.host}, port: ${r.port}, active: ${r.isActive}`);
      });

      console.log("=== LATEST SESSIONS ===");
      dj.liveSessions.forEach(s => {
        console.log(`id: ${s.id}, status: ${s.status}, conn: ${s.connectedAt}, disconn: ${s.disconnectedAt}, reason: ${s.disconnectReason}`);
      });
      
      console.log("=== LATEST RECORDINGS ===");
      dj.recordings.forEach(r => {
        console.log(`id: ${r.id}, path: ${r.localPath}, bytes: ${r.bytesReceived}, radioId: ${r.directDjRadioId}`);
      });
    }
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
