import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadService } from './upload.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockConfig = {
  get: jest.fn((key: string, fallback?: unknown) => {
    const map: Record<string, unknown> = {
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      API_BASE_URL: 'http://localhost:3001',
      PORT: 3001,
    };
    return map[key] !== undefined ? map[key] : fallback;
  }),
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeJpegBuffer = () => {
  const buf = Buffer.alloc(100);
  buf[0] = 0xff; buf[1] = 0xd8; // JPEG magic bytes
  return buf;
};

const makePngBuffer = () => {
  const buf = Buffer.alloc(100);
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47; // PNG magic bytes
  return buf;
};

const makePdfBuffer = () => {
  const buf = Buffer.from('%PDFxxxxxxxx');
  return buf;
};

const makeFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File => ({
  fieldname: 'file',
  originalname: 'photo.jpg',
  encoding: '7bit',
  mimetype: 'image/jpeg',
  size: 1024,
  buffer: makeJpegBuffer(),
  destination: '',
  filename: '',
  path: '',
  stream: null as any,
  ...overrides,
});

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('UploadService', () => {
  let service: UploadService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
  });

  // ── Validação de folder ────────────────────────────────────────────────────

  describe('validação de folder (path traversal protection)', () => {
    it('rejeita folder não autorizado', async () => {
      await expect(
        service.uploadFile(makeFile(), 'unauthorized-folder', 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita tentativa de path traversal: ../etc/passwd', async () => {
      await expect(
        service.uploadFile(makeFile(), '../etc/passwd', 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita tentativa de path traversal com encoding: ..%2F..%2Fetc', async () => {
      await expect(
        service.uploadFile(makeFile(), '..%2F..%2Fetc', 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('aceita folders da whitelist: executions', async () => {
      // Não deve lançar BadRequestException na validação do folder
      // (pode falhar em outro ponto como escrita em disco, que é OK para o teste)
      const promise = service.uploadFile(makeFile(), 'executions', 'company-1');
      await expect(promise).resolves.toBeDefined();
    });

    it('aceita todos os folders permitidos', async () => {
      const allowedFolders = ['executions', 'work-orders', 'assets', 'incidents', 'signatures', 'general'];
      for (const folder of allowedFolders) {
        const promise = service.uploadFile(makeFile(), folder, 'company-1');
        // Pode falhar na escrita em disco (sem mock do fs), mas não na validação
        await expect(promise).resolves.toBeDefined();
      }
    });
  });

  // ── Validação de MIME type ─────────────────────────────────────────────────

  describe('validação de MIME type', () => {
    it('rejeita application/x-executable', async () => {
      await expect(
        service.uploadFile(makeFile({ mimetype: 'application/x-executable', buffer: Buffer.from('ELF') }), 'general', 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita text/html (potencial XSS via upload)', async () => {
      await expect(
        service.uploadFile(makeFile({ mimetype: 'text/html', buffer: Buffer.from('<script>alert(1)</script>') }), 'general', 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita application/javascript', async () => {
      await expect(
        service.uploadFile(makeFile({ mimetype: 'application/javascript', buffer: Buffer.from('alert(1)') }), 'general', 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('aceita image/jpeg', async () => {
      await expect(service.uploadFile(makeFile(), 'general', 'company-1')).resolves.toBeDefined();
    });

    it('aceita image/png', async () => {
      await expect(
        service.uploadFile(makeFile({ mimetype: 'image/png', buffer: makePngBuffer() }), 'general', 'company-1'),
      ).resolves.toBeDefined();
    });

    it('aceita application/pdf', async () => {
      await expect(
        service.uploadFile(makeFile({ mimetype: 'application/pdf', buffer: makePdfBuffer(), originalname: 'doc.pdf' }), 'general', 'company-1'),
      ).resolves.toBeDefined();
    });
  });

  // ── Validação de magic bytes ───────────────────────────────────────────────

  describe('validação de magic bytes (extensão falsa)', () => {
    it('rejeita JPEG com magic bytes inválidos (arquivo renomeado)', async () => {
      const invalidJpeg = Buffer.alloc(100, 0x00); // sem magic bytes corretos
      await expect(
        service.uploadFile(makeFile({ buffer: invalidJpeg }), 'general', 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita PNG com magic bytes inválidos', async () => {
      const invalidPng = Buffer.alloc(100, 0x00);
      await expect(
        service.uploadFile(makeFile({ mimetype: 'image/png', buffer: invalidPng }), 'general', 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejeita PDF com magic bytes inválidos', async () => {
      const invalidPdf = Buffer.from('NOT_PDF_HEADER');
      await expect(
        service.uploadFile(makeFile({ mimetype: 'application/pdf', buffer: invalidPdf, originalname: 'doc.pdf' }), 'general', 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('aceita JPEG com magic bytes corretos', async () => {
      await expect(
        service.uploadFile(makeFile({ buffer: makeJpegBuffer() }), 'general', 'company-1'),
      ).resolves.toBeDefined();
    });
  });

  // ── Validação de tamanho ───────────────────────────────────────────────────

  describe('validação de tamanho', () => {
    it('rejeita arquivo maior que 10MB', async () => {
      const oversized = makeFile({ size: 11 * 1024 * 1024 });
      await expect(service.uploadFile(oversized, 'general', 'company-1')).rejects.toThrow(BadRequestException);
    });

    it('aceita arquivo de exatamente 10MB', async () => {
      const maxSize = makeFile({ size: 10 * 1024 * 1024 });
      await expect(service.uploadFile(maxSize, 'general', 'company-1')).resolves.toBeDefined();
    });

    it('rejeita buffer vazio', async () => {
      const empty = makeFile({ buffer: Buffer.alloc(0), size: 0 });
      await expect(service.uploadFile(empty, 'general', 'company-1')).rejects.toThrow(BadRequestException);
    });
  });
});
