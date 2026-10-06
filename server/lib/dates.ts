/** วันแรกหรือวันสุดท้ายของเดือนของวันที่นั้น (YYYY-MM-DD) ใช้กับวันเปิด/ปิดรับที่รู้แค่เดือน (6 ต.ค. 2569) */
export function monthEdge(iso: string, edge: 'first' | 'last') {
  const [year, month] = iso.split('-').map(Number);
  if (edge === 'first') return `${iso.slice(0, 7)}-01`;
  return `${iso.slice(0, 7)}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
}
