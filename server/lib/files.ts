import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { db } from '../db/client';
import { files } from '../db/schema';
import { env } from './env';
import { newId } from './id';

/* เก็บไฟล์ลงโฟลเดอร์ในเครื่องก่อน ตอนย้ายไป S3 หรือ R2 ให้แก้สองฟังก์ชันนี้
   โครงตารางไม่ต้องแก้ เพราะ path เก็บได้ทั้งชื่อไฟล์และ object key */

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

export function fileProblem(file: File) {
  if (!ALLOWED.has(file.type)) return 'รับเฉพาะไฟล์ JPG, PNG, WebP หรือ PDF';
  if (file.size > MAX_BYTES) return 'ไฟล์ต้องไม่เกิน 5 MB';
  return '';
}

export async function storeFile(ownerType: string, ownerId: string, file: File) {
  const id = newId('fil');
  const name = `${id}${extname(file.name) || ''}`;
  await mkdir(env.uploadDir, { recursive: true });
  await writeFile(join(env.uploadDir, name), Buffer.from(await file.arrayBuffer()));
  const [row] = await db.insert(files).values({
    id, ownerType, ownerId, path: name, originalName: file.name, mime: file.type, size: file.size,
  }).returning();
  return row;
}
