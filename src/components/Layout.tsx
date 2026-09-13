import { useEffect, useRef } from 'react';
import { BookmarkSimple } from './icons';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { isReviewer, useAuth } from '../data/auth';
import { useSavedSlugs } from '../data/saved';
import trophy from '../assets/trophy.png';

/** The wordmark beside it already says ChampionWays, so the image is decorative. */
export function BrandMark() {
  return <img className="brand-mark" src={trophy} alt="" width={36} height={37} />;
}

function Header() {
  const saved = useSavedSlugs();
  const { pathname, search } = useLocation();
  const { user, loading, signOut } = useAuth();
  // กลับมาที่หน้าเดิมหลังเข้าสู่ระบบ แต่ไม่วนกลับมาหน้าเข้าสู่ระบบเอง
  const next = pathname.startsWith('/signin') || pathname.startsWith('/signup') ? '/' : `${pathname}${search}`;

  return <header className="site-header">
    <div className="shell header-inner">
      <Link to="/" className="brand-link" aria-label="ChampionWays หน้าแรก">
        <BrandMark /><span className="brand-name">ChampionWays</span>
      </Link>
      <nav className="main-nav" aria-label="เมนูหลัก">
        <NavLink to="/" end>สำรวจการแข่งขัน</NavLink>
        <NavLink to="/mentors">เมนเทอร์</NavLink>
        <span className="nav-soon" title="ยังไม่เปิดในเว็บต้นแบบ">คลังความรู้</span>
      </nav>
      <div className="header-actions">
        <Link to="/?saved=1" className="icon-button" aria-label={`รายการที่บันทึก ${saved.length} รายการ`}>
          <BookmarkSimple size={19} filled={saved.length > 0} />
          {saved.length > 0 && <span className="saved-badge" aria-hidden="true">{saved.length}</span>}
        </Link>
        {loading ? <span className="account-loading" aria-hidden="true" /> : user ? <>
          {isReviewer(user) && <Link className="ghost-button" to="/admin">หน้าจัดการ</Link>}
          <span className="account-name" title={user.email}>{user.name}</span>
          <button type="button" className="ghost-button" onClick={() => { void signOut(); }}>ออกจากระบบ</button>
        </> : <>
          <Link className="ghost-button" to={`/signin?next=${encodeURIComponent(next)}`}>เข้าสู่ระบบ</Link>
          <Link className="primary-button" to={`/signup?next=${encodeURIComponent(next)}`}>สมัครสมาชิก</Link>
        </>}
      </div>
    </div>
  </header>;
}

export function Layout() {
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
    <a className="skip-link" href="#main">ข้ามไปเนื้อหาหลัก</a>
    <div className="top-rule" />
    <Header />
    <Outlet />
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div className="footer-brand">
          <Link to="/" className="brand-link" aria-label="ChampionWays หน้าแรก">
            <BrandMark /><span className="brand-name">ChampionWays</span>
          </Link>
          <p>เส้นทางของแชมป์เริ่มจากเวทีแรก — เรารวมการแข่งขันไว้ให้ค้นหาง่าย และเก็บเวทีที่สนใจไว้ในที่เดียว</p>
        </div>
        <div className="footer-links">
          <div>
            <strong>ค้นหา</strong>
            <Link to="/">สำรวจการแข่งขัน</Link>
            <Link to="/mentors">เมนเทอร์</Link>
          </div>
          <div>
            <strong>เกี่ยวกับเว็บต้นแบบ</strong>
            {/* ฟอร์มผู้จัดงานพร้อมแล้วที่ /organizers แต่ยังไม่เปิดทางเข้า
                เพราะฟอร์มสัญญาว่าจะแจ้งผลทางอีเมล ซึ่งยังส่งถึงผู้จัดไม่ได้
                จนกว่าจะมีโดเมนของตัวเองไปยืนยันกับผู้ให้บริการอีเมล
                เปลี่ยนกลับเป็น Link ได้ทันทีเมื่อพร้อม */}
            <span className="nav-soon" title="เปิดเร็ว ๆ นี้">ลงงานแข่งขันฟรี</span>
            <span className="nav-soon" title="เปิดเร็ว ๆ นี้">แจ้งเพิ่มเวทีแข่งขัน</span>
          </div>
        </div>
      </div>
      <div className="shell footer-bottom">ChampionWays · เว็บต้นแบบ ข้อมูลทุกเวที เมนเทอร์ และราคาเป็นข้อมูลสมมติเพื่อการออกแบบ</div>
    </footer>
    <ScrollRestoration getKey={(location) => (location.pathname === '/' ? location.pathname + location.search : location.key)} />
  </>;
}
