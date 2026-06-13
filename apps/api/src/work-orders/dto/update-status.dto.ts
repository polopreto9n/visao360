import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { WorkOrderStatus } from '@prisma/client';

export class UpdateStatusDto {
  @ApiProperty({ enum: WorkOrderStatus })
  @IsEnum(WorkOrderStatus) declare status: WorkOrderStatus;

  @ApiPropertyOptional({ description: 'Observação sobre a transição de status' })
  @IsString() @IsOptional() notes?: string;

  @ApiPropertyOptional({ description: 'Custo total do serviço (mão de obra + peças)', example: 250.5 })
  @IsNumber() @Min(0) @IsOptional() cost?: number;

  @ApiPropertyOptional({ description: 'Materiais/peças utilizados no serviço' })
  @IsString() @IsOptional() materialsUsed?: string;

  @ApiPropertyOptional({ description: 'URLs de fotos adicionadas nesta transição (ex: antes/depois)', type: [String] })
  @IsArray() @IsString({ each: true }) @IsOptional() photoUrls?: string[];

  @ApiPropertyOptional({ description: 'ID do fornecedor/prestador responsável' })
  @IsString() @IsOptional() supplierId?: string;
}
