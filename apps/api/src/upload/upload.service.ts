import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { withRetry } from '../common/utils/retry';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
]);

// Whitelist estrita de folders — previne path traversal e organização caótica
const ALLOWED_FOLDERS = new Set([
  'executions', 'work-orders', 'assets', 'incidents', 'signatures', 'general',
]);

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadsDir = join(process.cwd(), 'uploads');

  constructor(private readonly config: ConfigService) {
    if (!existsSync(this.uploadsDir)) {
      mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string,
    companyId: string,
  ): Promise<{ url: string; key: string; size: number; mimeType: string }> {
    this.validateFolder(folder);
    this.validateFile(file);

    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    const supabaseKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && supabaseKey) {
      return this.uploadToSupabase(file, folder, companyId, supabaseUrl, supabaseKey);
    }

    return this.uploadToLocal(file, folder, companyId);
  }

  private validateFolder(folder: string): void {
    // Rejeita qualquer tentativa de path traversal ou folder não autorizado
    if (!ALLOWED_FOLDERS.has(folder)) {
      throw new BadRequestException(
        `Pasta inválida: "${folder}". Permitidas: ${[...ALLOWED_FOLDERS].join(', ')}`,
      );
    }
  }

  private validateFile(file: Express.Multer.File): void {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Arquivo vazio ou corrompido');
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de arquivo não permitido: ${file.mimetype}. Permitidos: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException(
        `Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(1)}MB. Máximo: 10MB`,
      );
    }

    // Validação básica de magic bytes para JPEG/PNG (previne extensão falsa)
    this.validateMagicBytes(file);
  }

  private validateMagicBytes(file: Express.Multer.File): void {
    const buf = file.buffer;
    if (file.mimetype === 'image/jpeg') {
      if (buf[0] !== 0xff || buf[1] !== 0xd8) {
        throw new BadRequestException('Arquivo JPEG inválido (magic bytes incorretos)');
      }
    } else if (file.mimetype === 'image/png') {
      if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
        throw new BadRequestException('Arquivo PNG inválido (magic bytes incorretos)');
      }
    } else if (file.mimetype === 'application/pdf') {
      const header = buf.subarray(0, 4).toString('ascii');
      if (header !== '%PDF') {
        throw new BadRequestException('Arquivo PDF inválido (magic bytes incorretos)');
      }
    }
  }

  private async uploadToLocal(
    file: Express.Multer.File,
    folder: string,
    companyId: string,
  ) {
    const ext = this.safeExtension(file);
    const key = `${companyId}/${folder}/${randomUUID()}${ext}`;
    const filePath = join(this.uploadsDir, key);

    const dir = join(this.uploadsDir, companyId, folder);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(filePath);
      stream.write(file.buffer);
      stream.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    const baseUrl = this.config.get<string>(
      'API_BASE_URL',
      `http://localhost:${this.config.get('PORT', 3001)}`,
    );
    const url = `${baseUrl}/uploads/${key}`;
    this.logger.log(`Upload local: ${key} (${(file.size / 1024).toFixed(1)}KB)`);
    return { url, key, size: file.size, mimeType: file.mimetype };
  }

  private async uploadToSupabase(
    file: Express.Multer.File,
    folder: string,
    companyId: string,
    supabaseUrl: string,
    supabaseKey: string,
  ) {
    const ext = this.safeExtension(file);
    const key = `${companyId}/${folder}/${randomUUID()}${ext}`;
    const bucket = 'visao360';

    // Retry com exponential backoff: erros 5xx do Supabase são transitórios
    await withRetry(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15_000);
        try {
          const response = await fetch(
            `${supabaseUrl}/storage/v1/object/${bucket}/${key}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${supabaseKey}`,
                'Content-Type': file.mimetype,
                'x-upsert': 'false',
              },
              body: file.buffer,
              signal: controller.signal,
            },
          );
          if (!response.ok) {
            const err = new Error(`Supabase storage HTTP ${response.status}`);
            (err as Error & { status: number }).status = response.status;
            throw err;
          }
        } finally {
          clearTimeout(timer);
        }
      },
      { maxAttempts: 3, baseDelayMs: 300, maxDelayMs: 3000 },
    );

    const url = `${supabaseUrl}/storage/v1/object/public/${bucket}/${key}`;
    this.logger.log(`Upload Supabase: ${key} (${(file.size / 1024).toFixed(1)}KB)`);
    return { url, key, size: file.size, mimeType: file.mimetype };
  }

  private safeExtension(file: Express.Multer.File): string {
    // Usa a extensão do originalname apenas se for segura (sem path traversal)
    const raw = extname(file.originalname ?? '').toLowerCase();
    const safe = /^\.[a-z0-9]{1,6}$/.test(raw) ? raw : `.${file.mimetype.split('/')[1]}`;
    return safe;
  }
}
