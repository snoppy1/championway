/** คืนวันที่แบบ ISO นับจากวันนี้ ใช้กับข้อมูลตัวอย่างเพื่อไม่ให้วันปิดรับหมดอายุ */
export function inDays(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}
