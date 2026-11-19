import * as R from 'ramda';
import getContentArea from '../page/getContentArea';
import getWrapArea from '../page/getWrapArea';
import splitNodes from '../node/splitNodes';
import getFootnotes from './getFootnotes';
import getFootnotePlaceholder from './getFootnotePlaceholder';

const getHeight = R.path(['box', 'height']);

const FOOTNOTES_MIN_HEIGHT = 15;

// Upper bound on re-checking which references stay on the page after a cut.
// It settles after one or two checks; the bound only guards against looping forever.
const MAX_CUT_CHECKS = 5;

const groupByKey = (array, key) => {
  const groups = array.reduce((r, a) => {
    const result = r;
    result[a[key]] = result[a[key]] || [];
    result[a[key]].push(a);
    return result;
  }, {});

  // Object.values lists whole-number keys before the others, which can put a lower
  // line ahead of a higher one. The loop below expects the groups in page order.
  return Object.values(groups).sort((a, b) => a[0][key] - b[0][key]);
};

/**
 * Height taken by the footnotes view: separator and padding plus the notes.
 */
const getFootnotesHeight = notes =>
  notes.length > 0
    ? FOOTNOTES_MIN_HEIGHT + notes.reduce((a, b) => a + b.heightNeeded, 0)
    : 0;

const isSameFootnote = (a, b) => a.el.props.footnote === b.el.props.footnote;

const hasSameNotes = (a, b) =>
  a.length === b.length && a.every((note, i) => note === b[i]);

/**
 * Space splitPage takes off the bottom of the page when it cuts the page at `cutAt`
 * with `notes` in the placeholder (the placeholder's height plus the spacing above it).
 */
const getSpacingForCut = (contentArea, cutAt, notes) => {
  const notesHeight = getFootnotesHeight(notes);

  return (
    notesHeight + Math.floor(Math.max(0, contentArea - cutAt - notesHeight))
  );
};

/**
 * Cuts the page the way splitPage will and keeps the notes whose references are still on
 * the page afterwards. Widow / orphan protection can carry lines from above the cut over
 * to the next page together with the line that has to move, and their notes must go too.
 *
 * @param {Object} page
 * @param {Array} notes notes chosen so far, all of them above the cut
 * @param {number} cutAt where the page is cut, measured from the top of the content area
 * @returns {Array} the notes whose references stay on the page
 */
const keepFootnotesOnPage = (page, notes, cutAt) => {
  if (notes.length === 0) return notes;

  const wrapArea = getWrapArea(page);
  const contentArea = getContentArea(page);

  let kept = notes;

  for (let i = 0; i < MAX_CUT_CHECKS; i += 1) {
    const spacing = getSpacingForCut(contentArea, cutAt, kept);

    const [currentChildren] = splitNodes(
      wrapArea - spacing,
      contentArea - spacing,
      page.children,
    );

    const refsOnPage = getFootnotes({ children: currentChildren });
    const stillOnPage = notes.filter(note =>
      refsOnPage.some(ref => isSameFootnote(ref, note)),
    );

    if (hasSameNotes(stillOnPage, kept)) return stillOnPage;

    kept = stillOnPage;
  }

  return kept;
};

const chooseToFitHeight = (group, height) => {
  const chosen = [];
  let totalHeight = 0;
  for (let i = 0; i < group.length; i += 1) {
    const note = group[i];

    if (totalHeight + note.heightNeeded > height) {
      break;
    }

    chosen.push(note);
    totalHeight += note.heightNeeded;
  }
  return chosen;
};
/**
 * Given page, choose which footnotes to include in the page considering,
 *
 *  1. If the footnote is included, will the reference to the footnote be on the same page,
 *  2. If not, will the reference move back to the page given more space being available
 *  3. If we can't fit the line including the references and footnotes in the same page,
 *     we will limit the no of footnotes shown to available space
 *
 *  If case 2 is happening we need to limit he content height for that page so that,
 *  the reference won't move back to the previous page.
 *  For that, this function also returns a space that needs added to the
 *
 * @param {page} page
 *
 * @returns {Object} containing footnotes array and contentHeight
 */
