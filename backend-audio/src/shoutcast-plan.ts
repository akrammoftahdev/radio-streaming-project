/**
 * shoutcast-plan.ts
 * --------------------------------------------------------
 * Dry-run SHOUTcast / SonicPanel connection planner.
 *
 * Reads required environment variables, validates they are
 * present, and prints a safe connection plan to the console.
 *
 * Does NOT connect to any server.
 * Does NOT send audio.
 * Does NOT expose the password value.
 *
 * Future step: replace this dry-run with a real TCP source
 * connection to SonicPanel / SHOUTcast using the validated
 * credentials retrieved from the encrypted database fields.
 * --------------------------------------------------------
 */

interface ShoucastPlan {
  host: string;
  port: string;
  password: string;
  sid: string;
  bitrate: string;
}

const REQUIRED_VARS: (keyof ShoucastPlan)[] = [
  'host',
  'port',
  'password',
  'sid',
  'bitrate',
];

function loadPlan(): ShoucastPlan {
  const plan: Partial<ShoucastPlan> = {
    host:     process.env.SHOUTCAST_HOST,
    port:     process.env.SHOUTCAST_PORT,
    password: process.env.SHOUTCAST_PASSWORD,
    sid:      process.env.SHOUTCAST_SID,
    bitrate:  process.env.SHOUTCAST_BITRATE,
  };

  const missing = REQUIRED_VARS.filter(k => !plan[k]);

  if (missing.length > 0) {
    console.error('[Error] Missing required environment variables:');
    missing.forEach(k => {
      const envKey = `SHOUTCAST_${k.toUpperCase()}`;
      console.error(`  - ${envKey}`);
    });
    console.error('\nSet them in backend-audio/.env or export them before running.');
    process.exit(1);
  }

  return plan as ShoucastPlan;
}

function printPlan(plan: ShoucastPlan): void {
  console.log('');
  console.log('SHOUTcast / SonicPanel Connection Plan (Dry Run)');
  console.log('=================================================');
  console.log(`  Host:     ${plan.host}`);
  console.log(`  Port:     ${plan.port}`);
  console.log(`  SID:      ${plan.sid}`);
  console.log(`  Bitrate:  ${plan.bitrate} kbps`);
  console.log(`  Password: ${'*'.repeat(plan.password.length)}`);
  console.log('=================================================');
  console.log('  Status:   DRY RUN — no connection made');
  console.log('  Target:   SonicPanel / SHOUTcast source protocol');
  console.log('  Encoding: MP3 @ 64 kbps (libmp3lame via FFmpeg)');
  console.log('=================================================');
  console.log('');
  console.log('[OK] All required variables are present.');
  console.log('[OK] Ready for real SHOUTcast connection (next phase).');
  console.log('');
}

const plan = loadPlan();
printPlan(plan);
