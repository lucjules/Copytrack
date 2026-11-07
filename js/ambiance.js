// Ambiance d'un circuit (0.9.18) : le MOMENT de la journée, la BRUME et la MUSIQUE, au choix de l'auteur, par-dessus le décor. Purement visuel et sonore : aucun effet sur la physique, les temps ni la signature
// du circuit (changer l'ambiance ne fait perdre ni la vérification ni les records). Module sans rendu : resolveAmbiance renvoie les réglages à appliquer à la scène (scenery.js).

export const SKY_CHOICES = [['', 'Selon le décor'], ['dawn', 'Aube'], ['day', 'Plein jour'], ['sunset', 'Coucher de soleil'], ['night', 'Nuit']];
export const FOG_CHOICES = [['', 'Selon le décor'], ['clear', 'Dégagé'], ['misty', 'Brumeux'], ['thick', 'Épais']];
export const MUSIC_CHOICES = [['', 'Chill de course'], ['menu', 'Groove du menu'], ['none', 'Aucune']];

const SKIES = SKY_CHOICES.map(([k]) => k).filter(Boolean), FOGS = FOG_CHOICES.map(([k]) => k).filter(Boolean), MUSICS = MUSIC_CHOICES.map(([k]) => k).filter(Boolean);

export const DEFAULT_AMBIANCE = Object.freeze({ sky: '', fog: '', music: '' });
export const isDefaultAmbiance = (a) => !a || (!a.sky && !a.fog && !a.music);

// Valeurs inconnues ou hostiles (code de circuit venu d'un inconnu) : ignorées.
export function cleanAmbiance(a) {
  const o = a && typeof a === 'object' ? a : {};
  return { sky: SKIES.includes(o.sky) ? o.sky : '', fog: FOGS.includes(o.fog) ? o.fog : '', music: MUSICS.includes(o.music) ? o.music : '' };
}

// Forme compacte écrite dans le code du circuit (champ « am ») : [ciel, brume, musique], null si tout est par défaut.
export const ambianceToArray = (a) => (isDefaultAmbiance(a) ? null : [a.sky || '', a.fog || '', a.music || '']);
export const ambianceFromArray = (arr) => (Array.isArray(arr) ? cleanAmbiance({ sky: arr[0], fog: arr[1], music: arr[2] }) : { ...DEFAULT_AMBIANCE });

// Le moment de la journée tire les couleurs du décor vers celles-ci (k : part du décor remplacée).
const SKY_TARGET = {
  dawn: { top: '#4a5d9a', mid: '#e79a8a', horizon: '#ffd7a8', sun: '#ffe2b8', sunDir: [0.85, 0.18, -0.5], sunColor: '#ffcf9a', sunIntensity: 1.8, hemi: ['#ffd9bd', '#3a3f66', 1.2], fog: '#e8b9a0', stars: 0.15, k: 0.7 },
  day: { top: '#2d7fe0', mid: '#79c3f5', horizon: '#eaf6ff', sun: '#fff8e0', sunDir: [0.35, 0.85, -0.4], sunColor: '#fff4dd', sunIntensity: 3.0, hemi: ['#d8ecff', '#6a7a6a', 1.8], fog: '#cfe6f5', stars: 0, k: 0.75 },
  sunset: { top: '#2a2250', mid: '#c0486a', horizon: '#ffb15e', sun: '#ffd9a0', sunDir: [-0.8, 0.14, -0.55], sunColor: '#ff9a55', sunIntensity: 2.0, hemi: ['#ffb68a', '#2a1f3d', 1.3], fog: '#a85a5a', stars: 0.1, k: 0.75 },
  night: { top: '#02030c', mid: '#0b1230', horizon: '#1c2750', sun: '#b6c8ff', sunDir: [-0.3, 0.4, -0.8], sunColor: '#8fa6ff', sunIntensity: 0.9, hemi: ['#6a7cc0', '#05060f', 0.7], fog: '#0a0f26', stars: 1, k: 0.85 },
};
// Brume : multiplicateur de la distance du brouillard.
const FOG_SCALE = { clear: 2.2, misty: 0.55, thick: 0.22 };

const lerp = (a, b, k) => a + (b - a) * k;
function mix(c1, c2, k) {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return '#' + a.map((v, i) => Math.round(lerp(v, b[i], k)).toString(16).padStart(2, '0')).join('');
}

// theme : un décor de scenery.js (sky, fog, fogNear, fogFar, sunDir, sunColor, sunIntensity, hemi) ; renvoie une COPIE avec l'ambiance appliquée (le décor d'origine n'est jamais modifié).
export function resolveAmbiance(theme, ambiance) {
  const am = cleanAmbiance(ambiance);
  const out = { ...theme, sky: { ...theme.sky }, hemi: [...theme.hemi], sunDir: [...theme.sunDir] };
  const T = SKY_TARGET[am.sky];
  if (T) {
    const k = T.k;
    out.sky.top = mix(theme.sky.top, T.top, k); out.sky.mid = mix(theme.sky.mid, T.mid, k); out.sky.horizon = mix(theme.sky.horizon, T.horizon, k); out.sky.sun = mix(theme.sky.sun, T.sun, k);
    out.sky.stars = lerp(theme.sky.stars || 0, T.stars, k);
    out.fog = mix(theme.fog, T.fog, k);
    out.sunDir = theme.sunDir.map((v, i) => lerp(v, T.sunDir[i], k));
    out.sunColor = mix(theme.sunColor, T.sunColor, k);
    out.sunIntensity = lerp(theme.sunIntensity, T.sunIntensity, k);
    out.hemi = [mix(theme.hemi[0], T.hemi[0], k), mix(theme.hemi[1], T.hemi[1], k), lerp(theme.hemi[2], T.hemi[2], k)];
  }
  if (FOG_SCALE[am.fog]) { out.fogNear = theme.fogNear * FOG_SCALE[am.fog]; out.fogFar = theme.fogFar * FOG_SCALE[am.fog]; }
  return out;
}
