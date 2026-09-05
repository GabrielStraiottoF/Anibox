import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const file = `${root}/src/app/core/config/runtime-config.ts`;
const configured = (process.env.ANIBOX_API_URL || '').trim();
const fallback = process.env.NODE_ENV === 'production'
  ? 'https://anibox-backend.vercel.app/api/v1'
  : 'http://localhost:3000/api/v1';
const apiUrl = (configured || fallback).replace(/\/$/, '');

await mkdir(dirname(file), { recursive: true });
await writeFile(file, `export const API_URL = ${JSON.stringify(apiUrl)};\n`, 'utf8');
console.log(`Generated frontend API URL: ${apiUrl.replace(/https?:\/\/([^/]+).*/, '$1')}`);
