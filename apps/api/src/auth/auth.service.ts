import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { JwtPayload } from './strategies/jwt.strategy';

// TTL para família de refresh tokens = 30 dias em segundos
const REFRESH_FAMILY_TTL = 30 * 24 * 3600;

interface RefreshFamily {
  userId: string;
  companyId: string;
  currentToken: string; // hash do token válido atual
  version: number;      // incrementado a cada rotação
  revokedAt?: string;   // preenchido se família foi revogada por reuse
}

// Singleton para evitar bcrypt.hash no hot path — gerado uma vez
let DUMMY_HASH: string | null = null;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private getRefreshSecret(): string {
    return this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  private async getDummyHash(): Promise<string> {
    if (!DUMMY_HASH) {
      DUMMY_HASH = await bcrypt.hash('dummy-timing-protection-visao360', 12);
    }
    return DUMMY_HASH;
  }

  /** Retorna todas as empresas onde o e-mail está cadastrado */
  async findCompaniesByEmail(email: string) {
    const users = await this.prisma.user.findMany({
      where: { email: email.toLowerCase().trim(), isActive: true },
      select: {
        company: {
          select: { id: true, name: true, logoUrl: true, isActive: true },
        },
      },
    });

    return users
      .filter((u) => u.company.isActive)
      .map((u) => u.company);
  }

  /** Autentica usuário e retorna JWT + dados do usuário */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email.toLowerCase().trim(),
        companyId: dto.companyId,
        isActive: true,
      },
      include: {
        company: { select: { id: true, name: true, logoUrl: true, isActive: true } },
      },
    });

    // Timing attack mitigation — sempre executa bcrypt independente de achar o usuário
    const dummyHash = await this.getDummyHash();
    const isValid = await bcrypt.compare(dto.password, user?.passwordHash ?? dummyHash);

    if (!user || !isValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!user.company.isActive) {
      throw new UnauthorizedException('Empresa desativada. Contate o suporte.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
    };

    const familyId = randomUUID();
    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign(
      { ...payload, familyId },
      { secret: this.getRefreshSecret(), expiresIn: '30d' },
    );

    // Armazenar família no Redis — permite detectar reuso (token theft)
    const family: RefreshFamily = {
      userId: user.id,
      companyId: user.companyId,
      currentToken: this.hashToken(refreshToken),
      version: 1,
    };
    await this.redis.set(`refresh:family:${familyId}`, family, REFRESH_FAMILY_TTL);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.get<number>('JWT_EXPIRES_IN', 86400),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        companyId: user.companyId,
        company: user.company,
      },
    };
  }

  /**
   * Emite novo access token + novo refresh token (rotação).
   *
   * REUSE DETECTION: se o token apresentado não bate com o token atual da família,
   * significa que um token antigo foi roubado e reutilizado. Nesse caso:
   * 1. Revoga TODA a família (logout forçado em todos os devices)
   * 2. Lança UnauthorizedException com mensagem clara
   *
   * Padrão usado por: Auth0, Okta, GitHub, Google.
   */
  async refresh(refreshToken: string) {
    // Verificar blacklist individual (logout explícito)
    const blacklisted = await this.redis.get<string>(`token:blacklist:${refreshToken}`);
    if (blacklisted) {
      throw new UnauthorizedException('Refresh token revogado. Faça login novamente.');
    }

    let payload: JwtPayload & { familyId?: string };
    try {
      payload = this.jwt.verify<JwtPayload & { familyId?: string }>(refreshToken, {
        secret: this.getRefreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }

    // Verificar família se o token tiver familyId (tokens antigos sem família continuam funcionando)
    if (payload.familyId) {
      const familyKey = `refresh:family:${payload.familyId}`;
      const family = await this.redis.get<RefreshFamily>(familyKey);

      if (!family) {
        throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
      }

      if (family.revokedAt) {
        throw new UnauthorizedException(
          'Sessão inválida (token reutilizado detectado). Faça login novamente.',
        );
      }

      const incomingHash = this.hashToken(refreshToken);
      if (incomingHash !== family.currentToken) {
        // REUSE DETECTED — revogar família inteira imediatamente
        await this.redis.set(
          familyKey,
          { ...family, revokedAt: new Date().toISOString() },
          REFRESH_FAMILY_TTL,
        );
        throw new UnauthorizedException(
          'Token de sessão inválido detectado. Todas as sessões foram encerradas por segurança.',
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await (this.prisma as any).user.findFirst({
      where: { id: payload.sub, companyId: payload.companyId, isActive: true },
      include: {
        company: {
          select: {
            id: true, name: true, logoUrl: true, isActive: true,
            subscriptionStatus: true, trialEndsAt: true,
          },
        },
      },
    });

    if (!user || !user.company.isActive) throw new UnauthorizedException();

    // Consistência: refresh também rejeita tenants bloqueados — sem emitir tokens inúteis
    const status: string = user.company.subscriptionStatus;
    if (status === 'SUSPENDED' || status === 'CANCELLED') {
      throw new UnauthorizedException(
        'Assinatura inativa. Regularize o pagamento para continuar.',
      );
    }
    if (
      status === 'TRIAL' &&
      user.company.trialEndsAt &&
      new Date() > new Date(user.company.trialEndsAt)
    ) {
      throw new UnauthorizedException('Período de avaliação encerrado. Escolha um plano.');
    }

    const newPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
    };

    const newFamilyId = payload.familyId ?? randomUUID();
    const newAccessToken = this.jwt.sign(newPayload);
    const newRefreshToken = this.jwt.sign(
      { ...newPayload, familyId: newFamilyId },
      { secret: this.getRefreshSecret(), expiresIn: '30d' },
    );

    // Rotacionar: atualizar token válido na família
    if (payload.familyId) {
      const family = await this.redis.get<RefreshFamily>(`refresh:family:${newFamilyId}`);
      if (family) {
        await this.redis.set(
          `refresh:family:${newFamilyId}`,
          { ...family, currentToken: this.hashToken(newRefreshToken), version: family.version + 1 },
          REFRESH_FAMILY_TTL,
        );
      }
    } else {
      // Token legado sem família — criar família agora
      const family: RefreshFamily = {
        userId: user.id,
        companyId: user.companyId,
        currentToken: this.hashToken(newRefreshToken),
        version: 1,
      };
      await this.redis.set(`refresh:family:${newFamilyId}`, family, REFRESH_FAMILY_TTL);
    }

    // Invalidar token antigo na blacklist
    await this.logout(refreshToken);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.config.get<number>('JWT_EXPIRES_IN', 86400),
    };
  }

  /** Hash do token para comparação segura — nunca armazenar o token bruto no Redis */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Invalida access token e refresh token no Redis (logout real) */
  async logout(accessToken: string, refreshToken?: string): Promise<{ message: string }> {
    const promises: Promise<void>[] = [];

    try {
      const decoded = this.jwt.decode(accessToken) as (JwtPayload & { exp?: number }) | null;
      if (decoded?.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          promises.push(this.redis.set(`token:blacklist:${accessToken}`, '1', ttl));
        }
      }
    } catch {
      // token malformado — logout é melhor esforço, não falhar
    }

    if (refreshToken) {
      try {
        const decoded = this.jwt.decode(refreshToken) as (JwtPayload & { exp?: number }) | null;
        const ttl = decoded?.exp
          ? decoded.exp - Math.floor(Date.now() / 1000)
          : 30 * 24 * 3600;
        if (ttl > 0) {
          promises.push(this.redis.set(`token:blacklist:${refreshToken}`, '1', ttl));
        }
      } catch {
        // ignorar
      }
    }

    await Promise.allSettled(promises);
    return { message: 'Logout efetuado com sucesso' };
  }

  /**
   * Cadastro público: cria empresa + usuário OWNER + inicia trial de 14 dias.
   * Chamado no fluxo de signup da landing page — sem autenticação.
   */
  async registerTenant(dto: RegisterTenantDto) {
    const emailNorm = dto.ownerEmail.toLowerCase().trim();
    const companyEmailNorm = dto.companyEmail.toLowerCase().trim();

    // P7: bloquear email que já possui trial/assinatura activa em QUALQUER empresa
    const existingOwner = await this.prisma.user.findFirst({
      where: { email: emailNorm },
      select: { id: true, companyId: true },
    });
    if (existingOwner) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingCompany = await (this.prisma as any).company.findUnique({
        where: { id: existingOwner.companyId },
        select: { subscriptionStatus: true },
      });
      // P8: SUSPENDED não pode criar novo trial para burlar pagamento
      if (existingCompany?.subscriptionStatus === 'SUSPENDED') {
        throw new ForbiddenException(
          'Sua conta está suspensa por falta de pagamento. Use POST /subscriptions/recover para regularizar.',
        );
      }
      // Email já usado em outra empresa ativa
      throw new ConflictException(
        'E-mail já possui uma conta no Visão360. Faça login na empresa existente.',
      );
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Cria empresa + OWNER em uma única transação atômica
    const result = await this.prisma.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txDb = tx as any;

      // P11: verificação de CNPJ DENTRO da transação — elimina race condition
      if (dto.cnpj) {
        const cnpjExists = await txDb.company.findUnique({ where: { cnpj: dto.cnpj } });
        if (cnpjExists) throw new ConflictException('CNPJ já cadastrado');
      }

      const company = await txDb.company.create({
        data: {
          name: dto.companyName,
          cnpj: dto.cnpj,
          email: companyEmailNorm,
          phone: dto.phone,
          plan: 'TRIAL',
          subscriptionStatus: 'TRIAL',
          trialEndsAt,
        },
      });

      const user = await txDb.user.create({
        data: {
          companyId: company.id,
          name: dto.ownerName,
          email: emailNorm,
          passwordHash,
          role: 'OWNER',
          phone: dto.phone,
        },
        select: { id: true, name: true, email: true, role: true, companyId: true },
      });

      return { company, user };
    });

    // P9: Audit log — tenant criado + trial iniciado
    await this.prisma.auditLog.create({
      data: {
        companyId: result.company.id,
        userId: result.user.id,
        action: 'TENANT_CREATED',
        resource: 'company',
        resourceId: result.company.id,
      },
    }).catch(() => {}); // Fire-and-forget — falha no audit não impede o signup

    const payload: JwtPayload = {
      sub: result.user.id,
      email: result.user.email,
      companyId: result.company.id,
      role: result.user.role,
    };

    const familyId = randomUUID();
    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign(
      { ...payload, familyId },
      { secret: this.getRefreshSecret(), expiresIn: '30d' },
    );

    const family = {
      userId: result.user.id,
      companyId: result.company.id,
      currentToken: this.hashToken(refreshToken),
      version: 1,
    };
    await this.redis.set(`refresh:family:${familyId}`, family, REFRESH_FAMILY_TTL);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.get<number>('JWT_EXPIRES_IN', 86400),
      trialEndsAt,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        companyId: result.company.id,
        company: {
          id: result.company.id,
          name: result.company.name,
          subscriptionStatus: 'TRIAL',
          trialEndsAt,
        },
      },
    };
  }

  /** Cria novo usuário na empresa do solicitante */
  async register(dto: RegisterDto, companyId: string, requestingRole: Role) {
    // OWNER só pode ser criado via registerTenant (signup público)
    if ((dto.role as string) === 'OWNER') {
      throw new ForbiddenException('O role OWNER é atribuído automaticamente ao fundador do tenant');
    }

    if (dto.role === Role.ADMIN && requestingRole !== Role.ADMIN && (requestingRole as string) !== 'OWNER') {
      throw new UnauthorizedException('Somente ADMINs podem criar usuários com role ADMIN');
    }

    const exists = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase().trim(), companyId },
    });

    if (exists) {
      throw new ConflictException(`E-mail ${dto.email} já está cadastrado nesta empresa`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        companyId,
        name: dto.name,
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        role: dto.role ?? Role.TECNICO,
        phone: dto.phone,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        companyId: true,
        createdAt: true,
      },
    });
  }

  /** Dados do usuário autenticado */
  async me(userId: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        avatarUrl: true,
        companyId: true,
        lastLoginAt: true,
        createdAt: true,
        company: {
          select: { id: true, name: true, logoUrl: true, email: true },
        },
      },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');

    return user;
  }

  /** Atualiza senha e invalida o token atual */
  async changePassword(
    userId: string,
    companyId: string,
    currentPassword: string,
    newPassword: string,
    currentAccessToken: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId, isActive: true },
      select: { id: true, passwordHash: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Senha atual incorreta');

    const newHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    // Invalida o token atual para forçar novo login
    await this.logout(currentAccessToken);

    return { message: 'Senha atualizada. Faça login novamente com a nova senha.' };
  }
}
