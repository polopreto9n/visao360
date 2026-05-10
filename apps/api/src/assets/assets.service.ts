import { Injectable, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { paginated } from '../common/dto/pagination.dto';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { ListAssetsDto } from './dto/list-assets.dto';

const ASSET_SELECT = {
  id: true, name: true, code: true, category: true, brand: true, model: true,
  serialNumber: true, qrCode: true, status: true, installDate: true,
  lastMaintenanceAt: true, nextMaintenanceAt: true, description: true, photoUrl: true,
  createdAt: true, updatedAt: true,
  unit: { select: { id: true, name: true } },
} as const;

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateAssetDto) {
    // Verificar que a unidade pertence à empresa
    const unit = await this.prisma.unit.findFirst({ where: { id: dto.unitId, companyId } });
    if (!unit) throw new NotFoundException('Unidade não encontrada nesta empresa');

    return this.prisma.asset.create({
      data: { ...dto, companyId },
      select: ASSET_SELECT,
    });
  }

  async findAll(companyId: string, dto: ListAssetsDto) {
    const where = {
      companyId,
      ...(dto.unitId ? { unitId: dto.unitId } : {}),
      ...(dto.category ? { category: { contains: dto.category, mode: 'insensitive' as const } } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.search
        ? { OR: [{ name: { contains: dto.search, mode: 'insensitive' as const } },
                 { code: { contains: dto.search, mode: 'insensitive' as const } },
                 { brand: { contains: dto.search, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.asset.findMany({
        where, select: ASSET_SELECT,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip: dto.skip, take: dto.limit,
      }),
      this.prisma.asset.count({ where }),
    ]);

    return paginated(data, total, dto);
  }

  async findOne(id: string, companyId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, companyId },
      include: {
        unit: { select: { id: true, name: true, address: true } },
        checklists: { where: { isActive: true }, select: { id: true, name: true, type: true } },
        workOrders: {
          where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
          select: { id: true, code: true, title: true, status: true, priority: true },
          take: 5,
        },
      },
    });
    if (!asset) throw new NotFoundException('Equipamento não encontrado');
    return asset;
  }

  async findByQRCode(qrCode: string, companyId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { qrCode, companyId },
      include: { unit: { select: { id: true, name: true } } },
    });
    if (!asset) throw new NotFoundException(`QR Code "${qrCode}" não encontrado`);
    return asset;
  }

  async update(id: string, companyId: string, dto: UpdateAssetDto) {
    await this.findOne(id, companyId);
    if (dto.unitId) {
      const unit = await this.prisma.unit.findFirst({ where: { id: dto.unitId, companyId } });
      if (!unit) throw new NotFoundException('Unidade não encontrada');
    }
    return this.prisma.asset.update({ where: { id }, data: dto, select: ASSET_SELECT });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.asset.update({
      where: { id },
      data: { status: 'INACTIVE' },
      select: ASSET_SELECT,
    });
  }

  /** Gera imagem PNG do QR Code e envia diretamente na response */
  async streamQRCodeImage(id: string, companyId: string, res: Response) {
    const asset = await this.findOne(id, companyId);
    const qrData = `visao360://asset/${companyId}/${asset.id}?qr=${asset.qrCode}`;

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${asset.code ?? asset.id}-qr.png"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await QRCode.toFileStream(res as any, qrData, {
      type: 'png',
      width: 300,
      margin: 2,
      color: { dark: '#1e40af', light: '#ffffff' },
    });
  }

  /** Retorna URL de dados base64 do QR Code */
  async getQRCodeDataUrl(id: string, companyId: string) {
    const asset = await this.findOne(id, companyId);
    const qrData = `visao360://asset/${companyId}/${asset.id}?qr=${asset.qrCode}`;
    const dataUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: { dark: '#1e40af', light: '#ffffff' },
    });
    return { qrCode: asset.qrCode, qrData, dataUrl };
  }
}
