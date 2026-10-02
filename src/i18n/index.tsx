import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { en } from './en';
import { th } from './th';
import type { Messages } from './en';
import { enGoBetween, thGoBetween, withGoBetween } from './go-between';
import { useHiring } from '../data/hiring';
import { setRequestLanguage } from '../lib/api';
import type { Lang } from './format';

/* ภาษาของหน้าเว็บ ค่าตั้งต้นคืออังกฤษ จำตัวเลือกไว้ในเบราว์เซอร์นั้น
   และตั้ง <html lang> ให้ตรง เพื่อให้กฎตัวอักษรไทยใน CSS (:lang(th)) กับโปรแกรมอ่านหน้าจอทำงานถูก
   เนื้อหาที่ผู้ใช้เขียนเอง เช่นรายละเอียดเวทีหรือประวัติเมนเทอร์ ไม่ได้แปล แสดงตามภาษาที่เขียนมา */

export type { Lang };
export const langs: Lang[] = ['en', 'th'];
const dictionaries: Record<Lang, Messages> = { en, th };
// ตอนจ้างพักไว้ (ค่าตั้งต้น และตอนยังไม่รู้ค่าสวิตช์) ใช้ถ้อยคำของโหมดตัวกลางซ้อนทับ ดู go-between.ts
const goBetween: Record<Lang, Messages> = { en: withGoBetween(en, enGoBetween), th: withGoBetween(th, thGoBetween) };
const STORAGE_KEY = 'cw-lang';
export const DEFAULT_LANG: Lang = 'en';

function storedLang(): Lang {
  // localStorage อาจอ่านไม่ได้ในโหมดส่วนตัวของบางเบราว์เซอร์ ต้องไม่ทำให้หน้าพัง
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'th' || value === 'en' ? value : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

type I18nState = { lang: Lang; t: Messages; setLang: (lang: Lang) => void };
const I18nContext = createContext<I18nState | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(storedLang);
  const hiring = useHiring();

  useEffect(() => {
    document.documentElement.lang = lang;
    setRequestLanguage(lang);
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ไม่มีที่เก็บก็ใช้ได้ แค่ไม่จำ */ }
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);
  const value = useMemo(() => ({ lang, t: hiring === true ? dictionaries[lang] : goBetween[lang], setLang }), [lang, hiring, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
