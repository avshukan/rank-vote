import { Module } from '@nestjs/common';
import { PollService } from '../../application/poll/poll.service';
import { PollsController } from './polls.controller';

@Module({
  controllers: [PollsController],
  providers: [PollService],
})
export class PollModule {}
