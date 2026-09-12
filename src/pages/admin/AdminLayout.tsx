import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { BrandMark } from '../../components/Layout';
import { isReviewer, useAuth } from '../../data/auth';
import { useApi } from '../../lib/useApi';
import '../../admin.css';

type Overview = { waiting: { competitions: number; mentors: number } };

export function AdminLayout() {
  const { pathname } = useLocation();
  const { user, loading, unreachable } = useAuth();
  const allowed = isReviewer(user);
  const { data } = useApi<Overview>(allowed ? '/admin/overview' : null);

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

  return <div className="admin">
    <a className="skip-link" href="#main">ข้ามไปเนื้อหาหลัก</a>
    <header className="admin-header">
      <div className="admin-shell admin-header-inner">
        <Link to="/admin" className="brand-link" aria-label="หน้าจัดการ ChampionWays">
          <BrandMark /><span className="brand-name">หน้าจัดการ</span>
        </Link>
        {allowed && <nav className="admin-nav" aria-label="เมนูหน้าจัดการ">
          <NavLink to="/admin" end>ภาพรวม</NavLink>
          <NavLink to="/admin/competitions">
            งานแข่ง{data && data.waiting.competitions > 0 && <span className="admin-badge">{data.waiting.competitions}</span>}
          </NavLink>
          <NavLink to="/admin/mentors">
            เมนเทอร์{data && data.waiting.mentors > 0 && <span className="admin-badge">{data.waiting.mentors}</span>}
          </NavLink>
        </nav>}
        <Link className="admin-exit" to="/">กลับไปหน้าบ้าน</Link>
      </div>
    </header>

    {/* ข้อมูลเป็นตัวอย่าง และอีเมลยังไม่ถูกส่งออกจริง ต้องบอกให้ชัดทั้งสองอย่าง */}
    <p className="admin-warning" role="note">
      <TriangleAlert size={16} aria-hidden="true" />
      <span>
        ข้อมูลเวที ผู้จัด และผู้สมัครในระบบนี้ยัง<b>เป็นข้อมูลตัวอย่าง</b> การตัดสินถูกบันทึกลงฐานข้อมูลจริง
        แต่<b>อีเมลยังไม่ถูกส่งออก</b> ระบบเก็บไว้ในตาราง email_log แทน
      </span>
    </p>

    <main id="main" tabIndex={-1} className="admin-shell admin-main">
      {loading ? <p className="admin-muted">กำลังตรวจสิทธิ์…</p>
        : allowed ? <Outlet />
          : <NoAccess signedIn={Boolean(user)} unreachable={unreachable} />}
    </main>
    <ScrollRestoration />
  </div>;
}

function NoAccess({ signedIn, unreachable }: { signedIn: boolean; unreachable: boolean }) {
  // เซิร์ฟเวอร์ล่มกับยังไม่ล็อกอินต้องอ่านออกว่าคนละเรื่อง ไม่อย่างนั้นตอนตั้งค่า deploy ผิด
  // จะเห็นแค่ "เข้าไม่ได้" แล้วไล่หาสาเหตุไม่เจอ
  if (unreachable) {
    return <div className="admin-empty admin-denied">
      <h1>ติดต่อเซิร์ฟเวอร์ไม่ได้</h1>
      <p>
        หน้านี้โหลดขึ้นแล้วแต่เรียก API ไม่สำเร็จ จึงยังบอกไม่ได้ว่าคุณเป็นใคร
        มักเกิดจากยังไม่ได้ตั้งค่า Environment Variables ของสภาพแวดล้อมนี้
        ลองเปิด <code>/api/health</code> ดูว่าตอบ <code>{'{"ok":true}'}</code> หรือไม่
      </p>
    </div>;
  }
  return <div className="admin-empty admin-denied">
    <h1>เข้าหน้าจัดการไม่ได้</h1>
    <p>
      {signedIn
        ? 'บัญชีนี้เป็นสมาชิกทั่วไป หน้าจัดการเปิดให้เฉพาะบัญชีทีมตรวจ ซึ่งตั้งให้จากฝั่งเซิร์ฟเวอร์เท่านั้น'
        : 'ต้องเข้าสู่ระบบด้วยบัญชีทีมตรวจก่อน'}
    </p>
    {!signedIn && <p style={{ marginTop: 16 }}>
      <Link className="primary-button" to="/signin?next=/admin">เข้าสู่ระบบ</Link>
    </p>}
  </div>;
}
