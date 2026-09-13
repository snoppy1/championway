import { Navigate, useSearchParams } from 'react-router-dom';

/* หน้าเลือกเมนเทอร์แบบเดิมเริ่มด้วยคำถาม "ติดตรงไหน" ซึ่งยกเลิกไปแล้ว
   เส้นทางใหม่เริ่มจากเวที ลิงก์เก่าที่พกชื่อเวทีมาจึงพากลับไปหน้าเวทีนั้น
   ซึ่งมีรายชื่อเมนเทอร์ของงานอยู่แล้ว ส่วนลิงก์เปล่าพาไปหน้าสำรวจ */
export function MentorsRedirect() {
  const [params] = useSearchParams();
  const competition = params.get('competition');
  return <Navigate replace to={competition ? `/competitions/${competition}#event-mentors` : '/explore'} />;
}
