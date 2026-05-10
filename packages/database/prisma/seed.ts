import {
  PrismaClient,
  Role,
  AssetStatus,
  ChecklistType,
  WorkOrderStatus,
  WorkOrderPriority,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...\n');

  // ── Company ─────────────────────────────────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { cnpj: '00.000.000/0001-00' },
    update: {},
    create: {
      name: 'Administradora Visão360',
      cnpj: '00.000.000/0001-00',
      email: 'contato@visao360.com.br',
      phone: '(11) 99999-9999',
      address: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310-100',
    },
  });
  console.log(`✅ Company: ${company.name} (id: ${company.id})`);

  // ── Users ────────────────────────────────────────────────────────────────────
  const [adminHash, gestorHash, tecnicoHash] = await Promise.all([
    bcrypt.hash('admin@123', 12),
    bcrypt.hash('gestor@123', 12),
    bcrypt.hash('tecnico@123', 12),
  ]);

  const admin = await prisma.user.upsert({
    where: { email_companyId: { email: 'admin@visao360.com.br', companyId: company.id } },
    update: {},
    create: {
      companyId: company.id,
      name: 'Administrador Sistema',
      email: 'admin@visao360.com.br',
      passwordHash: adminHash,
      role: Role.ADMIN,
      phone: '(11) 99999-0001',
    },
  });

  const gestor = await prisma.user.upsert({
    where: { email_companyId: { email: 'gestor@visao360.com.br', companyId: company.id } },
    update: {},
    create: {
      companyId: company.id,
      name: 'Maria Gestora',
      email: 'gestor@visao360.com.br',
      passwordHash: gestorHash,
      role: Role.GESTOR,
      phone: '(11) 99999-0002',
    },
  });

  const tecnico = await prisma.user.upsert({
    where: { email_companyId: { email: 'tecnico@visao360.com.br', companyId: company.id } },
    update: {},
    create: {
      companyId: company.id,
      name: 'João Técnico',
      email: 'tecnico@visao360.com.br',
      passwordHash: tecnicoHash,
      role: Role.TECNICO,
      phone: '(11) 99999-0003',
    },
  });

  console.log(`✅ Usuários: ${admin.email}, ${gestor.email}, ${tecnico.email}`);

  // ── Unit ─────────────────────────────────────────────────────────────────────
  const unit = await prisma.unit.upsert({
    where: { code_companyId: { code: 'COND-001', companyId: company.id } },
    update: {},
    create: {
      companyId: company.id,
      name: 'Condomínio Jardim das Flores',
      code: 'COND-001',
      address: 'Rua das Flores, 500 - Moema, São Paulo - SP, 04077-020',
      description: 'Condomínio residencial de alto padrão com 20 andares e 4 torres',
      users: { connect: [{ id: gestor.id }, { id: tecnico.id }] },
    },
  });
  console.log(`✅ Unidade: ${unit.name} (code: ${unit.code})`);

  // ── Assets ───────────────────────────────────────────────────────────────────
  const assetData = [
    {
      name: 'Elevador Social Torre A',
      code: 'ELV-001',
      category: 'Elevadores',
      brand: 'ThyssenKrupp',
      model: 'Atlas 3000',
      serialNumber: 'TK2020001',
      qrCode: 'QR-ELV-001-VISAO360',
      status: AssetStatus.ACTIVE,
      installDate: new Date('2020-01-15'),
      nextMaintenanceAt: new Date('2024-07-15'),
      description: 'Elevador social da Torre A, capacidade 8 pessoas / 600kg',
    },
    {
      name: 'Gerador de Emergência',
      code: 'GER-001',
      category: 'Elétrica',
      brand: 'Stemac',
      model: 'SG-150 kVA',
      serialNumber: 'ST2021050',
      qrCode: 'QR-GER-001-VISAO360',
      status: AssetStatus.ACTIVE,
      installDate: new Date('2021-05-10'),
      nextMaintenanceAt: new Date('2024-08-10'),
      description: 'Gerador de emergência 150 kVA para áreas comuns',
    },
    {
      name: "Bomba D'Água Principal",
      code: 'BOM-001',
      category: 'Hidráulica',
      brand: 'KSB',
      model: 'Hydrobloc C 1000',
      serialNumber: 'KSB2019030',
      qrCode: 'QR-BOM-001-VISAO360',
      status: AssetStatus.ACTIVE,
      installDate: new Date('2019-03-22'),
      nextMaintenanceAt: new Date('2024-06-30'),
      description: 'Bomba principal de abastecimento de água do condomínio',
    },
  ];

  const assets = await Promise.all(
    assetData.map((data) =>
      prisma.asset.upsert({
        where: { qrCode: data.qrCode },
        update: {},
        create: { companyId: company.id, unitId: unit.id, ...data },
      }),
    ),
  );
  console.log(`✅ Assets: ${assets.map((a) => a.code).join(', ')}`);

  // ── Checklists ───────────────────────────────────────────────────────────────
  const existingChecklist = await prisma.checklist.findFirst({
    where: { companyId: company.id, name: 'Inspeção Mensal de Elevador' },
  });

  if (!existingChecklist) {
    const checklist = await prisma.checklist.create({
      data: {
        companyId: company.id,
        unitId: unit.id,
        assetId: assets[0].id,
        name: 'Inspeção Mensal de Elevador',
        description: 'Checklist de inspeção preventiva mensal conforme NR-12',
        type: ChecklistType.PREVENTIVE,
        intervalDays: 30,
        items: {
          create: [
            {
              order: 1,
              question: 'Porta do pavimento abre e fecha corretamente?',
              requiresPhoto: false,
              requiresNote: false,
            },
            {
              order: 2,
              question: 'Porta da cabina abre e fecha sem travamentos?',
              requiresPhoto: false,
              requiresNote: false,
            },
            {
              order: 3,
              question: 'Nível de óleo do sistema hidráulico está adequado?',
              requiresPhoto: true,
              requiresNote: false,
            },
            {
              order: 4,
              question: 'Cabina está limpa e sem avarias visíveis?',
              requiresPhoto: true,
              requiresNote: false,
            },
            {
              order: 5,
              question: 'Botões de emergência e interfone funcionam?',
              requiresPhoto: false,
              requiresNote: true,
            },
            {
              order: 6,
              question: 'Iluminação interna e de emergência funcionam?',
              requiresPhoto: false,
              requiresNote: false,
            },
            {
              order: 7,
              question: 'Nivelamento do elevador está correto nos pavimentos?',
              requiresPhoto: false,
              requiresNote: true,
            },
          ],
        },
      },
    });
    console.log(`✅ Checklist: ${checklist.name} (${checklist.id})`);
  } else {
    console.log(`⏭️  Checklist já existe, pulando criação`);
  }

  // ── Checklist Gerador ────────────────────────────────────────────────────────
  const existingChecklistGer = await prisma.checklist.findFirst({
    where: { companyId: company.id, name: 'Teste Semanal do Gerador' },
  });

  if (!existingChecklistGer) {
    await prisma.checklist.create({
      data: {
        companyId: company.id,
        unitId: unit.id,
        assetId: assets[1].id,
        name: 'Teste Semanal do Gerador',
        description: 'Verificação semanal do gerador de emergência',
        type: ChecklistType.PREVENTIVE,
        intervalDays: 7,
        items: {
          create: [
            {
              order: 1,
              question: 'Nível de combustível (diesel) está acima de 50%?',
              requiresPhoto: true,
              requiresNote: false,
            },
            {
              order: 2,
              question: 'Nível de óleo do motor está correto?',
              requiresPhoto: true,
              requiresNote: false,
            },
            {
              order: 3,
              question: 'Partida automática funcionou corretamente no teste?',
              requiresPhoto: false,
              requiresNote: true,
            },
            {
              order: 4,
              question: 'Tensão de saída está dentro do range 220V ±5%?',
              requiresPhoto: false,
              requiresNote: true,
            },
            {
              order: 5,
              question: 'Ausência de vazamentos de óleo ou combustível?',
              requiresPhoto: true,
              requiresNote: false,
            },
          ],
        },
      },
    });
    console.log(`✅ Checklist: Teste Semanal do Gerador`);
  }

  // ── Work Order de exemplo ────────────────────────────────────────────────────
  const existingWO = await prisma.workOrder.findUnique({ where: { code: 'OS-2024-001' } });

  if (!existingWO) {
    await prisma.workOrder.create({
      data: {
        companyId: company.id,
        unitId: unit.id,
        assetId: assets[0].id,
        creatorId: gestor.id,
        assigneeId: tecnico.id,
        code: 'OS-2024-001',
        title: 'Manutenção preventiva — Elevador Social Torre A',
        description:
          'Realizar manutenção preventiva mensal conforme contrato com ThyssenKrupp. ' +
          'Verificar cabos, polias, sistema de frenagem e lubrificação geral.',
        status: WorkOrderStatus.ASSIGNED,
        priority: WorkOrderPriority.MEDIUM,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    console.log(`✅ Work Order: OS-2024-001`);
  }

  console.log('\n🎉 Seed concluído com sucesso!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Credenciais de acesso:');
  console.log(`  Company ID: ${company.id}`);
  console.log('  Admin:   admin@visao360.com.br   / admin@123');
  console.log('  Gestor:  gestor@visao360.com.br  / gestor@123');
  console.log('  Técnico: tecnico@visao360.com.br / tecnico@123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
