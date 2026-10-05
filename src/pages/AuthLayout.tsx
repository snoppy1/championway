import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BrandMark, LangToggle } from '../components/Layout';
import { useI18n } from '../i18n';
import apollo from '../assets/auth/apollo.webp';
import apolloSm from '../assets/auth/apollo-sm.webp';
import zeus from '../assets/auth/zeus.webp';
import zeusSm from '../assets/auth/zeus-sm.webp';
import athena from '../assets/auth/athena-hermes.webp';
import athenaSm from '../assets/auth/athena-hermes-sm.webp';
import '../auth.css';

/* หน้าเข้าสู่ระบบ / สมัครสมาชิก แบบ "กระดาษฉีกต่อกันทั้งหน้า" (ผู้ใช้เลือก 5 ต.ค. 2569)
   ภาพเทพกรีกฝั่งซ้ายสุ่มหนึ่งในสามภาพทุกครั้งที่เปิดหน้านี้ สลับแท็บเข้าสู่ระบบ/สมัครสมาชิกแล้วภาพไม่เปลี่ยน
   (สุ่มที่ layout นี้ ซึ่งอยู่ค้างระหว่างสองหน้า) อยู่นอก Layout หลักเพราะหน้านี้มีแถบบนของตัวเอง */

export type ArtId = 'apollo' | 'zeus' | 'athena';
const art: Record<ArtId, { large: string; small: string }> = {
  apollo: { large: apollo, small: apolloSm },
  zeus: { large: zeus, small: zeusSm },
  athena: { large: athena, small: athenaSm },
};
const ids = Object.keys(art) as ArtId[];

export function AuthLayout() {
  const { t } = useI18n();
  const s = t.signIn;
  const [pick] = useState<ArtId>(() => ids[Math.floor(Math.random() * ids.length)]);
  const caption = s.art[pick];
  const { pathname } = useLocation();
  const last = useRef(pathname);
  // เหมือน Layout หลัก: เปลี่ยนแท็บแล้วย้ายโฟกัสไปเนื้อหาหลัก
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    requestAnimationFrame(() => document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true }));
  }, [pathname]);

  return <div className="auth-shell" data-art={pick}>
    <a className="skip-link" href="#main">{t.common.skipToContent}</a>
    <aside className="auth-art" aria-label={caption.alt}>
      <div className="auth-art__paper">
        <img src={art[pick].large} srcSet={`${art[pick].small} 561w, ${art[pick].large} 1122w`}
          sizes="(max-width: 900px) 100vw, 50vw" alt={caption.alt} width={1122} height={1402} fetchPriority="high" />
      </div>
      <Link to="/" className="auth-brand" aria-label={t.common.homeLink}>
        <span className="auth-brand__mark"><BrandMark /></span>
        <span className="auth-brand__name">ChampionWays</span>
      </Link>
      <div className="auth-caption">
        <span className="auth-tape" aria-hidden="true" />
        <div className="auth-caption__paper">
          <p className="auth-caption__eyebrow">{caption.eyebrow}</p>
          <p className="auth-caption__line">{caption.line}</p>
        </div>
      </div>
    </aside>
    <div className="auth-side">
      <div className="auth-top">
        <Link to="/" className="auth-back"><ArrowLeft size={15} aria-hidden="true" />{s.backHome}</Link>
        <LangToggle />
      </div>
      <Outlet />
    </div>
    <ScrollRestoration />
  </div>;
}
