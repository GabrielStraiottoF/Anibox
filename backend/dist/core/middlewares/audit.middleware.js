"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditMiddleware = void 0;
const common_1 = require("@nestjs/common");
const jwt = require("jsonwebtoken");
let AuditMiddleware = class AuditMiddleware {
    constructor() {
        this.logger = new common_1.Logger('AuditMiddleware');
    }
    use(req, res, next) {
        const start = Date.now();
        const { ip, method, originalUrl, headers } = req;
        const userAgent = headers['user-agent'] || '';
        let userId = null;
        let username = null;
        const authHeader = headers['authorization'];
        if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.decode(token);
                if (decoded) {
                    userId = decoded.sub || decoded.id || null;
                    username = decoded.username || null;
                }
            }
            catch (err) {
                this.logger.warn(`[Audit] Tentativa de login/acesso com Token JWT malformado do IP: ${ip}`);
            }
        }
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
            let action = 'GENERAL_ACCESS';
            if (originalUrl.startsWith('/api/v1/auth/login') && method === 'POST') {
                action = statusCode === 201 ? 'USER_LOGIN_SUCCESS' : 'USER_LOGIN_FAILED';
            }
            else if (originalUrl.startsWith('/api/v1/auth/register') && method === 'POST') {
                action = 'USER_REGISTRATION';
            }
            else if (originalUrl.includes('/reviews') && ['POST', 'PUT', 'DELETE'].includes(method)) {
                action = `REVIEW_${method}`;
            }
            else if (originalUrl.includes('/lists') && ['POST', 'PUT', 'DELETE'].includes(method)) {
                action = `LIST_${method}`;
            }
            else if (originalUrl.includes('/users/delete-account') && method === 'DELETE') {
                action = 'ACCOUNT_DELETION';
            }
            else if (statusCode >= 400) {
                action = 'SECURITY_ALERT_HTTP_ERROR';
            }
            this.logger.log(`[AUDIT] Action: ${action} | User: ${username || 'Anon'} (${userId || 'N/A'}) | IP: ${ip} | UA: ${userAgent} | Status: ${statusCode} | ${duration}ms`);
            try {
            }
            catch (dbError) {
                this.logger.error(`Erro ao salvar log de auditoria no banco de dados: ${dbError.message}`);
            }
        });
        next();
    }
};
exports.AuditMiddleware = AuditMiddleware;
exports.AuditMiddleware = AuditMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], AuditMiddleware);
//# sourceMappingURL=audit.middleware.js.map