import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
  verify: jest.fn(),
  decode: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string, fallback?: unknown) => {
    const map: Record<string, unknown> = { JWT_EXPIRES_IN: 86400 };
    return map[key] !== undefined ? map[key] : fallback;
  }),
  getOrThrow: jest.fn((key: string) => {
    const map: Record<string, string> = {
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-chars!!',
    };
    if (!map[key]) throw new Error(`Env missing: ${key}`);
    return map[key];
  }),
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ACTIVE_COMPANY = { id: 'company-1', name: 'Empresa Teste', logoUrl: null, isActive: true };
let PASSWORD_HASH = '';

const makeUser = (overrides = {}) => ({
  id: 'user-1',
  name: 'Admin Teste',
  email: 'admin@test.com',
  role: Role.ADMIN,
  passwordHash: PASSWORD_HASH,
  companyId: 'company-1',
  phone: null,
  avatarUrl: null,
  isActive: true,
  company: ACTIVE_COMPANY,
  ...overrides,
});

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeAll(async () => {
    PASSWORD_HASH = await bcrypt.hash('SenhaValida@123', 12);
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── findCompaniesByEmail ────────────────────────────────────────────────────

  describe('findCompaniesByEmail', () => {
    it('retorna apenas empresas ativas', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { company: { id: 'c1', name: 'Ativa', logoUrl: null, isActive: true } },
        { company: { id: 'c2', name: 'Inativa', logoUrl: null, isActive: false } },
      ]);

      const result = await service.findCompaniesByEmail('admin@test.com');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c1');
    });

    it('normaliza e-mail para lowercase', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      await service.findCompaniesByEmail('ADMIN@TEST.COM');
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'admin@test.com', isActive: true } }),
      );
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    const dto = { email: 'admin@test.com', password: 'SenhaValida@123', companyId: 'company-1' };

    it('retorna tokens e dados do usuário com credenciais válidas', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.login(dto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe('admin@test.com');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ lastLoginAt: expect.any(Date) }) }),
      );
    });

    it('lança UnauthorizedException com senha incorreta', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      await expect(service.login({ ...dto, password: 'SenhaErrada' })).rejects.toThrow(UnauthorizedException);
    });

    it('lança UnauthorizedException quando usuário não existe', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('lança UnauthorizedException se empresa desativada', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ company: { ...ACTIVE_COMPANY, isActive: false } }),
      );
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('não expõe passwordHash na resposta', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockPrisma.user.update.mockResolvedValue({});
      const result = await service.login(dto);
      expect(JSON.stringify(result)).not.toContain('passwordHash');
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('adiciona access token à blacklist do Redis', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      mockJwt.decode.mockReturnValue({ exp: futureExp, sub: 'user-1' });

      const result = await service.logout('valid.access.token');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'token:blacklist:valid.access.token',
        '1',
        expect.any(Number),
      );
      expect(result).toHaveProperty('message');
    });

    it('adiciona refresh token à blacklist quando fornecido', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 86400;
      mockJwt.decode.mockReturnValue({ exp: futureExp });

      await service.logout('access.token', 'refresh.token');

      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });

    it('não lança erro se token for malformado (best-effort)', async () => {
      mockJwt.decode.mockImplementation(() => { throw new Error('malformed'); });
      await expect(service.logout('malformed')).resolves.toBeDefined();
    });

    it('não adiciona à blacklist se token já expirou (TTL negativo)', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 100;
      mockJwt.decode.mockReturnValue({ exp: pastExp });

      await service.logout('expired.token');

      expect(mockRedis.set).not.toHaveBeenCalled();
    });
  });

  // ── refresh ────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('lança UnauthorizedException se refresh token estiver na blacklist', async () => {
      mockRedis.get.mockResolvedValue('1');
      await expect(service.refresh('blacklisted.token')).rejects.toThrow(UnauthorizedException);
    });

    it('lança UnauthorizedException se token for inválido', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockJwt.verify.mockImplementation(() => { throw new Error('invalid'); });
      await expect(service.refresh('invalid.token')).rejects.toThrow(UnauthorizedException);
    });

    it('retorna novo accessToken com refresh token válido', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockJwt.verify.mockReturnValue({ sub: 'user-1', companyId: 'company-1' });
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());

      const result = await service.refresh('valid.refresh.token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('expiresIn');
    });
  });

  // ── register ───────────────────────────────────────────────────────────────

  describe('register', () => {
    const dto = { name: 'Novo Tecnico', email: 'tecnico@test.com', password: 'Senha@123', role: Role.TECNICO };

    it('cria usuário com role TECNICO quando solicitado por ADMIN', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u2', email: 'tecnico@test.com', role: Role.TECNICO, companyId: 'company-1', createdAt: new Date() });

      const result = await service.register(dto, 'company-1', Role.ADMIN);

      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(result.email).toBe('tecnico@test.com');
    });

    it('lança UnauthorizedException quando GESTOR tenta criar ADMIN', async () => {
      await expect(
        service.register({ ...dto, role: Role.ADMIN }, 'company-1', Role.GESTOR),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lança ConflictException se e-mail já existir na empresa', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      await expect(service.register(dto, 'company-1', Role.ADMIN)).rejects.toThrow(ConflictException);
    });

    it('normaliza e-mail para lowercase ao criar usuário', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u2', email: 'tecnico@test.com' });

      await service.register({ ...dto, email: 'TECNICO@TEST.COM' }, 'company-1', Role.ADMIN);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'tecnico@test.com' }) }),
      );
    });

    it('armazena hash bcrypt, nunca senha em plaintext', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u2' });

      await service.register(dto, 'company-1', Role.ADMIN);

      const createCall = mockPrisma.user.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).toBeDefined();
      expect(createCall.data.passwordHash).not.toBe(dto.password);
      expect(createCall.data).not.toHaveProperty('password');
    });
  });
});
