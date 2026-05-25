module.exports = {
  apps: [
    {
      name: "frontend",
      script: "npm",
      args: "start",
      cwd: "./frontend",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    },
    {
      name: "backend-audio",
      script: "npm",
      args: "start",
      cwd: "./backend-audio",
      env: {
        NODE_ENV: "production",
        PORT: 8080,
        GOOGLE_APPLICATION_CREDENTIALS: "../infra/gcp-service-account.json",
        SHOUTCAST_HOST: "127.0.0.1",
        SHOUTCAST_PORT: 8000
      }
    }
  ]
};
