// Seed system DSP presets into the database.
// Run: npx tsx prisma/seed-dsp-presets.ts
import { PrismaClient } from "@prisma/client";
import { SYSTEM_PRESETS } from "../src/lib/dsp-presets";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding DSP system presets...");

  for (const preset of SYSTEM_PRESETS) {
    await prisma.dspPreset.upsert({
      where: {
        // Use a deterministic ID based on name for idempotent seeding
        id: `system-${preset.name.replace(/\s+/g, '-')}`,
      },
      create: {
        id: `system-${preset.name.replace(/\s+/g, '-')}`,
        name: preset.name,
        isSystem: true,
        presenterId: null,
        params: JSON.stringify(preset.params),
      },
      update: {
        name: preset.name,
        params: JSON.stringify(preset.params),
      },
    });
    console.log(`  ✓ ${preset.name}`);
  }

  console.log(`\nDone! ${SYSTEM_PRESETS.length} system presets seeded.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
