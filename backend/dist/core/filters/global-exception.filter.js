"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
let GlobalExceptionFilter = class GlobalExceptionFilter {
    constructor() {
        this.logger = new common_1.Logger('GlobalExceptionFilter');
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Ocorreu um erro interno no servidor.';
        let errorType = 'Internal Server Error';
        if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
                message = exceptionResponse.message || message;
                errorType = exceptionResponse.error || errorType;
            }
            else if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
            }
        }
        else {
            const err = exception;
            if (err.code) {
                switch (err.code) {
                    case 'P2002':
                        status = common_1.HttpStatus.CONFLICT;
                        const target = err.meta?.target;
                        const fieldsInfo = Array.isArray(target)
                            ? target.join(', ')
                            : (typeof target === 'string' ? target : '');
                        const targetFields = fieldsInfo ? ` nos campos (${fieldsInfo})` : '';
                        message = `Conflito de registro: Um registro com este valor já existe${targetFields}.`;
                        errorType = 'Conflict';
                        break;
                    case 'P2025':
                        status = common_1.HttpStatus.NOT_FOUND;
                        message = 'O registro solicitado não foi encontrado para realizar esta operação.';
                        errorType = 'Not Found';
                        break;
                    case 'P2003':
                        status = common_1.HttpStatus.BAD_REQUEST;
                        message = 'Operação inválida: Dependência de chave estrangeira não satisfeita.';
                        errorType = 'Bad Request';
                        break;
                    default:
                        this.logger.error(`[Database Error] Code: ${err.code} | Message: ${err.message}`);
                        message = 'Erro ao processar a operação no banco de dados.';
                        errorType = 'Database Error';
                }
            }
            else {
                this.logger.error(`[Unhandled Error] Path: ${request.url} | Message: ${err.message || err}`, err.stack);
            }
        }
        const errorResponse = {
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            method: request.method,
            error: errorType,
            message: Array.isArray(message) ? message[0] : message,
        };
        if (status >= 500) {
            this.logger.error(`HTTP ${status} | ${request.method} ${request.url} - Error: ${errorResponse.message}`);
        }
        else {
            this.logger.warn(`HTTP ${status} | ${request.method} ${request.url} - Warning: ${errorResponse.message}`);
        }
        response.status(status).json(errorResponse);
    }
};
exports.GlobalExceptionFilter = GlobalExceptionFilter;
exports.GlobalExceptionFilter = GlobalExceptionFilter = __decorate([
    (0, common_1.Catch)()
], GlobalExceptionFilter);
//# sourceMappingURL=global-exception.filter.js.map