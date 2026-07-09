import {
  medalGlyph,
  medalName,
  objectiveText,
  recommendedStageId,
  stageIsUnlocked,
  stageRulesText,
} from '../stages';
import type { StageConfig, StageRecord, WorldConfig } from '../types';

export interface CampaignMapOptions {
  stages: readonly StageConfig[];
  worlds: readonly WorldConfig[];
  records: Record<string, StageRecord>;
  focusStageId?: string | null;
  onStage: (stageId: string) => void;
  onBack: () => void;
}

type Direction = 'left' | 'right' | 'up' | 'down';

const SVG_NS = 'http://www.w3.org/2000/svg';
let mapInstance = 0;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  className: string,
  parent: SVGElement,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  node.setAttribute('class', className);
  parent.appendChild(node);
  return node;
}

function setSvgAttributes(node: SVGElement, attributes: Record<string, string>): void {
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
}

function stageRecord(records: Record<string, StageRecord>, stageId: string): StageRecord {
  return records[stageId] ?? { bestScore: 0, medal: 0 };
}

function isCleared(records: Record<string, StageRecord>, stageId: string): boolean {
  return stageRecord(records, stageId).medal > 0;
}

function worldStagesFor(
  world: WorldConfig,
  stages: readonly StageConfig[],
): StageConfig[] {
  return stages.filter((stage) => stage.worldId === world.id).sort((a, b) => a.index - b.index);
}

function isWorldUnlocked(
  world: WorldConfig,
  stages: readonly StageConfig[],
  records: Record<string, StageRecord>,
): boolean {
  const firstStage = worldStagesFor(world, stages)[0];
  return firstStage !== undefined && stageIsUnlocked(firstStage, records);
}

function recommendedForWorld(
  world: WorldConfig,
  stages: readonly StageConfig[],
  records: Record<string, StageRecord>,
): StageConfig | undefined {
  const inWorld = worldStagesFor(world, stages);
  const globalRecommendation = recommendedStageId(records);
  const recommended = inWorld.find(
    (stage) => stage.id === globalRecommendation && stageIsUnlocked(stage, records),
  );
  if (recommended) return recommended;

  const next = inWorld.find(
    (stage) => stageIsUnlocked(stage, records) && !isCleared(records, stage.id),
  );
  if (next) return next;

  const lastClear = [...inWorld].reverse().find((stage) => isCleared(records, stage.id));
  return lastClear ?? inWorld.find((stage) => stageIsUnlocked(stage, records));
}

function routePath(fromX: number, fromY: number, toX: number, toY: number): string {
  const midX = fromX + (toX - fromX) / 2;
  return `M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`;
}

function appendTerrain(svg: SVGSVGElement, world: WorldConfig): void {
  const terrain = svgEl('g', `world-terrain world-terrain-${world.id}`, svg);
  terrain.dataset.worldId = world.id;
  setSvgAttributes(terrain, {
    'aria-hidden': 'true',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '0.7',
    opacity: '0.22',
    'vector-effect': 'non-scaling-stroke',
  });

  const horizon = svgEl('path', 'map-terrain-horizon', terrain);
  setSvgAttributes(horizon, {
    d: 'M 0 90 L 8 84 L 17 88 L 29 80 L 42 87 L 55 78 L 69 86 L 82 79 L 100 88',
  });

  if (world.id === 'boot-sector') {
    for (const [x, y, size] of [
      [5, 16, 5],
      [14, 11, 3],
      [78, 13, 4],
      [91, 17, 6],
    ] as const) {
      const block = svgEl('rect', 'map-terrain-block', terrain);
      setSvgAttributes(block, {
        x: String(x),
        y: String(y),
        width: String(size),
        height: String(size),
      });
    }
  } else if (world.id === 'relay-fields') {
    for (const x of [12, 76]) {
      const tower = svgEl('path', 'map-terrain-relay', terrain);
      setSvgAttributes(tower, {
        d: `M ${x} 18 V 42 M ${x - 4} 42 H ${x + 4} M ${x - 3} 25 L ${x} 18 L ${x + 3} 25`,
      });
    }
  } else if (world.id === 'moonfall') {
    const moon = svgEl('circle', 'map-terrain-moon', terrain);
    setSvgAttributes(moon, { cx: '82', cy: '18', r: '10' });
    for (const [cx, cy, r] of [
      [78, 16, 2],
      [85, 20, 1.4],
      [83, 12, 1],
    ] as const) {
      const crater = svgEl('circle', 'map-terrain-crater', terrain);
      setSvgAttributes(crater, { cx: String(cx), cy: String(cy), r: String(r) });
    }
  } else if (world.id === 'overclock') {
    const pulse = svgEl('path', 'map-terrain-pulse', terrain);
    setSvgAttributes(pulse, {
      d: 'M 3 19 H 20 L 24 12 L 29 27 L 35 6 L 42 19 H 61 L 65 11 L 70 24 L 76 19 H 97',
    });
  } else {
    const crown = svgEl('path', 'map-terrain-crown', terrain);
    setSvgAttributes(crown, {
      d: 'M 74 28 L 77 10 L 84 20 L 90 8 L 96 20 L 99 10 L 100 28 Z',
    });
  }
}

