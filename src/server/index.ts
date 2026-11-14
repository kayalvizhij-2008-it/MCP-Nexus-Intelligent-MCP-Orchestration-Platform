import { IS_PROD, PORT } from './config.js';
import { createApp } from './app.js';
import { runMigrations } from './migrations.js';
import { seedDatabase } from './seed.js';
import { autoStartServers, shutdownAll, startHealthLoop } from './mcp/manager.js';

async function main() {
  runMigrations();
  const bootstrap = seedDatabase();
  startHealthLoop();

  const app = createApp();
  const host = process.env.HOST ?? '127.0.0.1';
  const server = app.listen(PORT, host, () => {
    console.log('');
    console.log('  MCPNEXUS control plane');
    console.log(`  → http://${host}:${PORT}`);
    console.log(`  → mode: ${IS_PROD ? 'production' : 'development'}`);
    if (bootstrap?.passwordFile) {
      console.log(`  → first-run admin: ${bootstrap.email}`);
      console.log(`  → generated password written to ${bootstrap.passwordFile}`);
      console.log('  → sign in, change the password, then delete that file');
    } else if (bootstrap) {
      console.log(`  → first-run admin: ${bootstrap.email} (password from MCPNEXUS_ADMIN_PASSWORD)`);
    }
    console.log('');
    // Connect the seeded servers once the listener (and /mcp) is reachable.
    setTimeout(() => {
      void autoStartServers().then(() => {
        console.log('[mcpnexus] auto-start pass complete');
      });
    }, 400);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[mcpnexus] ${signal} received — stopping MCP sessions`);
    await shutdownAll().catch(() => undefined);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 4000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[mcpnexus] failed to start', error);
  process.exit(1);
});
