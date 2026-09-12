import { useEffect, useRef, useState } from 'react';
import { BookmarkSimple } from './icons';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { useSavedSlugs } from '../data/saved';

export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>;
}

function Header() {
  const saved = useSavedSlugs();
  const [note, setNote] = useState(false);

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
        <button type="button" className="primary-button" aria-describedby={note ? 'login-note' : undefined} onClick={() => setNote(true)}>
          เข้าสู่ระบบ
        </button>
      </div>
      {note && <p className="header-note" id="login-note" role="status">
        ระบบสมาชิกยังไม่เปิดในเว็บต้นแบบ รายการที่บันทึกไว้จะเก็บอยู่ในเบราว์เซอร์นี้เท่านั้น
      </p>}
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
            <span className="nav-soon">แจ้งเพิ่มเวทีแข่งขัน</span>
            <span className="nav-soon">ร่วมงานกับเรา</span>
          </div>
        </div>
      </div>
      <div className="shell footer-bottom">ChampionWays · เว็บต้นแบบ ข้อมูลทุกเวที เมนเทอร์ และราคาเป็นข้อมูลสมมติเพื่อการออกแบบ</div>
    </footer>
    <ScrollRestoration getKey={(location) => (location.pathname === '/' ? location.pathname + location.search : location.key)} />
  </>;
}
