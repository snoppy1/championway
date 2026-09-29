import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, messages } from './api';

type State<T> = { data: T | null; error: string; loading: boolean };

/** โหลดข้อมูลจาก API พร้อมสถานะกำลังโหลดและข้อผิดพลาด และสั่งโหลดซ้ำได้
    ส่ง path เป็น null เมื่อยังไม่ควรโหลด เช่น ยังไม่รู้ว่าล็อกอินหรือยัง */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<State<T>>({ data: null, error: '', loading: Boolean(path) });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!path) {
      setState({ data: null, error: '', loading: false });
      return;
    }
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: '' }));
    api<T>(path)
      .then((data) => { if (!cancelled) setState({ data, error: '', loading: false }); })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof ApiError ? error.message : messages().errors.unreachable;
        setState({ data: null, error: message, loading: false });
      });
    return () => { cancelled = true; };
  }, [path, tick]);

  return { ...state, reload };
}
