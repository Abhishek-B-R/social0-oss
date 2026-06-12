type JsonLd = Record<string, unknown>;

export function PseoJsonLd({ graphs }: { graphs: JsonLd | JsonLd[] }) {
  const payload = Array.isArray(graphs) ? graphs : [graphs];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  );
}
