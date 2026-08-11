import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  type BallotEntryDto,
  type SubmitBallotDto,
} from '@rank-vote/shared';

/** One ranked option in a submitted ballot. */
export class BallotEntryBodyDto implements BallotEntryDto {
  @IsString()
  @IsNotEmpty()
  optionId!: string;

  @IsInt()
  @Min(1)
  rank!: number;
}

/**
 * Request body for POST /api/v1/polls/:id/ballots. Implements the shared
 * SubmitBallotDto so the wire contract stays in sync; class-validator enforces
 * the shape here at the edge. Whether the ranking actually covers this poll's
 * options is a domain rule — see domain/ballot/strict-ranking.ts.
 */
export class SubmitBallotBodyDto implements SubmitBallotDto {
  @IsArray()
  @ArrayMinSize(MIN_OPTIONS)
  @ArrayMaxSize(MAX_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => BallotEntryBodyDto)
  entries!: BallotEntryBodyDto[];
}
