import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { BrandMark } from '../../components/Layout';
import { competitionSubmissions, mentorSubmissions, pendingOf } from '../../data/submissions';
import '../../admin.css';

export function AdminLayout() {
  const { pathname } = useLocation();
  const lastPath = useRef(pathname);
  useEffect(() => {
    // Same rule as the public layout: move focus only when the path actually
    // changes, so the skip link stays the first stop on load.
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => { document.title = 'หน้าจัดการ — ChampionWays'; }, []);

  const waiting = pendingOf(competitionSubmissions).length;
  const waitingMentors = pendingOf(mentorSubmissions).length;

  return <div className="admin">
    <a className="skip-link" href="#main">ข้ามไปเนื้อหาหลัก</a>
    <header className="admin-header">
      <div className="admin-shell admin-header-inner">
        <Link to="/admin" className="brand-link" aria-label="หน้าจัดการ ChampionWays">
          <BrandMark /><span className="brand-name">หน้าจัดการ</span>
        </Link>
        <nav className="admin-nav" aria-label="เมนูหน้าจัดการ">
          <NavLink to="/admin" end>ภาพรวม</NavLink>
          <NavLink to="/admin/competitions">งานแข่ง{waiting > 0 && <span className="admin-badge">{waiting}</span>}</NavLink>
          <NavLink to="/admin/mentors">เมนเทอร์{waitingMentors > 0 && <span className="admin-badge">{waitingMentors}</span>}</NavLink>
        </nav>
        <Link className="admin-exit" to="/">กลับไปหน้าบ้าน</Link>
      </div>
    </header>

    {/* หน้านี้อยู่ใน bundle เดียวกับหน้าบ้าน ใครเปิด /admin ก็เข้าได้ ต้องบอกให้ชัด */}
    <p className="admin-warning" role="note">
      <TriangleAlert size={16} aria-hidden="true" />
      <span>
        หน้าต้นแบบ <b>ยังไม่มีระบบยืนยันตัวตนและสิทธิ์</b> ใครเปิดลิงก์นี้ก็เข้าได้
        ใบที่เห็นเป็นข้อมูลตัวอย่าง และการกดปุ่มตัดสินไม่ถูกบันทึกไว้ที่ใด
      </span>
    </p>

    <main id="main" tabIndex={-1} className="admin-shell admin-main"><Outlet /></main>
    <ScrollRestoration />
  </div>;
}
