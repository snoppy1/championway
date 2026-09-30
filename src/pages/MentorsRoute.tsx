import { Navigate, useSearchParams } from 'react-router-dom';
import { RisingStar } from './RisingStar';

/* /mentors คือหน้า Rising Star แล้ว แต่ลิงก์เก่าที่พกชื่อเวทีมา (/mentors?competition=<slug>)
   ยังต้องพากลับไปหน้าเวทีนั้น ซึ่งมีรายชื่อเมนเทอร์ของงานอยู่แล้ว
   (แบบเดิมเริ่มด้วยคำถาม "ติดตรงไหน" ซึ่งยกเลิกไปแล้ว) ส่วนลิงก์เปล่าแสดงหน้าใหม่ */
export function MentorsRoute() {
  const [params] = useSearchParams();
  const competition = params.get('competition');
  if (competition) return <Navigate replace to={`/competitions/${encodeURIComponent(competition)}#event-mentors`} />;
  return <RisingStar />;
}
