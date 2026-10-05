import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import '@fontsource/ibm-plex-sans-thai/thai-400.css';
import '@fontsource/ibm-plex-sans-thai/thai-500.css';
import '@fontsource/ibm-plex-sans-thai/thai-600.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/anuphan/thai-500.css';
import '@fontsource/anuphan/thai-600.css';
import '@fontsource/anuphan/thai-700.css';
import '@fontsource/anuphan/latin-500.css';
import '@fontsource/anuphan/latin-600.css';
import '@fontsource/anuphan/latin-700.css';
import { AuthProvider } from './data/auth';
import { I18nProvider } from './i18n';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Explore } from './pages/Explore';
import { MentorProfile } from './pages/MentorProfile';
import { MentorsRoute } from './pages/MentorsRoute';
import { MentorApplication } from './pages/MentorApplication';
import { Profile } from './pages/Profile';
import { ProfileEdit } from './pages/ProfileEdit';
import { Detail, NotFound } from './pages/Detail';
import { SignIn } from './pages/SignIn';
import { AuthLayout } from './pages/AuthLayout';
import { Legal } from './pages/Legal';
import { Consulting } from './pages/Consulting';
import { MentorZone } from './pages/MentorZoneRoute';
import { VerifyEmail } from './pages/VerifyEmail';
import { ConfirmGuidance } from './pages/ConfirmGuidance';
import { ChatsRedirect } from './pages/ChatsRedirect';
import { PayReturn, PaySimulated } from './pages/Pay';
import { AdminPayouts } from './pages/admin/AdminPayouts';
import { AdminDisputes } from './pages/admin/AdminDisputes';
import { Organisers } from './pages/Organisers';
import { OrganiserSubmit } from './pages/OrganiserSubmit';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminOverview } from './pages/admin/AdminOverview';
import { AdminCompetitionQueue, AdminCompetitionReview } from './pages/admin/AdminCompetitions';
import { AdminMentorQueue, AdminMentorReview } from './pages/admin/AdminMentors';
import { AdminRequestQueue } from './pages/admin/AdminRequests';
import { AdminReviewList } from './pages/admin/AdminReviews';
import { AdminNotifications } from './pages/admin/AdminNotifications';
import { AdminListingForm, AdminListingList } from './pages/admin/AdminListings';
import './styles.css';

// Vite's BASE_URL keeps its trailing slash; React Router wants it without one.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

const router = createBrowserRouter([{
  element: <Layout />,
  children: [
    { path: '/', element: <Home /> },
    { path: '/explore', element: <Explore /> },
    { path: '/competitions', element: <Navigate to="/explore" replace /> },
    { path: '/competitions/:slug', element: <Detail /> },
    { path: '/mentors', element: <MentorsRoute /> },
    { path: '/mentors/apply', element: <MentorApplication /> },
    { path: '/mentors/:id', element: <MentorProfile /> },
    { path: '/profile', element: <Profile /> },
    { path: '/profile/edit', element: <ProfileEdit /> },
    { path: '/organizers', element: <Organisers /> },
    { path: '/organizers/submit', element: <OrganiserSubmit /> },
    { path: '/consulting', element: <Consulting /> },
    { path: '/mentor-zone', element: <MentorZone /> },
    { path: '/verify-email', element: <VerifyEmail /> },
    // ลิงก์ในอีเมลของเมนเทอร์ ไม่ต้องเข้าสู่ระบบ
    { path: '/confirm', element: <ConfirmGuidance /> },
    { path: '/pay/simulated', element: <PaySimulated /> },
    { path: '/pay/return', element: <PayReturn /> },
    // แชตอยู่ในหน้า Consulting (นักเรียน) และ Mentor zone (เมนเทอร์) ลิงก์ /chats เก่าพาไปที่ถูกฝั่ง
    { path: '/chats', element: <ChatsRedirect /> },
    { path: '/chats/:id', element: <ChatsRedirect /> },
    { path: '/privacy', element: <Legal doc="privacy" /> },
    { path: '/terms', element: <Legal doc="terms" /> },
    { path: '/refunds', element: <Legal doc="refunds" /> },
    { path: '*', element: <NotFound /> },
  ],
}, {
  // เข้าสู่ระบบ / สมัครสมาชิกมีแถบบนและภาพของตัวเอง (AuthLayout) ภาพสุ่มครั้งเดียวต่อการเปิดหน้า สลับแท็บแล้วไม่เปลี่ยน
  element: <AuthLayout />,
  children: [
    { path: '/signin', element: <SignIn mode="signin" /> },
    { path: '/signup', element: <SignIn mode="signup" /> },
  ],
}, {
  // หน้าจัดการอยู่นอก Layout ของหน้าบ้าน เพราะไม่ควรมีเมนูผู้ใช้ทั่วไปหรือ footer การตลาด
  path: '/admin',
  element: <AdminLayout />,
  children: [
    { index: true, element: <AdminOverview /> },
    { path: 'competitions', element: <AdminCompetitionQueue /> },
    { path: 'competitions/:id', element: <AdminCompetitionReview /> },
    { path: 'listings', element: <AdminListingList /> },
    { path: 'listings/:id', element: <AdminListingForm /> },
    { path: 'mentors', element: <AdminMentorQueue /> },
    { path: 'mentors/:id', element: <AdminMentorReview /> },
    { path: 'requests', element: <AdminRequestQueue /> },
    { path: 'reviews', element: <AdminReviewList /> },
    { path: 'notifications', element: <AdminNotifications /> },
    { path: 'payouts', element: <AdminPayouts /> },
    { path: 'disputes', element: <AdminDisputes /> },
  ],
}], { basename });

createRoot(document.getElementById('root')!).render(
  <StrictMode><I18nProvider><AuthProvider><RouterProvider router={router} /></AuthProvider></I18nProvider></StrictMode>,
);
