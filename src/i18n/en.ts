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
    mentors: 'Mentors',
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
  risingStar: {
    pageTitle: 'Rising Star Hall of Fame',
    lead: 'The mentors with the most completed consultations each month. Only confirmed bookings whose time has passed are counted.',
    loading: 'Loading mentors…',
    errorTitle: 'Could not load the mentors',
    retry: 'Try again',
    thisMonth: 'This month',
    lastMonth: 'Last month',
    twoMonthsAgo: 'Two months ago',
    sample: 'Sample ranking, not real data',
    closesTonight: 'Ranking closes tonight at 23:59',
    closesOn: (date: string) => `Ranking closes ${date}, 23:59`,
    rank: (rank: number) => `Rank ${rank}`,
    moreRanks: (last: number) => (last === 2 ? 'Rank 2' : `Ranks 2–${last}`),
    consultations: (count: number): string => (count === 1 ? 'consultation' : 'consultations'),
    consultationsLong: (count: number): string => (count === 1 ? 'completed consultation' : 'completed consultations'),
    emptyNow: 'No Rising Star yet this month. The ranking starts with the first completed consultation.',
    emptyPast: 'No Rising Star was ranked in this month.',
    pill: 'Rising Star',
    viewProfile: 'View profile',
    viewProfileOf: (name: string) => `View the profile of ${name}`,
    perSession: (price: number) => `${price.toLocaleString('en-US')}\u00A0THB / 60\u00A0min`,
    thisMonthCount: (count: number) => `${count}\u00A0${count === 1 ? 'consultation' : 'consultations'} this month`,
    rankedTitle: 'Rising Star this month',
    rankedSub: (count: number, month: string) =>
      `${count} ${count === 1 ? 'mentor' : 'mentors'} · ranked by completed consultations in ${month}`,
    rankedEmptyTitle: 'No Rising Star members yet',
    rankedEmptyText: 'Mentors who join Rising Star appear here, ranked by completed consultations.',
    othersTitle: 'Other mentors',
    othersSub: 'Sorted by name',
    othersEmpty: 'Every mentor is a Rising Star member right now.',
    upsellFor: 'For mentors',
    upsellTitle: 'Get found before anyone else',
    price: '99',
    per: 'THB\u00A0/\u00A0month',
    perks: [
      'Listed at the top, ranked by completed consultations',
      'A place in the monthly Hall of Fame, and your name stays for 2\u00A0more\u00A0months',
      'A Rising Star badge next to your name in this list',
    ],
    upsellProgress: (count: number, rank: number) =>
      `You've had ${count} ${count === 1 ? 'consultation' : 'consultations'} this month. As a Rising Star you'd be #${rank}.`,
    upsellNoSessions: 'You have no completed consultations this month yet. Join now to be listed with the Rising Star members.',
    upsellGuestText: 'You need a mentor account first.',
    joinCta: 'Join Rising Star',
    applyCta: 'Apply to be a mentor',
    renewal: 'Renews monthly · payment is not open yet',
    memberTitle: 'You are a Rising Star',
    memberUntil: (date: string) => `Your membership runs until ${date}.`,
    memberProgress: (count: number, rank: number) =>
      `${count} ${count === 1 ? 'consultation' : 'consultations'} this month. You are ranked #${rank}.`,
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
