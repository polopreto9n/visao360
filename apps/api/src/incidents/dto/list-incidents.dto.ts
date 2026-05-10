import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { IncidentSeverity, IncidentStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListIncidentsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: IncidentStatus }) @IsEnum(IncidentStatus) @IsOptional() status?: IncidentStatus;
  @ApiPropertyOptional({ enum: IncidentSeverity }) @IsEnum(IncidentSeverity) @IsOptional() severity?: IncidentSeverity;
  @ApiPropertyOptional() @IsString() @IsOptional() unitId?: string;
}
