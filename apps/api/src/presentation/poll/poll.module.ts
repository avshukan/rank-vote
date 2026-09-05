import { Module } from '@nestjs/common';
import { BallotService } from '../../application/ballot/ballot.service';
import { PollService } from '../../application/poll/poll.service';
import { ResultService } from '../../application/result/result.service';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { PollsController } from './polls.controller';

@Module({
  imports: [RateLimitModule],
  controllers: [PollsController],
  providers: [PollService, BallotService, ResultService],
})
export class PollModule {}
