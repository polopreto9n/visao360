import { Controller, Delete, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { NotificationsService } from "./notifications.service";
import { ListNotificationsDto } from "./dto/list-notifications.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/strategies/jwt.strategy";

@ApiTags("Notifications")
@ApiBearerAuth("jwt")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "Listar notificacoes (filtro: unreadOnly=true)" })
  findAll(@CurrentUser() u: AuthenticatedUser, @Query() q: ListNotificationsDto) {
    return this.svc.findAll(u.id, u.companyId, q);
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Contagem de nao lidas" })
  unreadCount(@CurrentUser() u: AuthenticatedUser) {
    return this.svc.getUnreadCount(u.id, u.companyId);
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Marcar como lida" })
  markAsRead(@Param("id") id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.markAsRead(id, u.id, u.companyId);
  }

  @Patch("read-all")
  @ApiOperation({ summary: "Marcar todas como lidas" })
  markAllAsRead(@CurrentUser() u: AuthenticatedUser) {
    return this.svc.markAllAsRead(u.id, u.companyId);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Excluir notificacao" })
  delete(@Param("id") id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.delete(id, u.id, u.companyId);
  }
}
