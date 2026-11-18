const LITERAL_IDENTIFIERS = new Map([
  ['True', true],
  ['true', true],
  ['False', false],
  ['false', false],
  ['None', null],
  ['null', null],
  ['nil', null],
]);

const SIMPLE_ESCAPES = new Map([
  ['n', '\n'],
  ['t', '\t'],
  ['r', '\r'],
  ['0', '\0'],
]);
const UNICODE_ESCAPE_LENGTHS = new Map([
  ['u', 4],
  ['x', 2],
]);
const QUOTES = new Set(['"', "'", '`']);
const RAW_QUOTE = '`';
const VERBATIM_PREFIX = '@';
const IDENTIFIER_START_PATTERN = /[\p{L}_]/u;
const IDENTIFIER_PART_PATTERN = /[\p{L}\p{N}_]/u;
const DIGIT_PATTERN = /\d/;
const WHITESPACE_PATTERN = /\s/;
const NUMBER_PATTERN = /^\d[\d_]*(?:\.\d+)?/;
const HEX_RADIX = 16;
const LINE_COMMENT_STARTS = {hash: '#', slash: '//'};

export class SourceLiteralError extends Error {
  constructor() {
    super('A test source holds a literal the reader cannot parse.');
    this.name = 'SourceLiteralError';
  }
}

const readEscape = (sourceText, position) => {
  const escaped = sourceText[position + 1];
  if (!UNICODE_ESCAPE_LENGTHS.has(escaped)) {
    return {escapedText: SIMPLE_ESCAPES.get(escaped) ?? escaped, length: 2};
  }
  const digitCount = UNICODE_ESCAPE_LENGTHS.get(escaped);
  return {
    escapedText: String.fromCodePoint(
      Number.parseInt(
        sourceText.slice(position + 2, position + 2 + digitCount),
        HEX_RADIX,
      ),
    ),
    length: 2 + digitCount,
  };
};

const readQuoted = ({sourceText, start, hasEscapes}) => {
  const quote = sourceText[start];
  let position = start + 1;
  let literalText = '';
  while (position < sourceText.length) {
    const character = sourceText[position];
    if (character === quote) {
      return {literalText, end: position + 1};
    }
    if (character === '\\' && hasEscapes) {
      const {escapedText, length} = readEscape(sourceText, position);
      literalText += escapedText;
      position += length;
    } else {
      literalText += character;
      position += 1;
    }
  }
  throw new SourceLiteralError();
};

const readIdentifierEnd = (sourceText, start) => {
  let identifierEnd = start + 1;
  while (
    identifierEnd < sourceText.length &&
    IDENTIFIER_PART_PATTERN.test(sourceText[identifierEnd])
  ) {
    identifierEnd += 1;
  }
  return identifierEnd;
};

export const tokenizeSource = (sourceText, {commentStyle}) => {
  const lineCommentStart = LINE_COMMENT_STARTS[commentStyle];
  const tokens = [];
  let position = 0;
  while (position < sourceText.length) {
    const character = sourceText[position];
    const isVerbatim =
      character === VERBATIM_PREFIX && sourceText[position + 1] === '"';
    if (sourceText.startsWith(lineCommentStart, position)) {
      const lineEnd = sourceText.indexOf('\n', position);
      position = lineEnd < 0 ? sourceText.length : lineEnd;
    } else if (WHITESPACE_PATTERN.test(character)) {
      position += 1;
    } else if (QUOTES.has(character) || isVerbatim) {
      const quoteStart = isVerbatim ? position + 1 : position;
      const {literalText, end} = readQuoted({
        sourceText,
        start: quoteStart,
        hasEscapes: !isVerbatim && character !== RAW_QUOTE,
      });
      tokens.push({kind: 'string', literalValue: literalText});
      position = end;
    } else if (DIGIT_PATTERN.test(character)) {
      const [numberText] = NUMBER_PATTERN.exec(sourceText.slice(position));
      tokens.push({
        kind: 'number',
        literalValue: Number.parseFloat(numberText.replaceAll('_', '')),
      });
      position += numberText.length;
    } else if (IDENTIFIER_START_PATTERN.test(character)) {
      const identifierEnd = readIdentifierEnd(sourceText, position);
      tokens.push({
        kind: 'identifier',
        tokenText: sourceText.slice(position, identifierEnd),
      });
      position = identifierEnd;
    } else {
      tokens.push({kind: 'punctuation', tokenText: character});
      position += 1;
    }
  }
  return tokens;
};

