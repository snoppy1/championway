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
import { Detail, NotFound } from './pages/Detail';
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
    { path: '*', element: <NotFound /> },
  ],
}], { basename });

createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
