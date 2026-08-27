import type { Request, Response } from 'express';
import { createApp } from '../src/main';

let cachedHandler: ((req: Request, res: Response) => unknown) | null = null;

export default async function handler(req: Request, res: Response) {
  if (!cachedHandler) {
    const app = await createApp();
    await app.init();
    cachedHandler = app.getHttpAdapter().getInstance();
  }

  return cachedHandler(req, res);
}
