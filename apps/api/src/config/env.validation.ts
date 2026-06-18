import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  MinLength,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1024)
  @Max(65535)
  @IsOptional()
  PORT: number = 3001;

  @IsString()
  @MinLength(20, { message: 'DATABASE_URL deve ser uma URL de conexão válida' })
  declare DATABASE_URL: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET deve ter no mínimo 32 caracteres' })
  declare JWT_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET deve ter no mínimo 32 caracteres e ser diferente do JWT_SECRET' })
  declare JWT_REFRESH_SECRET: string;

  @IsInt()
  @Min(300, { message: 'JWT_EXPIRES_IN deve ser no mínimo 300 segundos' })
  @IsOptional()
  JWT_EXPIRES_IN: number = 86400;

  @IsString()
  @IsOptional()
  REDIS_URL: string = 'redis://localhost:6379';

  @IsString()
  @IsOptional()
  REDIS_PASSWORD: string = '';

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:3000';

  @IsString()
  @IsOptional()
  LOG_LEVEL: string = 'info';

  @IsString()
  @IsOptional()
  SUPABASE_URL: string = '';

  @IsString()
  @IsOptional()
  SUPABASE_ANON_KEY: string = '';

  @IsString()
  @IsOptional()
  SUPABASE_SERVICE_ROLE_KEY: string = '';

  // Stripe — opcionais em dev, obrigatórios em produção para billing funcionar
  @IsString()
  @IsOptional()
  STRIPE_SECRET_KEY: string = '';

  @IsString()
  @IsOptional()
  STRIPE_WEBHOOK_SECRET: string = '';

  // Price IDs dos planos no Stripe (obrigatórios em produção)
  @IsString()
  @IsOptional()
  STRIPE_PRICE_STARTER: string = '';

  @IsString()
  @IsOptional()
  STRIPE_PRICE_PROFESSIONAL: string = '';

  @IsString()
  @IsOptional()
  STRIPE_PRICE_ENTERPRISE: string = '';

  // URL pública do frontend (usada nos redirects do Stripe)
  @IsString()
  @IsOptional()
  FRONTEND_URL: string = 'http://localhost:3000';
}

export function envValidation(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => {
        const constraints = Object.values(e.constraints ?? {}).join('; ');
        return `  [${e.property}]: ${constraints}`;
      })
      .join('\n');

    throw new Error(`❌ Variáveis de ambiente inválidas:\n${messages}`);
  }

  return validated;
}
