// Test-only HTTP/IPC instrumentation around the compiled production modules.
// This file is not included in dist or the runtime image.
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const {
  PrismaService,
} = require('../../dist/infrastructure/prisma/prisma.service');

function report(type, details = {}) {
  return new Promise((resolve, reject) => {
    process.send({ type, ...details }, (error) =>
      error ? reject(error) : resolve(),
    );
  });
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  const prisma = app.get(PrismaService);
  const server = app.getHttpServer();
  let releaseRequest;
  let releaseShutdown;
  const requestGate = new Promise((resolve) => (releaseRequest = resolve));
  const shutdownGate = new Promise((resolve) => (releaseShutdown = resolve));

  const destroy = prisma.onModuleDestroy.bind(prisma);
  prisma.onModuleDestroy = async () => {
    await report('prisma-destroy');
    await destroy();
    await report('prisma-disconnected');
  };

  const close = server.close.bind(server);
  server.close = (...args) => {
    const result = close(...args);
    if (!server.listening) void report('draining');
    return result;
  };

  app.get(AppModule).onApplicationShutdown = async (signal) => {
    await report('shutdown-complete', { signal });
    // Keep the process alive so the parent can inspect the disconnected pool
    // before allowing Nest to finish its own signal handling.
    await shutdownGate;
    process.disconnect();
  };

  app.use('/__test/active', async (_request, response, next) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await report('request-active');
      await requestGate;
      // The request still needs its real database after draining has begun.
      const rows = await prisma.$queryRaw`SELECT 42::int AS answer`;
      response.json(rows);
    } catch (error) {
      next(error);
    }
  });

  process.on('message', (message) => {
    if (message === 'release-request') releaseRequest();
    if (message === 'release-shutdown') releaseShutdown();
    if (message === 'close') void app.close();
  });

  await app.listen(0, '127.0.0.1');
  await report('ready', { port: server.address().port });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  if (process.connected) process.disconnect();
});
