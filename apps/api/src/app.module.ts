import { Module } from '@nestjs/common';
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
export class AppModule {}
