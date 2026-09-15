import { Module, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { HealthModule } from './presentation/health/health.module';
import { PollModule } from './presentation/poll/poll.module';

@Module({
  imports: [PrismaModule, HealthModule, PollModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleDestroy {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  async onModuleDestroy(): Promise<void> {
    // Nest destroys the root module before its imports, but normally closes
    // HTTP only after all destroy hooks. Drain here so Prisma stays available
    // to active requests until they finish, then let Nest destroy its pool.
    await this.httpAdapterHost.httpAdapter.close();
  }
}
