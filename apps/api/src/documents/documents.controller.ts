import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Post()
  @Roles('OWNER', 'ADMIN', 'GESTOR')
  create(@CurrentUser() user: any, @Body() dto: CreateDocumentDto) {
    return this.svc.create(user.companyId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query() query: PaginationDto & { status?: DocumentStatus; unitId?: string; type?: string; expiringSoon?: string },
  ) {
    // Object.assign preserves the PaginationDto prototype (and its .skip getter)
    const dto = Object.assign(query, { expiringSoon: query.expiringSoon === 'true' } as any);
    return this.svc.findAll(user.companyId, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.findOne(id, user.companyId);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'GESTOR')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: Partial<CreateDocumentDto>) {
    return this.svc.update(id, user.companyId, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'GESTOR')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.remove(id, user.companyId);
  }
}
