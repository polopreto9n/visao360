import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { UnitsService } from '../units/units.service';
import { MonthlyReportDto } from './dto/monthly-report.dto';

const INCIDENT_SEVERITY_LABELS: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

const INCIDENT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta',
  INVESTIGATING: 'Em investigação',
  RESOLVED: 'Resolvida',
  CLOSED: 'Encerrada',
};

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly units: UnitsService,
  ) {}

  async streamMonthlyReport(
    companyId: string,
    dto: MonthlyReportDto,
    res: Response,
    userId?: string,
    userRole?: string,
  ) {
    const unit = await this.prisma.unit.findFirst({
      where: { id: dto.unitId, companyId },
      include: { company: { select: { name: true, logoUrl: true } } },
    });
    if (!unit) throw new NotFoundException('Condomínio não encontrado');

    if ((userRole === 'TECNICO' || userRole === 'CLIENTE') && userId) {
      const unitIds = await this.units.getUserUnitIds(userId);
      if (!unitIds.includes(unit.id)) {
        throw new ForbiddenException('Você não tem acesso a este condomínio');
      }
    }

    const from = new Date(dto.year, dto.month - 1, 1, 0, 0, 0, 0);
    const to = new Date(dto.year, dto.month, 0, 23, 59, 59, 999);
    const inPeriod = { gte: from, lte: to };

    const [
      activeAssets,
      totalAssets,
      workOrdersCreated,
      completedWorkOrders,
      overdueWorkOrders,
      checklistExecutions,
      completedExecutions,
      incidents,
      maintenanceCostAgg,
      overdueMaintenanceAssets,
    ] = await Promise.all([
      this.prisma.asset.count({ where: { companyId, unitId: unit.id, status: 'ACTIVE' } }),
      this.prisma.asset.count({ where: { companyId, unitId: unit.id } }),
      this.prisma.workOrder.count({ where: { companyId, unitId: unit.id, createdAt: inPeriod } }),
      this.prisma.workOrder.findMany({
        where: { companyId, unitId: unit.id, status: 'COMPLETED', completedAt: inPeriod },
        select: {
          code: true, title: true, completedAt: true, cost: true,
          assignee: { select: { name: true } },
          asset: { select: { name: true } },
        },
        orderBy: { completedAt: 'asc' },
      }),
      this.prisma.workOrder.count({
        where: {
          companyId, unitId: unit.id,
          dueDate: { lte: to },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      this.prisma.execution.count({
        where: { companyId, createdAt: inPeriod, OR: [{ checklist: { unitId: unit.id } }, { asset: { unitId: unit.id } }] },
      }),
      this.prisma.execution.count({
        where: {
          companyId, status: 'COMPLETED', completedAt: inPeriod,
          OR: [{ checklist: { unitId: unit.id } }, { asset: { unitId: unit.id } }],
        },
      }),
      this.prisma.incident.findMany({
        where: { companyId, unitId: unit.id, createdAt: inPeriod },
        select: { title: true, severity: true, status: true, createdAt: true, resolvedAt: true },
        orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.workOrder.aggregate({
        where: { companyId, unitId: unit.id, status: 'COMPLETED', completedAt: inPeriod },
        _sum: { cost: true },
      }),
      this.prisma.asset.findMany({
        where: {
          companyId, unitId: unit.id, status: 'ACTIVE',
          nextMaintenanceAt: { lte: to },
        },
        select: { name: true, category: true, nextMaintenanceAt: true },
        orderBy: { nextMaintenanceAt: 'asc' },
      }),
    ]);

    const checklistCompletionRate = checklistExecutions > 0
      ? Math.round((completedExecutions / checklistExecutions) * 100)
      : 0;
    const maintenanceCost = maintenanceCostAgg._sum.cost ?? 0;

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const filename = `relatorio-${unit.name.replace(/[^a-zA-Z0-9]+/g, '-')}-${dto.year}-${String(dto.month).padStart(2, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    this.renderHeader(doc, unit, dto);
    this.renderSummary(doc, {
      activeAssets, totalAssets, workOrdersCreated,
      completedCount: completedWorkOrders.length,
      overdueWorkOrders, checklistExecutions, completedExecutions,
      checklistCompletionRate, maintenanceCost, incidentCount: incidents.length,
    });
    this.renderWorkOrders(doc, completedWorkOrders);
    this.renderIncidents(doc, incidents);
    this.renderOverdueMaintenance(doc, overdueMaintenanceAssets);

    doc.end();
  }

  private renderHeader(
    doc: PDFKit.PDFDocument,
    unit: { name: string; address: string | null; company: { name: string } },
    dto: MonthlyReportDto,
  ) {
    doc.fontSize(18).font('Helvetica-Bold').text('Relatório Mensal de Manutenção');
    doc.fontSize(11).font('Helvetica').fillColor('#475569')
      .text(unit.company.name);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a')
      .text(unit.name, { continued: false });
    if (unit.address) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(unit.address);
    }
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#2563eb')
      .text(`Referência: ${MONTH_NAMES[dto.month - 1]} de ${dto.year}`);
    doc.moveDown(1);
    doc.fillColor('#0f172a');
    this.drawDivider(doc);
  }

  private renderSummary(doc: PDFKit.PDFDocument, s: {
    activeAssets: number; totalAssets: number; workOrdersCreated: number;
    completedCount: number; overdueWorkOrders: number;
    checklistExecutions: number; completedExecutions: number; checklistCompletionRate: number;
    maintenanceCost: number; incidentCount: number;
  }) {
    doc.moveDown(0.5);
    doc.fontSize(13).font('Helvetica-Bold').text('Resumo do período');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');

    const rows: [string, string][] = [
      ['Equipamentos ativos', `${s.activeAssets} de ${s.totalAssets}`],
      ['Ordens de serviço abertas no mês', `${s.workOrdersCreated}`],
      ['Ordens de serviço concluídas no mês', `${s.completedCount}`],
      ['Ordens de serviço vencidas (em aberto)', `${s.overdueWorkOrders}`],
      ['Checklists executados no mês', `${s.checklistExecutions}`],
      ['Checklists concluídos', `${s.completedExecutions} (${s.checklistCompletionRate}%)`],
      ['Ocorrências registradas no mês', `${s.incidentCount}`],
      ['Custo de manutenção no mês', `R$ ${s.maintenanceCost.toFixed(2)}`],
    ];

    for (const [label, value] of rows) {
      doc.font('Helvetica').fillColor('#475569').text(label, { continued: true, width: 350 });
      doc.font('Helvetica-Bold').fillColor('#0f172a').text(`  ${value}`, { align: 'right' });
    }

    doc.fillColor('#0f172a');
    doc.moveDown(1);
    this.drawDivider(doc);
  }

  private renderWorkOrders(doc: PDFKit.PDFDocument, workOrders: {
    code: string; title: string; completedAt: Date | null; cost: number | null;
    assignee: { name: string } | null; asset: { name: string } | null;
  }[]) {
    doc.moveDown(0.5);
    doc.fontSize(13).font('Helvetica-Bold').text('Manutenções realizadas');
    doc.moveDown(0.3);

    if (workOrders.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Nenhuma ordem de serviço concluída neste período.');
      doc.fillColor('#0f172a');
    } else {
      for (const wo of workOrders) {
        this.ensureSpace(doc, 40);
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a')
          .text(`${wo.code} — ${wo.title}`);
        const details = [
          wo.asset ? `Equipamento: ${wo.asset.name}` : null,
          wo.assignee ? `Responsável: ${wo.assignee.name}` : null,
          wo.completedAt ? `Concluída em: ${this.formatDate(wo.completedAt)}` : null,
          wo.cost != null ? `Custo: R$ ${wo.cost.toFixed(2)}` : null,
        ].filter(Boolean).join('  ·  ');
        doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(details);
        doc.moveDown(0.4);
      }
      doc.fillColor('#0f172a');
    }

    doc.moveDown(0.5);
    this.drawDivider(doc);
  }

  private renderIncidents(doc: PDFKit.PDFDocument, incidents: {
    title: string; severity: string; status: string; createdAt: Date; resolvedAt: Date | null;
  }[]) {
    doc.moveDown(0.5);
    doc.fontSize(13).font('Helvetica-Bold').text('Ocorrências do período');
    doc.moveDown(0.3);

    if (incidents.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Nenhuma ocorrência registrada neste período.');
      doc.fillColor('#0f172a');
    } else {
      for (const incident of incidents) {
        this.ensureSpace(doc, 40);
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a')
          .text(`${incident.title} (${INCIDENT_SEVERITY_LABELS[incident.severity] ?? incident.severity})`);
        const details = [
          `Status: ${INCIDENT_STATUS_LABELS[incident.status] ?? incident.status}`,
          `Aberta em: ${this.formatDate(incident.createdAt)}`,
          incident.resolvedAt ? `Resolvida em: ${this.formatDate(incident.resolvedAt)}` : null,
        ].filter(Boolean).join('  ·  ');
        doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(details);
        doc.moveDown(0.4);
      }
      doc.fillColor('#0f172a');
    }

    doc.moveDown(0.5);
    this.drawDivider(doc);
  }

  private renderOverdueMaintenance(doc: PDFKit.PDFDocument, assets: {
    name: string; category: string; nextMaintenanceAt: Date | null;
  }[]) {
    doc.moveDown(0.5);
    doc.fontSize(13).font('Helvetica-Bold').text('Manutenções pendentes');
    doc.moveDown(0.3);

    if (assets.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Nenhum equipamento com manutenção pendente até o fim do período.');
      doc.fillColor('#0f172a');
    } else {
      for (const asset of assets) {
        this.ensureSpace(doc, 20);
        doc.fontSize(10).font('Helvetica').fillColor('#0f172a')
          .text(`${asset.name} (${asset.category})`, { continued: true, width: 350 });
        doc.font('Helvetica-Bold').fillColor('#dc2626')
          .text(`  Prevista: ${asset.nextMaintenanceAt ? this.formatDate(asset.nextMaintenanceAt) : '-'}`, { align: 'right' });
      }
      doc.fillColor('#0f172a');
    }
  }

  private drawDivider(doc: PDFKit.PDFDocument) {
    const y = doc.y;
    doc.moveTo(doc.page.margins.left, y)
      .lineTo(doc.page.width - doc.page.margins.right, y)
      .strokeColor('#e2e8f0').lineWidth(1).stroke();
    doc.moveDown(0.5);
  }

  private ensureSpace(doc: PDFKit.PDFDocument, height: number) {
    if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
  }

  private formatDate(date: Date) {
    return date.toLocaleDateString('pt-BR');
  }
}
