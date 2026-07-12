import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  type CreatePollDto,
} from '@rank-vote/shared';

/**
 * Request body for POST /api/v1/polls. Implements the shared CreatePollDto so
 * the wire contract stays in sync; class-validator enforces it at the edge.
 */
export class CreatePollBodyDto implements CreatePollDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsArray()
  @ArrayMinSize(MIN_OPTIONS)
  @ArrayMaxSize(MAX_OPTIONS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  options!: string[];
}
