import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { UnitsService } from '../units/units.service';
import { MonthlyReportDto } from './dto/monthly-report.dto';

const C = {
  primary: '#1e40af',
  primaryLight: '#dbeafe',
  primaryDark: '#1e3a8a',
  accent: '#f97316',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  success: '#16a34a',
  successLight: '#dcfce7',
  warning: '#ca8a04',
  warningLight: '#fef9c3',
  text: '#0f172a',
  textMuted: '#475569',
  textLight: '#94a3b8',
  border: '#e2e8f0',
  bg: '#f8fafc',
  white: '#ffffff',
  rowAlt: '#f1f5f9',
};

const SEVERITY_COLORS: Record<string, string> = {
  LOW: C.success,
  MEDIUM: C.warning,
  HIGH: C.accent,
  CRITICAL: C.danger,
};

const INCIDENT_SEVERITY_LABELS: Record<string, string> = {
  LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica',
};

const INCIDENT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta', INVESTIGATING: 'Investigando', RESOLVED: 'Resolvida', CLOSED: 'Encerrada',
};

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type Doc = PDFKit.PDFDocument;
const PAGE_MARGIN = 50;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const HEADER_HEIGHT = 115;

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
    const today = new Date();
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
      activeAssets, totalAssets, workOrdersCreated, completedWorkOrders,
      overdueWorkOrders, checklistExecutions, completedExecutions,
      incidents, maintenanceCostAgg, overdueMaintenanceAssets, expiringDocuments,
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
          companyId, unitId: unit.id, dueDate: { lte: to },
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
        where: { companyId, unitId: unit.id, status: 'ACTIVE', nextMaintenanceAt: { lte: to } },
        select: { name: true, category: true, nextMaintenanceAt: true },
        orderBy: { nextMaintenanceAt: 'asc' },
      }),
      this.prisma.document.findMany({
        where: { companyId, unitId: unit.id, isActive: true, expiryDate: { not: null, lte: in30Days } },
        select: { name: true, type: true, expiryDate: true, status: true },
        orderBy: { expiryDate: 'asc' },
        take: 10,
      }),
    ]);

    const checklistCompletionRate = checklistExecutions > 0
      ? Math.round((completedExecutions / checklistExecutions) * 100) : 0;
    const maintenanceCost = maintenanceCostAgg._sum.cost ?? 0;

    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
    const filename = `relatorio-${unit.name.replace(/[^a-zA-Z0-9]+/g, '-')}-${dto.year}-${String(dto.month).padStart(2, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    this.renderCoverHeader(doc, unit, dto);
    this.renderKpiCards(doc, {
      completedCount: completedWorkOrders.length,
      overdueWorkOrders, incidentCount: incidents.length, maintenanceCost,
    });
    this.renderSummaryTable(doc, {
      activeAssets, totalAssets, workOrdersCreated,
      completedCount: completedWorkOrders.length, overdueWorkOrders,
      checklistExecutions, completedExecutions, checklistCompletionRate,
      maintenanceCost, incidentCount: incidents.length,
    });
    this.renderWorkOrdersTable(doc, completedWorkOrders);
    this.renderIncidentsTable(doc, incidents);
    this.renderOverdueMaintenance(doc, overdueMaintenanceAssets);
    if (expiringDocuments.length > 0) {
      this.renderExpiringDocuments(doc, expiringDocuments);
    }

    const range = doc.bufferedPageRange();
    const totalPages = range.count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(range.start + i);
      this.renderFooter(doc, i + 1, totalPages, unit.company.name);
    }

    doc.end();
  }

  private renderCoverHeader(
    doc: Doc,
    unit: { name: string; address: string | null; company: { name: string } },
    dto: MonthlyReportDto,
  ) {
    // Blue banner
    doc.save();
    doc.rect(0, 0, PAGE_WIDTH, HEADER_HEIGHT).fill(C.primary);

    // Subtle decorative stripe
    doc.rect(0, HEADER_HEIGHT - 6, PAGE_WIDTH, 6).fill(C.primaryDark);

    // Company name
    doc.fillColor(C.primaryLight).fontSize(8).font('Helvetica')
      .text(unit.company.name.toUpperCase(), PAGE_MARGIN, 22, { width: CONTENT_WIDTH - 140, characterSpacing: 0.5 });

    // Report title
    doc.fillColor(C.white).fontSize(17).font('Helvetica-Bold')
      .text('Relatório Mensal de Manutenção', PAGE_MARGIN, 36, { width: CONTENT_WIDTH - 140 });

    // Unit name
    doc.fillColor(C.primaryLight).fontSize(10).font('Helvetica')
      .text(unit.name, PAGE_MARGIN, 62, { width: CONTENT_WIDTH - 140 });

    // Period badge (right side)
    const period = `${MONTH_NAMES[dto.month - 1]} / ${dto.year}`;
    doc.roundedRect(PAGE_WIDTH - PAGE_MARGIN - 125, 30, 125, 38, 5).fill(C.primaryDark);
    doc.fillColor(C.white).fontSize(12).font('Helvetica-Bold')
      .text(period, PAGE_WIDTH - PAGE_MARGIN - 121, 43, { width: 117, align: 'center' });

    doc.restore();

    // Position cursor below header, in margin area
    doc.text('', PAGE_MARGIN, HEADER_HEIGHT + 12);

    // Address
    if (unit.address) {
      doc.fillColor(C.textMuted).fontSize(8).font('Helvetica')
        .text(unit.address, PAGE_MARGIN, HEADER_HEIGHT + 12, { width: CONTENT_WIDTH });
      doc.moveDown(0.4);
    }

    // Generated at
    const now = new Date();
    const genLabel = `Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    doc.fillColor(C.textLight).fontSize(7).font('Helvetica')
      .text(genLabel, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'right' });
    doc.moveDown(1.2);
  }

  private renderKpiCards(doc: Doc, data: {
    completedCount: number; overdueWorkOrders: number;
    incidentCount: number; maintenanceCost: number;
  }) {
    this.ensureSpace(doc, 82);
    const gap = 8;
    const cardW = (CONTENT_WIDTH - gap * 3) / 4;
    const cardH = 66;
    const startY = doc.y;

    const cards = [
      {
        label: 'OS Concluídas', value: String(data.completedCount),
        accent: C.primary, bg: C.primaryLight,
      },
      {
        label: 'OS Vencidas', value: String(data.overdueWorkOrders),
        accent: data.overdueWorkOrders > 0 ? C.danger : C.success,
        bg: data.overdueWorkOrders > 0 ? C.dangerLight : C.successLight,
      },
      {
        label: 'Ocorrências', value: String(data.incidentCount),
        accent: data.incidentCount > 0 ? C.accent : C.success,
        bg: data.incidentCount > 0 ? '#fff7ed' : C.successLight,
      },
      {
        label: 'Custo Total', value: `R$ ${this.fmtCurrency(data.maintenanceCost)}`,
        accent: C.text, bg: C.bg,
      },
    ];

    for (let i = 0; i < cards.length; i++) {
      const x = PAGE_MARGIN + i * (cardW + gap);
      const card = cards[i];
      doc.roundedRect(x, startY, cardW, cardH, 5).fill(card.bg);
      doc.rect(x, startY, 4, cardH).fill(card.accent);

      doc.fillColor(card.accent).fontSize(20).font('Helvetica-Bold')
        .text(card.value, x + 12, startY + 10, { width: cardW - 18, lineBreak: false });
      doc.fillColor(C.textMuted).fontSize(7.5).font('Helvetica')
        .text(card.label.toUpperCase(), x + 12, startY + 41, { width: cardW - 18, characterSpacing: 0.3 });
    }

    doc.text('', PAGE_MARGIN, startY + cardH + 14);
  }

  private renderSummaryTable(doc: Doc, s: {
    activeAssets: number; totalAssets: number; workOrdersCreated: number;
    completedCount: number; overdueWorkOrders: number; checklistExecutions: number;
    completedExecutions: number; checklistCompletionRate: number;
    maintenanceCost: number; incidentCount: number;
  }) {
    this.renderSectionHeader(doc, 'Resumo do Período');

    const rows: [string, string, boolean][] = [
      ['Equipamentos ativos', `${s.activeAssets} de ${s.totalAssets}`, false],
      ['Ordens de serviço abertas no mês', String(s.workOrdersCreated), false],
      ['Ordens de serviço concluídas no mês', String(s.completedCount), false],
      ['Ordens de serviço vencidas (em aberto)', String(s.overdueWorkOrders), s.overdueWorkOrders > 0],
      ['Checklists executados no mês', String(s.checklistExecutions), false],
      ['Checklists concluídos', `${s.completedExecutions} (${s.checklistCompletionRate}%)`, false],
      ['Ocorrências registradas no mês', String(s.incidentCount), s.incidentCount > 0],
      ['Custo de manutenção no mês', `R$ ${this.fmtCurrency(s.maintenanceCost)}`, false],
    ];

    const rowH = 22;
    const col1W = CONTENT_WIDTH * 0.65;

    for (let i = 0; i < rows.length; i++) {
      this.ensureSpace(doc, rowH + 2);
      const [label, value, isAlert] = rows[i];
      const rowY = doc.y;
      doc.rect(PAGE_MARGIN, rowY, CONTENT_WIDTH, rowH).fill(i % 2 === 0 ? C.white : C.rowAlt);
      doc.fillColor(isAlert ? C.danger : C.textMuted).fontSize(9).font('Helvetica')
        .text(label, PAGE_MARGIN + 8, rowY + 6, { width: col1W - 10, lineBreak: false });
      doc.fillColor(isAlert ? C.danger : C.text).font('Helvetica-Bold')
        .text(value, PAGE_MARGIN + col1W, rowY + 6, { width: CONTENT_WIDTH - col1W - 8, align: 'right', lineBreak: false });
      doc.text('', PAGE_MARGIN, rowY + rowH);
    }

    doc.moveDown(0.8);
  }

  private renderWorkOrdersTable(doc: Doc, workOrders: {
    code: string; title: string; completedAt: Date | null; cost: number | null;
    assignee: { name: string } | null; asset: { name: string } | null;
  }[]) {
    this.renderSectionHeader(doc, 'Manutenções Realizadas no Período');

    if (workOrders.length === 0) {
      doc.fillColor(C.textMuted).fontSize(9).font('Helvetica')
        .text('Nenhuma ordem de serviço concluída neste período.', PAGE_MARGIN, doc.y);
      doc.moveDown(1.2);
      return;
    }

    const codeW = 75, dateW = 78, assigneeW = 95, assetW = 95, costW = 72;
    const titleW = CONTENT_WIDTH - codeW - dateW - assigneeW - assetW - costW;

    this.ensureSpace(doc, 28);
    const hY = doc.y;
    doc.rect(PAGE_MARGIN, hY, CONTENT_WIDTH, 22).fill(C.primary);
    doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold');

    let cx = PAGE_MARGIN + 6;
    doc.text('CÓDIGO', cx, hY + 7, { width: codeW - 6, lineBreak: false }); cx += codeW;
    doc.text('TÍTULO', cx, hY + 7, { width: titleW, lineBreak: false }); cx += titleW;
    doc.text('RESPONSÁVEL', cx, hY + 7, { width: assigneeW, lineBreak: false }); cx += assigneeW;
    doc.text('EQUIPAMENTO', cx, hY + 7, { width: assetW, lineBreak: false }); cx += assetW;
    doc.text('CONCLUÍDA', cx, hY + 7, { width: dateW, lineBreak: false }); cx += dateW;
    doc.text('CUSTO', cx, hY + 7, { width: costW - 6, align: 'right', lineBreak: false });
    doc.text('', PAGE_MARGIN, hY + 22);

    for (let i = 0; i < workOrders.length; i++) {
      const wo = workOrders[i];
      const rowH = 22;
      this.ensureSpace(doc, rowH + 2);
      const rowY = doc.y;
      doc.rect(PAGE_MARGIN, rowY, CONTENT_WIDTH, rowH).fill(i % 2 === 0 ? C.white : C.rowAlt);

      cx = PAGE_MARGIN + 6;
      doc.fillColor(C.primary).fontSize(7.5).font('Helvetica-Bold')
        .text(wo.code, cx, rowY + 7, { width: codeW - 6, lineBreak: false }); cx += codeW;
      doc.fillColor(C.text).font('Helvetica')
        .text(wo.title, cx, rowY + 7, { width: titleW, lineBreak: false, ellipsis: true }); cx += titleW;
      doc.text(wo.assignee?.name ?? '—', cx, rowY + 7, { width: assigneeW, lineBreak: false, ellipsis: true }); cx += assigneeW;
      doc.text(wo.asset?.name ?? '—', cx, rowY + 7, { width: assetW, lineBreak: false, ellipsis: true }); cx += assetW;
      doc.fillColor(C.textMuted)
        .text(wo.completedAt ? this.fmtDate(wo.completedAt) : '—', cx, rowY + 7, { width: dateW, lineBreak: false }); cx += dateW;
      doc.fillColor(C.text).font('Helvetica-Bold')
        .text(wo.cost != null ? `R$ ${this.fmtCurrency(wo.cost)}` : '—', cx, rowY + 7, { width: costW - 6, align: 'right', lineBreak: false });
      doc.text('', PAGE_MARGIN, rowY + rowH);
    }

    // Totals row
    const totalCost = workOrders.reduce((s, wo) => s + (wo.cost ?? 0), 0);
    this.ensureSpace(doc, 22);
    const totY = doc.y;
    doc.rect(PAGE_MARGIN, totY, CONTENT_WIDTH, 22).fill(C.primaryLight);
    doc.fillColor(C.primary).fontSize(8.5).font('Helvetica-Bold')
      .text(
        `${workOrders.length} OS concluída${workOrders.length !== 1 ? 's' : ''} · Total: R$ ${this.fmtCurrency(totalCost)}`,
        PAGE_MARGIN + 8, totY + 7, { width: CONTENT_WIDTH - 16, align: 'right', lineBreak: false },
      );
    doc.text('', PAGE_MARGIN, totY + 22);
    doc.moveDown(0.8);
  }

  private renderIncidentsTable(doc: Doc, incidents: {
    title: string; severity: string; status: string; createdAt: Date; resolvedAt: Date | null;
  }[]) {
    this.renderSectionHeader(doc, 'Ocorrências do Período');

    if (incidents.length === 0) {
      doc.fillColor(C.textMuted).fontSize(9).font('Helvetica')
        .text('Nenhuma ocorrência registrada neste período.', PAGE_MARGIN, doc.y);
      doc.moveDown(1.2);
      return;
    }

    const sevW = 68, statusW = 95, openW = 78, resolvedW = 78;
    const titleW = CONTENT_WIDTH - sevW - statusW - openW - resolvedW;

    this.ensureSpace(doc, 28);
    const hY = doc.y;
    doc.rect(PAGE_MARGIN, hY, CONTENT_WIDTH, 22).fill(C.primary);
    doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold');

    let cx = PAGE_MARGIN + 6;
    doc.text('TÍTULO', cx, hY + 7, { width: titleW, lineBreak: false }); cx += titleW;
    doc.text('GRAVIDADE', cx, hY + 7, { width: sevW, lineBreak: false }); cx += sevW;
    doc.text('STATUS', cx, hY + 7, { width: statusW, lineBreak: false }); cx += statusW;
    doc.text('ABERTA EM', cx, hY + 7, { width: openW, lineBreak: false }); cx += openW;
    doc.text('RESOLVIDA EM', cx, hY + 7, { width: resolvedW - 6, lineBreak: false });
    doc.text('', PAGE_MARGIN, hY + 22);

    for (let i = 0; i < incidents.length; i++) {
      const inc = incidents[i];
      const rowH = 22;
      this.ensureSpace(doc, rowH + 2);
      const rowY = doc.y;
      doc.rect(PAGE_MARGIN, rowY, CONTENT_WIDTH, rowH).fill(i % 2 === 0 ? C.white : C.rowAlt);

      cx = PAGE_MARGIN + 6;
      doc.fillColor(C.text).fontSize(7.5).font('Helvetica')
        .text(inc.title, cx, rowY + 7, { width: titleW, lineBreak: false, ellipsis: true }); cx += titleW;
      doc.fillColor(SEVERITY_COLORS[inc.severity] ?? C.text).font('Helvetica-Bold')
        .text(INCIDENT_SEVERITY_LABELS[inc.severity] ?? inc.severity, cx, rowY + 7, { width: sevW, lineBreak: false }); cx += sevW;
      doc.fillColor(C.textMuted).font('Helvetica')
        .text(INCIDENT_STATUS_LABELS[inc.status] ?? inc.status, cx, rowY + 7, { width: statusW, lineBreak: false }); cx += statusW;
      doc.text(this.fmtDate(inc.createdAt), cx, rowY + 7, { width: openW, lineBreak: false }); cx += openW;
      doc.text(inc.resolvedAt ? this.fmtDate(inc.resolvedAt) : '—', cx, rowY + 7, { width: resolvedW - 6, lineBreak: false });
      doc.text('', PAGE_MARGIN, rowY + rowH);
    }
    doc.moveDown(0.8);
  }

  private renderOverdueMaintenance(doc: Doc, assets: {
    name: string; category: string; nextMaintenanceAt: Date | null;
  }[]) {
    this.renderSectionHeader(doc, 'Manutenções Pendentes');

    if (assets.length === 0) {
      doc.fillColor(C.textMuted).fontSize(9).font('Helvetica')
        .text('Nenhum equipamento com manutenção pendente até o fim do período.', PAGE_MARGIN, doc.y);
      doc.moveDown(1.2);
      return;
    }

    const rowH = 22;
    const labelW = CONTENT_WIDTH * 0.68;
    const dateW = CONTENT_WIDTH - labelW;

    for (let i = 0; i < assets.length; i++) {
      this.ensureSpace(doc, rowH + 2);
      const asset = assets[i];
      const rowY = doc.y;
      doc.rect(PAGE_MARGIN, rowY, CONTENT_WIDTH, rowH).fill(i % 2 === 0 ? C.white : C.rowAlt);
      doc.fillColor(C.text).fontSize(9).font('Helvetica')
        .text(`${asset.name} (${asset.category})`, PAGE_MARGIN + 8, rowY + 6, { width: labelW - 10, lineBreak: false });
      doc.fillColor(C.danger).font('Helvetica-Bold')
        .text(
          `Prevista: ${asset.nextMaintenanceAt ? this.fmtDate(asset.nextMaintenanceAt) : '—'}`,
          PAGE_MARGIN + labelW, rowY + 6, { width: dateW - 8, align: 'right', lineBreak: false },
        );
      doc.text('', PAGE_MARGIN, rowY + rowH);
    }
    doc.moveDown(0.8);
  }

  private renderExpiringDocuments(doc: Doc, documents: {
    name: string; type: string; expiryDate: Date | null; status: string;
  }[]) {
    this.renderSectionHeader(doc, 'Documentos Próximos do Vencimento');

    const today = new Date();
    const rowH = 22;
    const labelW = CONTENT_WIDTH * 0.68;
    const statusW = CONTENT_WIDTH - labelW;

    for (let i = 0; i < documents.length; i++) {
      this.ensureSpace(doc, rowH + 2);
      const d = documents[i];
      const rowY = doc.y;
      const isExpired = d.status === 'EXPIRED';
      const bg = isExpired ? C.dangerLight : (i % 2 === 0 ? C.white : C.rowAlt);
      doc.rect(PAGE_MARGIN, rowY, CONTENT_WIDTH, rowH).fill(bg);

      const daysLeft = d.expiryDate
        ? Math.ceil((d.expiryDate.getTime() - today.getTime()) / 86_400_000)
        : null;
      const badge = daysLeft == null ? '—'
        : daysLeft < 0 ? `Vencido há ${Math.abs(daysLeft)}d`
        : daysLeft === 0 ? 'Vence hoje'
        : `${daysLeft}d restantes`;

      doc.fillColor(C.text).fontSize(9).font('Helvetica')
        .text(`${d.name} (${d.type})`, PAGE_MARGIN + 8, rowY + 6, { width: labelW - 10, lineBreak: false });
      doc.fillColor(isExpired ? C.danger : C.warning).font('Helvetica-Bold')
        .text(badge, PAGE_MARGIN + labelW, rowY + 6, { width: statusW - 8, align: 'right', lineBreak: false });
      doc.text('', PAGE_MARGIN, rowY + rowH);
    }
    doc.moveDown(0.8);
  }

  private renderSectionHeader(doc: Doc, title: string) {
    this.ensureSpace(doc, 54);
    const y = doc.y;
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 26).fill(C.bg);
    doc.rect(PAGE_MARGIN, y, 4, 26).fill(C.primary);
    doc.fillColor(C.primary).fontSize(10.5).font('Helvetica-Bold')
      .text(title, PAGE_MARGIN + 12, y + 7, { width: CONTENT_WIDTH - 16, lineBreak: false });
    doc.text('', PAGE_MARGIN, y + 34);
  }

  private renderFooter(doc: Doc, page: number, total: number, companyName: string) {
    const footerY = doc.page.height - 32;
    doc.save();
    doc.moveTo(PAGE_MARGIN, footerY - 6)
      .lineTo(PAGE_WIDTH - PAGE_MARGIN, footerY - 6)
      .strokeColor(C.border).lineWidth(0.5).stroke();
    doc.fillColor(C.textLight).fontSize(7).font('Helvetica')
      .text(companyName, PAGE_MARGIN, footerY, { width: CONTENT_WIDTH * 0.6, lineBreak: false });
    doc.text(`Página ${page} de ${total}`, PAGE_MARGIN, footerY, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });
    doc.restore();
  }

  private ensureSpace(doc: Doc, height: number) {
    if (doc.y + height > doc.page.height - 60) {
      doc.addPage();
    }
  }

  private fmtDate(date: Date) {
    return date.toLocaleDateString('pt-BR');
  }

  private fmtCurrency(value: number) {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
