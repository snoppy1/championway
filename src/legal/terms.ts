import { CONTACT_EMAIL, EFFECTIVE, OPERATOR } from './types';
import type { LegalPair } from './types';

/* ข้อกำหนดการใช้งาน ตรงกับโหมดตัวกลาง (ติดต่อเมนเทอร์นอกเว็บ) และสมาชิก Rising Star ที่เมนเทอร์จ่ายให้เรา
   ถ้าเปิดระบบจ้าง แชต หรือจ่ายเงินให้เมนเทอร์ (HIRING_ENABLED) ต้องแก้ข้อ 4–5 ก่อน */

export const terms: LegalPair = {
  th: {
    title: 'ข้อกำหนดการใช้งาน',
    updated: `มีผลตั้งแต่วันที่ ${EFFECTIVE.th}`,
    intro: `ข้อกำหนดนี้เป็นข้อตกลงระหว่างคุณกับ ${OPERATOR} ผู้ดำเนินการ ChampionWays ("เรา") เมื่อคุณใช้เว็บ championways.space สมัครสมาชิก หรือสมัครเป็นเมนเทอร์ ถือว่าคุณยอมรับข้อกำหนดนี้และนโยบายความเป็นส่วนตัว`,
    sections: [
      { id: 'service', heading: '1. ChampionWays คืออะไร', blocks: [
        'ChampionWays รวบรวมข้อมูลงานแข่งขัน ค่าย และโอกาสต่าง ๆ ให้ค้นหาง่าย และเป็นตัวกลางให้คุณรู้จักเมนเทอร์ที่เคยลงแข่งในเวทีนั้นจริง',
        { list: [
          'เราไม่ใช่ผู้จัดงานแข่งขันที่ลงบนเว็บ ข้อมูลงานแข่ง (วันปิดรับสมัคร รางวัล คุณสมบัติ) อาจเปลี่ยนได้ ก่อนสมัครกรุณาตรวจกับประกาศของผู้จัดเสมอ',
          'ตอนนี้การปรึกษาและการจ่ายเงินระหว่างคุณกับเมนเทอร์เกิดขึ้นนอก ChampionWays เราไม่ได้เป็นคู่สัญญาในข้อตกลงนั้น และไม่ได้รับหรือถือเงินแทนฝ่ายใด',
        ] },
      ] },
      { id: 'account', heading: '2. บัญชีผู้ใช้', blocks: [
        { list: [
          'ใช้ข้อมูลจริง และดูแลรหัสผ่านของคุณเอง กิจกรรมที่เกิดจากบัญชีของคุณถือเป็นความรับผิดชอบของคุณ',
          'หนึ่งคนหนึ่งบัญชี ห้ามสร้างบัญชีปลอมหรือสวมรอยเป็นผู้อื่น',
          'ถ้าคุณอายุต่ำกว่า 20 ปี ต้องได้รับความยินยอมจากผู้ปกครองก่อนใช้บริการ',
          'ถ้าสงสัยว่าบัญชีถูกใช้โดยไม่ได้รับอนุญาต แจ้งเราทันที',
        ] },
      ] },
      { id: 'mentors', heading: '3. สำหรับเมนเทอร์', blocks: [
        { list: [
          'ข้อมูล ประสบการณ์ และหลักฐานในใบสมัครต้องเป็นความจริงและเป็นของคุณเอง ทีมงานตรวจก่อนเผยแพร่ และอาจขอหลักฐานเพิ่ม',
          'คุณรับปรึกษาได้เฉพาะเวทีที่คุณเคยลงแข่งจริง และต้องไม่รับปรึกษาทีมในเวทีที่คุณเป็นกรรมการหรือผู้จัด',
          'ให้คำแนะนำเท่านั้น ห้ามทำงานหรือจัดทำผลงานส่งแข่งแทนทีม และห้ามช่วยทุจริตกติกาของเวที',
          'ราคาและเงื่อนไขที่คุณตกลงกับนักเรียนเป็นเรื่องระหว่างคุณกับนักเรียน คุณรับผิดชอบภาษีจากรายได้ของคุณเอง',
          'การยืนยันว่าได้ให้คำปรึกษาต้องตรงกับความจริง',
        ] },
      ] },
      { id: 'rising-star', heading: '4. สมาชิก Rising Star', blocks: [
        { list: [
          'Rising Star เป็นสมาชิกรายเดือนสำหรับเมนเทอร์ ราคา 99 บาทต่อเดือน (ราคาอาจเปลี่ยนได้ โดยเราจะแจ้งล่วงหน้าก่อนรอบชำระถัดไป)',
          'จ่ายด้วยบัตร: ต่ออายุอัตโนมัติทุกเดือนจนกว่าคุณจะยกเลิก ยกเลิกได้ทุกเมื่อที่ "จัดการการสมัคร" และยังใช้สิทธิ์ได้จนสิ้นรอบที่จ่ายแล้ว',
          'จ่ายด้วย PromptPay: ได้สิทธิ์หนึ่งเดือนต่อการจ่ายหนึ่งครั้ง ไม่ต่ออายุเอง เราจะส่งอีเมลเตือนก่อนหมด',
          'ถ้าตัดบัตรไม่ผ่าน สิทธิ์ Rising Star จะหยุดจนกว่าการชำระจะสำเร็จ',
          'สมาชิกช่วยให้ชื่อของคุณขึ้นในส่วน Rising Star และมีสิทธิ์จัดอันดับตามคะแนนรีวิว แต่เราไม่รับประกันจำนวนนักเรียนที่ติดต่อหรือรายได้',
          'การคืนเงินเป็นไปตามนโยบายคืนเงิน',
        ] },
      ] },
      { id: 'reviews', heading: '5. รีวิวและเนื้อหาที่คุณส่ง', blocks: [
        { list: [
          'รีวิวต้องมาจากการปรึกษาที่เกิดขึ้นจริง ห้ามรีวิวตัวเอง ห้ามจ้างหรือแลกรีวิว',
          'คุณยังเป็นเจ้าของเนื้อหาที่ส่งมา (โปรไฟล์ รีวิว ข้อมูลงานแข่ง) แต่อนุญาตให้เราแสดง ปรับรูปแบบ และแปลเนื้อหานั้นบน ChampionWays เพื่อให้บริการ',
          'เราอาจซ่อนหรือลบเนื้อหาที่ผิดข้อกำหนด ผิดกฎหมาย หรือทำให้ผู้อื่นเข้าใจผิด',
        ] },
      ] },
      { id: 'prohibited', heading: '6. สิ่งที่ห้ามทำ', blocks: [
        { list: [
          'ใช้ข้อมูลติดต่อของเมนเทอร์หรือผู้ใช้อื่นเพื่อสแปม ขายของ หรือคุกคาม',
          'ดึงข้อมูลจากเว็บด้วยโปรแกรมอัตโนมัติจำนวนมาก หรือพยายามเจาะ รบกวน หรือข้ามระบบความปลอดภัย',
          'โพสต์เนื้อหาที่ผิดกฎหมาย ละเมิดลิขสิทธิ์ หรือละเมิดความเป็นส่วนตัวของผู้อื่น',
        ] },
      ] },
      { id: 'suspension', heading: '7. การระงับบัญชี', blocks: [
        'ถ้าคุณทำผิดข้อกำหนดนี้ เราอาจถอดโปรไฟล์ ระงับ หรือปิดบัญชีของคุณ ในกรณีที่ไม่ร้ายแรง เราจะแจ้งเหตุผลและให้โอกาสแก้ไขก่อน คุณขอปิดบัญชีของคุณเองได้ทุกเมื่อโดยติดต่อเรา',
      ] },
      { id: 'liability', heading: '8. ข้อจำกัดความรับผิด', blocks: [
        'เราพยายามให้ข้อมูลถูกต้องและให้บริการได้ต่อเนื่อง แต่ไม่รับประกันผลการแข่งขัน คุณภาพคำแนะนำของเมนเทอร์แต่ละคน หรือความถูกต้องของข้อมูลจากผู้จัดงาน เท่าที่กฎหมายอนุญาต ความรับผิดของเราต่อคุณรวมแล้วไม่เกินจำนวนเงินที่คุณจ่ายให้เราในช่วง 12 เดือนก่อนเกิดเหตุ ข้อนี้ไม่จำกัดสิทธิ์ใดของคุณที่กฎหมายคุ้มครองผู้บริโภคกำหนดไว้',
      ] },
      { id: 'changes', heading: '9. การเปลี่ยนแปลงข้อกำหนด', blocks: [
        'เราอาจปรับข้อกำหนดนี้เมื่อบริการเปลี่ยน ถ้าเป็นการเปลี่ยนแปลงสำคัญ เราจะแจ้งบนเว็บหรือทางอีเมลก่อนมีผล การใช้บริการต่อหลังจากนั้นถือว่าคุณยอมรับข้อกำหนดใหม่',
      ] },
      { id: 'law', heading: '10. กฎหมายที่ใช้บังคับ', blocks: ['ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย'] },
      { id: 'contact', heading: '11. ติดต่อเรา', blocks: [`${OPERATOR} · ${CONTACT_EMAIL}`] },
    ],
  },
  en: {
    title: 'Terms of Service',
    updated: `Effective ${EFFECTIVE.en}`,
    intro: `These terms are an agreement between you and ${OPERATOR}, who operates ChampionWays ("we"). By using championways.space, creating an account, or applying to be a mentor, you agree to these terms and to our Privacy Policy.`,
    sections: [
      { id: 'service', heading: '1. What ChampionWays is', blocks: [
        'ChampionWays gathers competitions, camps and other opportunities so they are easy to find, and introduces you to mentors who have actually competed in those competitions.',
        { list: [
          'We do not organize the competitions listed on the site. Competition details (deadlines, prizes, eligibility) can change, so always check the organizer\'s announcement before you apply.',
          'For now, consultations and any payment between you and a mentor happen outside ChampionWays. We are not a party to that arrangement and we do not take or hold money for either side.',
        ] },
      ] },
      { id: 'account', heading: '2. Your account', blocks: [
        { list: [
          'Use accurate information and keep your password safe. You are responsible for activity on your account.',
          'One person, one account. Do not create fake accounts or pretend to be someone else.',
          'If you are under 20, you need a parent\'s or guardian\'s consent before using the service.',
          'Tell us right away if you think someone has used your account without permission.',
        ] },
      ] },
      { id: 'mentors', heading: '3. For mentors', blocks: [
        { list: [
          'The details, experience and evidence in your application must be true and your own. Our team reviews them before publishing and may ask for more evidence.',
          'You may only mentor competitions you actually competed in, and you must not advise teams in a competition you judge or organize.',
          'Give guidance only. Do not do the work or produce competition entries for a team, and do not help anyone break a competition\'s rules.',
          'Prices and terms you agree with a student are between you and the student. You are responsible for tax on your own income.',
          'Confirmations that you gave a consultation must be truthful.',
        ] },
      ] },
      { id: 'rising-star', heading: '4. Rising Star membership', blocks: [
        { list: [
          'Rising Star is a monthly membership for mentors at 99 THB per month. The price may change; we will tell you before your next billing period.',
          'Paying by card: renews automatically every month until you cancel. Cancel any time under "Manage subscription" and keep your benefits until the end of the period you paid for.',
          'Paying with PromptPay: each payment covers one month and does not renew by itself. We email you a reminder before it ends.',
          'If a card payment fails, Rising Star benefits pause until a payment succeeds.',
          'Membership puts your name in the Rising Star section and makes you eligible for the review-based ranking. We do not guarantee how many students contact you or how much you earn.',
          'Refunds follow our Refund Policy.',
        ] },
      ] },
      { id: 'reviews', heading: '5. Reviews and content you submit', blocks: [
        { list: [
          'Reviews must come from a consultation that really happened. No reviewing yourself, and no paying for or trading reviews.',
          'You keep ownership of what you submit (profiles, reviews, competition details), but you allow us to display, format and translate it on ChampionWays to provide the service.',
          'We may hide or remove content that breaks these terms, breaks the law, or misleads others.',
        ] },
      ] },
      { id: 'prohibited', heading: '6. What you must not do', blocks: [
        { list: [
          'Use mentors\' or other users\' contact details to spam, sell, or harass.',
          'Scrape the site at scale with automated tools, or try to break into, disrupt, or get around its security.',
          'Post content that is illegal, infringes copyright, or invades someone else\'s privacy.',
        ] },
      ] },
      { id: 'suspension', heading: '7. Suspension', blocks: [
        'If you break these terms, we may remove your profile, suspend, or close your account. For minor issues we will explain why and give you a chance to fix things first. You can ask us to close your own account at any time.',
      ] },
      { id: 'liability', heading: '8. Limitation of liability', blocks: [
        'We work to keep information accurate and the service available, but we do not guarantee competition results, the quality of any individual mentor\'s advice, or the accuracy of information from organizers. To the extent the law allows, our total liability to you is limited to the amount you paid us in the 12 months before the event. This does not limit any rights you have under consumer protection law.',
      ] },
      { id: 'changes', heading: '9. Changes to these terms', blocks: [
        'We may update these terms as the service changes. For significant changes we will announce them on the site or by email before they take effect. Continuing to use the service after that means you accept the new terms.',
      ] },
      { id: 'law', heading: '10. Governing law', blocks: ['These terms are governed by the laws of Thailand.'] },
      { id: 'contact', heading: '11. Contact us', blocks: [`${OPERATOR} · ${CONTACT_EMAIL}`] },
    ],
  },
};
