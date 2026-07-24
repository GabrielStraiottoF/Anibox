import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AuditMiddleware');
  
  // Como o PrismaService seria injetado no módulo real, simulamos a gravação.
  // Em produção, isso seria: constructor(private prisma: PrismaService) {}
  constructor() {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const { ip, method, originalUrl, headers } = req;
    const userAgent = headers['user-agent'] || '';

    // Tentar extrair o usuário do JWT no Header de Autorização
    let userId: string | null = null;
    let username: string | null = null;

    const authHeader = headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        // Em produção, usar a chave secreta real do arquivo .env
        const decoded: any = jwt.decode(token);
        if (decoded) {
          userId = decoded.sub || decoded.id || null;
          username = decoded.username || null;
        }
      } catch (err) {
        // Apenas silencia o erro, pois a validação real será feita pelo AuthGuard.
        // Registramos a falha na tentativa de leitura do token para fins de segurança.
        this.logger.warn(`[Audit] Tentativa de login/acesso com Token JWT malformado do IP: ${ip}`);
      }
    }

    // Intercepta a finalização da resposta para salvar os detalhes
    res.on('finish', async () => {
      const duration = Date.now() - start;
      const statusCode = res.statusCode;

      const logPayload = {
        method,
        url: originalUrl,
        statusCode,
        durationMs: duration,
        username: username || 'ANONYMOUS',
        timestamp: new Date().toISOString()
      };

      // Mapeamento simplificado de ações com base na rota e verbo
      let action = 'GENERAL_ACCESS';
      if (originalUrl.startsWith('/api/v1/auth/login') && method === 'POST') {
        action = statusCode === 201 ? 'USER_LOGIN_SUCCESS' : 'USER_LOGIN_FAILED';
      } else if (originalUrl.startsWith('/api/v1/auth/register') && method === 'POST') {
        action = 'USER_REGISTRATION';
      } else if (originalUrl.includes('/reviews') && ['POST', 'PUT', 'DELETE'].includes(method)) {
        action = `REVIEW_${method}`;
      } else if (originalUrl.includes('/lists') && ['POST', 'PUT', 'DELETE'].includes(method)) {
        action = `LIST_${method}`;
      } else if (originalUrl.includes('/users/delete-account') && method === 'DELETE') {
        action = 'ACCOUNT_DELETION';
      } else if (statusCode >= 400) {
        action = 'SECURITY_ALERT_HTTP_ERROR';
      }

      // Log estruturado no console para coleta do Loki/Promtail/OpenTelemetry
      this.logger.log(
        `[AUDIT] Action: ${action} | User: ${username || 'Anon'} (${userId || 'N/A'}) | IP: ${ip} | UA: ${userAgent} | Status: ${statusCode} | ${duration}ms`
      );

      // Persistência assíncrona no PostgreSQL (Prisma) em produção
      try {
        // await this.prisma.auditLog.create({
        //   data: {
        //     userId,
        //     action,
        //     ipAddress: ip,
        //     userAgent,
        //     payload: logPayload
        //   }
        // });
      } catch (dbError: any) {
        this.logger.error(`Erro ao salvar log de auditoria no banco de dados: ${dbError.message}`);
      }
    });

    next();
  }
}
