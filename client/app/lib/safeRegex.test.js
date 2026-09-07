import {
  compileRegexPattern,
  isSafeRegexPattern,
  matchesRegexPattern,
  MAX_REGEX_PATTERN_LENGTH,
  MAX_REGEX_SUBJECT_LENGTH,
} from "./safeRegex";

describe("safeRegex", () => {
  describe("isSafeRegexPattern", () => {
    test("accepts ordinary patterns", () => {
      ["", "a+", "a.*a", "^[a-z0-9_-]+$", "(foo|bar)+", "\\d{1,10}", "^\\(a+\\)+$", "(a+)"].forEach((pattern) => {
        expect(isSafeRegexPattern(pattern)).toBe(true);
      });
    });

    test("rejects patterns with nested quantifiers", () => {
      ["(a+)+", "(a+)+$", "([a-zA-Z]+)*", "^(\\w+\\s?)*$", "(a{2,})+", "((a)*)*"].forEach((pattern) => {
        expect(isSafeRegexPattern(pattern)).toBe(false);
      });
    });

    test("rejects repeated groups with overlapping alternatives", () => {
      ["(a|a)+", "(a|aa)+$", "(ab|abc)*"].forEach((pattern) => {
        expect(isSafeRegexPattern(pattern)).toBe(false);
      });
    });

    test("rejects absurdly large explicit repetitions", () => {
      expect(isSafeRegexPattern("a{1,50000}")).toBe(false);
    });

    test("rejects patterns longer than the limit", () => {
      expect(isSafeRegexPattern("a".repeat(MAX_REGEX_PATTERN_LENGTH))).toBe(true);
      expect(isSafeRegexPattern("a".repeat(MAX_REGEX_PATTERN_LENGTH + 1))).toBe(false);
    });
  });

  describe("compileRegexPattern", () => {
    test("compiles safe patterns", () => {
      const regex = compileRegexPattern("^a+$");
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.test("aaa")).toBe(true);
    });

    test("returns null instead of throwing on invalid patterns", () => {
      expect(compileRegexPattern("[")).toBeNull();
      expect(compileRegexPattern("a{2,1}")).toBeNull();
    });

    test("returns null on unsafe patterns", () => {
      expect(compileRegexPattern("(a+)+$")).toBeNull();
    });
  });

  describe("matchesRegexPattern", () => {
    test("still validates values against the pattern", () => {
      expect(matchesRegexPattern("a+", "art")).toBe(true);
      expect(matchesRegexPattern("a+", "brt")).toBe(false);
      expect(matchesRegexPattern("a.*a", "arounda")).toBe(true);
    });

    test("does not accept values when the pattern is unsafe", () => {
      expect(matchesRegexPattern("(a+)+$", "aaaaaaaaaa")).toBe(false);
    });

    test("does not accept values longer than the limit", () => {
      expect(matchesRegexPattern("a+", "a".repeat(MAX_REGEX_SUBJECT_LENGTH))).toBe(true);
      expect(matchesRegexPattern("a+", "a".repeat(MAX_REGEX_SUBJECT_LENGTH + 1))).toBe(false);
    });

    test("returns quickly for a pattern that would otherwise backtrack forever", () => {
      const start = Date.now();
      expect(matchesRegexPattern("^(a+)+$", `${"a".repeat(40)}b`)).toBe(false);
      expect(Date.now() - start).toBeLessThan(1000);
    });
  });
});
