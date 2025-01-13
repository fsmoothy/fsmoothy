import { toDot, digraph, attribute as _ } from 'ts-graphviz';

import type { IStateMachineInspectRepresentation } from '@fsmoothy/core';
import type { RootGraphModel } from 'ts-graphviz';

const prettifyData = (data: unknown): string => {
  if (typeof data !== 'object') {
    return data?.toString() ?? '';
  }

  if (Array.isArray(data)) {
    return data.map((item) => prettifyData(item)).join(',\n');
  }

  if (data === null) {
    return 'null';
  }

  const keys = Object.keys(data);

  if (keys.length === 0) {
    return '';
  }

  return keys
    .map((key) => {
      const value = (data as Record<string, unknown>)[key];

      if (typeof value !== 'object') {
        return `${key}: ${value}`;
      }

      return `${key}: ${prettifyData(value)}`;
    })
    .join('\n');
};

const buildDataNode = (
  fsm: IStateMachineInspectRepresentation,
  g: RootGraphModel,
) => {
  if (fsm.data && Object.keys(fsm.data).length > 0) {
    g.node('data', {
      [_.label]: prettifyData(fsm.data),
      [_.shape]: 'box',
    });
  }
};

const buildGraph = (fsm: IStateMachineInspectRepresentation) => {
  return digraph(fsm.id, (g) => {
    buildDataNode(fsm, g);

    const nodes = fsm.states.map((state) =>
      g.node(state.toString(), {
        [_.color]: state === fsm.currentState ? 'green' : 'black',
      }),
    );

    for (const transition of fsm.transitions) {
      const fromNode = nodes.find(
        (node) => node.id === transition.from.toString(),
      )!;
      const toNode = nodes.find(
        (node) => node.id === transition.to.toString(),
      )!;

      g.edge([fromNode, toNode], {
        [_.label]: transition.event.toString(),
        [_.color]: transition.hasGuard ? 'red' : 'black',
      });
    }
  });
};

export const render = (fsm: IStateMachineInspectRepresentation): string => {
  return toDot(buildGraph(fsm));
};
