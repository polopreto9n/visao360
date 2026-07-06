import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getLimits, isUnlimited } from './plan-limits';

@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getCompanyPlan(companyId: string): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true, subscriptionStatus: true },
    });
    return company?.plan ?? 'TRIAL';
  }

  async checkUnitLimit(companyId: string) {
    const plan = await this.getCompanyPlan(companyId);
    const limits = getLimits(plan);
    if (isUnlimited(limits.maxUnits)) return;

    const count = await this.prisma.unit.count({ where: { companyId } });
    if (count >= limits.maxUnits) {
      throw new ForbiddenException(
        `Seu plano ${plan} permite até ${limits.maxUnits} unidade(s). Faça upgrade para adicionar mais.`,
      );
    }
  }

  async checkUserLimit(companyId: string) {
    const plan = await this.getCompanyPlan(companyId);
    const limits = getLimits(plan);
    if (isUnlimited(limits.maxUsers)) return;

    const count = await this.prisma.user.count({ where: { companyId, isActive: true } });
    if (count >= limits.maxUsers) {
      throw new ForbiddenException(
        `Seu plano ${plan} permite até ${limits.maxUsers} usuário(s). Faça upgrade para adicionar mais.`,
      );
    }
  }

  async checkAssetLimit(companyId: string) {
    const plan = await this.getCompanyPlan(companyId);
    const limits = getLimits(plan);
    if (isUnlimited(limits.maxAssets)) return;

    const count = await this.prisma.asset.count({
      where: { companyId, status: { not: 'INACTIVE' } },
    });
    if (count >= limits.maxAssets) {
      throw new ForbiddenException(
        `Seu plano ${plan} permite até ${limits.maxAssets} equipamento(s). Faça upgrade para adicionar mais.`,
      );
    }
  }

  async checkChecklistLimit(companyId: string) {
    const plan = await this.getCompanyPlan(companyId);
    const limits = getLimits(plan);
    if (isUnlimited(limits.maxChecklists)) return;

    const count = await this.prisma.checklist.count({ where: { companyId, isActive: true } });
    if (count >= limits.maxChecklists) {
      throw new ForbiddenException(
        `Seu plano ${plan} permite até ${limits.maxChecklists} checklist(s) ativo(s). Faça upgrade para adicionar mais.`,
      );
    }
  }

  async getLimitStatus(companyId: string) {
    const plan = await this.getCompanyPlan(companyId);
    const limits = getLimits(plan);

    const [units, users, assets, checklists] = await Promise.all([
      this.prisma.unit.count({ where: { companyId } }),
      this.prisma.user.count({ where: { companyId, isActive: true } }),
      this.prisma.asset.count({ where: { companyId, status: { not: 'INACTIVE' } } }),
      this.prisma.checklist.count({ where: { companyId, isActive: true } }),
    ]);

    return {
      plan,
      limits,
      usage: { units, users, assets, checklists },
    };
  }
}
