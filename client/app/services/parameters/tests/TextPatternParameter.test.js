import { createParameter } from "..";
import { MAX_REGEX_SUBJECT_LENGTH } from "@/lib/safeRegex";

function createTextPatternParameter(regex) {
  return createParameter({ name: "param", title: "Param", type: "text-pattern", regex });
}

describe("TextPatternParameter", () => {
  let param;

  beforeEach(() => {
    param = createTextPatternParameter("a+");
  });

  describe("noramlizeValue", () => {
    test("converts matching strings", () => {
      const normalizedValue = param.normalizeValue("art");
      expect(normalizedValue).toBe("art");
    });

    test("returns null when string does not match pattern", () => {
      const normalizedValue = param.normalizeValue("brt");
      expect(normalizedValue).toBeNull();
    });

    test("returns null when value is longer than the matchable limit", () => {
      expect(param.normalizeValue("a".repeat(MAX_REGEX_SUBJECT_LENGTH))).toBe("a".repeat(MAX_REGEX_SUBJECT_LENGTH));
      expect(param.normalizeValue("a".repeat(MAX_REGEX_SUBJECT_LENGTH + 1))).toBeNull();
    });

    test("returns null without hanging when the pattern can backtrack catastrophically", () => {
      const redosParam = createTextPatternParameter("^(a+)+$");
      const start = Date.now();
      expect(redosParam.normalizeValue(`${"a".repeat(40)}b`)).toBeNull();
      expect(Date.now() - start).toBeLessThan(1000);
    });

    test("returns null instead of throwing when the pattern is invalid", () => {
      expect(createTextPatternParameter("[").normalizeValue("art")).toBeNull();
    });
  });
});
