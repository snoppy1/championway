export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/* เรียก API ด้วย path เดียวกับหน้าเว็บเสมอ คุกกี้ session จึงเป็น same-site
   ตอน dev มี Vite proxy พา /api ไปที่เซิร์ฟเวอร์ ตอน production อยู่โดเมนเดียวกัน */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const text = await response.text();
  let payload: unknown = text;
  try { payload = text ? JSON.parse(text) : null; } catch { /* ไม่ใช่ JSON */ }

  if (!response.ok) {
    /* ถ้าเซิร์ฟเวอร์ตอบเป็น JSON ของเราเอง ให้ใช้ข้อความนั้น แต่ถ้าตอบเป็นอย่างอื่น
       เช่นหน้า error ของโฮสต์ตอนฟังก์ชันบูตไม่ขึ้น ต้องบอกรหัสสถานะออกมาด้วย
       ไม่อย่างนั้นจะแยกไม่ออกจากกรณีที่ต่อเซิร์ฟเวอร์ไม่ติดเลย */
    const fromServer = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : '';
    throw new ApiError(response.status, fromServer || `เซิร์ฟเวอร์ตอบผิดพลาด (HTTP ${response.status})`);
  }
  return payload as T;
}

export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });
