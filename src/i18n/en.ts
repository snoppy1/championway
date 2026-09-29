/* ภาษาอังกฤษเป็นภาษาตั้งต้นและเป็นต้นฉบับของทุกคีย์
   th.ts ผูกชนิดไว้กับไฟล์นี้ ถ้าภาษาไทยขาดคีย์ไหน build จะไม่ผ่าน แทนที่จะไปโผล่เป็นช่องว่างบนหน้าเว็บ

   รูปแบบ: American English, ขึ้นต้นประโยคด้วยตัวใหญ่ตัวเดียว (sentence case) ทั้งปุ่มและหัวข้อ
   ใช้คำตามอภิธานศัพท์ใน markdown/i18n.md */

export const en = {
  common: {
    skipToContent: 'Skip to main content',
    homeLink: 'ChampionWays home',
    comingSoon: 'Coming soon',
    soonTag: 'Soon',
  },
  errors: {
    unreachable: 'Could not connect to the server. Please try again.',
    serverStatus: (status: number) => `The server returned an error (HTTP ${status}).`,
  },
  nav: {
    mainMenu: 'Main menu',
    explore: 'Explore competitions',
    profile: 'Profile',
    chats: 'My chats',
    library: 'Knowledge hub',
    admin: 'Admin',
    signIn: 'Sign in',
    signUp: 'Sign up',
    signOut: 'Sign out',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    language: 'Language',
    profileTitle: (email: string) => `My profile · ${email}`,
    savedItems: (count: number) => (count === 1 ? '1 saved competition' : `${count} saved competitions`),
  },
  footer: {
    tagline: 'Every champion starts somewhere. We gather competitions so they are easy to find, and keep the ones you care about in one place.',
    find: 'Find',
    forOrganizers: 'For competition organizers',
    listForFree: 'List a competition for free',
    suggestCompetition: 'Suggest a competition',
    bottomLine: 'ChampionWays · Find the right competition and prepare with a mentor',
  },
};

export type Messages = typeof en;
