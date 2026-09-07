import React from "react";
import enzyme from "enzyme";

import HtmlContent from "./HtmlContent";

function render(html: string) {
  return enzyme.mount(<HtmlContent>{html}</HtmlContent>).html();
}

describe("HtmlContent", () => {
  test("Strips script tags and their content", () => {
    const el = render('<p>safe</p><script>window.xssMarker = "1";</script>');

    expect(el).toContain("<p>safe</p>");
    expect(el).not.toContain("<script");
    expect(el).not.toContain("xssMarker");
  });

  test("Strips event handler attributes", () => {
    const el = render(
      '<img src="https://example.com/broken.png" alt="i" onerror="window.xssMarker = 1">' +
        '<span onload="window.xssMarker = 1" onclick="window.xssMarker = 1">text</span>'
    );

    expect(el).not.toContain("onerror");
    expect(el).not.toContain("onload");
    expect(el).not.toContain("onclick");
    expect(el).toContain("https://example.com/broken.png");
    expect(el).toContain("text");
  });

  test("Neutralizes javascript: and vbscript: URLs", () => {
    const el = render(
      '<a href="javascript:window.xssMarker = 1">click</a>' + '<a href="vbscript:msgbox(1)">click too</a>'
    );

    expect(el).not.toContain("javascript:");
    expect(el).not.toContain("vbscript:");
    // the link text is kept, only the URL is dropped
    expect(el).toContain("click");
    expect(el).toContain("click too");
  });

  test("Strips framing, active content and style based injection", () => {
    const el = render(
      '<div style="position:fixed;top:0;left:0;width:100%;height:100%">overlay</div>' +
        '<iframe src="https://evil.example"></iframe><object data="x.swf"></object><embed src="x.swf">' +
        '<form action="https://evil.example"><input name="password"></form>'
    );

    expect(el).not.toContain("style=");
    expect(el).not.toContain("position:fixed");
    expect(el).not.toContain("<iframe");
    expect(el).not.toContain("<object");
    expect(el).not.toContain("<embed");
    expect(el).not.toContain("<form");
    expect(el).not.toContain("<input");
    expect(el).toContain("overlay");
  });

  test("Blocks data: URLs that can carry markup but keeps inert images", () => {
    const svg = render('<img src="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+">');
    expect(svg).not.toContain("data:image/svg+xml");

    const png = render('<img src="data:image/png;base64,iVBORw0KGgo=" alt="i">');
    expect(png).toContain("data:image/png;base64,iVBORw0KGgo=");
  });

  test("Keeps the markup dashboards rely on", () => {
    const el = render(
      "<h2>Title</h2><p><strong>bold</strong> <em>italic</em></p><ul><li>one</li><li>two</li></ul>" +
        "<table><tbody><tr><td>cell</td></tr></tbody></table>" +
        '<a href="https://example.com/report">link</a><img src="https://example.com/i.png" alt="i">' +
        '<a href="/queries/1">relative link</a>'
    );

    expect(el).toContain("<h2>Title</h2>");
    expect(el).toContain("<strong>bold</strong>");
    expect(el).toContain("<em>italic</em>");
    expect(el).toContain("<li>one</li>");
    expect(el).toContain("<td>cell</td>");
    expect(el).toContain('href="https://example.com/report"');
    expect(el).toContain('href="/queries/1"');
    expect(el).toContain('src="https://example.com/i.png"');
  });

  test("Allows target=_blank links but forces rel=noopener noreferrer", () => {
    const el = render('<a href="https://example.com" target="_blank">link</a>');

    expect(el).toContain('target="_blank"');
    expect(el).toContain('rel="noopener noreferrer"');
  });

  test("Drops target values other than _blank", () => {
    const el = render('<a href="https://example.com" target="_top">link</a>');

    expect(el).not.toContain("target=");
    expect(el).toContain('href="https://example.com"');
  });

  test("Passes remaining props through to the wrapper element", () => {
    // `HtmlContent` is not typed (it is consumed from plain JS as well), so the props are cast here
    const wrapperProps = { className: "markdown" } as any;
    const el = enzyme.mount(<HtmlContent {...wrapperProps}>{"<p>text</p>"}</HtmlContent>).html();

    expect(el).toContain('class="markdown"');
    expect(el).toContain("<p>text</p>");
  });
});
