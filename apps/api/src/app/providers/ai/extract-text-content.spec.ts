import { extractTextContent } from "./extract-text-content";

describe("extractTextContent", () => {
  it("returns plain text unchanged", () => {
    expect(extractTextContent("hello world")).toBe("hello world");
  });

  it("strips regular HTML tags", () => {
    expect(extractTextContent("<p>hello <strong>world</strong></p>")).toBe("hello world");
  });

  it("replaces an img with non-empty alt with [alt text]", () => {
    expect(extractTextContent("<img src=\"x.png\" alt=\"a cat\">")).toBe("[a cat]");
  });

  it("drops an img with empty alt", () => {
    expect(extractTextContent("<img src=\"x.png\" alt=\"\">")).toBe("");
  });

  it("drops an img with no alt attribute", () => {
    expect(extractTextContent("<img src=\"x.png\">")).toBe("");
  });

  it("handles mixed content: text + image with alt", () => {
    expect(extractTextContent("some text <img src=\"x.png\" alt=\"a dog\"> more text")).toBe("some text [a dog] more text");
  });

  it("collapses extra whitespace after stripping", () => {
    expect(extractTextContent("<p>  hello  </p>")).toBe("hello");
  });
});
