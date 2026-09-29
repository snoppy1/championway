/* Reference-page renderer. Builds the same markup the real pages will use, in English and Thai.
   All styling comes from src/styles.css + src/rising-star.css; nothing is styled here. */
(function () {
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/></svg>';
  const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M4 12.5 9 17.5 20 6.5"/></svg>';
  const WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>';

  const T = {
    en: {
      hallTitle: 'Rising Star Hall of Fame',
      hallLead: 'The mentors with the most successful sessions each month. Only confirmed sessions whose time has passed count.',
      sample: 'Sample ranking, not real data',
      last: 'Last month', now: 'This month', before: 'Two months ago',
      m: ['August 2026', 'September 2026', 'July 2026'],
      closing: 'Ranking closes tonight 23:59',
      times: 'sessions', timesLong: 'successful sessions', ranks23: 'Ranks 2–3',
      rank: (n) => 'Rank ' + n,
      people: [
        { i: 'P', n: 'Pannawat Srisuk', s: 'Business plans and pitching' },
        { i: 'N', n: 'Natchaya Wongthong', s: 'Data science and hackathons' },
        { i: 'K', n: 'Krittin Onlamai', s: 'UX/UI and design' },
        { i: 'T', n: 'Thanakrit Kaewmanee', s: 'Robotics and IoT' },
        { i: 'S', n: 'Suphawit Boonma', s: 'Business case competitions' },
        { i: 'C', n: 'Chayaphon Thongdee', s: 'Web development for hackathons' },
      ],
      pill: 'Rising Star', profile: 'View profile',
      meta: (n) => `<b>${n}</b> sessions this month · 60 min 450 THB`, metaPlain: '60 min 250 THB',
      rankedTitle: 'Rising Star this month', rankedSub: '6 people · ranked by successful sessions in September',
      allTitle: 'All mentors', allSub: 'Sorted by most recently joined',
      upFor: 'For mentors', upTitle: 'Get found before everyone else', price: '99', per: 'THB / month',
      perks: ['Listed at the top, ranked by successful sessions', 'Eligible for the monthly Hall of Fame; your name stays for 2 more months', 'Rising Star badge on your profile and in search'],
      codeLabel: 'Discount code', codePh: 'e.g. RISING-XXXX', apply: 'Apply code',
      help: 'No code needed. Full price is 99 THB.', ok: 'Code applied: first month 39 THB.', bad: 'We could not find that code. Check the spelling or leave it empty.',
      cta: 'Join Rising Star', fine: 'Renews monthly · payment is not open in this preview',
    },
    th: {
      hallTitle: 'ทำเนียบ Rising Star',
      hallLead: 'เมนเทอร์ที่ให้คำปรึกษาสำเร็จมากที่สุดในแต่ละเดือน นับเฉพาะนัดที่ยืนยันแล้วและถึงเวลานัดแล้ว',
      sample: 'อันดับตัวอย่าง ยังไม่ใช่ข้อมูลจริง',
      last: 'เดือนที่แล้ว', now: 'เดือนนี้', before: 'สองเดือนก่อน',
      m: ['สิงหาคม 2569', 'กันยายน 2569', 'กรกฎาคม 2569'],
      closing: 'ปิดอันดับคืนนี้ 23:59 น.',
      times: 'ครั้ง', timesLong: 'ครั้งที่ปรึกษาสำเร็จ', ranks23: 'อันดับ 2–3',
      rank: (n) => 'อันดับ ' + n,
      people: [
        { i: 'ป', n: 'ปัณณวัฒน์ ศรีสุข', s: 'แผนธุรกิจและการพิชช์' },
        { i: 'ณ', n: 'ณัฐชยา วงศ์ทอง', s: 'Data Science และ Hackathon' },
        { i: 'ก', n: 'กฤติน อ่อนละมัย', s: 'UX/UI และงานออกแบบ' },
        { i: 'ธ', n: 'ธนกฤต แก้วมณี', s: 'หุ่นยนต์และ IoT' },
        { i: 'ศ', n: 'ศุภวิชญ์ บุญมา', s: 'แข่งเคสธุรกิจ' },
        { i: 'ช', n: 'ชยพล ทองดี', s: 'พัฒนาเว็บสำหรับ Hackathon' },
      ],
      pill: 'Rising Star', profile: 'ดูโปรไฟล์',
      meta: (n) => `<b>${n}</b> ครั้งเดือนนี้ · 60 นาที 450 บาท`, metaPlain: '60 นาที 250 บาท',
      rankedTitle: 'Rising Star เดือนนี้', rankedSub: '6 คน · เรียงตามจำนวนนัดที่ปรึกษาสำเร็จในเดือนกันยายน',
      allTitle: 'เมนเทอร์ทั้งหมด', allSub: 'เรียงตามเมนเทอร์ที่เข้าร่วมล่าสุด',
      upFor: 'สำหรับเมนเทอร์', upTitle: 'ให้นักเรียนเจอคุณก่อนคนอื่น', price: '99', per: 'บาท / เดือน',
      perks: ['ขึ้นรายชื่อช่วงบนสุด เรียงอันดับตามนัดที่ปรึกษาสำเร็จ', 'มีสิทธิ์ติดทำเนียบประจำเดือน ชื่ออยู่บนหน้านี้ต่อไปอีก 2 เดือน', 'ป้าย Rising Star บนโปรไฟล์และผลค้นหา'],
      codeLabel: 'โค้ดส่วนลด', codePh: 'เช่น RISING-XXXX', apply: 'ใช้โค้ด',
      help: 'ไม่มีโค้ดก็สมัครได้ ราคาเต็ม 99 บาท', ok: 'ใช้โค้ดแล้ว เดือนแรก 39 บาท', bad: 'ไม่พบโค้ดนี้ ตรวจตัวสะกดอีกครั้ง หรือเว้นว่างไว้ก็ได้',
      cta: 'สมัคร Rising Star', fine: 'ต่ออายุทุกเดือน · ชำระเงินยังไม่เปิดในหน้าตัวอย่างนี้',
    },
  };

  const medal = (n, extra = '', lang) => `<span class="rs-medal rs-medal--${n} ${extra}" role="img" aria-label="${T[lang].rank(n)}">${n}</span>`;
  const av = (t, cls = '') => `<span class="rs-avatar ${cls}" aria-hidden="true">${t}</span>`;
  const pill = (lang) => `<span class="rs-pill">${STAR}${T[lang].pill}</span>`;

  function month(lang, kind, p) {
    const t = T[lang];
    const a = t.people;
    const win = p.win, rest = p.rest;
    const winner = `<div class="rs-winner">
      <span class="rs-avatar-wrap">${av(win.i)}${medal(1, '', lang)}</span>
      <div class="rs-winner__who"><p class="rs-winner__name">${win.n}</p><p class="rs-winner__spec">${win.s}</p></div>
      <p class="rs-winner__count"><b>${p.count}</b><span>${kind === 'now' ? t.timesLong : t.times}</span></p></div>`;
    const list = `<ol class="rs-rank-list ${kind === 'past' ? 'rs-fold__body' : ''}" ${kind === 'past' ? `id="${p.id}" ${p.open ? '' : 'hidden'}` : ''}>${rest.map((r, k) => `
      <li class="rs-rank-row">${medal(k + 2, 'rs-medal--sm', lang)}${av(r.i)}<span class="rs-rank-row__name">${r.n}</span><span class="rs-rank-row__count"><b>${r.c}</b> ${t.times}</span></li>`).join('')}</ol>`;
    if (kind === 'now') {
      return `<section class="rs-month rs-month--now" aria-labelledby="${p.id}-t"><p class="rs-month__label">${t.now}</p><h2 class="rs-month__title" id="${p.id}-t">${t.m[1]}</h2><p class="rs-month__closing">${t.closing}</p>${winner}${list}</section>`;
    }
    return `<section class="rs-month rs-month--past" aria-labelledby="${p.id}-t">
      <div class="rs-month__head"><div><p class="rs-month__label">${p.label}</p><h2 class="rs-month__title" id="${p.id}-t">${p.title}</h2></div>
      <button type="button" class="rs-fold__toggle" aria-expanded="${p.open ? 'true' : 'false'}" aria-controls="${p.id}">${t.ranks23}${CHEV}</button></div>
      ${winner}${list}</section>`;
  }

  function hall(lang, uid, openPast) {
    const t = T[lang], a = t.people;
    return `<section class="rs-hall" aria-labelledby="${uid}-h"><div class="shell">
      <div class="rs-hall__head"><div><h1 id="${uid}-h">${t.hallTitle}</h1><p>${t.hallLead}</p></div><span class="rs-sample">${t.sample}</span></div>
      <div class="rs-months">
        ${month(lang, 'past', { id: uid + '-a', label: t.last, title: t.m[0], win: a[1], count: 17, rest: [{ ...a[3], c: 12 }, { ...a[2], c: 10 }], open: openPast })}
        ${month(lang, 'now', { id: uid + '-b', win: a[0], count: 14, rest: [{ ...a[1], c: 11 }, { ...a[2], c: 9 }] })}
        ${month(lang, 'past', { id: uid + '-c', label: t.before, title: t.m[2], win: a[4], count: 12, rest: [{ ...a[0], c: 9 }, { ...a[3], c: 8 }], open: false })}
      </div></div></section>`;
  }

  function ranked(lang, n = 3) {
    const t = T[lang], a = t.people;
    return `<ol class="rs-list">${a.slice(0, n).map((p, k) => `
      <li class="rs-row"><span class="rs-row__rank" role="img" aria-label="${t.rank(k + 1)}">${k + 1}</span>${av(p.i)}
      <div><p class="rs-row__name">${p.n} ${pill(lang)}</p><p class="rs-row__spec">${p.s}</p><p class="rs-row__meta">${t.meta(14 - k * 2)}</p></div>
      <a class="ghost-button rs-row__action" href="#">${t.profile}</a></li>`).join('')}</ol>`;
  }
  function plain(lang, n = 2) {
    const t = T[lang], a = t.people.slice(4);
    return `<ul class="rs-list rs-list--plain">${a.slice(0, n).map((p) => `
      <li class="rs-row">${av(p.i, 'rs-avatar--plain')}<div><p class="rs-row__name">${p.n}</p><p class="rs-row__spec">${p.s}</p><p class="rs-row__meta">${t.metaPlain}</p></div>
      <a class="ghost-button rs-row__action" href="#">${t.profile}</a></li>`).join('')}</ul>`;
  }

  /* code field: state = empty | filled | valid | invalid | disabled | loading, force = hover | focus */
  function code(lang, id, state = 'empty', force = '') {
    const t = T[lang];
    const val = state === 'empty' || state === 'disabled' ? '' : state === 'invalid' ? 'RISING-0000' : 'RISING-2026';
    const inCls = ['rs-code__input', state === 'valid' ? 'is-valid' : '', force ? 'is-' + force : ''].join(' ');
    const msg = state === 'valid' ? `<p class="rs-code__msg rs-code__msg--ok" id="${id}-m" role="status">${TICK}${t.ok}</p>`
      : state === 'invalid' ? `<p class="rs-code__msg rs-code__msg--error" id="${id}-m" role="alert">${WARN}${t.bad}</p>`
      : `<p class="rs-code__msg" id="${id}-m">${t.help}</p>`;
    return `<form class="rs-code" onsubmit="return false"><label class="rs-code__label" for="${id}">${t.codeLabel}</label>
      <div class="rs-code__field"><input class="${inCls}" id="${id}" autocomplete="off" placeholder="${t.codePh}" value="${val}" ${state === 'invalid' ? 'aria-invalid="true"' : ''} ${state === 'disabled' ? 'disabled' : ''} aria-describedby="${id}-m">
      <button class="ghost-button rs-code__apply" type="button" ${state === 'disabled' ? 'disabled' : ''} ${state === 'loading' ? 'aria-busy="true" aria-disabled="true"' : ''}>${t.apply}</button></div>${msg}</form>`;
  }

  function upsell(lang, id, codeState = 'empty', sticky = true) {
    const t = T[lang];
    return `<aside class="rs-upsell" ${sticky ? '' : 'style="position:static"'} aria-labelledby="${id}-t"><div class="rs-upsell__head"><p class="rs-upsell__for">${t.upFor}</p><h3 class="rs-upsell__title" id="${id}-t">${t.upTitle}</h3><p class="rs-upsell__price"><b>${t.price}</b><span>${t.per}</span></p></div>
      <div class="rs-upsell__body"><ul class="rs-perks">${t.perks.map((x) => `<li>${TICK}<span>${x}</span></li>`).join('')}</ul>
      ${code(lang, id + '-code', codeState)}
      <button class="primary-button rs-upsell__cta" type="button">${t.cta}</button><p class="rs-upsell__fine">${t.fine}</p></div></aside>`;
  }

  function langToggle(pressed, force = {}, disabled = false) {
    const b = (l) => `<button type="button" lang="en" aria-pressed="${pressed === l}" class="${force[l] ? 'is-' + force[l] : ''}" ${disabled ? 'disabled' : ''}>${l.toUpperCase()}</button>`;
    return `<div class="lang-toggle" role="group" aria-label="Language">${b('en')}${b('th')}</div>`;
  }

  function fold(root) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('.rs-fold__toggle'); if (!b) return;
      const open = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', String(!open));
      document.getElementById(b.getAttribute('aria-controls')).hidden = open;
    });
  }

  window.RS = { T, hall, ranked, plain, code, upsell, langToggle, fold, medal, av, pill, STAR };
})();
