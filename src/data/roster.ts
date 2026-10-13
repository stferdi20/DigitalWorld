import data from './roster.json';
import type { DigimonForm, EvolutionLine } from './types';

export const LINES = data.lines as EvolutionLine[];

export function lineById(id: string): EvolutionLine {
  const l = LINES.find((x) => x.id === id);
  if (!l) throw new Error(`unknown line ${id}`);
  return l;
}

/** Every form that may appear on screen, including dark branches. */
export function allForms(): { form: DigimonForm; line: EvolutionLine }[] {
  return LINES.flatMap((line) => [
    ...line.forms.map((form) => ({ form, line })),
    ...(line.dark ? [{ form: line.dark.to, line }] : []),
  ]);
}

let customN = 0;
/** A one-form line for hiring any sprite straight from the Digidex. */
export function addCustomLine(name: string): EvolutionLine {
  const id = `custom_${++customN}`;
  const line: EvolutionLine = { id, name, home: 'training', color: '#888888', forms: [{ id, name, stage: 'rookie' }] };
  LINES.push(line);
  return line;
}
