import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../src/main';

let cachedHandler: ((req: VercelRequest, res: VercelResponse) => unknown) | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!cachedHandler) {
    const app = await createApp();
    await app.init();
    cachedHandler = app.getHttpAdapter().getInstance();
  }

  return cachedHandler(req, res);
}
