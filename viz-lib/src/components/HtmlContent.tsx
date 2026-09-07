import React from "react";
import PropTypes from "prop-types";
import { sanitizeHtml } from "@/services/sanitize";

const HtmlContent = React.memo(function HtmlContent({ children, ...props }) {
  return (
    <div
      {...props}
      // `children` is untrusted, user-authored HTML (dashboard text widgets, query/visualization descriptions,
      // table columns with `allowHTML`), so it may only reach the DOM through the sanitizer, which strips
      // script, event handlers, `javascript:`/`data:` URLs, framing and style-based injection.
      // Note: `dangerouslySetInnerHTML` is set after `{...props}` on purpose, so a caller cannot override it.
      // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'ReactNode' is not assignable to ... Remove this comment to see the full error message
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(children) }} // eslint-disable-line react/no-danger
    />
  );
});

// @ts-expect-error ts-migrate(2339) FIXME: Property 'propTypes' does not exist on type 'Named... Remove this comment to see the full error message
HtmlContent.propTypes = {
  children: PropTypes.string,
};

// @ts-expect-error ts-migrate(2339) FIXME: Property 'defaultProps' does not exist on type 'Na... Remove this comment to see the full error message
HtmlContent.defaultProps = {
  children: "",
};

export default HtmlContent;
