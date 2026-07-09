import type {
  Medal,
  MedalScores,
  StageConfig,
  StageObjective,
  StageRecord,
  StageRules,
  WorldConfig,
  WorldId,
} from './types';

export const WORLDS: WorldConfig[] = [
  {
    id: 'boot-sector',
    index: 1,
    title: 'Boot Sector',
    subtitle: 'Wake the signal',
    description: 'Learn the language of contact, control, and clean returns.',
  },
  {
    id: 'relay-fields',
    index: 2,
    title: 'Relay Fields',
    subtitle: 'Route the carrier',
    description: 'Thread open channels, bend shots, and build longer chains.',
  },
  {
    id: 'moonfall',
    index: 3,
    title: 'Moonfall',
    subtitle: 'Master low gravity',
    description: 'Slow the rhythm down, then learn to place every floating return.',
  },
  {
    id: 'overclock',
    index: 4,
    title: 'Overclock',
    subtitle: 'Hold the hot line',
    description: 'The pace spikes, the paddle narrows, and hesitation becomes noise.',
  },
  {
    id: 'null-crown',
    index: 5,
    title: 'Null Crown',
    subtitle: 'Cross the dead channel',
    description: 'Every discipline returns at full pressure in the final transmission.',
  },
];

export const STAGES: StageConfig[] = [
  // WORLD 1: BOOT SECTOR
  {
    id: 'first-contact',
    index: 1,
    worldId: 'boot-sector',
    title: 'First Contact',
    subtitle: 'Keep the first signal alive.',
    mode: 'waves',
    objective: { kind: 'hits', target: 8 },
    medalScores: { bronze: 100, silver: 220, gold: 400 },
    rules: { pace: 0.82, paddleScale: 1.15 },
    mapX: 9,
    mapY: 74,
  },
  {
    id: 'center-work',
    index: 2,
    worldId: 'boot-sector',
    title: 'Center Work',
    subtitle: 'Meet the ball on the bright line.',
    mode: 'waves',
    objective: { kind: 'sweetHits', target: 5 },
    medalScores: { bronze: 180, silver: 360, gold: 620 },
    rules: { pace: 0.86, paddleScale: 1.1 },
    mapX: 27,
    mapY: 58,
    requires: ['first-contact'],
  },
  {
    id: 'edge-control',
    index: 3,
    worldId: 'boot-sector',
    title: 'Edge Control',
    subtitle: 'Steer with the dangerous half.',
    mode: 'waves',
    objective: { kind: 'edgeHits', target: 6 },
    medalScores: { bronze: 180, silver: 380, gold: 680 },
    rules: { pace: 0.9, paddleScale: 1.08 },
    mapX: 46,
    mapY: 70,
    requires: ['center-work'],
  },
  {
    id: 'roof-check',
    index: 4,
    worldId: 'boot-sector',
    title: 'Roof Check',
    subtitle: 'Send the carrier into the frame.',
    mode: 'waves',
    objective: { kind: 'wallHits', target: 10 },
    medalScores: { bronze: 220, silver: 420, gold: 720 },
    rules: { pace: 0.9 },
    mapX: 34,
    mapY: 24,
    requires: ['center-work'],
    optional: true,
  },
  {
    id: 'soft-hands',
    index: 5,
    worldId: 'boot-sector',
    title: 'Soft Hands',
    subtitle: 'Catch, cushion, then release.',
    mode: 'waves',
    objective: { kind: 'carrySeconds', target: 0.8 },
    medalScores: { bronze: 220, silver: 440, gold: 760 },
    rules: { pace: 0.84, paddleScale: 1.12 },
    mapX: 67,
    mapY: 49,
    requires: ['edge-control'],
  },
  {
    id: 'boot-tower',
    index: 6,
    worldId: 'boot-sector',
    title: 'Boot Tower',
    subtitle: 'Raise enough charge before shutdown.',
    mode: 'rush',
    objective: { kind: 'score', target: 650 },
    medalScores: { bronze: 650, silver: 1000, gold: 1450 },
    timeLimit: 35,
    rules: { pace: 0.92, gateDifficulty: 0.12 },
    mapX: 89,
    mapY: 27,
    requires: ['soft-hands'],
    tower: true,
  },

  // WORLD 2: RELAY FIELDS
  {
    id: 'open-channel',
    index: 7,
    worldId: 'relay-fields',
    title: 'Open Channel',
    subtitle: 'Put the signal through the frame.',
    mode: 'waves',
    objective: { kind: 'gates', target: 3 },
    medalScores: { bronze: 320, silver: 620, gold: 980 },
    rules: { pace: 0.95, gateDifficulty: 0.1 },
    mapX: 8,
    mapY: 66,
    requires: ['boot-tower'],
  },
  {
    id: 'wall-relay',
    index: 8,
    worldId: 'relay-fields',
    title: 'Wall Relay',
    subtitle: 'Bank the ball before the gate.',
    mode: 'waves',
    objective: { kind: 'bankGates', target: 2 },
    medalScores: { bronze: 420, silver: 760, gold: 1180 },
    rules: { pace: 0.98, gateDifficulty: 0.18 },
    mapX: 26,
    mapY: 78,
    requires: ['open-channel'],
  },
  {
    id: 'clean-line',
    index: 9,
    worldId: 'relay-fields',
    title: 'Clean Line',
    subtitle: 'Build precision without dropping pace.',
    mode: 'waves',
    objective: { kind: 'combo', target: 12 },
    medalScores: { bronze: 380, silver: 720, gold: 1120 },
    rules: { pace: 1.0, paddleScale: 0.98 },
    mapX: 45,
    mapY: 55,
    requires: ['wall-relay'],
  },
  {
    id: 'power-grid',
    index: 10,
    worldId: 'relay-fields',
    title: 'Power Grid',
    subtitle: 'Flick hard enough to light the line.',
    mode: 'waves',
    objective: { kind: 'powerHits', target: 5 },
    medalScores: { bronze: 300, silver: 600, gold: 980 },
    rules: { pace: 0.94, paddleScale: 1.04 },
    mapX: 29,
    mapY: 29,
    requires: ['wall-relay'],
    optional: true,
  },
  {
    id: 'long-carrier',
    index: 11,
    worldId: 'relay-fields',
    title: 'Long Carrier',
    subtitle: 'Stay connected through the interference.',
    mode: 'waves',
    objective: { kind: 'surviveSeconds', target: 24 },
    medalScores: { bronze: 450, silver: 850, gold: 1320 },
    rules: { pace: 1.03, gateDifficulty: 0.25, paddleScale: 0.96 },
    mapX: 66,
    mapY: 69,
    requires: ['clean-line'],
  },
  {
    id: 'relay-tower',
    index: 12,
    worldId: 'relay-fields',
    title: 'Relay Tower',
    subtitle: 'Flood the tower before the clock cuts out.',
    mode: 'rush',
    objective: { kind: 'score', target: 1100 },
    medalScores: { bronze: 1100, silver: 1650, gold: 2350 },
    timeLimit: 42,
    rules: { pace: 1.04, paddleScale: 0.96, gateDifficulty: 0.32 },
    mapX: 89,
    mapY: 42,
    requires: ['long-carrier'],
    tower: true,
  },

  // WORLD 3: MOONFALL
  {
    id: 'moon-hop',
    index: 13,
    worldId: 'moonfall',
    title: 'Moon Hop',
    subtitle: 'Read the long arc in weak gravity.',
    mode: 'waves',
    objective: { kind: 'wallHits', target: 14 },
    medalScores: { bronze: 360, silver: 680, gold: 1080 },
    rules: { pace: 0.88, gravityScale: 0.5, paddleScale: 1.05 },
    mapX: 10,
    mapY: 30,
    requires: ['relay-tower'],
  },
  {
    id: 'float-line',
    index: 14,
    worldId: 'moonfall',
    title: 'Float Line',
    subtitle: 'Guide a slow carrier through open space.',
    mode: 'waves',
    objective: { kind: 'gates', target: 4 },
    medalScores: { bronze: 480, silver: 860, gold: 1320 },
    rules: { pace: 0.9, gravityScale: 0.55, gateDifficulty: 0.28 },
    mapX: 28,
    mapY: 54,
    requires: ['moon-hop'],
  },
  {
    id: 'dead-center',
    index: 15,
    worldId: 'moonfall',
    title: 'Dead Center',
    subtitle: 'Hold a clean center line in slow orbit.',
    mode: 'waves',
    objective: { kind: 'sweetHits', target: 12 },
    medalScores: { bronze: 520, silver: 940, gold: 1460 },
    rules: { pace: 0.94, gravityScale: 0.62, paddleScale: 0.94 },
    mapX: 48,
    mapY: 39,
    requires: ['float-line'],
  },
  {
    id: 'satellite-bank',
    index: 16,
    worldId: 'moonfall',
    title: 'Satellite Bank',
    subtitle: 'Bend moon arcs into remote relays.',
    mode: 'waves',
    objective: { kind: 'bankGates', target: 3 },
    medalScores: { bronze: 560, silver: 980, gold: 1520 },
    rules: { pace: 0.94, gravityScale: 0.58, gateDifficulty: 0.42 },
    mapX: 42,
    mapY: 78,
    requires: ['float-line'],
    optional: true,
  },
  {
    id: 'drift-catch',
    index: 17,
    worldId: 'moonfall',
    title: 'Drift Catch',
    subtitle: 'Take the energy out of a falling signal.',
    mode: 'waves',
    objective: { kind: 'carrySeconds', target: 1.6 },
    medalScores: { bronze: 420, silver: 800, gold: 1260 },
    rules: { pace: 0.82, gravityScale: 0.48, paddleScale: 1.08 },
    mapX: 69,
    mapY: 58,
    requires: ['dead-center'],
  },
  {
    id: 'lunar-core',
    index: 18,
    worldId: 'moonfall',
    title: 'Lunar Core',
    subtitle: 'Keep the core awake through one long orbit.',
    mode: 'waves',
    objective: { kind: 'surviveSeconds', target: 36 },
    medalScores: { bronze: 700, silver: 1250, gold: 1900 },
    rules: { pace: 1.04, gravityScale: 0.68, paddleScale: 0.88, gateDifficulty: 0.48 },
    mapX: 89,
    mapY: 25,
    requires: ['drift-catch'],
    tower: true,
  },

  // WORLD 4: OVERCLOCK
  {
    id: 'hot-start',
    index: 19,
    worldId: 'overclock',
    title: 'Hot Start',
    subtitle: 'Strike fast and keep the line bright.',
    mode: 'waves',
    objective: { kind: 'powerHits', target: 8 },
    medalScores: { bronze: 520, silver: 920, gold: 1420 },
    rules: { pace: 1.1, gravityScale: 1.12, paddleScale: 0.94 },
    mapX: 9,
    mapY: 76,
    requires: ['lunar-core'],
  },
  {
    id: 'narrow-band',
    index: 20,
    worldId: 'overclock',
    title: 'Narrow Band',
    subtitle: 'Work a smaller paddle at full speed.',
    mode: 'waves',
    objective: { kind: 'hits', target: 20 },
    medalScores: { bronze: 620, silver: 1080, gold: 1660 },
    rules: { pace: 1.12, paddleScale: 0.78 },
    mapX: 26,
    mapY: 52,
    requires: ['hot-start'],
  },
  {
    id: 'gate-storm',
    index: 21,
    worldId: 'overclock',
    title: 'Gate Storm',
    subtitle: 'Find six openings in the static.',
    mode: 'waves',
    objective: { kind: 'gates', target: 6 },
    medalScores: { bronze: 720, silver: 1240, gold: 1880 },
    rules: { pace: 1.16, paddleScale: 0.84, gateDifficulty: 0.62 },
    mapX: 47,
    mapY: 65,
    requires: ['narrow-band'],
  },
  {
    id: 'chain-reaction',
    index: 22,
    worldId: 'overclock',
    title: 'Chain Reaction',
    subtitle: 'Build one uninterrupted multiplier chain.',
    mode: 'waves',
    objective: { kind: 'combo', target: 20 },
    medalScores: { bronze: 650, silver: 1120, gold: 1740 },
    rules: { pace: 1.14, paddleScale: 0.82 },
    mapX: 45,
    mapY: 22,
    requires: ['narrow-band'],
    optional: true,
  },
  {
    id: 'split-signal',
    index: 23,
    worldId: 'overclock',
    title: 'Split Signal',
    subtitle: 'Hold the line as one carrier becomes three.',
    mode: 'chaos',
    objective: { kind: 'hits', target: 30 },
    medalScores: { bronze: 900, silver: 1550, gold: 2350 },
    rules: { pace: 1.08, paddleScale: 0.9, ballCap: 3 },
    mapX: 68,
    mapY: 42,
    requires: ['gate-storm'],
  },
  {
    id: 'overclock-core',
    index: 24,
    worldId: 'overclock',
    title: 'Overclock Core',
    subtitle: 'Outscore the core before it burns out.',
    mode: 'rush',
    objective: { kind: 'score', target: 2100 },
    medalScores: { bronze: 2100, silver: 2900, gold: 3900 },
    timeLimit: 48,
    rules: { pace: 1.2, paddleScale: 0.84, gravityScale: 1.08, gateDifficulty: 0.7 },
    mapX: 89,
    mapY: 60,
    requires: ['split-signal'],
    tower: true,
  },

  // WORLD 5: NULL CROWN
  {
    id: 'triple-threat',
    index: 25,
    worldId: 'null-crown',
    title: 'Triple Threat',
    subtitle: 'Build and protect a three-carrier field.',
    mode: 'chaos',
    objective: { kind: 'hits', target: 34 },
    medalScores: { bronze: 1100, silver: 1850, gold: 2750 },
    rules: { pace: 1.13, paddleScale: 0.88, ballCap: 3 },
    mapX: 10,
    mapY: 62,
    requires: ['overclock-core'],
  },
  {
    id: 'swarm-score',
    index: 26,
    worldId: 'null-crown',
    title: 'Full Swarm',
    subtitle: 'Build four carriers, then hold the field.',
    mode: 'chaos',
    objective: { kind: 'hits', target: 42 },
    medalScores: { bronze: 3500, silver: 5000, gold: 6500 },
    rules: { pace: 1.16, paddleScale: 0.84, ballCap: 4 },
    mapX: 29,
    mapY: 76,
    requires: ['triple-threat'],
  },
  {
    id: 'razor-bank',
    index: 27,
    worldId: 'null-crown',
    title: 'Razor Bank',
    subtitle: 'Bank into the smallest open channels.',
    mode: 'waves',
    objective: { kind: 'bankGates', target: 5 },
    medalScores: { bronze: 900, silver: 1500, gold: 2250 },
    rules: { pace: 1.22, paddleScale: 0.78, gateDifficulty: 0.84 },
    mapX: 47,
    mapY: 50,
    requires: ['swarm-score'],
  },
  {
    id: 'dead-air',
    index: 28,
    worldId: 'null-crown',
    title: 'Dead Air',
    subtitle: 'Keep control through the longest silence.',
    mode: 'waves',
    objective: { kind: 'surviveSeconds', target: 48 },
    medalScores: { bronze: 1000, silver: 1700, gold: 2500 },
    rules: { pace: 1.24, gravityScale: 1.12, paddleScale: 0.76, gateDifficulty: 0.76 },
    mapX: 31,
    mapY: 27,
    requires: ['swarm-score'],
    optional: true,
  },
  {
    id: 'perfect-carrier',
    index: 29,
    worldId: 'null-crown',
    title: 'Perfect Carrier',
    subtitle: 'Build the final clean chain.',
    mode: 'waves',
    objective: { kind: 'combo', target: 28 },
    medalScores: { bronze: 980, silver: 1650, gold: 2480 },
    rules: { pace: 1.26, paddleScale: 0.74, gateDifficulty: 0.82 },
    mapX: 68,
    mapY: 66,
    requires: ['razor-bank'],
  },
  {
    id: 'crown-signal',
    index: 30,
    worldId: 'null-crown',
    title: 'Crown Signal',
    subtitle: 'Send one final transmission through the null.',
    mode: 'rush',
    objective: { kind: 'score', target: 3600 },
    medalScores: { bronze: 3600, silver: 4800, gold: 6200 },
    timeLimit: 60,
    rules: { pace: 1.3, paddleScale: 0.72, gravityScale: 1.14, gateDifficulty: 1 },
    mapX: 89,
    mapY: 34,
    requires: ['perfect-carrier'],
    tower: true,
  },
];

