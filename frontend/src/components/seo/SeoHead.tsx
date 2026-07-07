import { Helmet } from "react-helmet-async";
import {
  type PageSeoConfig,
  seoConfigToHelmetProps,
} from "@/lib/page-metadata";

export function SeoHead(config: PageSeoConfig) {
  const { title, meta, link } = seoConfigToHelmetProps(config);

  return (
    <Helmet>
      <title>{title}</title>
      {meta.map((tag) =>
        "property" in tag ? (
          <meta
            key={`${tag.property}-${tag.content}`}
            property={tag.property}
            content={tag.content}
          />
        ) : (
          <meta
            key={`${tag.name}-${tag.content}`}
            name={tag.name}
            content={tag.content}
          />
        ),
      )}
      {link.map((l) => (
        <link key={l.rel} rel={l.rel} href={l.href} />
      ))}
    </Helmet>
  );
}
