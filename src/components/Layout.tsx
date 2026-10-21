import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { isReviewer, useAuth } from '../data/auth';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { CHAT_CHANGED } from './ChatPanel';
import { UnreadBadge } from './hire';
import { useHiring } from '../data/hiring';
import trophy from '../assets/trophy.png';
import { useI18n } from '../i18n';

/** The text beside it says what this is (admin), so the image is decorative. */
export function BrandMark() {
  return <img className="brand-mark" src={trophy} alt="" width={36} height={36} />;
}

/* ปุ่มสลับภาษา ค่าตั้งต้นคืออังกฤษ ป้ายบนปุ่มเป็นรหัสภาษา EN/TH เหมือนกันทั้งสองภาษา
   ผู้ใช้ที่อ่านภาษาปัจจุบันไม่ออกจะได้ยังหาปุ่มเจอ */
export function LangToggle() {
  const { lang, setLang, t } = useI18n();
  return <div className="lang-toggle" role="group" aria-label={t.nav.language}>
    <button type="button" aria-pressed={lang === 'en'} lang="en" onClick={() => setLang('en')}>EN</button>
    <button type="button" aria-pressed={lang === 'th'} lang="en" onClick={() => setLang('th')}>TH</button>
  </div>;
}

function Header() {
  const { t } = useI18n();
  const { pathname, search } = useLocation();
  const { user, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  /* เมนเทอร์ที่ผ่านอนุมัติเห็น Mentor zone คนอื่นที่เข้าสู่ระบบเห็น Consulting
     ระหว่างรอคำตอบยังไม่แสดงทั้งสองอย่าง จะได้ไม่เห็นป้ายเปลี่ยนกลางทาง */
  const { data: consultMe } = useApi<{ mentorId: string | null }>(user ? '/consult/me' : null);
  // จ้างและแชตพักไว้: ไม่ถาม /api/chats (ตอบ 404) และไม่มีจุดแจ้งเตือนข้อความ
  const hiring = useHiring();
  /* ข้อความแชตที่ยังไม่อ่านรวมทุกห้อง ขึ้นเป็นจุดบนแท็บ Consulting / Mentor zone
     ถามทุก 20 วินาทีตอนแท็บมองเห็น และถามใหม่ทันทีที่แชตอ่านหรือส่งข้อความ (CHAT_CHANGED) */
  const [unread, setUnread] = useState(0);
  const userId = user?.id;
  useEffect(() => {
    if (!userId || hiring !== true) { setUnread(0); return; }
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      api<{ rooms: { unread: number }[] }>('/chats')
        .then((result) => { if (alive) setUnread(result.rooms.reduce((sum, room) => sum + room.unread, 0)); })
        .catch(() => { /* ถามไม่ได้ก็ใช้ตัวเลขเดิม */ });
    };
    load();
    const timer = setInterval(load, 20_000);
    window.addEventListener(CHAT_CHANGED, load);
    document.addEventListener('visibilitychange', load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(CHAT_CHANGED, load);
      document.removeEventListener('visibilitychange', load);
    };
  }, [userId, hiring]);
  // เมนูบนมือถือปิดเองเมื่อเปลี่ยนหน้า ไม่อย่างนั้นจะค้างบังเนื้อหาหน้าใหม่
  useEffect(() => { setMenuOpen(false); }, [pathname, search]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menuOpen]);
  // กลับมาที่หน้าเดิมหลังเข้าสู่ระบบ แต่ไม่วนกลับมาหน้าเข้าสู่ระบบเอง
  const next = pathname.startsWith('/signin') || pathname.startsWith('/signup') ? '/' : `${pathname}${search}`;

  return <header className="site-header">
    <div className="shell header-inner">
      {/* หัวเว็บตาม Landing v4: ถ้วยกับชื่อเป็นตัวอักษร */}
      <Link to="/" className="brand-link" aria-label={t.common.homeLink}>
        <BrandMark /><span className="brand-name" aria-hidden="true">ChampionWays</span>
      </Link>
      {/* จอกว้างใช้ display: contents ให้ลูกเรียงอยู่ในแถบเดียวกับโลโก้ตามเดิม
          จอแคบกลายเป็นแผงเมนูที่เปิดจากปุ่มสามขีด หัวเว็บจึงเหลือแถวเดียว */}
      <div className={menuOpen ? 'header-menu is-open' : 'header-menu'} id="site-menu">
        <nav className="main-nav" aria-label={t.nav.mainMenu}>
          {/* เมนูตาม Landing v4 (spec ข้อ 12): งานแข่ง คลังความรู้ และรายการที่บันทึกออกจากเมนูแล้ว
              Consulting อยู่แทน My Projects ไปก่อนจนกว่าระบบจับคู่จะเปิด */}
          <NavLink to="/mentors" end>{t.nav.findMentor}</NavLink>
          <Link to="/#ranking">{t.nav.ranking}</Link>
          {user && consultMe && (consultMe.mentorId
            ? <NavLink to="/mentor-zone">{t.nav.mentorZone}<UnreadBadge count={unread} /></NavLink>
            : <NavLink to="/consulting">{t.nav.consulting}<UnreadBadge count={unread} /></NavLink>)}
        </nav>
        <div className="header-actions">
          <LangToggle />
          {loading ? <span className="account-loading" aria-hidden="true" /> : user ? <>
            {isReviewer(user) && <Link className="ghost-button" to="/admin">{t.nav.admin}</Link>}
            {/* ชื่อบนหัวเว็บคือทางเข้าโปรไฟล์ ใช้ของที่มีอยู่แล้วแทนการเพิ่มปุ่มใหม่ให้แถบบนแน่นขึ้น */}
            <Link className="account-name" to="/profile" title={t.nav.profileTitle(user.email)}>
              <span className="account-initial" aria-hidden="true">{user.name.trim().slice(0, 1).toUpperCase()}</span>{user.name}
            </Link>
            <button type="button" className="ghost-button" onClick={() => { void signOut(); }}>{t.nav.signOut}</button>
          </> : <>
            <Link className="ghost-button" to={`/signin?next=${encodeURIComponent(next)}`}>{t.nav.signIn}</Link>
            <Link className="primary-button" to={`/signup?next=${encodeURIComponent(next)}`}>{t.nav.signUp}</Link>
          </>}
        </div>
      </div>
      <button
        type="button" className="icon-button menu-toggle"
        aria-expanded={menuOpen} aria-controls="site-menu"
        aria-label={menuOpen ? t.nav.closeMenu : t.nav.openMenu}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>
    </div>
  </header>;
}

