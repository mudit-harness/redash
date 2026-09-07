import { toString, isNull } from "lodash";
import { matchesRegexPattern } from "@/lib/safeRegex";
import Parameter from "./Parameter";

class TextPatternParameter extends Parameter {
  constructor(parameter, parentQueryId) {
    super(parameter, parentQueryId);
    this.regex = parameter.regex;
    this.setValue(parameter.value);
  }

  // eslint-disable-next-line class-methods-use-this
  normalizeValue(value) {
    const normalizedValue = toString(value);
    if (isNull(normalizedValue)) {
      return null;
    }

    // The pattern is supplied by the query author and the value by whoever runs the query, so the
    // match is bounded (pattern/value length, no catastrophic backtracking) to keep a pathological
    // pattern from hanging the browser. Values that do not match are still rejected.
    if (matchesRegexPattern(this.regex, normalizedValue)) {
      return normalizedValue;
    }
    return null;
  }
}

export default TextPatternParameter;
