import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { BrandMark } from '../../components/Layout';
import { isAdmin, isReviewer, useAuth } from '../../data/auth';
import { useHiring } from '../../data/hiring';
import { useApi } from '../../lib/useApi';
import '../../admin.css';

type Overview = { waiting: { competitions: number; mentors: number } };

export function AdminLayout() {
  const { pathname } = useLocation();
  const { user, loading, unreachable } = useAuth();
  const allowed = isReviewer(user);
  // หน้าโอนเงินกับเรื่องแจ้งปัญหาเป็นของระบบจ้าง ซ่อนลิงก์ไว้ตอนที่จ้างพักอยู่
  const hiring = useHiring();
  const { data } = useApi<Overview>(allowed ? '/admin/overview' : null);
  const { data: requests } = useApi<{ items: { status: string }[] }>(allowed ? '/admin/competition-requests' : null);
  const pendingRequests = requests?.items.filter((item) => item.status === 'pending').length ?? 0;

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
  // จอแคบเมนูเลื่อนแนวนอน พาหน้าที่เปิดอยู่มาอยู่ในแถบที่มองเห็น ไม่ให้ป้ายสีม่วงหลบอยู่นอกจอ
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const nav = document.querySelector<HTMLElement>('.admin-nav');
      const active = nav?.querySelector<HTMLElement>('a.active');
      if (nav && active && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, allowed]);

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
          <NavLink to="/admin/listings">เวทีบนหน้าเว็บ</NavLink>
          <NavLink to="/admin/imports">งานแข่งที่ดึงมา</NavLink>
          <NavLink to="/admin/mentors">
            เมนเทอร์{data && data.waiting.mentors > 0 && <span className="admin-badge">{data.waiting.mentors}</span>}
          </NavLink>
          <NavLink to="/admin/requests">
            คำขอเพิ่มเวที{pendingRequests > 0 && <span className="admin-badge">{pendingRequests}</span>}
          </NavLink>
          <NavLink to="/admin/reviews">รีวิว</NavLink>
          {isAdmin(user) && <NavLink to="/admin/notifications">การแจ้งเตือน</NavLink>}
          {isAdmin(user) && hiring === true && <>
            <NavLink to="/admin/payouts">โอนเงินเมนเทอร์</NavLink>
            <NavLink to="/admin/disputes">เรื่องแจ้งปัญหา</NavLink>
          </>}
        </nav>}
        <Link className="admin-exit" to="/">กลับไปหน้าบ้าน</Link>
      </div>
    </header>

    {/* หน้าโอนเงินไม่ใช่การตัดสินเผยแพร่ ข้อความเตือนเรื่องผู้สมัครไม่เกี่ยวจึงไม่แสดงที่นี่ */}
    {!['/admin/payouts', '/admin/notifications'].includes(pathname) && <p className="admin-warning" role="note">
      <TriangleAlert size={16} aria-hidden="true" />
      <span>
        การตัดสินถูกบันทึกลงฐานข้อมูลจริง ตรวจสอบข้อมูลและหลักฐานให้ครบก่อนเผยแพร่
        และตรวจสถานะการส่งอีเมลก่อนแจ้งผู้สมัครว่าได้รับผลแล้ว
      </span>
    </p>}

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
