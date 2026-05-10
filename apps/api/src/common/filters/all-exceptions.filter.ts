import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  details?: unknown;
  timestamp: string;
  path: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.buildErrorResponse(exception, request.url);

    if (errorResponse.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${errorResponse.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} → ${errorResponse.statusCode}: ${JSON.stringify(errorResponse.message)}`,
      );
    }

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private buildErrorResponse(exception: unknown, url: string): ErrorResponse {
    const timestamp = new Date().toISOString();
    const path = url;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      const message =
        typeof res === 'string'
          ? res
          : (res as { message?: string | string[] }).message ?? exception.message;

      return { statusCode: status, message, timestamp, path };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaError(exception, timestamp, path);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Dados inválidos na requisição ao banco de dados',
        timestamp,
        path,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor',
      timestamp,
      path,
    };
  }

  private handlePrismaError(
    error: Prisma.PrismaClientKnownRequestError,
    timestamp: string,
    path: string,
  ): ErrorResponse {
    switch (error.code) {
      case 'P2002': {
        const fields = (error.meta?.target as string[])?.join(', ') ?? 'campo';
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `Já existe um registro com o mesmo ${fields}`,
          timestamp,
          path,
        };
      }
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Registro não encontrado',
          timestamp,
          path,
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Referência inválida: registro relacionado não existe',
          timestamp,
          path,
        };
      case 'P2014':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Violação de constraint: a alteração quebraria uma relação existente',
          timestamp,
          path,
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Erro no banco de dados',
          details: { code: error.code },
          timestamp,
          path,
        };
    }
  }
}