export const STAGE_IDS = STAGES.map((stage) => stage.id);

export function stageById(id: string): StageConfig | undefined {
  return STAGES.find((stage) => stage.id === id);
}

export function worldById(id: WorldId): WorldConfig {
  return WORLDS.find((world) => world.id === id) ?? WORLDS[0]!;
}

export function stagesForWorld(id: WorldId): StageConfig[] {
  return STAGES.filter((stage) => stage.worldId === id);
}

export function stageIsUnlocked(stage: StageConfig, records: Record<string, StageRecord>): boolean {
  return (stage.requires ?? []).every((id) => (records[id]?.medal ?? 0) > 0);
}

export function worldIsUnlocked(world: WorldConfig, records: Record<string, StageRecord>): boolean {
  const first = stagesForWorld(world.id)[0];
  return first !== undefined && stageIsUnlocked(first, records);
}

export function recommendedStageId(records: Record<string, StageRecord>): string | undefined {
  const available = STAGES.filter(
    (stage) => stageIsUnlocked(stage, records) && (records[stage.id]?.medal ?? 0) === 0,
  );
  return available.find((stage) => !stage.optional)?.id ?? available[0]?.id;
}

export function objectiveText(objective: StageObjective): string {
  switch (objective.kind) {
    case 'hits':
      return `${objective.target} paddle hits`;
    case 'sweetHits':
      return `${objective.target} sweet hits`;
    case 'edgeHits':
      return `${objective.target} edge hits`;
    case 'powerHits':
      return `${objective.target} power hits`;
    case 'wallHits':
      return `${objective.target} wall contacts`;
    case 'gates':
      return `${objective.target} gates`;
    case 'bankGates':
      return `${objective.target} bank gates`;
    case 'carrySeconds':
      return `${objective.target.toFixed(1)}s carry`;
    case 'combo':
      return `combo ${objective.target}`;
    case 'surviveSeconds':
      return `survive ${objective.target}s`;
    case 'score':
      return `${objective.target} points`;
  }
}

export function stageRulesText(rules?: StageRules): string {
  if (!rules) return 'STANDARD SIGNAL';
  const parts: string[] = [];
  if (rules.pace !== undefined) parts.push(`PACE ${Math.round(rules.pace * 100)}%`);
  if (rules.paddleScale !== undefined) parts.push(`PADDLE ${Math.round(rules.paddleScale * 100)}%`);
  if (rules.gravityScale !== undefined) parts.push(`GRAV ${Math.round(rules.gravityScale * 100)}%`);
  if (rules.gateDifficulty !== undefined) parts.push(`GATES ${Math.round(rules.gateDifficulty * 100)}%`);
  if (rules.ballCap !== undefined) parts.push(`${rules.ballCap} BALL CAP`);
  return parts.join('  /  ') || 'STANDARD SIGNAL';
}

export function medalForScore(score: number, scores: MedalScores, cleared: boolean): Medal {
  if (score >= scores.gold) return 3;
  if (score >= scores.silver) return 2;
  if (score >= scores.bronze || cleared) return 1;
  return 0;
}

export function medalName(medal: Medal): string {
  switch (medal) {
    case 3:
      return 'GOLD';
    case 2:
      return 'SILVER';
    case 1:
      return 'BRONZE';
    case 0:
      return 'NONE';
  }
}

export function medalGlyph(medal: Medal): string {
  return medal === 0 ? '○' : medal === 1 ? '◆' : medal === 2 ? '◆◆' : '◆◆◆';
}

export function emptyStageRecords(): Record<string, StageRecord> {
  return Object.fromEntries(
    STAGES.map((stage) => [stage.id, { bestScore: 0, medal: 0 as Medal }]),
  );
}
