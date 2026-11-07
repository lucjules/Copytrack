// Médailles : leur ordre (de la meilleure à la moins bonne) et leur attribution selon un temps.
// Module de données pur : l'interface, la course et la carrière s'en servent sans dépendre les unes des autres.
export const MEDALS = [
  { id: 'cristal', label: 'Cristal' },
  { id: 'or', label: 'Or' },
  { id: 'argent', label: 'Argent' },
  { id: 'bronze', label: 'Bronze' },
];

// La meilleure médaille obtenue avec ce temps (medals : { cristal, or, argent, bronze } en secondes), ou null.
export function medalFor(time, medals) {
  if (!medals || time == null) return null;
  for (const m of MEDALS) if (time <= medals[m.id] + 1e-6) return m;
  return null;
}
