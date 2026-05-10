import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_SIZE_MB = 10;

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
    this.validateFile(file);

    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    const supabaseKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && supabaseKey) {
      return this.uploadToSupabase(file, folder, companyId, supabaseUrl, supabaseKey);
    }

    return this.uploadToLocal(file, folder, companyId);
  }

  private validateFile(file: Express.Multer.File) {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de arquivo não permitido: ${file.mimetype}. Permitidos: ${ALLOWED_TYPES.join(', ')}`,
      );
    }

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_SIZE_MB) {
      throw new BadRequestException(`Arquivo muito grande: ${sizeMB.toFixed(1)}MB. Máximo: ${MAX_SIZE_MB}MB`);
    }
  }

  private async uploadToLocal(
    file: Express.Multer.File,
    folder: string,
    companyId: string,
  ) {
    const ext = extname(file.originalname) || `.${file.mimetype.split('/')[1]}`;
    const key = `${companyId}/${folder}/${randomUUID()}${ext}`;
    const filePath = join(this.uploadsDir, key);

    // Cria subdiretórios se necessário
    const dir = join(this.uploadsDir, companyId, folder);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    // Escreve o arquivo
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(filePath);
      stream.write(file.buffer);
      stream.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    const baseUrl = this.config.get<string>('API_BASE_URL', `http://localhost:${this.config.get('PORT', 3001)}`);
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
    const ext = extname(file.originalname) || `.${file.mimetype.split('/')[1]}`;
    const key = `${companyId}/${folder}/${randomUUID()}${ext}`;
    const bucket = 'visao360';

    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/${bucket}/${key}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': file.mimetype,
          'x-upsert': 'true',
        },
        body: file.buffer,
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(`Erro ao fazer upload no Supabase: ${err}`);
    }

    const url = `${supabaseUrl}/storage/v1/object/public/${bucket}/${key}`;
    this.logger.log(`Upload Supabase: ${key} (${(file.size / 1024).toFixed(1)}KB)`);

    return { url, key, size: file.size, mimeType: file.mimetype };
  }
}
