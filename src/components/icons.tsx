import { Bookmark } from 'lucide-react';

/** Lucide draws outlines only; the saved state needs a filled bookmark to read at a glance. */
export function BookmarkSimple({ size = 16, filled = false }: { size?: number; filled?: boolean }) {
  return <Bookmark size={size} fill={filled ? 'currentColor' : 'none'} aria-hidden="true" />;
}
