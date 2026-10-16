/* eslint-disable no-continue */
/* eslint-disable no-restricted-syntax */

import * as R from 'ramda';

import getWrap from './getWrap';
import getNodesHeight from './getNodesHeight';
// eslint-disable-next-line import/no-cycle
import split from './split';

const getBreak = R.pathOr(false, ['props', 'break']);

const getBreakIfLastOnPage = R.pathOr(false, ['props', 'breakIfLastOnPage']);

const getMinPresenceAhead = R.path(['props', 'minPresenceAhead']);

const getMinWrapHeight = R.path(['props', 'minWrapHeight']);

const getTop = R.pathOr(0, ['box', 'top']);

const defaultPresenceAhead = element => height =>
  Math.min(element.box.height, height);

const getPresenceAhead = (elements, height) => {
  let result = 0;

  for (let i = 0; i < elements.length; i += 1) {
    const element = elements[i];

    if (!element.box) continue;

    const isElementInside = height > element.box.top;
    const presenceAhead =
      element.props.presenceAhead || defaultPresenceAhead(element);

    if (element && isElementInside) {
      result += presenceAhead(height - element.box.top);
    }
  }

  return result;
};

/**
 * Returns the height of the child components with `wrapTextAround` attribute if the parent node
 * has explicitly specified `hasWrapTextAroundComponent` attribute
 * @param {Object} node
 * @returns number
 */
const getWrapTextAroundChildrenHeight = node => {
  if (!node.props?.hasWrapTextAroundComponent) {
    return 0;
  }
  const queue = [node];
  let height = 0;
  while (queue.length) {
    const top = queue.pop();
    (top.children || []).forEach(child => queue.push(child));

    if (top.props?.wrapTextAround) {
      height += top.box?.height || 0;
    }
  }
  return height;
};

/**
 * Returns whether the node or its children
 * has any drawable lines
 *
 * @param {Object} node
 * @returns boolean
 */
const hasAnyLines = node => {
  if (node?.lines?.length) {
    return true;
  }

  if (node?.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      return hasAnyLines(child);
    }
  }

  return false;
};

/**
 * Returns whether the node can be drawn on the
 * current page
 *
 * @param {Object} node
 * @param {Number} presenceAhead
 * @param {Number} height
 * @param {Number} contentArea
 * @returns boolean
 */
const canDrawOnPage = (node, presenceAhead, height, contentArea) => {
  const nextHeight = getNodesHeight([node]);

  if (nextHeight <= presenceAhead) return false;

  if (!getWrap(node)) {
    return true;
  }

  const [currentContent] = split(node, height, contentArea);
  if (!hasAnyLines(currentContent)) return true;

  return false;
};

const shouldBreak = (child, futureElements, height, contentArea) => {
  const minPresenceAhead = getMinPresenceAhead(child);
  const minWrapHeight = getMinWrapHeight(child);
  const presenceAhead = getPresenceAhead(futureElements, height);
  const futureHeight = getNodesHeight(futureElements);
  const wrapTextAroundChildrenHeight = getWrapTextAroundChildrenHeight(child);
  const shouldSplit =
    height < child.box.top + child.box.height + wrapTextAroundChildrenHeight;
  const shouldWrap = getWrap(child);
  // If a wrapping node needs more than the leftover space to start meaningfully,
  // push it to the next page instead of leaving a chrome "tip" fragment.
  const remaining = height - getTop(child);
  const shouldDeferWrapStart =
    shouldWrap && minWrapHeight != null && remaining < minWrapHeight;

  return (
    getBreak(child) ||
    shouldDeferWrapStart ||
    (!shouldWrap && shouldSplit) ||
    (wrapTextAroundChildrenHeight && shouldSplit) ||
    (minPresenceAhead < futureHeight && presenceAhead < minPresenceAhead) ||
    (getBreakIfLastOnPage(child) &&
      futureElements.length &&
      canDrawOnPage(futureElements[0], presenceAhead, height, contentArea))
  );
};

export default shouldBreak;