function nearestStage(
  origin: StageConfig,
  candidates: readonly StageConfig[],
  direction: Direction,
): StageConfig | undefined {
  const directional = candidates.filter((stage) => {
    if (stage.id === origin.id) return false;
    if (direction === 'left') return stage.mapX < origin.mapX;
    if (direction === 'right') return stage.mapX > origin.mapX;
    if (direction === 'up') return stage.mapY < origin.mapY;
    return stage.mapY > origin.mapY;
  });

  return directional.sort((a, b) => {
    const aDistance = Math.hypot(a.mapX - origin.mapX, a.mapY - origin.mapY);
    const bDistance = Math.hypot(b.mapX - origin.mapX, b.mapY - origin.mapY);
    return aDistance - bDistance || a.index - b.index;
  })[0];
}

function nodeStateLabel(
  stage: StageConfig,
  records: Record<string, StageRecord>,
): 'locked' | 'available' | 'cleared' {
  if (!stageIsUnlocked(stage, records)) return 'locked';
  return isCleared(records, stage.id) ? 'cleared' : 'available';
}

function nodeIcon(stage: StageConfig, state: 'locked' | 'available' | 'cleared'): string {
  if (state === 'locked') return '×';
  if (stage.tower) return '▣';
  if (stage.optional) return '◇';
  return state === 'cleared' ? '■' : '○';
}

