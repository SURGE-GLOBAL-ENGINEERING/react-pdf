import * as R from 'ramda';
import getContentArea from '../page/getContentArea';
import getFootnotePlaceholder from './getFootnotePlaceholder';

const getHeight = R.path(['box', 'height']);

const FOOTNOTES_MIN_HEIGHT = 15;

const groupByKey = (array, key) => {
  return Object.values(
    array.reduce((r, a) => {
      const groups = r;
      groups[a[key]] = groups[a[key]] || [];
      groups[a[key]].push(a);
      return groups;
    }, {}),
  );
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
        // keep at least 2 lines to avoid triggering widow / orphan
        const minContentSpace = Math.ceil(lineHeight * 2);
        /*
          if the references and the footnotes height total is greater than the page,
          defer the whole group (and anything after it) to the next page instead of
          truncating it - a footnote that doesn't fit here should still get a chance
          to render on the next page rather than being discarded.
        */
        if (minContentSpace + totalHeight > contentArea) {
          spacingNeeded = Math.ceil(contentArea - groupTop - footnotesHeight);
        } else {
          // filter footnotes that will be shifted due to orphan / widow protection
          const remainingFootnotes = [];
          const droppedFootnotes = [];
          chosenFootnotes.forEach(note => {
            // bottom of the line containing the note reference
            const noteBottom = note.approxBottom - page.box.paddingTop;
            // height between current groupTop(shift point) and note bottom
            const spaceAfter = groupTop - noteBottom;
            // if the line is the last line, a break should be allowed after it to include it
            if (spaceAfter > lineHeight || note.breakAfter) {
              remainingFootnotes.push(note);
            } else {
              droppedFootnotes.push(note);
            }
          });
          chosenFootnotes = remainingFootnotes;

          // Footnotes dropped here still have their reference on this page, so the
          // reference needs to move to the next page along with them - otherwise
          // the reference renders with no matching footnote text. Reduce the
          // reserved footnote height to match what's actually still chosen, and
          // shift the split point back to the earliest dropped reference so it
          // (and anything after it) gets deferred too.
          footnotesHeight -= droppedFootnotes.reduce(
            (a, b) => a + b.heightNeeded,
            0,
          );
          const shiftPoint = droppedFootnotes.reduce(
            (min, note) => Math.min(min, note.approxTop - page.box.paddingTop),
            groupTop,
          );

          // if they can be included in a single page add a space and shift the reference to next page
          spacingNeeded =
            contentArea -
            shiftPoint -
            (chosenFootnotes.length > 0 ? footnotesHeight : 0);
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
