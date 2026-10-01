import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../data/auth';
import { useApi } from '../lib/useApi';
import { useI18n } from '../i18n';

/* /chats และ /chats/:id เป็นลิงก์เก่าและลิงก์ในอีเมล แชตจริงอยู่ในหน้า Consulting (นักเรียน) กับ Mentor zone (เมนเทอร์)
   ถามเซิร์ฟเวอร์ว่าห้องนี้เราอยู่ฝั่งไหนแล้วพาไปถูกที่พร้อม #room-<id> ส่วน /chats เฉย ๆ ดูว่าเป็นเมนเทอร์หรือไม่ */
export function ChatsRedirect() {
  const { t } = useI18n();
  const { id } = useParams();
  const { user, loading } = useAuth();
  const room = useApi<{ room: { role: 'member' | 'mentor' } }>(user && id ? `/chats/${encodeURIComponent(id)}` : null);
  const me = useApi<{ mentorId: string | null }>(user && !id ? '/consult/me' : null);

  /* useApi ยังไม่เริ่มโหลดในเฟรมแรกหลังเข้าสู่ระบบเสร็จ (loading เป็น false ทั้งที่ยังไม่มีข้อมูล)
     จึงรอจนกว่าจะมีคำตอบหรือ error จริง ไม่อย่างนั้นจะเด้งไปหน้า Consulting ก่อนรู้ว่าห้องนี้อยู่ฝั่งไหน */
  const answered = id ? Boolean(room.data || room.error) : Boolean(me.data || me.error);
  if (loading || (user && !answered)) return <main id="main" tabIndex={-1} className="shell page"><p className="side-note" role="status">{t.chat.loading}</p></main>;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(id ? `/chats/${id}` : '/chats')}`} replace />;
  if (id) {
    const base = room.data?.room.role === 'mentor' ? '/mentor-zone' : '/consulting';
    return <Navigate to={room.data ? `${base}#room-${id}` : '/consulting'} replace />;
  }
  return <Navigate to={me.data?.mentorId ? '/mentor-zone' : '/consulting'} replace />;
}
