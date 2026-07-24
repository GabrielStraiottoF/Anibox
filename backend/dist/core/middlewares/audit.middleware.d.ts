import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
export declare class AuditMiddleware implements NestMiddleware {
    private readonly logger;
    constructor();
    use(req: Request, res: Response, next: NextFunction): void;
}
