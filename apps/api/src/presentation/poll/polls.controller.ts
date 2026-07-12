import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { PollResponseDto } from '@rank-vote/shared';
import { PollService } from '../../application/poll/poll.service';
import { CreatePollBodyDto } from './dto/create-poll.dto';

@Controller('polls')
export class PollsController {
  constructor(private readonly pollService: PollService) {}

  /** POST /api/v1/polls → 201 Created */
  @Post()
  createPoll(@Body() body: CreatePollBodyDto): Promise<PollResponseDto> {
    return this.pollService.createPoll(body);
  }

  /** GET /api/v1/polls/:id → 200 OK, or 404 if not found */
  @Get(':id')
  getPoll(@Param('id') id: string): Promise<PollResponseDto> {
    return this.pollService.getPoll(id);
  }
}
