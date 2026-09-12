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
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Mentors } from './pages/Mentors';
import { MentorApplication } from './pages/MentorApplication';
import { Detail, NotFound } from './pages/Detail';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminOverview } from './pages/admin/AdminOverview';
import { AdminCompetitionQueue, AdminCompetitionReview } from './pages/admin/AdminCompetitions';
import { AdminMentorQueue, AdminMentorReview } from './pages/admin/AdminMentors';
import './styles.css';

// Vite's BASE_URL keeps its trailing slash; React Router wants it without one.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

const router = createBrowserRouter([{
  element: <Layout />,
  children: [
    { path: '/', element: <Home /> },
    { path: '/competitions', element: <Navigate to="/" replace /> },
    { path: '/competitions/:slug', element: <Detail /> },
    { path: '/mentors', element: <Mentors /> },
    { path: '/mentors/apply', element: <MentorApplication /> },
    { path: '*', element: <NotFound /> },
  ],
}, {
  // หน้าจัดการอยู่นอก Layout ของหน้าบ้าน เพราะไม่ควรมีเมนูผู้ใช้ทั่วไปหรือ footer การตลาด
  path: '/admin',
  element: <AdminLayout />,
  children: [
    { index: true, element: <AdminOverview /> },
    { path: 'competitions', element: <AdminCompetitionQueue /> },
    { path: 'competitions/:id', element: <AdminCompetitionReview /> },
    { path: 'mentors', element: <AdminMentorQueue /> },
    { path: 'mentors/:id', element: <AdminMentorReview /> },
  ],
}], { basename });

createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
