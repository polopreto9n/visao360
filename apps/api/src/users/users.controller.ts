import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { UsersService } from "./users.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import { ListUsersDto } from "./dto/list-users.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthenticatedUser } from "../auth/strategies/jwt.strategy";

@ApiTags("Users")
@ApiBearerAuth("jwt")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: "Listar usuarios (filtros: search, role)" })
  findAll(@CurrentUser() u: AuthenticatedUser, @Query() q: ListUsersDto) {
    return this.svc.findAll(u.companyId, q);
  }

  @Get(":id")
  @ApiOperation({ summary: "Obter usuario por ID" })
  findOne(@Param("id") id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.findOne(id, u.companyId, u.role as Role, u.id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Atualizar usuario" })
  update(@Param("id") id: string, @CurrentUser() u: AuthenticatedUser, @Body() dto: UpdateUserDto) {
    return this.svc.update(id, u.companyId, dto, u.role as Role, u.id);
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Desativar usuario (ADMIN)" })
  deactivate(@Param("id") id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.deactivate(id, u.companyId, u.id);
  }
}
