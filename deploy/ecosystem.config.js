// ============================================================
// EGONAIR — PM2 Ecosystem Configuration
// File: ~/apps/egonair-stream/ecosystem.config.js
//
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup   (then run the printed command)
// ============================================================

module.exports = {
  apps: [
    {
      // ── Next.js Frontend ─────────────────────────────────────
      name: 'egonair-frontend',
      script: 'node_modules/.bin/next',
      args: 'start --port 3000 --hostname 127.0.0.1',
      cwd: '/home/<YOUR_CPANEL_USER>/apps/egonair-stream/frontend',

      // Single instance — SQLite is single-writer; do NOT use cluster mode
      instances: 1,
      exec_mode: 'fork',

      // Env
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // Logging
      out_file: '/home/<YOUR_CPANEL_USER>/logs/egonair/frontend-out.log',
      error_file: '/home/<YOUR_CPANEL_USER>/logs/egonair/frontend-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      // Restart behavior
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,     // ms between restarts
      min_uptime: '10s',       // must stay up 10s to count as a successful start

      // Memory guard — restart if over 1 GB (adjust based on your traffic)
      max_memory_restart: '1G',

      // Watch — disabled in production (use manual pm2 reload)
      watch: false,
    },

    {
      // ── backend-audio WebSocket Service ──────────────────────
      name: 'egonair-audio',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--require ts-node/register',
      cwd: '/home/<YOUR_CPANEL_USER>/apps/egonair-stream/backend-audio',

      // Single instance — one audio gateway per server
      instances: 1,
      exec_mode: 'fork',

      // Env
      env_production: {
        NODE_ENV: 'production',
        TS_NODE_PROJECT: 'tsconfig.json',
      },

      // Logging
      out_file: '/home/<YOUR_CPANEL_USER>/logs/egonair/audio-out.log',
      error_file: '/home/<YOUR_CPANEL_USER>/logs/egonair/audio-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      // Restart behavior
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,     // slightly longer — avoids SHOUTcast reconnect storms
      min_uptime: '10s',

      max_memory_restart: '512M',

      watch: false,
    },
  ],
};
