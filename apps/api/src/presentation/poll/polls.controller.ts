import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type {
  BallotResponseDto,
  PollResponseDto,
  PollResultsResponseDto,
} from '@rank-vote/shared';
import { BallotService } from '../../application/ballot/ballot.service';
import { PollService } from '../../application/poll/poll.service';
import { ResultService } from '../../application/result/result.service';
import { CreatePollBodyDto } from './dto/create-poll.dto';
import { SubmitBallotBodyDto } from './dto/submit-ballot.dto';

@Controller('polls')
export class PollsController {
  constructor(
    private readonly pollService: PollService,
    private readonly ballotService: BallotService,
    private readonly resultService: ResultService,
  ) {}

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

  /** GET /api/v1/polls/:id/results → 200 OK, or 404 if not found */
  @Get(':id/results')
  getResults(@Param('id') id: string): Promise<PollResultsResponseDto> {
    return this.resultService.getResults(id);
  }

  /** POST /api/v1/polls/:id/ballots → 201 Created, 400 invalid, 404 no poll */
  @Post(':id/ballots')
  submitBallot(
    @Param('id') id: string,
    @Body() body: SubmitBallotBodyDto,
  ): Promise<BallotResponseDto> {
    return this.ballotService.submitBallot(id, body);
  }
}