/** Build the accessible, one-world-at-a-time campaign overworld. */
export function buildCampaignMap(
  parent: HTMLElement,
  {
    stages,
    worlds,
    records,
    focusStageId,
    onStage,
    onBack,
  }: CampaignMapOptions,
): HTMLElement {
  const instanceId = `boll-campaign-map-${++mapInstance}`;
  const root = el('section', 'world-map', parent);
  root.setAttribute('aria-label', 'Campaign world map');

  if (worlds.length === 0 || stages.length === 0) {
    el('h2', 'world-title', root, 'CAMPAIGN MAP');
    el('p', 'map-empty', root, 'NO CAMPAIGN SIGNAL FOUND');
    const back = el('button', 'map-back', root, 'BACK');
    back.type = 'button';
    back.addEventListener('click', onBack);
    return root;
  }

  const helperRecommendation = stages.find((stage) => stage.id === recommendedStageId(records));
  const requestedStage = focusStageId
    ? stages.find((stage) => stage.id === focusStageId)
    : undefined;
  const firstUnlockedWorld = worlds.find((world) => isWorldUnlocked(world, stages, records));
  const initialWorld =
    worlds.find(
      (world) =>
        world.id === requestedStage?.worldId && isWorldUnlocked(world, stages, records),
    ) ??
    worlds.find(
      (world) =>
        world.id === helperRecommendation?.worldId && isWorldUnlocked(world, stages, records),
    ) ??
    firstUnlockedWorld ??
    worlds[0]!;

  let selectedWorld = initialWorld;
  let selectedStageId = requestedStage?.worldId === selectedWorld.id ? requestedStage.id : null;

  const tabs = el('div', 'world-tabs', root);
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Campaign worlds');

  const panel = el('section', 'world-panel', root);
  panel.id = `${instanceId}-panel`;
  panel.setAttribute('role', 'tabpanel');

  const header = el('header', 'world-header', panel);
  const heading = el('h2', 'world-title', header);
  heading.id = `${instanceId}-heading`;
  const subtitle = el('div', 'world-subtitle', header);
  const summary = el('div', 'world-summary', header);
  const description = el('p', 'world-description', header);

  const viewport = el('div', 'map-viewport', panel);
  viewport.style.position = 'relative';
  const detail = el('section', 'map-detail', panel);
  detail.setAttribute('aria-live', 'polite');
  detail.setAttribute('aria-atomic', 'true');

  const tabButtons = new Map<WorldConfig['id'], HTMLButtonElement>();

  const renderDetail = (stage: StageConfig): void => {
    detail.textContent = '';
    const record = stageRecord(records, stage.id);
    const unlocked = stageIsUnlocked(stage, records);

    const copy = el('div', 'map-detail-copy', detail);
    el(
      'div',
      'map-detail-kicker',
      copy,
      `${stage.tower ? 'TOWER' : stage.optional ? 'SIDE SIGNAL' : 'STAGE'} ${String(stage.index).padStart(2, '0')}`,
    );
    el('h3', 'map-detail-title', copy, stage.title.toUpperCase());
    el('p', 'map-detail-subtitle', copy, stage.subtitle);

    const facts = el('dl', 'map-detail-facts', copy);
    const addFact = (label: string, value: string): void => {
      el('dt', 'map-detail-label', facts, label);
      el('dd', 'map-detail-value', facts, value);
    };
    addFact('OBJECTIVE', objectiveText(stage.objective).toUpperCase());
    addFact('RULES', stageRulesText(stage.rules));
    addFact('BEST', String(record.bestScore));
    addFact('MEDAL', `${medalGlyph(record.medal)} ${medalName(record.medal)}`);
    addFact(
      'THRESHOLDS',
      `BRONZE ${stage.medalScores.bronze}  /  SILVER ${stage.medalScores.silver}  /  GOLD ${stage.medalScores.gold}`,
    );

    if (!unlocked) {
      const requirements = (stage.requires ?? [])
        .map((requiredId) => stages.find((candidate) => candidate.id === requiredId)?.title ?? requiredId)
        .join(' + ');
      el('p', 'map-detail-locked', copy, `LOCKED // CLEAR ${requirements.toUpperCase()}`);
    }

    const actions = el('div', 'map-detail-actions', detail);
    const start = el('button', 'map-start', actions, 'START');
    start.type = 'button';
    start.disabled = !unlocked;
    start.setAttribute('aria-disabled', String(!unlocked));
    start.setAttribute('aria-label', `Start ${stage.title}`);
    start.addEventListener('click', () => onStage(stage.id));

    const back = el('button', 'map-back', actions, 'BACK');
    back.type = 'button';
    back.addEventListener('click', onBack);
  };

  const renderWorld = (focusNode = false): void => {
    const worldStages = worldStagesFor(selectedWorld, stages);
    const unlockedStages = worldStages.filter((stage) => stageIsUnlocked(stage, records));
    let selectedStage = worldStages.find(
      (stage) => stage.id === selectedStageId && stageIsUnlocked(stage, records),
    );
    selectedStage ??= recommendedForWorld(selectedWorld, stages, records) ?? unlockedStages[0];
    selectedStageId = selectedStage?.id ?? null;

    for (const world of worlds) {
      const tab = tabButtons.get(world.id);
      if (!tab) continue;
      const active = world.id === selectedWorld.id;
      const unlocked = isWorldUnlocked(world, stages, records);
      tab.className = `world-tab${active ? ' world-tab-active' : ''}${unlocked ? '' : ' world-tab-locked'}`;
      tab.disabled = !unlocked;
      tab.tabIndex = active ? 0 : -1;
      tab.setAttribute('aria-selected', String(active));
      tab.setAttribute('aria-disabled', String(!unlocked));
      if (active) panel.setAttribute('aria-labelledby', tab.id);
    }

    heading.textContent = `WORLD ${String(selectedWorld.index).padStart(2, '0')} // ${selectedWorld.title.toUpperCase()}`;
    subtitle.textContent = selectedWorld.subtitle.toUpperCase();
    description.textContent = selectedWorld.description;
    const clearCount = worldStages.filter((stage) => isCleared(records, stage.id)).length;
    const medalCount = worldStages.reduce(
      (total, stage) => total + stageRecord(records, stage.id).medal,
      0,
    );
    summary.textContent = `${clearCount}/${worldStages.length} CLEAR  //  MEDALS ${medalCount}/${worldStages.length * 3}`;

    viewport.textContent = '';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'map-routes');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    viewport.appendChild(svg);
    appendTerrain(svg, selectedWorld);

    for (const stage of worldStages) {
      for (const requiredId of stage.requires ?? []) {
        const requirement = stages.find((candidate) => candidate.id === requiredId);
        const isEntry = requirement?.worldId !== selectedWorld.id;
        const fromX = isEntry ? 0 : (requirement?.mapX ?? 0);
        const fromY = isEntry ? stage.mapY : (requirement?.mapY ?? stage.mapY);
        const route = svgEl('path', 'map-route', svg);
        const requirementClear = isCleared(records, requiredId);
        route.classList.add(requirementClear ? 'map-route-open' : 'map-route-locked');
        if (isCleared(records, stage.id)) route.classList.add('map-route-cleared');
        if (isEntry) route.classList.add('map-route-entry');
        route.dataset.from = requiredId;
        route.dataset.to = stage.id;
        setSvgAttributes(route, {
          d: routePath(fromX, fromY, stage.mapX, stage.mapY),
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '1.35',
          'vector-effect': 'non-scaling-stroke',
        });
      }
    }

    const nodeLayer = el('div', 'map-node-layer', viewport);
    nodeLayer.style.position = 'absolute';
    nodeLayer.style.inset = '0';

    const markerStage = recommendedForWorld(selectedWorld, stages, records);
    if (markerStage) {
      const marker = el('div', 'map-player-marker', nodeLayer);
      marker.dataset.stageId = markerStage.id;
      marker.setAttribute('aria-hidden', 'true');
      marker.style.position = 'absolute';
      marker.style.left = `${markerStage.mapX}%`;
      marker.style.top = `${markerStage.mapY}%`;
      marker.style.transform = 'translate(-50%, calc(-50% - 31px))';
      el('span', 'map-player-ball', marker, '●');
      el('span', 'map-player-paddle', marker, '━');
    }

    const nodeButtons = new Map<string, HTMLButtonElement>();
    for (const stage of worldStages) {
      const record = stageRecord(records, stage.id);
      const state = nodeStateLabel(stage, records);
      const classes = ['map-node', `map-node-${state}`];
      if (stage.tower) classes.push('map-node-tower');
      if (stage.optional) classes.push('map-node-optional');
      if (stage.id === selectedStageId) classes.push('map-node-selected');

      const node = el('button', classes.join(' '), nodeLayer);
      node.type = 'button';
      node.disabled = state === 'locked';
      node.tabIndex = stage.id === selectedStageId && state !== 'locked' ? 0 : -1;
      node.dataset.stageId = stage.id;
      node.dataset.mapX = String(stage.mapX);
      node.dataset.mapY = String(stage.mapY);
      node.style.position = 'absolute';
      node.style.left = `${stage.mapX}%`;
      node.style.top = `${stage.mapY}%`;
      node.style.width = '44px';
      node.style.height = '44px';
      node.style.minWidth = '44px';
      node.style.minHeight = '44px';
      node.style.transform = 'translate(-50%, -50%)';
      node.setAttribute('aria-disabled', String(state === 'locked'));
      node.setAttribute(
        'aria-label',
        `Stage ${stage.index}, ${stage.title}, ${state}, ${objectiveText(stage.objective)}, medal ${medalName(record.medal)}, best ${record.bestScore}`,
      );
      if (stage.id === selectedStageId) node.setAttribute('aria-current', 'step');

      const icon = el('span', 'map-node-icon', node, nodeIcon(stage, state));
      icon.setAttribute('aria-hidden', 'true');
      const index = el('span', 'map-node-index', node, String(stage.index).padStart(2, '0'));
      index.setAttribute('aria-hidden', 'true');
      const medal = el('span', 'map-node-medal', node, medalGlyph(record.medal));
      medal.setAttribute('aria-hidden', 'true');

      node.addEventListener('click', () => {
        selectedStageId = stage.id;
        renderWorld(true);
      });
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          onStage(stage.id);
          return;
        }

        const keyDirections: Partial<Record<string, Direction>> = {
          ArrowLeft: 'left',
          ArrowRight: 'right',
          ArrowUp: 'up',
          ArrowDown: 'down',
        };
        const direction = keyDirections[event.key];
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        const next = nearestStage(stage, unlockedStages, direction);
        if (!next) return;
        selectedStageId = next.id;
        renderWorld(true);
      });
      nodeButtons.set(stage.id, node);
    }

    if (selectedStage) renderDetail(selectedStage);
    else {
      detail.textContent = '';
      el('p', 'map-empty', detail, 'NO AVAILABLE STAGES IN THIS WORLD');
      const back = el('button', 'map-back', detail, 'BACK');
      back.type = 'button';
      back.addEventListener('click', onBack);
    }

    if (focusNode && selectedStageId) nodeButtons.get(selectedStageId)?.focus();
  };

  const activateWorld = (world: WorldConfig): void => {
    if (!isWorldUnlocked(world, stages, records)) return;
    selectedWorld = world;
    selectedStageId = recommendedForWorld(world, stages, records)?.id ?? null;
    renderWorld(false);
  };

  for (const world of worlds) {
    const unlocked = isWorldUnlocked(world, stages, records);
    const tab = el(
      'button',
      `world-tab${world.id === selectedWorld.id ? ' world-tab-active' : ''}${unlocked ? '' : ' world-tab-locked'}`,
      tabs,
      `${String(world.index).padStart(2, '0')} ${world.title.toUpperCase()}`,
    );
    tab.id = `${instanceId}-tab-${world.id}`;
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    tab.setAttribute('aria-selected', String(world.id === selectedWorld.id));
    tab.setAttribute('aria-disabled', String(!unlocked));
    tab.setAttribute('aria-label', `${world.title}${unlocked ? '' : ', locked'}`);
    tab.disabled = !unlocked;
    tab.tabIndex = world.id === selectedWorld.id ? 0 : -1;
    tab.dataset.worldId = world.id;
    tab.addEventListener('click', () => activateWorld(world));
    tabButtons.set(world.id, tab);
  }

  tabs.addEventListener('keydown', (event) => {
    const direction =
      event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (direction === 0 && event.key !== 'Home' && event.key !== 'End') return;

    const availableWorlds = worlds.filter((world) => isWorldUnlocked(world, stages, records));
    if (availableWorlds.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const currentIndex = Math.max(
      0,
      availableWorlds.findIndex((world) => world.id === selectedWorld.id),
    );
    let nextIndex: number;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = availableWorlds.length - 1;
    else nextIndex = (currentIndex + direction + availableWorlds.length) % availableWorlds.length;
    const nextWorld = availableWorlds[nextIndex];
    if (!nextWorld) return;
    activateWorld(nextWorld);
    tabButtons.get(nextWorld.id)?.focus();
  });

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onBack();
  });

  renderWorld(false);
  return root;
}
