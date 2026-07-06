import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class PublicReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async getAssetInfo(qrCode: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { qrCode, status: { not: 'DECOMMISSIONED' } },
      select: {
        id: true,
        name: true,
        category: true,
        status: true,
        qrCode: true,
        unit: { select: { id: true, name: true, address: true } },
        company: { select: { id: true, name: true, logoUrl: true } },
      },
    });

    if (!asset) throw new NotFoundException('Equipamento não encontrado ou inativo');

    return {
      assetId: asset.id,
      assetName: asset.name,
      category: asset.category,
      unitName: asset.unit.name,
      unitAddress: asset.unit.address,
      companyName: asset.company.name,
      companyLogoUrl: asset.company.logoUrl,
    };
  }

  async createPublicReport(
    qrCode: string,
    dto: {
      title: string;
      description: string;
      reporterName?: string;
      reporterPhone?: string;
      photoUrl?: string;
    },
  ) {
    const asset = await this.prisma.asset.findFirst({
      where: { qrCode, status: { not: 'DECOMMISSIONED' } },
      include: {
        company: { select: { id: true, name: true, isActive: true } },
        unit: { select: { id: true, name: true } },
      },
    });

    if (!asset) throw new NotFoundException('Equipamento não encontrado');
    if (!asset.company.isActive) throw new BadRequestException('Empresa inativa');

    // Busca o primeiro OWNER da empresa para ser o reporter do sistema
    const systemReporter = await this.prisma.user.findFirst({
      where: { companyId: asset.company.id, role: 'OWNER', isActive: true },
      select: { id: true },
    });

    if (!systemReporter) throw new BadRequestException('Empresa sem usuário ativo');

    const descriptionWithReporter = [
      dto.description,
      dto.reporterName ? `\n\n*Relatado por: ${dto.reporterName}*` : '',
      dto.reporterPhone ? `*Telefone: ${dto.reporterPhone}*` : '',
      '\n*(Reporte público via QR Code)*',
    ].filter(Boolean).join('\n');

    const incident = await this.prisma.incident.create({
      data: {
        companyId: asset.company.id,
        unitId: asset.unit.id,
        reporterId: systemReporter.id,
        title: dto.title,
        description: descriptionWithReporter,
        severity: 'MEDIUM',
        status: 'OPEN',
        photoUrls: dto.photoUrl ? [dto.photoUrl] : [],
      },
    });

    // Notifica gestores
    const managers = await this.prisma.user.findMany({
      where: {
        companyId: asset.company.id,
        isActive: true,
        role: { in: ['OWNER', 'ADMIN', 'GESTOR'] },
      },
      select: { id: true },
    });

    await Promise.all(
      managers.map((m) =>
        this.notifications.create({
          companyId: asset.company.id,
          userId: m.id,
          type: NotificationType.INCIDENT_OPENED,
          title: `⚠️ Reporte via QR: ${dto.title}`,
          body: `${asset.name} — ${asset.unit.name}${dto.reporterName ? ` · ${dto.reporterName}` : ''}`,
          data: { incidentId: incident.id },
        }).catch(() => {}),
      ),
    );

    return {
      success: true,
      incidentId: incident.id,
      message: 'Sua ocorrência foi registrada com sucesso. A equipe de manutenção foi notificada.',
    };
  }
}
