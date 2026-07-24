import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Ocorreu um erro interno no servidor.';
    let errorType = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        message = (exceptionResponse as any).message || message;
        errorType = (exceptionResponse as any).error || errorType;
      } else if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      }
    } else {
      // Tratamento para exceções do banco de dados (ex: Prisma Client Errors)
      const err = exception as any;
      
      if (err.code) {
        // Códigos comuns do Prisma Client
        switch (err.code) {
          case 'P2002': // Violação de restrição única (Unique constraint failed)
            status = HttpStatus.CONFLICT;
            const target = err.meta?.target;
            const fieldsInfo = Array.isArray(target)
              ? target.join(', ')
              : (typeof target === 'string' ? target : '');
            const targetFields = fieldsInfo ? ` nos campos (${fieldsInfo})` : '';
            message = `Conflito de registro: Um registro com este valor já existe${targetFields}.`;
            errorType = 'Conflict';
            break;
          case 'P2025': // Registro não encontrado (Record to update or delete not found)
            status = HttpStatus.NOT_FOUND;
            message = 'O registro solicitado não foi encontrado para realizar esta operação.';
            errorType = 'Not Found';
            break;
          case 'P2003': // Falha de chave estrangeira (Foreign key constraint failed)
            status = HttpStatus.BAD_REQUEST;
            message = 'Operação inválida: Dependência de chave estrangeira não satisfeita.';
            errorType = 'Bad Request';
            break;
          default:
            this.logger.error(`[Database Error] Code: ${err.code} | Message: ${err.message}`);
            message = 'Erro ao processar a operação no banco de dados.';
            errorType = 'Database Error';
        }
      } else {
        // Erro desconhecido de runtime (Node.js, Typings, etc)
        this.logger.error(
          `[Unhandled Error] Path: ${request.url} | Message: ${err.message || err}`,
          err.stack
        );
      }
    }

    // Estrutura de resposta padronizada da API
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error: errorType,
      message: Array.isArray(message) ? message[0] : message, // Se for validação do class-validator, pega o primeiro erro
    };

    // Logging do erro
    if (status >= 500) {
      this.logger.error(
        `HTTP ${status} | ${request.method} ${request.url} - Error: ${errorResponse.message}`
      );
    } else {
      this.logger.warn(
        `HTTP ${status} | ${request.method} ${request.url} - Warning: ${errorResponse.message}`
      );
    }

    response.status(status).json(errorResponse);
  }
}
