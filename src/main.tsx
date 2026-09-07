import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-sans-thai/thai-400.css';
import '@fontsource/ibm-plex-sans-thai/thai-500.css';
import '@fontsource/ibm-plex-sans-thai/thai-600.css';
import '@fontsource/ibm-plex-sans-thai/thai-700.css';
import { Layout } from './components/Layout';
import { Explore } from './pages/Explore';
import { Detail, NotFound } from './pages/Detail';
import './styles.css';

const router = createBrowserRouter([{
  element: <Layout />,
  children: [
    { path: '/', element: <Navigate to="/competitions" replace /> },
    { path: '/competitions', element: <Explore /> },
    { path: '/competitions/:slug', element: <Detail /> },
    { path: '*', element: <NotFound /> },
  ],
}]);

createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
