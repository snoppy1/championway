import { useEffect } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';

export function Wordmark() {
  return <span className="wordmark"><strong>Champion</strong><span>Ways</span><span className="wordmark-dot">↗</span></span>;
}

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return <>
    <a className="skip-link" href="#main">ข้ามไปเนื้อหาหลัก</a>
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/competitions" className="brand-link" aria-label="ChampionWays หน้าสำรวจการแข่งขัน"><Wordmark /></Link>
        <nav aria-label="เมนูหลัก"><NavLink to="/competitions">สำรวจการแข่งขัน</NavLink></nav>
        <span className="edition-label"><span className="small-dot" />พื้นที่เริ่มต้นของไอเดีย</span>
      </div>
    </header>
    <Outlet />
    <footer className="site-footer container">
      <div className="footer-main">
        <Link to="/competitions" className="brand-link" aria-label="ChampionWays กลับหน้าสำรวจ"><Wordmark /></Link>
        <p>ทุกเส้นทาง เริ่มจากความสนใจ<ArrowUpRight size={17} aria-hidden="true" /></p>
      </div>
      <div className="footer-bottom"><span>STUDENT COMPETITIONS. NEW POSSIBILITIES.</span><span>ChampionWays · เว็บต้นแบบ</span></div>
    </footer>
    <ScrollRestoration getKey={(location) => location.pathname === '/competitions' ? location.pathname + location.search : location.key} />
  </>;
}

export function SampleNote() {
  return <p className="sample-note"><span className="sample-dot" aria-hidden="true" />ข้อมูลตัวอย่างสำหรับทดลองใช้งาน</p>;
}
