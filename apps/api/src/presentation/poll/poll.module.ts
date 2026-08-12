import { Module } from '@nestjs/common';
import { BallotService } from '../../application/ballot/ballot.service';
import { PollService } from '../../application/poll/poll.service';
import { ResultService } from '../../application/result/result.service';
import { PollsController } from './polls.controller';

@Module({
  controllers: [PollsController],
  providers: [PollService, BallotService, ResultService],
})
export class PollModule {}
