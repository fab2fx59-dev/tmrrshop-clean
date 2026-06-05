import { getPageHtml } from "./site-content";

export default function HomePage() {
  const html = getPageHtml("index.html");

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
