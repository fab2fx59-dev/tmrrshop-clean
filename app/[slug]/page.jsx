import { notFound } from "next/navigation";
import { getPageHtml, pageFiles } from "../site-content";

export function generateStaticParams() {
  return Object.keys(pageFiles).map((slug) => ({ slug }));
}

export default async function StaticPage({ params }) {
  const { slug } = await params;
  const fileName = pageFiles[slug];

  if (!fileName) {
    notFound();
  }

  const html = getPageHtml(fileName);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
