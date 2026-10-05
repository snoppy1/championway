import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { LookupFunction } from 'node:net';

/* เปิดหน้าเว็บภายนอกให้ระบบดึงงานแข่ง (5 ต.ค. 2569)
   แอดมินวางลิงก์อะไรก็ได้ จึงต้องกันไม่ให้ลิงก์พาเซิร์ฟเวอร์ไปเปิดที่อยู่ภายใน (SSRF)
   เช่น 127.0.0.1, 10.x, 169.254.169.254 (metadata ของคลาวด์)
   ตรวจที่ตอนเชื่อมต่อจริง (lookup ของ socket) ไม่ใช่แค่ตรวจชื่อโดเมนก่อน
   DNS ที่เปลี่ยนคำตอบระหว่างตรวจกับเชื่อมต่อ (DNS rebinding) จึงหลุดไม่ได้ redirect ทุกครั้งตรวจซ้ำแบบเดียวกัน */

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  // ::ffff:0:0/96 ไม่ใส่: BlockList ของ Node เทียบ IPv4 ทุกตัวว่าตรงกับช่วงนี้ (ที่อยู่แบบนี้แปลงเป็น IPv4 แล้วตรวจด้านบนแทน)
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net, prefix, 'ipv6');

/** ที่อยู่ที่ห้ามเชื่อมต่อ (ภายใน ส่วนตัว หรือสงวนไว้) IPv4 ที่ห่อใน IPv6 ตรวจเป็น IPv4 */
export function isBlockedAddress(address: string) {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped) return blocked.check(mapped, 'ipv4');
  // รูปแบบเลขฐานสิบหก เช่น ::ffff:7f00:1 (= 127.0.0.1) ซึ่ง URL แปลงให้เป็นแบบนี้เอง
  const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const [high, low] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
    return blocked.check(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`, 'ipv4');
  }
  const family = isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) return blocked.check(address, 'ipv6');
  return true;
}

export class FetchRefused extends Error {}

const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0);
    const list = addresses as unknown as LookupAddress[];
    const bad = list.find((entry) => isBlockedAddress(entry.address));
    if (bad || !list.length) return callback(new FetchRefused('ลิงก์นี้ชี้ไปที่อยู่ภายในเครือข่าย เปิดไม่ได้'), '', 0);
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

export function checkUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new FetchRefused('ลิงก์ไม่ถูกต้อง'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchRefused('รับเฉพาะลิงก์ http หรือ https');
  if (url.username || url.password) throw new FetchRefused('ลิงก์มีชื่อผู้ใช้หรือรหัสผ่าน เปิดไม่ได้');
  if (url.port && !['80', '443'].includes(url.port)) throw new FetchRefused('รับเฉพาะพอร์ตมาตรฐานของเว็บ');
  // ใส่ IP ตรง ๆ ก็ตรวจตรงนี้เลย (lookup ไม่ถูกเรียกเมื่อ host เป็น IP)
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isBlockedAddress(host)) throw new FetchRefused('ลิงก์นี้ชี้ไปที่อยู่ภายในเครือข่าย เปิดไม่ได้');
  url.hash = '';
  return url;
}

export type FetchedPage = { url: string; status: number; contentType: string; body: string };

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'ChampionWaysBot/1.0 (+https://championways.space; support@championways.space)';

function getOnce(url: URL): Promise<{ status: number; location?: string; contentType: string; body: string }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(url, {
      lookup: guardedLookup,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,text/plain;q=0.8' },
      timeout: TIMEOUT_MS,
    }, (response) => {
      const status = response.statusCode ?? 0;
      const contentType = String(response.headers['content-type'] ?? '');
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        return resolve({ status, location: response.headers.location, contentType, body: '' });
      }
      if (!/text\/|xml|xhtml/i.test(contentType)) {
        response.destroy();
        return reject(new FetchRefused('ลิงก์นี้ไม่ใช่หน้าเว็บหรือ RSS'));
      }
      let size = 0;
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) { response.destroy(); reject(new FetchRefused('หน้านี้ใหญ่เกินไป')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ status, contentType, body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new FetchRefused('เปิดหน้านี้นานเกินไป')));
    request.on('error', reject);
  });
}

/** GET หน้าเว็บภายนอกแบบปลอดภัย ตาม redirect ได้ไม่เกิน 3 ครั้ง ทุกครั้งผ่านการตรวจเดิม */
export async function safeFetch(raw: string): Promise<FetchedPage> {
  let url = checkUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const result = await getOnce(url);
    if (result.location) {
      url = checkUrl(new URL(result.location, url).toString());
      continue;
    }
    if (result.status >= 400) throw new FetchRefused(`ต้นทางตอบ HTTP ${result.status}`);
    return { url: url.toString(), status: result.status, contentType: result.contentType, body: result.body };
  }
  throw new FetchRefused('ลิงก์นี้ redirect หลายต่อเกินไป');
}
