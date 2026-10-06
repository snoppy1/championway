import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { get, put } from '@vercel/blob';
import { HTTPException } from 'hono/http-exception';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { files } from '../db/schema.js';
import { blobConfigured, env } from './env.js';
import { newId } from './id.js';

/* เก็บไฟล์ไว้ที่ Vercel Blob เมื่อมี BLOB_READ_WRITE_TOKEN ไม่อย่างนั้นเก็บลงดิสก์
   ดิสก์ใช้ได้เฉพาะตอนพัฒนาในเครื่อง เพราะ serverless ล้างดิสก์ทุกครั้งที่รีไซเคิล

   คอลัมน์ path เก็บได้ทั้งชื่อไฟล์ในเครื่องและ URL ของที่เก็บภายนอก จึงไม่ต้องแก้ตาราง
   ตอนสลับที่เก็บ ตัวที่ขึ้นต้นด้วย http คือของภายนอก นอกนั้นคือไฟล์ในเครื่อง */

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

export function fileProblem(file: File) {
  if (!ALLOWED.has(file.type)) return 'รับเฉพาะไฟล์ JPG, PNG, WebP หรือ PDF';
  if (file.size > MAX_BYTES) return 'ไฟล์ต้องไม่เกิน 5 MB';
  if (file.size === 0) return 'ไฟล์ว่างเปล่า';
  return '';
}

export type StoredFile = typeof files.$inferSelect;

/** ไฟล์บนที่เก็บแบบ private: path ขึ้นต้นด้วยคำนี้ตามด้วย URL ของ blob เปิดตรงไม่ได้ ต้องผ่าน API */
const PRIVATE = 'private:';
let storeAccess: 'public' | 'private' = 'public';

export async function storeFile(ownerType: string, ownerId: string, file: File) {
  const id = newId('fil');
  const name = `${id}${extname(file.name) || ''}`;
  let path: string;

  if (blobConfigured) {
    // addRandomSuffix ปิดไว้เพราะ id ของเราสุ่มอยู่แล้ว จะได้ตามรอยกลับมาที่แถวนี้ได้
    /* ที่เก็บตอบผิดพลาด (คีย์หมดอายุ ตั้งที่เก็บเป็น private ฯลฯ) บอกสาเหตุจาก Vercel Blob ตรง ๆ
       ไม่ปล่อยเป็น 500 เปล่า ๆ ที่ตามหาสาเหตุไม่ได้ ข้อความของ Blob ไม่มีคีย์หรือค่าลับ */
    try {
      const upload = (access: 'public' | 'private') => put(`submissions/${name}`, file, {
        access, token: env.blobToken, addRandomSuffix: false, contentType: file.type,
      });
      /* ที่เก็บของ Vercel Blob ตั้งเป็น public หรือ private ได้ตอนสร้าง (dev ตั้งเป็น private ไว้)
         ลองแบบที่เคยใช้ได้ก่อน ถ้าที่เก็บบอกว่าผิดแบบ ค่อยสลับ ไฟล์ private เปิดผ่าน /api/files/:id ที่ตรวจสิทธิ์ */
      let blob;
      try {
        blob = await upload(storeAccess);
      } catch (error) {
        if (!/(public|private) access on a (private|public) store/i.test(String(error))) throw error;
        storeAccess = storeAccess === 'public' ? 'private' : 'public';
        blob = await upload(storeAccess);
      }
      path = storeAccess === 'private' ? `${PRIVATE}${blob.url}` : blob.url;
    } catch (error) {
      console.error('[files] blob upload failed', error);
      throw new HTTPException(502, { message: `ที่เก็บไฟล์ตอบผิดพลาด: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}` });
    }
  } else {
    await mkdir(env.uploadDir, { recursive: true });
    await writeFile(join(env.uploadDir, name), Buffer.from(await file.arrayBuffer()));
    path = name;
  }

  const [row] = await db.insert(files).values({
    id, ownerType, ownerId, path, originalName: file.name, mime: file.type, size: file.size,
  }).returning();
  return row;
}

/** ที่อยู่ที่เปิดไฟล์ได้ ของบนที่เก็บแบบ public ใช้ URL ตรง ของในเครื่องหรือแบบ private ผ่าน API ที่ตรวจสิทธิ์ก่อน */
export function fileUrl(row: StoredFile) {
  return row.path.startsWith('http') ? row.path : `/api/files/${row.id}`;
}

/** เนื้อไฟล์สำหรับ /api/files/:id: ไฟล์ในเครื่อง หรือดึงจากที่เก็บแบบ private (ของ public redirect ไปเปิดตรง) */
export async function readStoredFile(row: StoredFile): Promise<ArrayBuffer | Buffer> {
  if (row.path.startsWith(PRIVATE)) {
    const result = await get(row.path.slice(PRIVATE.length), { access: 'private', token: env.blobToken });
    if (!result || !result.stream) throw new Error('ไม่พบไฟล์บนที่เก็บ');
    return new Response(result.stream).arrayBuffer();
  }
  return readFile(join(env.uploadDir, row.path));
}

export function publicFile(row: StoredFile) {
  return { id: row.id, url: fileUrl(row), originalName: row.originalName, mime: row.mime, size: row.size };
}

export async function filesOf(ownerType: string, ownerId: string) {
  return db.select().from(files)
    .where(and(eq(files.ownerType, ownerType), eq(files.ownerId, ownerId)));
}

/* ผูกไฟล์ที่อัปโหลดไว้ก่อนเข้ากับใบที่เพิ่งส่ง ย้ายเจ้าของได้เฉพาะไฟล์ที่ผู้ใช้คนนั้น
   อัปโหลดเองและยังไม่ถูกผูกกับใบไหน กันไม่ให้ใครแนบไฟล์ของคนอื่นเข้าใบตัวเอง */
export async function attachFiles(ids: string[], userId: string, ownerType: string, ownerId: string) {
  if (!ids.length) return [];
  return db.update(files)
    .set({ ownerType, ownerId })
    .where(and(inArray(files.id, ids), eq(files.ownerType, 'user'), eq(files.ownerId, userId)))
    .returning();
}
