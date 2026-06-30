export function extractTextContent(html: string): string {
  const withAlt = html.replace(/<img[^>]+alt="([^"]+)"[^>]*>/gi, "[$1]");
  const withoutImg = withAlt.replace(/<img[^>]*>/gi, "");
  return withoutImg.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