export const isPunctuation = (token, tokenText) =>
  token?.kind === 'punctuation' && token.tokenText === tokenText;

export const isIdentifier = (token, tokenText) =>
  token?.kind === 'identifier' &&
  (tokenText === undefined || token.tokenText === tokenText);

const CLOSING_BY_OPENING = new Map([
  ['[', ']'],
  ['(', ')'],
  ['{', '}'],
]);

export const createLiteralReader = tokens => {
  let position = 0;

  const peek = (offset = 0) => tokens[position + offset];
  const advance = () => {
    if (position >= tokens.length) {
      throw new SourceLiteralError();
    }
    const token = tokens[position];
    position += 1;
    return token;
  };
  const expect = tokenText => {
    if (!isPunctuation(advance(), tokenText)) {
      throw new SourceLiteralError();
    }
  };

  const skipBalanced = () => {
    const opening = advance().tokenText;
    const closing = CLOSING_BY_OPENING.get(opening);
    let depth = 1;
    while (depth > 0) {
      const token = advance();
      if (isPunctuation(token, opening)) {
        depth += 1;
      } else if (isPunctuation(token, closing)) {
        depth -= 1;
      }
    }
  };

  const readSequence = closing => {
    const entries = [];
    while (!isPunctuation(peek(), closing)) {
      entries.push(readValue());
      if (isPunctuation(peek(), ',')) {
        advance();
      }
    }
    advance();
    return entries;
  };

  const readBraced = () => {
    expect('{');
    const isKeyed =
      (isIdentifier(peek()) || peek()?.kind === 'string') &&
      isPunctuation(peek(1), ':');
    if (!isKeyed) {
      return readSequence('}');
    }
    const keyedEntries = {};
    while (!isPunctuation(peek(), '}')) {
      const keyToken = advance();
      const entryKey =
        keyToken.kind === 'string' ? keyToken.literalValue : keyToken.tokenText;
      expect(':');
      keyedEntries[entryKey] = readValue();
      if (isPunctuation(peek(), ',')) {
        advance();
      }
    }
    advance();
    return keyedEntries;
  };

  const readTypedValue = () => {
    while (!isPunctuation(peek(), '{')) {
      if (isPunctuation(advance(), '(')) {
        const [convertedValue] = readSequence(')');
        return convertedValue ?? null;
      }
    }
    return readBraced();
  };

  const readConstruction = () => {
    while (isIdentifier(peek())) {
      advance();
    }
    expect('[');
    const isSized = !isPunctuation(peek(), ']');
    while (!isPunctuation(advance(), ']')) {
      continue;
    }
    return isSized && !isPunctuation(peek(), '{') ? [] : readBraced();
  };

  const readString = () => {
    let literalText = advance().literalValue;
    while (peek()?.kind === 'string') {
      literalText += advance().literalValue;
    }
    return literalText;
  };

  const readIdentifierValue = () => {
    const identifierToken = advance();
    if (LITERAL_IDENTIFIERS.has(identifierToken.tokenText)) {
      return LITERAL_IDENTIFIERS.get(identifierToken.tokenText);
    }
    if (identifierToken.tokenText === 'new') {
      return readConstruction();
    }
    let qualifiedName = identifierToken.tokenText;
    while (isPunctuation(peek(), '.') && isIdentifier(peek(1))) {
      advance();
      qualifiedName += `.${advance().tokenText}`;
    }
    if (isPunctuation(peek(), '{')) {
      return readBraced();
    }
    if (isPunctuation(peek(), '(')) {
      skipBalanced();
    }
    return {qualifiedName};
  };

  const readSquare = () => {
    advance();
    if (isPunctuation(peek(), ']') && isIdentifier(peek(1))) {
      advance();
      return readTypedValue();
    }
    return readSequence(']');
  };

  const readValue = () => {
    const token = peek();
    if (token?.kind === 'string') {
      return readString();
    }
    if (token?.kind === 'number') {
      return advance().literalValue;
    }
    if (isPunctuation(token, '[')) {
      return readSquare();
    }
    if (isPunctuation(token, '(')) {
      advance();
      return readSequence(')');
    }
    if (isPunctuation(token, '{')) {
      return readBraced();
    }
    if (isIdentifier(token)) {
      return readIdentifierValue();
    }
    throw new SourceLiteralError();
  };

  return {
    peek,
    advance,
    readValue,
    getPosition: () => position,
    setPosition: nextPosition => {
      position = nextPosition;
    },
    isDone: () => position >= tokens.length,
  };
};
