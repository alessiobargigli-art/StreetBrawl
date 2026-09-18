export type CharacterId = 'alex' | 'matt' | 'elisa' | 'gaga';
export type StageId = 1 | 2 | 3 | 4 | 5 | 6;
export type MusicId = 'menu' | 'stage1' | 'boss1' | 'stage2' | 'boss2';

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  gender: 'male' | 'female' | 'unspecified';
  description: string;
  speed: number;
  power: number;
  endurance: number;
  reach: number;
  recovery: number;
}

export interface EncounterDefinition {
  id: string;
  distance: number;
  composition: ReadonlyArray<{ enemy: 'thug' | 'ripper' | 'heavy'; count: number }>;
  reinforcementWaves?: number;
  storyBeat?: string;
}

export interface StageDefinition {
  id: StageId;
  slug: string;
  title: string;
  subtitle: string;
  boss: string;
  worldWidth: number;
  music: MusicId;
  bossMusic: MusicId;
  narrativeLandmarks: readonly string[];
  encounters: readonly EncounterDefinition[];
}

export const CHARACTERS: Readonly<Record<CharacterId, CharacterDefinition>> = {
  alex: { id: 'alex', name: 'Alex', gender: 'male', description: 'Equilibrato e affidabile.', speed: 3, power: 3, endurance: 3, reach: 3, recovery: 3 },
  matt: { id: 'matt', name: 'Matt', gender: 'unspecified', description: 'Agile e rapido nel recupero.', speed: 4, power: 3, endurance: 2, reach: 3, recovery: 4 },
  elisa: { id: 'elisa', name: 'Elisa', gender: 'female', description: 'Resistente, con colpi e lanci pesanti.', speed: 2, power: 4, endurance: 4, reach: 3, recovery: 2 },
  gaga: { id: 'gaga', name: 'Gaga', gender: 'male', description: 'Specialista dei calci e della distanza.', speed: 3, power: 3, endurance: 3, reach: 4, recovery: 3 },
};

const encounters = (stage: number, beats: readonly string[]): EncounterDefinition[] => beats.map((storyBeat, i) => ({
  id: `s${stage}-e${i + 1}`,
  distance: 900 + i * 850,
  composition: i % 3 === 0
    ? [{ enemy: 'thug', count: 2 }]
    : i % 3 === 1
      ? [{ enemy: 'thug', count: 1 }, { enemy: 'ripper', count: 1 }]
      : [{ enemy: 'ripper', count: 2 }, { enemy: 'heavy', count: 1 }],
  reinforcementWaves: i >= 3 ? 1 : 0,
  storyBeat,
}));

export const STAGES: readonly StageDefinition[] = [
  { id: 1, slug: 'neon-corner', title: 'NEON CORNER', subtitle: 'IL QUARTIERE', boss: 'Bruno', worldWidth: 6800, music: 'stage1', bossMusic: 'boss1', narrativeLandmarks: ['Sala giochi Neon Corner saccheggiata', 'Manifesti del torneo strappati', 'Furgone Black Circuit in fuga'], encounters: encounters(1, ['Vetrine infrante', 'Tracce del cabinato', 'Vicolo del furgone', 'Sala giochi secondaria', 'Blocco stradale', 'Uscita dal quartiere']) },
  { id: 2, slug: 'night-market', title: 'NIGHT MARKET', subtitle: 'IL MERCATO', boss: 'Roxy', worldWidth: 7200, music: 'stage2', bossMusic: 'boss1', narrativeLandmarks: ['Bancarelle urtate dal furgone', 'Casse Black Circuit', 'Distinta di carico'], encounters: encounters(2, ['Ingresso mercato', 'Bancarelle', 'Furgoni', 'Cortile carico', 'Casse marcate', 'Distinta di carico']) },
  { id: 3, slug: 'last-train', title: 'LAST TRAIN', subtitle: 'LA METROPOLITANA', boss: 'Switch', worldWidth: 7400, music: 'stage2', bossMusic: 'boss1', narrativeLandmarks: ['Mappa della rotta merci', 'Carrelli con marchio Black Circuit', 'Convoglio clandestino'], encounters: encounters(3, ['Scale stazione', 'Banchina', 'Tunnel servizio', 'Deposito bagagli', 'Convoglio merci', 'Scambio ferroviario']) },
  { id: 4, slug: 'black-circuit-depot', title: 'BLACK CIRCUIT DEPOT', subtitle: 'IL DEPOSITO INDUSTRIALE', boss: 'Rivet', worldWidth: 7600, music: 'stage1', bossMusic: 'boss2', narrativeLandmarks: ['Materiale Neon Corner impilato', 'Piano spedizione Molo 7', 'Container 08 indicato sui registri'], encounters: encounters(4, ['Magazzino', 'Officina', 'Nastri', 'Casse rubate', 'Registro spedizioni', 'Uscita camion']) },
  { id: 5, slug: 'harbor-run', title: 'HARBOR RUN', subtitle: 'IL PORTO', boss: 'Crane', worldWidth: 7800, music: 'stage2', bossMusic: 'boss2', narrativeLandmarks: ['Segnaletica Molo 7', 'Container Black Circuit', 'Container 08 in movimento'], encounters: encounters(5, ['Cancello porto', 'Corsie container', 'Gru', 'Piazzale carico', 'Molo 7', 'Rampa nave']) },
  { id: 6, slug: 'last-shipment', title: 'LAST SHIPMENT', subtitle: 'LA NAVE CARGO', boss: 'Dock Master', worldWidth: 7000, music: 'stage2', bossMusic: 'boss2', narrativeLandmarks: ['Cabinati rubati nella stiva', 'Container 08 aperto', 'Cabinato storico Neon Corner'], encounters: encounters(6, ['Rampa', 'Ponte inferiore', 'Corridoio cargo', 'Stiva', 'Container 08', 'Ponte comando']) },
] as const;

export const DEFAULT_CONTINUES_PER_PLAYER = 3;
export const MIN_CONTINUES_PER_PLAYER = 0;
export const MAX_CONTINUES_PER_PLAYER = 9;
