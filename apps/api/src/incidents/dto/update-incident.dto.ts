import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { IncidentSeverity, IncidentStatus } from '@prisma/client';

const TRANSITIONS: Record<string, IncidentStatus[]> = {
  OPEN: [IncidentStatus.INVESTIGATING, IncidentStatus.RESOLVED, IncidentStatus.CLOSED],
  INVESTIGATING: [IncidentStatus.RESOLVED, IncidentStatus.CLOSED],
  RESOLVED: [IncidentStatus.CLOSED, IncidentStatus.OPEN],
  CLOSED: [IncidentStatus.OPEN],
};

export { TRANSITIONS as INCIDENT_TRANSITIONS };

export class UpdateIncidentStatusDto {
  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsEnum(IncidentStatus) @IsOptional()
  status?: IncidentStatus;

  @ApiPropertyOptional({ enum: IncidentSeverity })
  @IsEnum(IncidentSeverity) @IsOptional()
  severity?: IncidentSeverity;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  notes?: string;
}
