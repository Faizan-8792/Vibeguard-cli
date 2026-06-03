// Main entry point - imports everything
import { startServer } from './server.js';
import { connectDB } from './database.js';
import { setupAuth } from './auth.js';

async function main() {
  await connectDB();
  setupAuth();
  startServer();
}

main();
