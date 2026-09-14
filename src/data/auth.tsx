import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, post } from '../lib/api';
import type { PersonLevel } from './profile';

export type Account = {
  id: string;
  email: string;
  name: string;
  role: 'member' | 'reviewer' | 'admin';
  avatarUrl: string | null;
  bio: string | null;
  occupation: string | null;
  organization: string | null;
  position: string | null;
  educationLevel: PersonLevel | 'open' | null;
  /** ตั้งรหัสผ่านไว้หรือยัง คนที่สมัครด้วย Google ยังไม่มี จึงเป็นการ "ตั้ง" ไม่ใช่ "เปลี่ยน" */
  hasPassword: boolean;
  googleLinked: boolean;
};

type AuthState = {
  user: Account | null;
  /** ระหว่างที่ยังไม่รู้ว่าล็อกอินอยู่หรือไม่ อย่าเพิ่งตัดสินใจแทนผู้ใช้ */
  loading: boolean;
  /** ติดต่อเซิร์ฟเวอร์ไม่ได้ ต่างจาก "ยังไม่ล็อกอิน" ซึ่งเซิร์ฟเวอร์ตอบว่า user เป็น null */
  unreachable: boolean;
  googleEnabled: boolean;
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** ใช้หลังบันทึกโปรไฟล์ เพื่อให้ชื่อบนหัวเว็บเปลี่ยนตามทันทีโดยไม่ต้องรีโหลดหน้า */
  applyUser: (account: Account) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, providers] = await Promise.all([
          api<{ user: Account | null }>('/auth/me'),
          api<{ google: boolean }>('/auth/providers'),
        ]);
        if (cancelled) return;
        setUser(me.user);
        setUnreachable(false);
        setGoogleEnabled(providers.google);
      } catch {
        // แยกให้ออกจาก "ยังไม่ล็อกอิน" ไม่งั้นเซิร์ฟเวอร์ล่มจะดูเหมือนแค่ยังไม่ได้เข้าระบบ
        // ซึ่งทำให้ตามหาสาเหตุยากมากตอนตั้งค่า deploy ผิด
        if (!cancelled) { setUser(null); setUnreachable(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback(async (email: string, password: string, remember = false) => {
    const { user: account } = await post<{ user: Account }>('/auth/login', { email, password, remember });
    setUser(account);
    setUnreachable(false);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { user: account } = await post<{ user: Account }>('/auth/signup', { name, email, password });
    setUser(account);
  }, []);

  const signOut = useCallback(async () => {
    await post('/auth/logout', {});
    setUser(null);
  }, []);

  const applyUser = useCallback((account: Account) => setUser(account), []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, unreachable, googleEnabled, signIn, signUp, signOut, applyUser }),
    [user, loading, unreachable, googleEnabled, signIn, signUp, signOut, applyUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth ต้องอยู่ภายใน AuthProvider');
  return value;
}

export function isReviewer(user: Account | null) {
  return user?.role === 'reviewer' || user?.role === 'admin';
}
