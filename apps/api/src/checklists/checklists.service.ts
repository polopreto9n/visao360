import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChecklistType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../plans/plan-limits.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { UnitsService } from '../units/units.service';

interface TemplateItem {
  order: number;
  question: string;
  description?: string;
  requiresPhoto?: boolean;
  requiresNote?: boolean;
  expectedAnswer?: boolean;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  description: string;
  norm: string;
  category: string;
  type: ChecklistType;
  intervalDays: number;
  items: TemplateItem[];
}

export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  {
    id: 'nr10-eletrica',
    name: 'NR-10 — Segurança em Instalações Elétricas',
    description: 'Inspeção de segurança elétrica baseada na Norma Regulamentadora NR-10.',
    norm: 'NR-10',
    category: 'Elétrica',
    type: ChecklistType.PREVENTIVE,
    intervalDays: 30,
    items: [
      { order: 1, question: 'Quadros elétricos estão devidamente fechados e sinalizados?', requiresPhoto: true },
      { order: 2, question: 'Não há fios expostos ou danificados nas instalações?', requiresPhoto: true },
      { order: 3, question: 'Os disjuntores estão funcionando corretamente?', requiresNote: true },
      { order: 4, question: 'Os aterramentos estão presentes e em bom estado?', requiresPhoto: true },
      { order: 5, question: 'Há EPI disponível para trabalhos elétricos (luvas, capacetes)?', requiresPhoto: false },
      { order: 6, question: 'As tomadas e interruptores estão íntegros e fixos?', requiresNote: false },
      { order: 7, question: 'Cabo SPDA (para-raios) está íntegro e sem corrosão?', requiresPhoto: true },
      { order: 8, question: 'Não há sobrecarga aparente nos circuitos (cheiro de queimado, aquecimento)?', requiresNote: true },
      { order: 9, question: 'A iluminação de emergência está funcionando?', requiresPhoto: false },
      { order: 10, question: 'Equipamentos elétricos possuem aterramento de proteção?', requiresNote: false },
    ],
  },
  {
    id: 'nr12-maquinas',
    name: 'NR-12 — Segurança em Máquinas e Equipamentos',
    description: 'Verificação de proteções, sinalização e condições operacionais conforme NR-12.',
    norm: 'NR-12',
    category: 'Máquinas',
    type: ChecklistType.PREVENTIVE,
    intervalDays: 30,
    items: [
      { order: 1, question: 'As proteções fixas estão instaladas e em bom estado?', requiresPhoto: true },
      { order: 2, question: 'Os dispositivos de parada de emergência estão visíveis e funcionais?', requiresNote: true },
      { order: 3, question: 'Há sinalização de segurança nas áreas de risco?', requiresPhoto: true },
      { order: 4, question: 'Os operadores foram treinados para operar os equipamentos?', requiresNote: true },
      { order: 5, question: 'Não há ruído ou vibração excessiva nos equipamentos?', requiresNote: true },
      { order: 6, question: 'Os sistemas de lubrificação estão abastecidos e funcionando?', requiresNote: false },
      { order: 7, question: 'As ferramentas e acessórios estão em bom estado?', requiresPhoto: false },
      { order: 8, question: 'Há registro de manutenção atualizado para cada equipamento?', requiresNote: true },
    ],
  },
  {
    id: 'nr23-extintores',
    name: 'NR-23 — Inspeção de Extintores de Incêndio',
    description: 'Vistoria mensal de extintores conforme NR-23 e ABNT NBR 12962.',
    norm: 'NR-23 / ABNT NBR 12962',
    category: 'Incêndio',
    type: ChecklistType.INSPECTION,
    intervalDays: 30,
    items: [
      { order: 1, question: 'O extintor está no local designado e desobstruído?', requiresPhoto: true },
      { order: 2, question: 'A validade do extintor está dentro do prazo?', requiresNote: true },
      { order: 3, question: 'O lacre e o pino de segurança estão intactos?', requiresPhoto: true },
      { order: 4, question: 'A pressão está na faixa operacional (ponteiro no verde)?', requiresPhoto: true },
      { order: 5, question: 'O extintor está sem danos, amassados ou corrosão?', requiresPhoto: true },
      { order: 6, question: 'A mangueira/difusor está em bom estado e sem obstrução?', requiresPhoto: false },
      { order: 7, question: 'A placa de identificação está legível?', requiresNote: false },
      { order: 8, question: 'O extintor está corretamente instalado (altura e suporte)?', requiresPhoto: false },
    ],
  },
  {
    id: 'ppci-incendio',
    name: 'PPCI — Sistemas de Prevenção e Combate a Incêndio',
    description: 'Vistoria dos sistemas de prevenção de incêndio: sprinklers, hidrantes, alarmes e saídas de emergência.',
    norm: 'ABNT NBR 13714 / PPCI',
    category: 'Incêndio',
    type: ChecklistType.INSPECTION,
    intervalDays: 30,
    items: [
      { order: 1, question: 'As saídas de emergência estão desobstruídas e sinalizadas?', requiresPhoto: true },
      { order: 2, question: 'As portas corta-fogo estão funcionando corretamente?', requiresNote: true },
      { order: 3, question: 'Os hidrantes estão pressurizados e com mangueira em bom estado?', requiresPhoto: true, requiresNote: true },
      { order: 4, question: 'O sistema de sprinklers está sem vazamentos ou danos visíveis?', requiresPhoto: false },
      { order: 5, question: 'O painel de alarme de incêndio está operacional (sem falhas)?', requiresPhoto: true },
      { order: 6, question: 'Os detectores de fumaça estão limpos e funcionais?', requiresNote: true },
      { order: 7, question: 'A bomba de incêndio opera corretamente (teste mensal)?', requiresNote: true },
      { order: 8, question: 'O gerador de emergência entra em operação no desligamento da rede?', requiresNote: true },
      { order: 9, question: 'Os corredores de escape estão livres de obstáculos?', requiresPhoto: true },
      { order: 10, question: 'A sinalização luminosa de emergência está funcionando?', requiresPhoto: false },
    ],
  },
  {
    id: 'nbr5626-hidraulica',
    name: 'ABNT NBR 5626 — Instalações Hidráulicas Prediais',
    description: 'Verificação de instalações prediais de água fria e esgoto conforme ABNT NBR 5626.',
    norm: 'ABNT NBR 5626',
    category: 'Hidráulica',
    type: ChecklistType.PREVENTIVE,
    intervalDays: 90,
    items: [
      { order: 1, question: 'Não há vazamentos visíveis nas tubulações e conexões?', requiresPhoto: true },
      { order: 2, question: 'As válvulas de registro estão operacionais e sem corrosão?', requiresNote: false },
      { order: 3, question: 'A pressão da água está adequada em todos os pontos?', requiresNote: true },
      { order: 4, question: 'A caixa d\'água está limpa e sem biofilme (limpeza semestral em dia)?', requiresPhoto: true, requiresNote: true },
      { order: 5, question: 'As tubulações de esgoto estão sem obstrução ou mau cheiro?', requiresNote: true },
      { order: 6, question: 'O sistema de aquecimento solar/elétrico está funcionando?', requiresNote: false },
      { order: 7, question: 'As ralos e sifões estão limpos e sem entupimentos?', requiresNote: false },
      { order: 8, question: 'As bombas de recalque estão operacionais?', requiresPhoto: false, requiresNote: true },
    ],
  },
  {
    id: 'elevador-preventiva',
    name: 'Elevadores — Manutenção Preventiva',
    description: 'Inspeção preventiva de elevadores conforme ABNT NBR 16083 e exigências da ANOTEC.',
    norm: 'ABNT NBR 16083',
    category: 'Elevadores',
    type: ChecklistType.PREVENTIVE,
    intervalDays: 30,
    items: [
      { order: 1, question: 'As portas de cabine e de pavimento fecham e travam corretamente?', requiresPhoto: false },
      { order: 2, question: 'O nivelamento da cabine está correto em todos os andares?', requiresNote: true },
      { order: 3, question: 'Os botões de chamada e comando estão funcionando?', requiresNote: false },
      { order: 4, question: 'A iluminação interna da cabine está funcionando?', requiresPhoto: false },
      { order: 5, question: 'O interfone de emergência está funcionando?', requiresNote: true },
      { order: 6, question: 'Os dispositivos de segurança (parachoque, limitador de velocidade) estão OK?', requiresNote: true },
      { order: 7, question: 'O certificado de manutenção está em dia e afixado na cabine?', requiresPhoto: true },
      { order: 8, question: 'Não há ruídos, vibrações ou oscilações anormais no percurso?', requiresNote: true },
      { order: 9, question: 'O painel elétrico da casa de máquinas está limpo e organizado?', requiresPhoto: true },
      { order: 10, question: 'O relatório técnico da empresa de manutenção está disponível?', requiresNote: true },
    ],
  },
  {
    id: 'ar-condicionado',
    name: 'Ar-condicionado Split — Manutenção Preventiva',
    description: 'Limpeza e verificação preventiva de splits conforme boas práticas e ABNT NBR 16401.',
    norm: 'ABNT NBR 16401',
    category: 'Climatização',
    type: ChecklistType.PREVENTIVE,
    intervalDays: 90,
    items: [
      { order: 1, question: 'Os filtros da unidade interna foram limpos?', requiresPhoto: true },
      { order: 2, question: 'A bandeja de condensado está limpa e sem obstrução?', requiresPhoto: true },
      { order: 3, question: 'A unidade externa está limpa e sem obstrução ao redor?', requiresPhoto: true },
      { order: 4, question: 'O equipamento resfria/aquece adequadamente?', requiresNote: true },
      { order: 5, question: 'Não há vazamento de gás refrigerante (gelo excessivo na serpentina)?', requiresPhoto: false, requiresNote: true },
      { order: 6, question: 'O dreno de condensado está desobstruído e drenando corretamente?', requiresNote: false },
      { order: 7, question: 'Os componentes elétricos (capacitor, contator) estão em bom estado?', requiresNote: true },
      { order: 8, question: 'A temperatura de operação está dentro do esperado?', requiresNote: true },
    ],
  },
  {
    id: 'bomba-dagua',
    name: 'Bomba d\'água — Inspeção Preventiva',
    description: 'Verificação de bombas de recalque e de pressurização do condomínio.',
    norm: 'Boas práticas / ABNT NBR 5626',
    category: 'Hidráulica',
    type: ChecklistType.PREVENTIVE,
    intervalDays: 30,
    items: [
      { order: 1, question: 'A bomba parte corretamente no acionamento automático?', requiresNote: true },
      { order: 2, question: 'Não há vazamentos no corpo da bomba e nas conexões?', requiresPhoto: true },
      { order: 3, question: 'O motor não apresenta aquecimento excessivo ou ruídos anormais?', requiresNote: true },
      { order: 4, question: 'A pressão de saída está dentro do especificado?', requiresNote: true },
      { order: 5, question: 'O painel de comando da bomba está funcionando?', requiresPhoto: true },
      { order: 6, question: 'A bomba reserva (backup) está operacional?', requiresNote: true },
      { order: 7, question: 'Os filtros de sucção estão limpos?', requiresNote: false },
    ],
  },
  {
    id: 'gerador-diesel',
    name: 'Gerador a Diesel — Inspeção Preventiva',
    description: 'Verificação periódica do gerador de emergência.',
    norm: 'ABNT NBR 5418',
    category: 'Elétrica',
    type: ChecklistType.PREVENTIVE,
    intervalDays: 30,
    items: [
      { order: 1, question: 'O nível de combustível (diesel) está adequado (mín. 75%)?', requiresNote: true },
      { order: 2, question: 'O nível de óleo do motor está na faixa correta?', requiresNote: true },
      { order: 3, question: 'A bateria de partida está carregada e sem corrosão nos terminais?', requiresPhoto: false },
      { order: 4, question: 'O gerador parte e entra em carga no teste semanal?', requiresNote: true },
      { order: 5, question: 'A tensão e frequência na saída estão corretas (220V / 60Hz)?', requiresNote: true },
      { order: 6, question: 'Não há vazamentos de combustível, óleo ou líquido de arrefecimento?', requiresPhoto: true },
      { order: 7, question: 'O sistema de arrefecimento (radiador) está em bom estado?', requiresNote: false },
      { order: 8, question: 'O escape/exaustão está sem obstrução e bem direcionado?', requiresPhoto: false },
    ],
  },
  {
    id: 'portao-automatico',
    name: 'Portão Automático — Inspeção Preventiva',
    description: 'Verificação mensal de portões automáticos de acesso ao condomínio.',
    norm: 'ABNT NBR 15777',
    category: 'Acesso',
    type: ChecklistType.PREVENTIVE,
    intervalDays: 30,
    items: [
      { order: 1, question: 'O portão abre e fecha completamente sem travar?', requiresNote: false },
      { order: 2, question: 'O sensor de obstáculo está funcionando (para ao detectar objeto)?', requiresNote: true, requiresPhoto: false },
      { order: 3, question: 'A fotocélula de segurança está alinhada e funcionando?', requiresNote: true },
      { order: 4, question: 'O sistema de abertura manual (emergência) está funcionando?', requiresNote: true },
      { order: 5, question: 'A corrente, cremalheira ou trilhos estão lubrificados e sem desgaste?', requiresPhoto: true },
      { order: 6, question: 'O motor não apresenta superaquecimento ou ruídos anormais?', requiresNote: true },
      { order: 7, question: 'O sistema de interfone/videofone está funcionando?', requiresNote: false },
    ],
  },
];