export function Layout() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const lastPath = useRef(pathname);
  useEffect(() => {
    // Move focus on route changes so the new page is announced. Comparing paths
    // rather than counting renders leaves the skip link as the first thing Tab
    // reaches on load, and survives StrictMode running this effect twice.
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return <>
    <a className="skip-link" href="#main">{t.common.skipToContent}</a>
    <div className="top-rule" />
    <Header />
    <Outlet />
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div className="footer-brand">
          <Link to="/" className="brand-link" aria-label={t.common.homeLink}>
            <BrandMark /><span className="brand-name" aria-hidden="true">ChampionWays</span>
          </Link>
          <p>{t.footer.tagline}</p>
        </div>
        <div className="footer-links">
          <div>
            <strong>{t.footer.forTeams}</strong>
            <Link to="/mentors">{t.footer.match}</Link>
            <Link to="/#ranking">{t.footer.ranking}</Link>
            <Link to="/#how">{t.footer.how}</Link>
          </div>
          <div>
            <strong>{t.footer.forMentors}</strong>
            <Link to="/mentors/apply">{t.footer.become}</Link>
          </div>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>{t.footer.copyright}</span>
        <span className="footer-legal">
          <Link to="/privacy">{t.footer.privacy}</Link>
          <Link to="/terms">{t.footer.terms}</Link>
          <Link to="/refunds">{t.footer.refunds}</Link>
          <a href="mailto:support@championways.space">{t.footer.contact}</a>
        </span>
      </div>
    </footer>
    <ScrollRestoration getKey={(location) => (location.pathname === '/explore' ? location.pathname + location.search : location.key)} />
  </>;
}
