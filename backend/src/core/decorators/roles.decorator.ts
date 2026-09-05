import { SetMetadata } from '@nestjs/common';
import { AuthenticatedUser } from '../types/auth.types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AuthenticatedUser['role'][]) => SetMetadata(ROLES_KEY, roles);
