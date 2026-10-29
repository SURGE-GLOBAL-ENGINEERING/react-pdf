/* eslint-disable no-continue */

import * as R from 'ramda';

import isFixed from './isFixed';

// eslint-disable-next-line import/no-cycle
import shouldNodeBreak from './shouldBreak';
import canNodeWrap from './getWrap';
// eslint-disable-next-line import/no-cycle
import split from './split';

// Prevent splitting elements by low decimal numbers
const SAFTY_THRESHOLD = 0.001;

const getTop = R.pathOr(0, ['box', 'top']);

const getHeight = R.path(['box', 'height']);

const isElementOutside = R.useWith(R.lte, [R.identity, getTop]);

const warnUnavailableSpace = node => {
  console.warn(
    `Node of type ${node.type} can't wrap between pages and it's bigger than available page height`,
  );
};

/**
 * The page break check ignores the margin under a block. 
 * If the last real block on the page fits but that margin crosses the edge, drop the margin.
 * So the page is not too tall and paragraph gaps are not squeezed. 
 * Blocks higher up are left alone because a later block on the same page already includes their gap.
 */
const dropTrailingMargin = (nodes, height) => {
  const result = nodes.slice();

  for (let i = result.length - 1; i >= 0; i -= 1) {
    const node = result[i];
    if (!node || isFixed(node) || !node.box) continue;

    const marginBottom = node.box.marginBottom || 0;
    const marginEnds = getTop(node) + (getHeight(node) || 0) + marginBottom;

    if (marginBottom > SAFTY_THRESHOLD && marginEnds > height + SAFTY_THRESHOLD) {
      result[i] = {
        ...node,
        style: { ...(node.style || {}), marginBottom: 0 },
        box: { ...node.box, marginBottom: 0 },
      };
    }
    break;
  }

  return result;
};

const splitNodes = (height, contentArea, nodes) => {
  const currentChildren = [];
  const nextChildren = [];

  for (let i = 0; i < nodes.length; i += 1) {
    const child = nodes[i];
    const futureNodes = nodes.slice(i + 1);
    const futureFixedNodes = R.filter(isFixed, futureNodes);

    const nodeTop = getTop(child);
    const nodeHeight = getHeight(child);
    const isOutside = isElementOutside(height, child);
    const shouldBreak = shouldNodeBreak(
      child,
      futureNodes,
      height,
      contentArea,
    );
    const shouldSplit = height + SAFTY_THRESHOLD < nodeTop + nodeHeight;
    const canWrap = canNodeWrap(child);
    const fitsInsidePage = nodeHeight <= contentArea;

    if (isFixed(child)) {
      nextChildren.push(child);
      currentChildren.push(child);
      continue;
    }

    if (isOutside) {
      const next = R.evolve({ box: { top: R.subtract(R.__, height) } })(child);
      nextChildren.push(next);
      continue;
    }

    if (!fitsInsidePage && !canWrap) {
      currentChildren.push(child);
      nextChildren.push(...futureNodes);
      warnUnavailableSpace(child);
      break;
    }

    if (shouldBreak) {
      const next = R.evolve({
        box: { top: R.subtract(R.__, height) },
        props: R.evolve({
          wrap: R.always(true),
          break: R.always(false),
        }),
      })(child);

      //removed pushing futureFixedNodes into currentChildren to prevent footnote duplication with keep settings
      //currentChildren.push(...futureFixedNodes);
      nextChildren.push(next, ...futureNodes);
      break;
    }
    
    /**
     * should call split also if any child have break prop
     */
    const anyChildHasBreak = child.children?.some(childItem => !!childItem.props?.break);

    if (shouldSplit || anyChildHasBreak) {
      const [currentChild, nextChild] = split(child, height, contentArea);

      if (currentChild) currentChildren.push(currentChild);
      if (nextChild) nextChildren.push(nextChild);

      continue;
    }

    currentChildren.push(child);
  }

  return [dropTrailingMargin(currentChildren, height), nextChildren];
};

export default splitNodes;
