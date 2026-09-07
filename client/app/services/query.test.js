import Mustache from "mustache";
import { Query } from "@/services/query";

describe("Query parameters", () => {
  test("keeps Mustache's default HTML escaping enabled for the rest of the app", () => {
    // Regression guard: the query service used to do `Mustache.escape = identity`, which is
    // module-wide state and silently disabled HTML escaping for every other `Mustache.render`
    // in the bundle (e.g. the alert notification template preview).
    const rendered = Mustache.render("{{ value }}", { value: "<b>a & b</b>" });

    expect(rendered).not.toContain("<b>");
    expect(rendered).toContain("&lt;");
    expect(rendered).toContain("&amp;");
  });

  test("collects parameter names from the query text", () => {
    const queryText = "select * from t where a = {{ a }} and b = {{&b}} {{#c}}and d = {{ d.e }}{{/c}}";
    const query = new Query({ query: queryText });

    expect(query.getParameters().parseQuery()).toEqual(["a", "b", "d"]);
    // the query text itself is never rewritten or escaped by the service
    expect(query.query).toBe(queryText);
  });

  test("passes parameter values for substitution without HTML-escaping them", () => {
    // Substitution into the SQL happens server-side and must receive raw values, otherwise
    // characters such as `&` and quotes would break the executed query.
    const value = "Tom & Jerry's \"<best>\"";
    const query = new Query({ query: "select * from t where name = {{ name }}" });
    const parameters = query.getParameters();

    parameters.get()[0].setValue(value);

    expect(parameters.getExecutionValues()).toEqual({ name: value });
  });
});
