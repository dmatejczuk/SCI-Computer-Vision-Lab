import { describe, expect, it } from 'vitest';
import { parsePlateFeed } from '../src/features/phone-camera/PeerConnectionController';
import { connect, createNode, cutEdge, unplugNode } from '../src/features/plates/graph/graph';
import type { Graph } from '../src/features/plates/graph/types';
import { formatPlate } from '../src/features/plates/recognition/compare';
import {
  collect,
  Confirmer,
  CONFIRM_CONFIDENCE,
  CONFIRM_PASSES,
  MAX_COLLECTED,
} from '../src/features/plates/recognition/confirm';
import type { VotedCharacter } from '../src/features/plates/recognition/recognize';

const reading = (text: string, confidence = 90): VotedCharacter[] =>
  [...text].map((char) => ({ char, confidence, alternatives: [], agreement: 7 }));
const plate = { min: 7, max: 8 };

describe('confirming a reading', () => {
  it('confirms a complete, clear reading only after it stays the same for a while', () => {
    const confirmer = new Confirmer();
    for (let i = 1; i < CONFIRM_PASSES; i++)
      expect(confirmer.push(reading('WE12345'), plate)).toBeNull();
    expect(confirmer.push(reading('WE12345'), plate)).toBe('WE12345');
    // Once per appearance: the same plate in view is not confirmed again.
    expect(confirmer.push(reading('WE12345'), plate)).toBeNull();
    expect(confirmer.current).toBe('WE12345');
  });

  it('does not confirm incomplete readings or unsure characters', () => {
    const confirmer = new Confirmer();
    for (let i = 0; i < CONFIRM_PASSES * 2; i++) {
      expect(confirmer.push(reading('WE1234'), plate)).toBeNull();
      expect(confirmer.push(reading('WE12345', CONFIRM_CONFIDENCE - 1), plate)).toBeNull();
    }
    // 8 characters are a complete plate too.
    let confirmed: string | null = null;
    for (let i = 0; i < CONFIRM_PASSES; i++) confirmed = confirmer.push(reading('PZD7520E'), plate);
    expect(confirmed).toBe('PZD7520E');
  });

  it('confirms the same plate again after it left the picture', () => {
    const confirmer = new Confirmer();
    const show = () => {
      let confirmed: string | null = null;
      for (let i = 0; i < CONFIRM_PASSES; i++)
        confirmed = confirmer.push(reading('KR1AC23'), plate);
      return confirmed;
    };
    expect(show()).toBe('KR1AC23');
    for (let i = 0; i < CONFIRM_PASSES; i++) confirmer.push([], plate);
    expect(confirmer.current).toBe('');
    expect(show()).toBe('KR1AC23');
  });

  it('collects plates newest first and counts repeats', () => {
    let list = collect([], 'WE12345', 1);
    list = collect(list, 'KR1AC23', 2);
    list = collect(list, 'WE12345', 3);
    expect(list).toEqual([
      { text: 'WE12345', count: 2, at: 3 },
      { text: 'KR1AC23', count: 1, at: 2 },
    ]);
  });

  it('keeps the collection short enough for the phone feed', () => {
    let list = collect([], 'AA00000', 0);
    for (let i = 1; i < 300; i++) list = collect(list, `AA${String(i).padStart(5, '0')}`, i);
    expect(list).toHaveLength(MAX_COLLECTED);
    expect(list[0].text).toBe('AA00299');
    const feed = JSON.stringify({ type: 'plates', plates: list });
    expect(parsePlateFeed(feed)?.plates).toHaveLength(MAX_COLLECTED);
  });

  it('formats a read plate with a space after the district letters', () => {
    expect(formatPlate('WE12345')).toBe('WE 12345');
    expect(formatPlate('KOT2026')).toBe('KOT 2026');
    expect(formatPlate('PZD7520E')).toBe('PZD 7520E');
    expect(formatPlate('12345')).toBe('12345');
    expect(formatPlate('ab 12')).toBe('AB 12');
  });
});

describe('unplugging blocks', () => {
  function chain(): { graph: Graph; ids: string[] } {
    const nodes = [createNode('camera'), createNode('grayscale'), createNode('threshold')];
    nodes.push(createNode('output'));
    let graph: Graph = { nodes, edges: [] };
    for (let i = 1; i < nodes.length; i++)
      graph = connect(graph, { source: nodes[i - 1].id, target: nodes[i].id, targetHandle: 'in' });
    return { graph, ids: nodes.map((node) => node.id) };
  }

  it('takes a block out of the chain, keeps it on the canvas and joins its neighbours', () => {
    const { graph, ids } = chain();
    const next = unplugNode(graph, ids[2], { x: 10, y: 400 });
    expect(next.nodes).toHaveLength(4);
    expect(next.nodes.find((node) => node.id === ids[2])?.position).toEqual({ x: 10, y: 400 });
    expect(next.edges.some((edge) => edge.source === ids[2] || edge.target === ids[2])).toBe(false);
    expect(next.edges.some((edge) => edge.source === ids[1] && edge.target === ids[3])).toBe(true);
  });

  it('never unplugs the camera or the output, and cuts single wires', () => {
    const { graph, ids } = chain();
    expect(unplugNode(graph, ids[0])).toBe(graph);
    expect(unplugNode(graph, ids[3])).toBe(graph);
    expect(cutEdge(graph, graph.edges[0].id).edges).toHaveLength(graph.edges.length - 1);
  });
});

describe('plates sent to the phone', () => {
  it('accepts the plate feed and rejects anything else', () => {
    const feed = {
      type: 'plates',
      latest: 'WE 12345',
      plates: [{ text: 'WE 12345', count: 1, at: 1 }],
    };
    expect(parsePlateFeed(JSON.stringify(feed))).toEqual(feed);
    expect(parsePlateFeed('not json')).toBeNull();
    expect(parsePlateFeed(JSON.stringify({ ...feed, latest: '<img src=x>' }))).toBeNull();
    expect(parsePlateFeed(JSON.stringify({ ...feed, type: 'other' }))).toBeNull();
    expect(
      parsePlateFeed(JSON.stringify({ ...feed, plates: [{ text: 'A', count: 'x' }] })),
    ).toBeNull();
    expect(parsePlateFeed(new ArrayBuffer(4))).toBeNull();
  });
});
