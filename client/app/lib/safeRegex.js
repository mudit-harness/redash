import { toString } from "lodash";

/**
 * Helpers for compiling and matching regular expressions that come from user input.
 *
 * "Text pattern" query parameters let a query author type an arbitrary pattern which is later
 * compiled in the browser and matched against values typed by whoever runs the query, so both
 * the pattern and the subject string are untrusted. A pattern such as `(a+)+$` matched against a
 * long subject backtracks exponentially and freezes the single browser event loop, i.e. a regular
 * expression denial of service (ReDoS).
 *
 * The feature is kept intact - patterns are still compiled and values are still validated against
 * them - but the amount of work a single match may do is bounded: the pattern and the subject are
 * length limited and patterns with constructs known to backtrack catastrophically are rejected.
 */

// A parameter pattern is a handful of characters in practice.
export const MAX_REGEX_PATTERN_LENGTH = 1000;

// Text pattern parameters hold short, identifier-like values; bounding the subject bounds the
// amount of backtracking any single match can do.
export const MAX_REGEX_SUBJECT_LENGTH = 1000;

// Explicit repetitions such as `a{1,50000}` are expensive even without nesting.
const MAX_REPETITION_COUNT = 1000;

const REPETITION_QUANTIFIER = /^\{(\d*)(,(\d*))?\}/;

// Returns the index of the closing "]" of the character class starting at `index`, or the index of
// the end of the pattern when the class is not closed.
function skipCharacterClass(pattern, index) {
  let position = index + 1;
  if (pattern[position] === "^") {
    position += 1;
  }
  if (pattern[position] === "]") {
    // a "]" right after "[" (or "[^") is a literal, not the end of the class
    position += 1;
  }
  while (position < pattern.length && pattern[position] !== "]") {
    if (pattern[position] === "\\") {
      position += 1;
    }
    position += 1;
  }
  return position;
}

// Describes the quantifier starting at `index`, or null when there is none.
function quantifierAt(pattern, index) {
  switch (pattern.charAt(index)) {
    case "*":
    case "+":
      return { length: 1, max: Infinity };
    case "?":
      return { length: 1, max: 1 };
    case "{": {
      const match = REPETITION_QUANTIFIER.exec(pattern.slice(index));
      if (!match || (match[1] === "" && (match[3] === undefined || match[3] === ""))) {
        // not a quantifier, just a literal "{"
        return null;
      }
      const min = match[1] === "" ? 0 : parseInt(match[1], 10);
      let max = min;
      if (match[2] !== undefined) {
        max = match[3] === "" ? Infinity : parseInt(match[3], 10);
      }
      return { length: match[0].length, max };
    }
    default:
      return null;
  }
}

// True when the (sub)pattern repeats something, which is what makes an enclosing repetition
// ambiguous and therefore exponential.
function containsRepetition(pattern) {
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern.charAt(index);
    if (char === "\\") {
      index += 1;
    } else if (char === "[") {
      index = skipCharacterClass(pattern, index);
    } else {
      const quantifier = quantifierAt(pattern, index);
      if (quantifier && quantifier.max > 1) {
        return true;
      }
    }
  }
  return false;
}

// Splits a group body on its top level "|", keeping nested groups and character classes intact.
function splitAlternatives(pattern) {
  const alternatives = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern.charAt(index);
    if (char === "\\") {
      index += 1;
    } else if (char === "[") {
      index = skipCharacterClass(pattern, index);
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "|" && depth === 0) {
      alternatives.push(pattern.slice(start, index));
      start = index + 1;
    }
  }
  alternatives.push(pattern.slice(start));
  return alternatives;
}

// `(a|aa)+` and `(ab|abc)+` are ambiguous the same way `(a+)+` is: the alternatives overlap, so a
// failing match retries every way of splitting the subject. Alternatives that cannot match the
// same text - `(foo|bar)+` - are left alone.
function hasOverlappingAlternatives(pattern) {
  const alternatives = splitAlternatives(pattern);
  for (const [index, alternative] of alternatives.entries()) {
    if (
      alternative !== "" &&
      alternatives.some((other, otherIndex) => otherIndex !== index && other.startsWith(alternative))
    ) {
      return true;
    }
  }
  return false;
}

// Detects the classic sources of exponential backtracking: a repeated group that itself repeats or
// whose alternatives overlap, and absurdly large explicit repetitions.
function hasCatastrophicBacktracking(pattern) {
  const groupStarts = [];
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern.charAt(index);
    if (char === "\\") {
      index += 1;
    } else if (char === "[") {
      index = skipCharacterClass(pattern, index);
    } else if (char === "(") {
      groupStarts.push(index);
    } else if (char === ")") {
      const groupStart = groupStarts.pop();
      const quantifier = quantifierAt(pattern, index + 1);
      if (groupStart !== undefined && quantifier && quantifier.max > 1) {
        const body = pattern.slice(groupStart + 1, index);
        if (containsRepetition(body) || hasOverlappingAlternatives(body)) {
          return true;
        }
      }
    } else {
      const quantifier = quantifierAt(pattern, index);
      if (quantifier && Number.isFinite(quantifier.max) && quantifier.max > MAX_REPETITION_COUNT) {
        return true;
      }
    }
  }
  return false;
}

/**
 * True when `pattern` is short enough and free of constructs that can backtrack catastrophically.
 * Says nothing about the pattern being syntactically valid - use `compileRegexPattern` for that.
 */
export function isSafeRegexPattern(pattern) {
  const source = toString(pattern);
  return source.length <= MAX_REGEX_PATTERN_LENGTH && !hasCatastrophicBacktracking(source);
}

/**
 * Compiles `pattern` when it is safe to run, otherwise returns null. Never throws, so callers can
 * treat "unsafe" and "invalid" the same way when they do not need to tell them apart.
 */
export function compileRegexPattern(pattern, flags) {
  if (!isSafeRegexPattern(pattern)) {
    return null;
  }
  try {
    return new RegExp(toString(pattern), flags);
  } catch (error) {
    return null;
  }
}

/**
 * True when `value` matches `pattern`. Returns false - i.e. the value is not accepted - when the
 * pattern is unsafe or invalid, or when the value is longer than what is worth matching.
 */
export function matchesRegexPattern(pattern, value) {
  const subject = toString(value);
  if (subject.length > MAX_REGEX_SUBJECT_LENGTH) {
    return false;
  }
  const regex = compileRegexPattern(pattern);
  return regex !== null && regex.test(subject);
}
