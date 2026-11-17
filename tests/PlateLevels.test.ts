import { beforeAll, describe, expect, it } from 'vitest';
import { nodeIssues, runnableNodes } from '../src/features/plates/graph/graph';
import { BLOCKS } from '../src/features/plates/graph/nodes';
import type { Graph } from '../src/features/plates/graph/types';
import { LEVELS } from '../src/features/plates/levels';
import {
  renderPlateScene,
  type PlateSceneOptions,
} from '../src/features/plates/recognition/plateImage';
import { recognize } from '../src/features/plates/recognition/recognize';
import type { Template } from '../src/features/plates/recognition/templates';
import type { CV } from '../src/features/plates/worker/cv';
import { executeGraph } from '../src/features/plates/worker/engine';
import { MatScope, withScope } from '../src/features/plates/worker/scope';
import { loadTestOpenCv } from './helpers/opencv';
import { testFont, testTemplates } from './helpers/plates';

let cv: CV;
let templates: Template[];
const font = testFont();
beforeAll(async () => {
  cv = await loadTestOpenCv();
  templates = testTemplates();
}, 60000);

function read(textValue: string, scene: PlateSceneOptions, graph: Graph) {
  const image = renderPlateScene(font, textValue, scene);
  return withScope(cv, (scope) => {
    const input = scope.track(cv.matFromImageData(image as unknown as ImageData));
    const run = executeGraph(cv, scope, graph, input);
    const output = graph.nodes.find((node) => node.type === 'output')!;
    const edge = graph.edges.find((item) => item.target === output.id)!;
    const value = run.values.get(edge.source);
    if (!value || value.type === 'region') throw new Error('no output');
    return recognize(
      { width: value.mat.cols, height: value.mat.rows, data: value.mat.data },
      templates,
    ).text;
  });
}

describe('levels', () => {
  it('start with the camera wired to the output and offer only their blocks', () => {
    for (const level of LEVELS) {
      const start = level.start();
      expect(start.nodes.map((node) => node.type)).toEqual(['camera', 'output']);
      expect(nodeIssues(start).get(start.nodes[1].id)?.length).toBe(1);
      expect(level.blocks.every((type) => !BLOCKS[type].fixed)).toBe(true);
      expect(level.hints.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('reference solutions only use the blocks of their level and are complete', () => {
    for (const level of LEVELS) {
      const reference = level.reference();
      for (const node of reference.nodes)
        if (!BLOCKS[node.type].fixed) expect(level.blocks).toContain(node.type);
      const output = reference.nodes.find((node) => node.type === 'output')!;
      expect(runnableNodes(reference).has(output.id)).toBe(true);
    }
  });

  it('reference solutions read the built-in and practice images', () => {
    for (const level of LEVELS) {
      const image = level.sample ?? level.practice!;
      expect(read(image.text, image.scene, level.reference()), `level ${level.id}`).toBe(
        image.text,
      );
    }
    expect(MatScope.live).toBe(0);
  });
});
