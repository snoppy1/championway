import { CONTACT_EMAIL, EFFECTIVE, OPERATOR } from './types';
import type { LegalPair } from './types';

/* นโยบายความเป็นส่วนตัว เขียนจากสิ่งที่ระบบเก็บจริง ณ 5 ต.ค. 2569 (โหมดตัวกลาง + สมาชิก Rising Star ผ่าน Stripe)
   ต้นร่างอยู่ที่ markdown/legal/ ถ้าเปิดระบบจ้าง แชต หรือจ่ายเงินให้เมนเทอร์ (HIRING_ENABLED) ต้องแก้ไฟล์นี้ก่อน */

export const privacy: LegalPair = {
  th: {
    title: 'นโยบายความเป็นส่วนตัว',
    updated: `มีผลตั้งแต่วันที่ ${EFFECTIVE.th}`,
    intro: 'ChampionWays ("เรา") เป็นเว็บรวมงานแข่งขัน และเป็นตัวกลางให้นักเรียน นักศึกษา และคนทั่วไปได้รู้จักเมนเทอร์ที่ช่วยเตรียมตัวแข่งขัน นโยบายนี้อธิบายว่าเราเก็บข้อมูลส่วนบุคคลอะไร ใช้ทำอะไร เปิดให้ใครเห็น เก็บนานเท่าไร และคุณมีสิทธิอะไรบ้างตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562',
    sections: [
      { id: 'controller', heading: '1. ผู้ควบคุมข้อมูลส่วนบุคคล', blocks: [
        `${OPERATOR} ผู้ดำเนินการ ChampionWays (championways.space) ติดต่อได้ที่ ${CONTACT_EMAIL}`,
      ] },
      { id: 'collect', heading: '2. ข้อมูลที่เราเก็บ', blocks: [
        { list: [
          ['เมื่อสมัครสมาชิกหรือเข้าสู่ระบบ: ', 'อีเมล ชื่อที่แสดง และรหัสผ่าน (เก็บในรูปที่ถอดกลับไม่ได้) ถ้าเข้าสู่ระบบด้วย Google เราได้รับอีเมล ชื่อ รูปโปรไฟล์ และรหัสบัญชี Google ของคุณ รวมถึงข้อมูลโปรไฟล์ที่คุณเลือกกรอกเอง'],
          ['เมื่อสมัครเป็นเมนเทอร์: ', 'ชื่อ-นามสกุล อีเมล อาชีพ องค์กร ประสบการณ์ งานแข่งที่เคยลงและผลงาน ลิงก์หรือไฟล์หลักฐาน รูปโปรไฟล์ ช่องทางติดต่อที่คุณเลือกใส่ และราคาที่คุณกำหนด'],
          ['เมื่อติดต่อเมนเทอร์และรีวิว: ', 'บันทึกว่าคุณติดต่อเมนเทอร์คนไหน สำหรับงานแข่งไหน เมื่อไร สถานะการยืนยัน และคะแนนกับความเห็นที่คุณรีวิว'],
          ['เมื่อสมัครสมาชิก Rising Star (สำหรับเมนเทอร์): ', 'รหัสลูกค้าและสถานะการสมัครจาก Stripe วันที่ชำระและวันหมดอายุ เราไม่เห็นและไม่เก็บเลขบัตรหรือข้อมูลบัญชีของคุณ Stripe เป็นผู้รับชำระเงินโดยตรง'],
          ['เมื่อส่งงานแข่งให้เราลงเว็บ: ', 'ชื่อผู้จัด ชื่อ อีเมล และเบอร์โทรของผู้ติดต่อ'],
          ['ข้อมูลทางเทคนิค: ', 'คุกกี้ที่จำเป็นต่อการเข้าสู่ระบบ (ดูข้อ 7) และบันทึกคำขอตามปกติของผู้ให้บริการโฮสต์ เช่น ที่อยู่ IP และชนิดเบราว์เซอร์ เพื่อความปลอดภัยของระบบ'],
        ] },
        'เราไม่ใช้เครื่องมือติดตามเพื่อการโฆษณา และไม่ขายข้อมูลของคุณ',
      ] },
      { id: 'use', heading: '3. เราใช้ข้อมูลทำอะไร และใช้ฐานทางกฎหมายอะไร', blocks: [
        { table: { head: ['ใช้ทำอะไร', 'ฐานทางกฎหมาย'], rows: [
          ['สร้างและดูแลบัญชี ให้คุณเข้าสู่ระบบได้', 'การปฏิบัติตามสัญญาการใช้บริการ'],
          ['ตรวจคุณสมบัติผู้สมัครเมนเทอร์ และแสดงโปรไฟล์เมนเทอร์', 'การปฏิบัติตามสัญญา'],
          ['แสดงช่องทางติดต่อของเมนเทอร์ให้สมาชิกที่กดติดต่อ', 'ความยินยอมของเมนเทอร์ (เมนเทอร์เลือกเองว่าจะใส่ช่องทางไหน)'],
          ['ส่งอีเมลยืนยันอีเมล ขอให้เมนเทอร์ยืนยันการปรึกษา แจ้งผลการตรวจ และเตือนก่อนสมาชิกหมดอายุ', 'การปฏิบัติตามสัญญา'],
          ['รับชำระค่าสมาชิก Rising Star และออกใบเสร็จ', 'การปฏิบัติตามสัญญา และหน้าที่ตามกฎหมายด้านบัญชีและภาษี'],
          ['ยืนยันอีเมลก่อนเห็นช่องทางติดต่อหรือรีวิว และจำกัดการรีวิว เพื่อกันบัญชีปลอมและรีวิวปลอม', 'ประโยชน์โดยชอบด้วยกฎหมายของเราและผู้ใช้คนอื่น'],
          ['แสดงรีวิวและจัดอันดับเมนเทอร์', 'ประโยชน์โดยชอบด้วยกฎหมาย'],
          ['ตรวจงานแข่งก่อนลงเว็บ', 'การปฏิบัติตามสัญญา'],
          ['ปฏิบัติตามกฎหมายหรือคำสั่งของหน่วยงานรัฐ', 'หน้าที่ตามกฎหมาย'],
        ] } },
      ] },
      { id: 'share', heading: '4. ใครเห็นข้อมูลของคุณ', blocks: [
        { list: [
          ['ทุกคนที่เข้าเว็บ: ', 'เห็นโปรไฟล์เมนเทอร์ (ชื่อและอักษรแรกของนามสกุล ความถนัด งานแข่งที่เคยลงและผลงาน ราคา) และรีวิว (แสดงเฉพาะชื่อแรกของผู้รีวิว)'],
          ['สมาชิกที่ยืนยันอีเมลแล้ว: ', 'เห็นช่องทางติดต่อของเมนเทอร์เมื่อกด "ติดต่อเมนเทอร์"'],
          ['เมนเทอร์: ', 'เห็นชื่อแรกของสมาชิกที่ขอให้ยืนยันการปรึกษา'],
          ['ทีมงาน ChampionWays: ', 'เห็นใบสมัครเมนเทอร์ ใบลงงานแข่ง และข้อมูลที่จำเป็นต่อการดูแลระบบ'],
          ['ผู้ให้บริการที่ประมวลผลแทนเรา: ', 'Vercel (โฮสต์เว็บและเก็บไฟล์) · Neon (ฐานข้อมูล) · Resend (ส่งอีเมล) · Google (เข้าสู่ระบบด้วย Google) · Stripe (รับชำระเงิน)'],
        ] },
        'เมื่อคุณคุยกับเมนเทอร์ผ่านช่องทางนอกเว็บ เช่น LINE ข้อมูลที่คุยกันอยู่ภายใต้นโยบายของบริการนั้น ไม่ใช่ของเรา',
      ] },
      { id: 'transfer', heading: '5. การส่งข้อมูลไปต่างประเทศ', blocks: [
        'ผู้ให้บริการของเราเก็บหรือประมวลผลข้อมูลนอกประเทศไทย เช่น สิงคโปร์และสหรัฐอเมริกา เราเลือกผู้ให้บริการที่มีมาตรการคุ้มครองข้อมูลตามมาตรฐานสากล และส่งข้อมูลไปเท่าที่จำเป็นต่อการให้บริการแก่คุณเท่านั้น',
      ] },
      { id: 'retention', heading: '6. เราเก็บข้อมูลนานเท่าไร', blocks: [
        { list: [
          ['บัญชีและโปรไฟล์: ', 'จนกว่าคุณจะขอลบบัญชี'],
          ['ใบสมัครเมนเทอร์ที่ไม่ผ่าน: ', '1 ปี'],
          ['บันทึกการติดต่อเมนเทอร์และใบลงงานแข่ง: ', '2 ปี'],
          ['ข้อมูลการชำระเงิน: ', 'ตามระยะเวลาที่กฎหมายบัญชีและภาษีกำหนด'],
          ['สำเนาอีเมลที่ระบบส่ง: ', '90 วัน'],
          ['การเข้าสู่ระบบ: ', 'หมดอายุใน 30 วันถ้าเลือก "จำฉันไว้" ไม่อย่างนั้น 8 ชั่วโมง'],
        ] },
        'เมื่อพ้นระยะเวลา เราจะลบหรือทำให้ข้อมูลระบุตัวคุณไม่ได้ เว้นแต่กฎหมายกำหนดให้เก็บต่อ',
      ] },
      { id: 'cookies', heading: '7. คุกกี้', blocks: [
        'เราใช้เฉพาะคุกกี้ที่จำเป็นต่อการเข้าสู่ระบบ (cw_session และคุกกี้ชั่วคราวระหว่างเข้าสู่ระบบด้วย Google) ภาษาที่คุณเลือกและงานแข่งที่คุณบันทึกไว้เก็บอยู่ในเบราว์เซอร์ของคุณเอง ไม่ส่งมาที่เรา เราไม่มีคุกกี้โฆษณาหรือคุกกี้วิเคราะห์การใช้งาน หน้าชำระเงินเป็นของ Stripe และอยู่ภายใต้นโยบายคุกกี้ของ Stripe',
      ] },
      { id: 'rights', heading: '8. สิทธิของคุณ', blocks: [
        { list: [
          'ขอเข้าถึงและขอรับสำเนาข้อมูลของคุณ',
          'ขอแก้ไขข้อมูลให้ถูกต้อง (ชื่อ อีเมล รหัสผ่าน และโปรไฟล์แก้ได้เองที่หน้าแก้โปรไฟล์)',
          'ขอลบข้อมูลหรือลบบัญชี',
          'ขอคัดค้านหรือขอระงับการใช้ข้อมูล',
          'เพิกถอนความยินยอม เช่น เมนเทอร์ลบช่องทางติดต่อได้ทุกเมื่อใน Mentor zone',
          'ขอโอนย้ายข้อมูล',
          'ร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล',
        ] },
        `ส่งคำขอมาที่ ${CONTACT_EMAIL} จากอีเมลที่ใช้สมัคร เราจะตอบภายใน 30 วัน`,
      ] },
      { id: 'minors', heading: '9. ผู้ใช้ที่ยังไม่บรรลุนิติภาวะ', blocks: [
        'ถ้าคุณอายุต่ำกว่า 20 ปี กรุณาให้ผู้ปกครองอ่านนโยบายนี้และยินยอมก่อนใช้บริการ การสมัครสมาชิก Rising Star หรือการชำระเงินใด ๆ ต้องทำโดยผู้ที่อายุ 20 ปีขึ้นไป หรือได้รับอนุญาตจากผู้ปกครองแล้ว ถ้าผู้ปกครองพบว่าบุตรหลานให้ข้อมูลกับเราโดยไม่ได้รับความยินยอม ติดต่อเราเพื่อลบข้อมูลได้',
      ] },
      { id: 'security', heading: '10. ความปลอดภัย', blocks: [
        'เราเก็บรหัสผ่านและลิงก์ยืนยันในรูปที่ถอดกลับไม่ได้ ใช้การเชื่อมต่อที่เข้ารหัส (HTTPS) จำกัดสิทธิ์การเข้าถึงข้อมูลเฉพาะทีมงานที่จำเป็น และตรวจความปลอดภัยของระบบทุกครั้งที่มีการเปลี่ยนแปลงสำคัญ หากเกิดเหตุข้อมูลรั่วไหลที่มีความเสี่ยงต่อคุณ เราจะแจ้งหน่วยงานที่กำกับดูแลและแจ้งคุณตามที่กฎหมายกำหนด',
      ] },
      { id: 'changes', heading: '11. การเปลี่ยนแปลงนโยบาย', blocks: [
        'ถ้าเราเปลี่ยนนโยบายนี้ในส่วนที่สำคัญ เราจะแจ้งบนเว็บหรือทางอีเมลก่อนมีผล',
      ] },
      { id: 'contact', heading: '12. ติดต่อเรา', blocks: [`${OPERATOR} · ${CONTACT_EMAIL}`] },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: `Effective ${EFFECTIVE.en}`,
    intro: 'ChampionWays ("we") lists competitions and connects students and anyone preparing for a competition with mentors who can help. This policy explains what personal data we collect, why, who can see it, how long we keep it, and your rights under Thailand\'s Personal Data Protection Act B.E. 2562 (2019).',
    sections: [
      { id: 'controller', heading: '1. Data controller', blocks: [
        `${OPERATOR}, who operates ChampionWays (championways.space). Contact: ${CONTACT_EMAIL}`,
      ] },
      { id: 'collect', heading: '2. Data we collect', blocks: [
        { list: [
          ['When you sign up or sign in: ', 'your email, display name and password (stored in a form that cannot be reversed). If you sign in with Google, we receive your email, name, profile picture and Google account ID, plus any profile details you choose to add.'],
          ['When you apply to be a mentor: ', 'your full name, email, occupation, organization, experience, the competitions you entered and your results, evidence links or files, profile photo, the contact channels you choose to share, and the prices you set.'],
          ['When you contact a mentor or write a review: ', 'which mentor you contacted, for which competition, when, the confirmation status, and the rating and comments you write.'],
          ['When a mentor joins Rising Star: ', 'the Stripe customer ID, subscription status, payment dates and expiry date. We never see or store your card number or account details. Stripe takes the payment directly.'],
          ['When you submit a competition for listing: ', 'the organizer name and the contact person\'s name, email and phone number.'],
          ['Technical data: ', 'cookies needed to keep you signed in (see section 7), and standard request logs kept by our hosting provider, such as IP address and browser type, for security.'],
        ] },
        'We do not use advertising trackers and we do not sell your data.',
      ] },
      { id: 'use', heading: '3. How we use data and our legal basis', blocks: [
        { table: { head: ['Purpose', 'Legal basis'], rows: [
          ['Create and maintain your account and let you sign in', 'Performance of our terms of service'],
          ['Review mentor applications and show mentor profiles', 'Performance of contract'],
          ['Show a mentor\'s contact channels to members who contact them', 'The mentor\'s consent (mentors choose which channels to share)'],
          ['Send email verification, consultation confirmation requests, review results and renewal reminders', 'Performance of contract'],
          ['Take Rising Star payments and issue receipts', 'Performance of contract and our accounting and tax obligations'],
          ['Require a verified email before contacts or reviews, and limit reviews, to prevent fake accounts and fake reviews', 'Our legitimate interests and those of other users'],
          ['Show reviews and rank mentors', 'Legitimate interests'],
          ['Review competitions before listing them', 'Performance of contract'],
          ['Comply with the law or orders from public authorities', 'Legal obligation'],
        ] } },
      ] },
      { id: 'share', heading: '4. Who can see your data', blocks: [
        { list: [
          ['Everyone visiting the site: ', 'mentor profiles (first name and last initial, specialty, competitions entered and results, prices) and reviews (showing only the reviewer\'s first name).'],
          ['Members with a verified email: ', 'a mentor\'s contact channels, after pressing "Contact mentor".'],
          ['Mentors: ', 'the first name of a member who asks them to confirm a consultation.'],
          ['The ChampionWays team: ', 'mentor applications, competition submissions, and the data needed to run the service.'],
          ['Service providers acting for us: ', 'Vercel (hosting and file storage) · Neon (database) · Resend (email) · Google (Google sign-in) · Stripe (payments).'],
        ] },
        'When you talk with a mentor off the site, for example on LINE, that conversation is covered by that service\'s policy, not ours.',
      ] },
      { id: 'transfer', heading: '5. International transfers', blocks: [
        'Our service providers store or process data outside Thailand, for example in Singapore and the United States. We choose providers with internationally recognized data protection measures and transfer only what is needed to provide the service to you.',
      ] },
      { id: 'retention', heading: '6. How long we keep data', blocks: [
        { list: [
          ['Account and profile: ', 'until you ask us to delete your account'],
          ['Mentor applications that were not approved: ', '1 year'],
          ['Mentor contact records and competition submissions: ', '2 years'],
          ['Payment records: ', 'as long as accounting and tax law requires'],
          ['Copies of emails the system sends: ', '90 days'],
          ['Sign-in sessions: ', '30 days with "Remember me", otherwise 8 hours'],
        ] },
        'After that we delete the data or make it impossible to identify you, unless the law requires us to keep it.',
      ] },
      { id: 'cookies', heading: '7. Cookies', blocks: [
        'We only use cookies needed to keep you signed in (cw_session, and short-lived cookies during Google sign-in). Your language choice and saved competitions stay in your own browser and are not sent to us. We have no advertising or analytics cookies. The payment page belongs to Stripe and follows Stripe\'s cookie policy.',
      ] },
      { id: 'rights', heading: '8. Your rights', blocks: [
        { list: [
          'Access your data and get a copy',
          'Correct your data (you can edit your name, email, password and profile yourself on the edit profile page)',
          'Delete your data or your account',
          'Object to or restrict how we use your data',
          'Withdraw consent, for example a mentor can remove contact channels at any time in the Mentor zone',
          'Data portability',
          'Complain to the Personal Data Protection Committee',
        ] },
        `Send requests to ${CONTACT_EMAIL} from the email address on your account. We reply within 30 days.`,
      ] },
      { id: 'minors', heading: '9. Users who are minors', blocks: [
        'If you are under 20, please have a parent or guardian read this policy and agree before you use the service. Joining Rising Star or making any payment must be done by someone aged 20 or over, or with a parent\'s or guardian\'s permission. If a parent finds that their child gave us data without consent, contact us and we will delete it.',
      ] },
      { id: 'security', heading: '10. Security', blocks: [
        'We store passwords and verification links in a form that cannot be reversed, use encrypted connections (HTTPS), limit data access to team members who need it, and check the system\'s security whenever we make a significant change. If a data breach puts you at risk, we will notify the regulator and you as the law requires.',
      ] },
      { id: 'changes', heading: '11. Changes to this policy', blocks: [
        'If we make a significant change to this policy, we will announce it on the site or by email before it takes effect.',
      ] },
      { id: 'contact', heading: '12. Contact us', blocks: [`${OPERATOR} · ${CONTACT_EMAIL}`] },
    ],
  },
};
