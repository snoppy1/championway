import { Navigate, useLocation } from 'react-router-dom';

// Preserve previously shared search links after merging exploration into Home.
export function Explore() {
  const { search } = useLocation();
  return <Navigate to={`/${search}`} replace />;
}
