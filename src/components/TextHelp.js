'use client';

import { useEffect } from 'react';

// Spelling help for the boxes where people write a sentence (note, description, purpose, reason).
// 1. The browser's and the phone's own checking is switched on: red underline and suggestions on a computer,
//    auto-correct and a capital letter after a full stop on a phone.
// 2. A short fix list changes a known wrong spelling to the right one when the word is finished (space, comma or full stop).
// Names, phone numbers and amounts are never touched: only the field names below are checked.
const FIELDS = new Set(['note', 'description', 'purpose', 'reason', 'comment', 'message']);

// Only clear mistakes belong here. Never add a word that is also a real word, a name or a brand (BOLDBus, BRV, OpsTrack).
const FIX = {
  recieve: 'receive', recieved: 'received', reciept: 'receipt', recipt: 'receipt', recieving: 'receiving',
  adress: 'address', adresses: 'addresses', tommorow: 'tomorrow', tomorow: 'tomorrow', tommorrow: 'tomorrow',
  expence: 'expense', expences: 'expenses', expenes: 'expenses', paymnet: 'payment', payement: 'payment', paiment: 'payment',
  accomodation: 'accommodation', acommodation: 'accommodation', occured: 'occurred', occurence: 'occurrence',
  seperate: 'separate', seperately: 'separately', definately: 'definitely', definatly: 'definitely', definitly: 'definitely',
  untill: 'until', wich: 'which', whcih: 'which', thier: 'their', theier: 'their', becuase: 'because', becouse: 'because', beacuse: 'because',
  teh: 'the', hte: 'the', adn: 'and', nad: 'and', taht: 'that', thsi: 'this', tihs: 'this', wiht: 'with',
  alot: 'a lot', thankyou: 'thank you', infront: 'in front', incase: 'in case',
  dont: "don't", cant: "can't", didnt: "didn't", doesnt: "doesn't", isnt: "isn't", wasnt: "wasn't",
  couldnt: "couldn't", shouldnt: "shouldn't", wouldnt: "wouldn't", havent: "haven't", hasnt: "hasn't", arent: "aren't", werent: "weren't",
  beleive: 'believe', belive: 'believe', freind: 'friend', freinds: 'friends', wierd: 'weird', foriegn: 'foreign',
  begining: 'beginning', beggining: 'beginning', comming: 'coming', goverment: 'government', enviroment: 'environment',
  independant: 'independent', neccessary: 'necessary', necesary: 'necessary', neccesary: 'necessary', necessery: 'necessary',
  occassion: 'occasion', ocasion: 'occasion', refered: 'referred', refering: 'referring', transfered: 'transferred',
  existance: 'existence', maintainance: 'maintenance', maintenence: 'maintenance', mantenance: 'maintenance',
  apparantly: 'apparently', appartment: 'apartment', arguement: 'argument', calender: 'calendar', collegue: 'colleague', colleage: 'colleague',
  commited: 'committed', completly: 'completely', concious: 'conscious', convinient: 'convenient', convenence: 'convenience',
  critisism: 'criticism', delievery: 'delivery', delivary: 'delivery', diffrent: 'different', difficulity: 'difficulty',
  embarass: 'embarrass', excellant: 'excellent', familar: 'familiar', finaly: 'finally', fourty: 'forty', gaurd: 'guard', guage: 'gauge',
  happend: 'happened', harrass: 'harass', immediatly: 'immediately', imediately: 'immediately', interupt: 'interrupt', knowlege: 'knowledge',
  libary: 'library', lisence: 'license', mispell: 'misspell', noticable: 'noticeable', occuring: 'occurring', persistant: 'persistent',
  posession: 'possession', prefered: 'preferred', priviledge: 'privilege', probly: 'probably', proffesional: 'professional', professinal: 'professional',
  publically: 'publicly', realy: 'really', reccomend: 'recommend', recomend: 'recommend', relevent: 'relevant', religous: 'religious',
  resturant: 'restaurant', rythm: 'rhythm', scedule: 'schedule', shedule: 'schedule', sucess: 'success', succesful: 'successful', successfull: 'successful',
  suprise: 'surprise', tatoo: 'tattoo', tecnical: 'technical', temperture: 'temperature', tendancy: 'tendency', truely: 'truly',
  unfortunatly: 'unfortunately', usualy: 'usually', vaccum: 'vacuum', wensday: 'Wednesday', wendsday: 'Wednesday', writting: 'writing',
 pettycash: 'petty cash', fule: 'fuel', fual: 'fuel', desiel: 'diesel', diseal: 'diesel',
 intreview: 'interview', interveiw: 'interview', candiate: 'candidate', candidat: 'candidate',
  attendence: 'attendance', attandance: 'attendance', approvel: 'approval', aproval: 'approval', aprove: 'approve', aproved: 'approved',
  reimbursment: 'reimbursement', reimberse: 'reimburse', adjustement: 'adjustment', adjustmnet: 'adjustment', repiar: 'repair',
  genrator: 'generator', genarator: 'generator', genertor: 'generator', electrcity: 'electricity', electricty: 'electricity', elecricity: 'electricity',
};

const textField = (el) => {
  if (!el || el.dataset.nofix) return false;
  if (el.tagName === 'TEXTAREA') return FIELDS.has(el.name);
  return el.tagName === 'INPUT' && (!el.type || el.type === 'text' || el.type === 'search') && FIELDS.has(el.name);
};

// Keep the way the person typed it: ALL CAPS stays caps, a Capital first letter stays capital.
const keepCase = (typed, fixed) => {
  if (typed.length > 1 && typed === typed.toUpperCase()) return fixed.toUpperCase();
  const first = typed[0];
  if (first !== first.toLowerCase()) return fixed[0].toUpperCase() + fixed.slice(1);
  return fixed;
};

export default function TextHelp() {
  useEffect(() => {
    let busy = false;

    const focus = (e) => {
      const el = e.target;
      if (!textField(el)) return;
      el.spellcheck = true;
      el.setAttribute('autocapitalize', 'sentences');
      el.setAttribute('autocorrect', 'on');
      el.setAttribute('lang', 'en');
    };

    const input = (e) => {
      if (busy || e.isComposing) return;
      const el = e.target;
      if (!textField(el)) return;
      if (e.inputType !== 'insertText' || ![' ', ',', '.'].includes(e.data)) return;
      const pos = el.selectionStart;
      if (pos == null || pos < 2) return;
      const end = pos - 1; // the character just typed is the one before the caret
      const m = /([A-Za-z']+)$/.exec(el.value.slice(0, end));
      if (!m) return;
      const typed = m[1];
      const key = typed.toLowerCase();
      let fixed = key === 'i' ? 'I' : FIX[key];
      if (!fixed || fixed === typed) return;
      if (key !== 'i') fixed = keepCase(typed, fixed);
      if (fixed === typed) return;
      busy = true;
      const start = end - typed.length;
      el.setRangeText(fixed, start, end, 'preserve');
      const caret = pos + (fixed.length - typed.length);
      el.setSelectionRange(caret, caret);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      busy = false;
    };

    document.addEventListener('focusin', focus);
    document.addEventListener('input', input);
    return () => {
      document.removeEventListener('focusin', focus);
      document.removeEventListener('input', input);
    };
  }, []);
  return null;
}
