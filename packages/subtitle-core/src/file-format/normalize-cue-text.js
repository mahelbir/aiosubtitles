const ASS_OVERRIDE_BLOCK_SPLIT_PATTERN = /(\{[^{}]*\})/;
const ASS_DRAWING_SCALE_PATTERN = /\\p(\d+)/g;
const ASS_ESCAPE_PATTERN = /\\[Nnh]/g;
const MARKUP_TAG_PATTERN = /<\/?[a-z0-9][^<>]*>/gi;
const WHITESPACE_RUN_PATTERN = /\s+/g;

export const removeAssOverrides = text => {
  let isDrawing = false;
  const keptSegments = [];
  text
    .split(ASS_OVERRIDE_BLOCK_SPLIT_PATTERN)
    .forEach((segment, segmentIndex) => {
      const isOverrideBlock = segmentIndex % 2 === 1;
      if (!isOverrideBlock) {
        if (!isDrawing) {
          keptSegments.push(segment);
        }
        return;
      }
      const drawingScale = [...segment.matchAll(ASS_DRAWING_SCALE_PATTERN)].at(
        -1,
      );
      if (drawingScale) {
        isDrawing = drawingScale[1] !== '0';
      }
    });
  return keptSegments.join('');
};

export const normalizeCueText = text =>
  removeAssOverrides(text)
    .replace(ASS_ESCAPE_PATTERN, ' ')
    .replace(MARKUP_TAG_PATTERN, '')
    .replace(WHITESPACE_RUN_PATTERN, ' ')
    .trim()
    .normalize('NFC');
