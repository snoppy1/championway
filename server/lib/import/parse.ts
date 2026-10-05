/* แปลงหน้าเว็บกับ RSS เป็นข้อความล้วนให้ AI อ่าน ไม่ใช้ไลบรารีเพิ่ม เพราะต้องการแค่ข้อความ ไม่ต้องการโครงสร้างหน้า */

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…' };

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : '';
    }
    return entities[code.toLowerCase()] ?? whole;
  });
}

const MAX_TEXT = 40_000;

/** ข้อความที่อ่านได้ของหน้าเว็บ: ตัด script/style/nav/footer ทิ้ง เก็บลิงก์ไว้ในวงเล็บเพื่อให้ AI หาลิงก์สมัครได้ */
export function htmlToText(html: string) {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, ' ').trim();
      return /^https?:/i.test(href) && text ? ` ${text} (${href}) ` : ` ${text} `;
    })
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeEntities(body)
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text: text.slice(0, MAX_TEXT) };
}

export type FeedItem = { title: string; link: string; published: string | null; categories: string[] };

const cdata = (value: string) => value.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
const tag = (block: string, name: string) => {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decodeEntities(cdata(match[1])).trim() : '';
};

/** รายการใน RSS 2.0 (WordPress ของ YSC และ Contest Thailand ใช้แบบนี้) */
export function parseRss(xml: string): FeedItem[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([, block]) => ({
    title: tag(block, 'title'),
    link: tag(block, 'link'),
    published: tag(block, 'pubDate') || null,
    categories: [...block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map(([, value]) => decodeEntities(cdata(value)).trim()),
  })).filter((item) => item.title && /^https?:\/\//i.test(item.link));
}

/** URL ที่ใช้เทียบว่าเคยเห็นประกาศนี้แล้ว: ตัด #, utm_*, ทับท้าย และตัวพิมพ์ของโดเมน */
export function normalizeUrl(raw: string) {
  const url = new URL(raw);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  url.hostname = url.hostname.toLowerCase();
  let text = url.toString();
  if (url.pathname.length > 1 && text.endsWith('/') && !url.search) text = text.slice(0, -1);
  return text;
}
