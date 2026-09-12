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
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ';
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });
