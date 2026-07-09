import type { Medal, MedalScores, StageConfig, StageObjective, StageRecord } from './types';

export const STAGES: StageConfig[] = [
  {
    id: 'first-contact',
    index: 1,
    title: 'First Contact',
    subtitle: 'Keep the rally alive.',
    mode: 'waves',
    objective: { kind: 'hits', target: 10 },
    medalScores: { bronze: 150, silver: 300, gold: 500 },
  },
  {
    id: 'center-work',
    index: 2,
    title: 'Center Work',
    subtitle: 'Find the sweet spot.',
    mode: 'waves',
    objective: { kind: 'sweetHits', target: 6 },
    medalScores: { bronze: 220, silver: 420, gold: 700 },
  },
  {
    id: 'thread-needle',
    index: 3,
    title: 'Thread Needle',
    subtitle: 'Guide the ball through gates.',
    mode: 'waves',
    objective: { kind: 'gates', target: 3 },
    medalScores: { bronze: 350, silver: 650, gold: 1000 },
  },
  {
    id: 'bank-shot',
    index: 4,
    title: 'Bank Shot',
    subtitle: 'Use the wall before the gate.',
    mode: 'waves',
    objective: { kind: 'bankGates', target: 2 },
    medalScores: { bronze: 450, silver: 850, gold: 1300 },
  },
  {
    id: 'soft-hands',
    index: 5,
    title: 'Soft Hands',
    subtitle: 'Catch, cushion, then release.',
    mode: 'waves',
    objective: { kind: 'carrySeconds', target: 1.2 },
    medalScores: { bronze: 300, silver: 600, gold: 950 },
  },
  {
    id: 'pressure-minute',
    index: 6,
    title: 'Pressure Minute',
    subtitle: 'Score before time wins.',
    mode: 'rush',
    objective: { kind: 'score', target: 900 },
    medalScores: { bronze: 900, silver: 1400, gold: 2100 },
    timeLimit: 45,
  },
];

export const STAGE_IDS = STAGES.map((stage) => stage.id);

export function stageById(id: string): StageConfig | undefined {
  return STAGES.find((stage) => stage.id === id);
}

export function objectiveText(objective: StageObjective): string {
  switch (objective.kind) {
    case 'hits':
      return `${objective.target} paddle hits`;
    case 'sweetHits':
      return `${objective.target} sweet hits`;
    case 'gates':
      return `${objective.target} gates`;
    case 'bankGates':
      return `${objective.target} bank gates`;
    case 'carrySeconds':
      return `${objective.target.toFixed(1)}s carry`;
    case 'score':
      return `${objective.target} points`;
  }
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

export function emptyStageRecords(): Record<string, StageRecord> {
  return Object.fromEntries(
    STAGES.map((stage) => [stage.id, { bestScore: 0, medal: 0 as Medal }]),
  );
}
