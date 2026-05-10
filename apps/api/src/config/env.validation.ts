import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min, Max, validateSync } from 'class-validator';

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
  declare DATABASE_URL: string;

  @IsString()
  declare JWT_SECRET: string;

  @IsInt()
  @Min(300)
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
}

export function envValidation(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Variaveis de ambiente invalidas:\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }

  return validated;
}
