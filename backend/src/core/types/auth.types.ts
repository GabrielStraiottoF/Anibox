export interface AccessTokenPayload {
  sub: string;
  email: string;
  username: string;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  type: 'refresh';
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
}
