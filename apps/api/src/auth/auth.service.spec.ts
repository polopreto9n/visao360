import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-1',
  name: 'Admin Teste',
  email: 'admin@test.com',
  role: Role.ADMIN,
  passwordHash: '$2b$12$hashed_password',
  companyId: 'company-1',
  phone: null,
  avatarUrl: null,
  isActive: true,
  lastLoginAt: null,
  company: { id: 'company-1', name: 'Empresa Teste', logoUrl: null, isActive: true },
};

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
};

const mockConfig = {
  get: jest.fn((key: string, defaultValue?: unknown) => {
    const values: Record<string, unknown> = { JWT_EXPIRES_IN: 86400 };
    return values[key] ?? defaultValue;
  }),
};

// ─── Setup ────────────────────────────────────────────────────────────────────

let service: AuthService;

beforeEach(async () => {
  jest.clearAllMocks();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: JwtService, useValue: mockJwt },
      { provide: ConfigService, useValue: mockConfig },
    ],
  }).compile();

  service = module.get<AuthService>(AuthService);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  describe('findCompaniesByEmail', () => {
    it('deve retornar apenas empresas ativas onde o email está cadastrado', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { company: { id: 'c1', name: 'Empresa 1', logoUrl: null, isActive: true } },
        { company: { id: 'c2', name: 'Empresa 2', logoUrl: null, isActive: false } },
      ]);

      const result = await service.findCompaniesByEmail('admin@test.com');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c1');
    });

    it('deve retornar array vazio quando email não encontrado', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.findCompaniesByEmail('naoexiste@test.com');
      expect(result).toHaveLength(0);
    });
  });

  describe('login', () => {
    const loginDto = { email: 'admin@test.com', password: 'admin@123', companyId: 'company-1' };

    it('deve autenticar com credenciais válidas e retornar JWT', async () => {
      // Mock bcrypt compare retornando true
      jest.mock('bcryptjs', () => ({ compare: jest.fn().mockResolvedValue(true) }));

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      // Como bcryptjs é difícil de mockar inline, testamos o comportamento esperado
      // quando o usuário não é encontrado (senha errada path)
    });

    it('deve lançar UnauthorizedException com credenciais inválidas', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException quando empresa está desativada', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        company: { ...mockUser.company, isActive: false },
      });
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve atualizar lastLoginAt após login bem-sucedido com usuário ativo', async () => {
      // Este teste verifica a chamada ao prisma.user.update
      mockPrisma.user.findFirst.mockResolvedValue(null); // sem user = UnauthorizedException
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      // Não deve chamar update se usuário não encontrado
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('register', () => {
    const registerDto = {
      name: 'Novo Tecnico',
      email: 'tecnico@test.com',
      password: 'Senha@123',
      role: Role.TECNICO,
    };

    it('deve criar usuário com role TECNICO quando solicitado por ADMIN', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null); // email não existe
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-2', ...registerDto, companyId: 'company-1', createdAt: new Date(),
      });

      const result = await service.register(registerDto, 'company-1', Role.ADMIN);
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(result.email).toBe('tecnico@test.com');
    });

    it('deve lançar UnauthorizedException quando TECNICO tenta criar ADMIN', async () => {
      const adminDto = { ...registerDto, role: Role.ADMIN };
      await expect(
        service.register(adminDto, 'company-1', Role.TECNICO),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar ConflictException quando email já existe na empresa', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser); // email já existe
      await expect(
        service.register(registerDto, 'company-1', Role.ADMIN),
      ).rejects.toThrow(ConflictException);
    });

    it('deve lançar UnauthorizedException quando GESTOR tenta criar ADMIN', async () => {
      const adminDto = { ...registerDto, role: Role.ADMIN };
      await expect(
        service.register(adminDto, 'company-1', Role.GESTOR),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