export default function chooseFootnotes(page, footnotes) {
  const contentArea = getContentArea(page);

  let footnotesHeight = FOOTNOTES_MIN_HEIGHT;
  let spacingNeeded = 0;

  let chosenFootnotes = [];
  const placeholder = getFootnotePlaceholder(page);

  if (placeholder) {
    const getFootnoteView = a => placeholder.children[0].children[a + 1];

    const initialFootnotes = footnotes.map((e, index) => {
      const footnoteView = getFootnoteView(index);
      const footnoteHeight =
        getHeight(footnoteView) +
        footnoteView.box.marginBottom +
        footnoteView.box.marginTop;

      return { ...e, heightNeeded: footnoteHeight, footnoteView };
    });

    let groupedFootnotes = groupByKey(initialFootnotes, 'approxTop');

    groupedFootnotes = groupedFootnotes.map(e => ({
      footnoteGroup: e,
      groupTop: e[0].approxTop - page.box.paddingTop,
      groupBottom: e[0].approxBottom - page.box.paddingTop,
      totalHeight: e.reduce((a, b) => a + b.heightNeeded, 0),
      breakAfter: e[0].breakAfter,
    }));

    for (let i = 0; i < groupedFootnotes.length; i += 1) {
      const {
        totalHeight,
        footnoteGroup,
        groupBottom,
        groupTop,
        breakAfter,
      } = groupedFootnotes[i];
      const lineHeight = groupBottom - groupTop;

      const spaceAfterAdding =
        contentArea - footnotesHeight - totalHeight - groupBottom;

      // include footnotes if space is available
      if (
        spaceAfterAdding > lineHeight ||
        (spaceAfterAdding > 0 && breakAfter)
      ) {
        footnotesHeight += totalHeight;
        chosenFootnotes.push(...footnoteGroup);
      }

      // case where space is not enough to include all the notes
      else {
        const availableSpace = contentArea - groupBottom - footnotesHeight;
        // keep at least 2 lines to avoid triggering widow / orphan
        const minContentSpace = Math.ceil(lineHeight * 2);
        /* 
          if the references and the footnotes height total is greater than the page,
          show the footnotes in the available space and discard others
        */
        if (minContentSpace + totalHeight > contentArea) {
          if (groupBottom >= minContentSpace) {
            // if the references are below the minimum possible content size,
            // shift the footnotes refs to the first line of next page
            spacingNeeded = Math.ceil(contentArea - groupTop - footnotesHeight);
          } else {
            // if the refs are within the minimum content size, show what is possible & cut off others.
            const chosen = chooseToFitHeight(footnoteGroup, availableSpace);
            chosenFootnotes.push(...chosen);
            footnotesHeight += chosen.reduce((a, b) => a + b.heightNeeded, 0);

            spacingNeeded =
              contentArea -
              Math.max(groupBottom, minContentSpace) -
              footnotesHeight;
          }
        } else {
          // The line holding these references moves to the next page, so the page is cut
          // at its top, or higher when the notes chosen so far leave less room than that.
          const cutAt =
            chosenFootnotes.length > 0
              ? Math.min(groupTop, contentArea - footnotesHeight)
              : groupTop;

          // Drop the notes whose references move to the next page along with that line
          chosenFootnotes = keepFootnotesOnPage(page, chosenFootnotes, cutAt);

          // Reserve space only for the notes that stay, so the page is cut where planned
          footnotesHeight = getFootnotesHeight(chosenFootnotes);

          // space between the cut and the notes, so the moved line can't come back to this page
          spacingNeeded = contentArea - cutAt - footnotesHeight;
        }
        break;
      }
    }
  }

  return {
    footnotes: chosenFootnotes,
    spacingNeeded: Math.floor(Math.max(0, spacingNeeded)),
  };
}