@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly units: UnitsService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  private async validateScope(companyId: string, unitId?: string | null, assetId?: string | null) {
    let resolvedUnitId = unitId ?? null;

    if (unitId) {
      const unit = await this.prisma.unit.findFirst({ where: { id: unitId, companyId } });
      if (!unit) throw new NotFoundException('Unidade nao encontrada');
    }

    if (assetId) {
      const asset = await this.prisma.asset.findFirst({
        where: { id: assetId, companyId },
        select: { unitId: true },
      });
      if (!asset) throw new NotFoundException('Equipamento nao encontrado');
      if (unitId && asset.unitId !== unitId) {
        throw new ForbiddenException('Equipamento nao pertence a unidade informada');
      }
      resolvedUnitId = resolvedUnitId ?? asset.unitId;
    }

    return resolvedUnitId;
  }

  async create(companyId: string, dto: CreateChecklistDto) {
    await this.planLimits.checkChecklistLimit(companyId);
    const { items, ...data } = dto;
    const unitId = await this.validateScope(companyId, data.unitId, data.assetId);
    return this.prisma.checklist.create({
      data: {
        ...data, companyId, unitId,
        items: {
          create: items.map((item) => ({
            order: item.order,
            question: item.question,
            description: item.description,
            requiresPhoto: item.requiresPhoto ?? false,
            requiresNote: item.requiresNote ?? false,
            expectedAnswer: item.expectedAnswer ?? true,
          })),
        },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  async findAll(
    companyId: string,
    dto: PaginationDto & { type?: ChecklistType; unitId?: string; assetId?: string },
    userId?: string,
    userRole?: string,
  ) {
    let unitIds: string[] | undefined;
    let allowedChecklistIds: string[] | undefined; // undefined = sem restrição (admin/owner)

    if (userRole === 'TECNICO' && userId) {
      // TECNICO: vê APENAS checklists com agenda ativa atribuída a ele
      const scheduledForMe = await this.prisma.checklistSchedule.findMany({
        where: {
          companyId,
          isActive: true,
          assigneeId: userId,
          checklist: { isActive: true },
        },
        select: { checklistId: true },
      });
      allowedChecklistIds = [...new Set(scheduledForMe.map((s) => s.checklistId))];
      // Se não tem nenhum agendado → retorna lista vazia imediatamente
      if (allowedChecklistIds.length === 0) {
        return paginated([], 0, dto);
      }
    }
    // GESTOR vê todos os checklists da empresa (sem escopo por unidade)

    const where = {
      companyId, isActive: true,
      ...(dto.type ? { type: dto.type } : {}),
      ...(allowedChecklistIds
        ? { id: { in: allowedChecklistIds } }
        : dto.assetId ? { assetId: dto.assetId } : dto.unitId ? { unitId: dto.unitId } : unitIds ? { unitId: { in: unitIds } } : {}),
      ...(dto.search ? { name: { contains: dto.search, mode: 'insensitive' as const } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.checklist.findMany({
        where,
        include: {
          items: { orderBy: { order: 'asc' } },
          unit: { select: { id: true, name: true } },
          asset: { select: { id: true, name: true, category: true } },
        },
        orderBy: { name: 'asc' },
        skip: dto.skip, take: dto.limit,
      }),
      this.prisma.checklist.count({ where }),
    ]);

    return paginated(data, total, dto);
  }

  async findOne(id: string, companyId: string, userId?: string, userRole?: string) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id, companyId },
      include: {
        items: { orderBy: { order: 'asc' } },
        unit: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true } },
        _count: { select: { executions: true } },
      },
    });
    if (!checklist) throw new NotFoundException('Checklist não encontrado');
    if (userRole === 'TECNICO' && userId && checklist.unitId) {
      const unitIds = await this.units.getUserUnitIds(userId);
      if (!unitIds.includes(checklist.unitId)) {
        throw new ForbiddenException('Checklist não pertence a uma unidade atribuída a você');
      }
    }
    return checklist;
  }

  async update(id: string, companyId: string, dto: UpdateChecklistDto) {
    await this.findOne(id, companyId);
    const unitId = dto.unitId || dto.assetId
      ? await this.validateScope(companyId, dto.unitId, dto.assetId)
      : undefined;
    return this.prisma.checklist.update({
      where: { id }, data: { ...dto, ...(unitId ? { unitId } : {}) },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  /**
   * Atualização completa: metadados + sincroniza itens preservando IDs existentes.
   * Estratégia: update in-place para preservar referências em ExecutionItem (histórico).
   * - Itens que existem → UPDATE (mantém ID, preserva histórico)
   * - Itens novos → CREATE
   * - Itens removidos → cascade delete (remove execution_items primeiro)
   */
  async fullUpdate(id: string, companyId: string, dto: CreateChecklistDto) {
    await this.findOne(id, companyId);
    const { items: newItems, ...meta } = dto;
    const unitId = await this.validateScope(companyId, meta.unitId, meta.assetId);

    // 1. Atualiza metadados do checklist
    await this.prisma.checklist.update({ where: { id }, data: { ...meta, unitId } });

    // 2. Busca itens existentes em ordem
    const existing = await this.prisma.checklistItem.findMany({
      where: { checklistId: id },
      orderBy: { order: 'asc' },
    });

    // 3. Sincroniza item a item
    for (let i = 0; i < Math.max(newItems.length, existing.length); i++) {
      const hasNew = i < newItems.length;
      const hasOld = i < existing.length;

      if (hasNew && hasOld) {
        // Atualiza item existente preservando o mesmo ID
        await this.prisma.checklistItem.update({
          where: { id: existing[i].id },
          data: {
            order: i + 1,
            question: newItems[i].question,
            description: newItems[i].description ?? null,
            requiresPhoto: newItems[i].requiresPhoto ?? false,
            requiresNote: newItems[i].requiresNote ?? false,
            expectedAnswer: newItems[i].expectedAnswer ?? true,
          },
        });
      } else if (hasNew && !hasOld) {
        // Cria novo item
        await this.prisma.checklistItem.create({
          data: {
            checklistId: id,
            order: i + 1,
            question: newItems[i].question,
            description: newItems[i].description ?? null,
            requiresPhoto: newItems[i].requiresPhoto ?? false,
            requiresNote: newItems[i].requiresNote ?? false,
            expectedAnswer: newItems[i].expectedAnswer ?? true,
          },
        });
      } else if (!hasNew && hasOld) {
        // Remove item extra (cascade: remove execution_items primeiro)
        await this.prisma.executionItem.deleteMany({
          where: { checklistItemId: existing[i].id },
        });
        await this.prisma.checklistItem.delete({ where: { id: existing[i].id } });
      }
    }

    return this.findOne(id, companyId);
  }

  async deleteChecklist(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.prisma.$transaction([
      this.prisma.checklist.update({ where: { id }, data: { isActive: false } }),
      this.prisma.checklistSchedule.updateMany({ where: { checklistId: id }, data: { isActive: false } }),
    ]);
    return { deleted: true };
  }

  getTemplates(category?: string, norm?: string) {
    let result = CHECKLIST_TEMPLATES;
    if (category) result = result.filter((t) => t.category.toLowerCase() === category.toLowerCase());
    if (norm) result = result.filter((t) => t.norm.toLowerCase().includes(norm.toLowerCase()));
    return result;
  }

  getTemplate(templateId: string) {
    const tpl = CHECKLIST_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) throw new NotFoundException(`Template '${templateId}' não encontrado`);
    return tpl;
  }

  async createFromTemplate(
    companyId: string,
    templateId: string,
    overrides: { name?: string; unitId?: string; assetId?: string; intervalDays?: number },
  ) {
    await this.planLimits.checkChecklistLimit(companyId);
    const tpl = this.getTemplate(templateId);
    const unitId = await this.validateScope(companyId, overrides.unitId, overrides.assetId);
    return this.prisma.checklist.create({
      data: {
        name: overrides.name ?? tpl.name,
        description: tpl.description,
        type: tpl.type,
        companyId,
        unitId: unitId ?? null,
        assetId: overrides.assetId ?? null,
        intervalDays: overrides.intervalDays ?? tpl.intervalDays,
        items: {
          create: tpl.items.map((item) => ({
            order: item.order,
            question: item.question,
            description: item.description ?? null,
            requiresPhoto: item.requiresPhoto ?? false,
            requiresNote: item.requiresNote ?? false,
            expectedAnswer: item.expectedAnswer ?? true,
          })),
        },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }
}
