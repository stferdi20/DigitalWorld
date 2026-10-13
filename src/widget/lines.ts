/** Scripted, in-character chat. Personalities are keyed by evolution line; unknown lines use a generic voice. */
import type { Critter } from './state';

interface Voice { hello: string[]; idle: string[]; tired: string[]; working: (job: string) => string[]; thanks: string[]; }

const VOICES: Record<string, Voice> = {
  veemon: {
    hello: ['Vee! Hey partner!', 'Hiya! Ready when you are.'],
    idle: ['I could take another job, you know.', 'The farm is nice, but I like the DigiLab better.', 'Almost ready to digivolve, I can feel it!'],
    tired: ['Vee… so sleepy.', "Can I have a snack? I'm running on empty."],
    working: (j) => [`Working on "${j}". Going great!`, `"${j}"? Easy. Give me a minute.`],
    thanks: ['Thanks! Vee-tastic!', 'Yum! Back to work!'],
  },
  impmon: {
    hello: ["What do you want?", "Oh, it's you."],
    idle: ["I'm not slacking. I'm thinking.", "Don't make me go to the Dark Farm again.", "Fine. I'll do a job. Maybe."],
    tired: ['I need a nap. A long one.', 'Feed me or I stop working. Just saying.'],
    working: (j) => [`"${j}". Yeah yeah, I'm on it.`, `Doing "${j}". You owe me.`],
    thanks: ['…Thanks. Don\'t tell anyone.', 'Hmph. That was okay.'],
  },
  pichu: {
    hello: ['Pika pika!', 'Pikachu! (it waves)'],
    idle: ['Pika… (it sniffs a flower)', 'Pi-ka! (it wants a job)', 'Chu~ (it naps in the sun)'],
    tired: ['Pika… (its cheeks spark weakly)', 'Chu… (it curls up)'],
    working: (j) => [`Pika! (busy with "${j}")`, `Pikachu concentrates on "${j}".`],
    thanks: ['Pika pika! ⚡', 'Chu! (happy sparks)'],
  },
  megaman: {
    hello: ['MegaMan.EXE, online.', 'Jacked in and ready.'],
    idle: ['Scanning the farm… all clear.', 'Battle chips charged. Send me a job.', 'Running a quick virus sweep.'],
    tired: ['Battery at low. Requesting recharge.', 'Running in power-save mode.'],
    working: (j) => [`Executing "${j}".`, `"${j}" in progress. ETA soon.`],
    thanks: ['Recharge complete. Thanks, operator.', 'Energy restored!'],
  },
};
const DEFAULT: Voice = {
  hello: ['Hello!', 'Hi there!'], idle: ['Got any work for me?', 'Just enjoying the farm.'],
  tired: ["I'm worn out."], working: (j) => [`Busy with "${j}".`], thanks: ['Thank you!'],
};

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export const voiceOf = (c: Critter) => VOICES[c.lineId] ?? DEFAULT;

/** A reply to what you typed, based on keywords and the agent's current state. */
export function reply(c: Critter, text: string): string {
  const v = voiceOf(c), t = text.toLowerCase();
  if (c.job?.approval) return `Waiting on you: can I run ${c.job.approval.command}?`;
  if (/\b(hi|hello|hey|yo)\b/.test(t)) return pick(v.hello);
  if (/(status|doing|progress|job|work)/.test(t)) {
    return c.job ? `${pick(v.working(c.job.title))} (${Math.round(c.job.progress * 100)}%)` : pick(v.idle);
  }
  if (/(tired|energy|sleep|rest|hungry)/.test(t) || c.energy < 30) return c.energy < 40 ? pick(v.tired) : 'Feeling good! Energy ' + Math.round(c.energy) + '%.';
  if (/(thank|good|nice|great)/.test(t)) return pick(v.thanks);
  return c.job ? pick(v.working(c.job.title)) : pick(v.idle);
}
export const greeting = (c: Critter) => (c.job ? pick(voiceOf(c).working(c.job.title)) : c.energy < 30 ? pick(voiceOf(c).tired) : pick(voiceOf(c).hello));
export const thanks = (c: Critter) => pick(voiceOf(c).thanks);
