import bot from './bot.js';
import prisma from './prisma.js';

async function main() {
  async function shutdown() {
    console.log('Shutting down...');
    await bot.stop();
    await prisma.$disconnect();
    console.log('Bye!');
    process.exit(0);
  }

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await bot.start();
  console.log('Bot is running...');
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
