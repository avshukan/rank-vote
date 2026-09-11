import { fork } from 'node:child_process';
import { once } from 'node:events';
import { Agent, get } from 'node:http';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

interface LifecycleMessage {
  type: string;
  port?: number;
  signal?: string;
}

function request(url: string, agent?: Agent): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = get(url, { agent: agent ?? false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (body += chunk));
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${body}`));
        } else resolve(body);
      });
    });
    req.on('error', reject);
    req.setTimeout(5_000, () => req.destroy(new Error('HTTP timeout')));
  });
}

describe('production shutdown lifecycle', () => {
  it.each(['SIGTERM', 'app.close()'] as const)(
    '%s drains HTTP before destroying the real Prisma pool',
    async (shutdown) => {
      const applicationName = `shutdown-${randomUUID()}`;
      const databaseUrl = new URL(process.env.DATABASE_URL!);
      databaseUrl.searchParams.set('application_name', applicationName);
      const observer = new PrismaService();
      const agent = new Agent({ keepAlive: true });
      const child = fork(join(__dirname, 'fixtures/shutdown.cjs'), [], {
        execArgv: [],
        env: { ...process.env, DATABASE_URL: databaseUrl.href },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      const exited = once(child, 'exit');
      const messages: LifecycleMessage[] = [];
      let output = '';
      child.stdout!.on('data', (data: Buffer) => (output += data.toString()));
      child.stderr!.on('data', (data: Buffer) => (output += data.toString()));
      child.on('message', (message: LifecycleMessage) =>
        messages.push(message),
      );

      function waitFor(type: string): Promise<LifecycleMessage> {
        const previous = messages.find((message) => message.type === type);
        if (previous) return Promise.resolve(previous);
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`Waiting for ${type}: ${output}`));
          }, 5_000);
          function cleanup() {
            clearTimeout(timer);
            child.off('message', onMessage);
            child.off('exit', onExit);
          }
          function onMessage(message: LifecycleMessage) {
            if (message.type !== type) return;
            cleanup();
            resolve(message);
          }
          function onExit() {
            cleanup();
            reject(new Error(`Child exited before ${type}: ${output}`));
          }
          child.on('message', onMessage);
          child.on('exit', onExit);
        });
      }

      async function poolConnections(): Promise<number> {
        const [row] = await observer.$queryRaw<{ count: number }[]>`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE application_name = ${applicationName}
        `;
        return row.count;
      }

      let activeRequest: Promise<string> | undefined;
      let shutdownTimeout: NodeJS.Timeout | undefined;
      try {
        await observer.$connect();
        const { port } = await waitFor('ready');
        const baseUrl = `http://127.0.0.1:${port}`;
        expect(await request(`${baseUrl}/api/v1/health`)).toBe(
          '{"status":"ok"}',
        );
        activeRequest = request(`${baseUrl}/__test/active`, agent);
        // Attach a rejection handler immediately; assertions await it below.
        void activeRequest.catch(() => undefined);
        await waitFor('request-active');
        expect(await poolConnections()).toBeGreaterThan(0);

        const shutdownDeadline = new Promise<never>((_resolve, reject) => {
          shutdownTimeout = setTimeout(
            () =>
              reject(
                new Error(
                  `Shutdown exceeded 5 seconds: ${JSON.stringify(messages)} ${output}`,
                ),
              ),
            5_000,
          );
        });
        await Promise.race([
          (async () => {
            if (shutdown === 'SIGTERM')
              expect(child.kill('SIGTERM')).toBe(true);
            else child.send('close');
            await waitFor('draining');
            expect(messages.some((m) => m.type === 'prisma-destroy')).toBe(
              false,
            );
            await expect(
              request(`${baseUrl}/api/v1/health`),
            ).rejects.toMatchObject({
              code: 'ECONNREFUSED',
            });
            child.send('release-request');
            expect(await activeRequest).toBe('[{"answer":42}]');
            const completed = await waitFor('shutdown-complete');
            expect(completed.signal).toBe(
              shutdown === 'SIGTERM' ? 'SIGTERM' : undefined,
            );
            expect(
              messages
                .filter((m) => m.type.startsWith('prisma-'))
                .map((m) => m.type),
            ).toEqual(['prisma-destroy', 'prisma-disconnected']);
            expect(await poolConnections()).toBe(0);
            child.send('release-shutdown');
            // Nest re-raises SIGTERM after its hooks. This is its successful
            // signal exit, whereas app.close() allows a natural zero exit.
            expect(await exited).toEqual(
              shutdown === 'SIGTERM' ? [null, 'SIGTERM'] : [0, null],
            );
          })(),
          shutdownDeadline,
        ]);
      } finally {
        clearTimeout(shutdownTimeout);
        // Failure cleanup only; a forced exit can never satisfy the assertions.
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
          await exited;
        }
        agent.destroy();
        await activeRequest?.catch(() => undefined);
        await observer.$disconnect();
      }
    },
    15_000,
  );
});
