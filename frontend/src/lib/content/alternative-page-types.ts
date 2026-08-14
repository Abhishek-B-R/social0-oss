export type ComparisonRow = {
  feature: string;
  social0: string;
  competitor: string;
};

export type AlternativePage = {
  slug: string;
  competitorName: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  heroHeadline: string;
  heroSubheadline: string;
  intro: string;
  whySwitch: string[];
  comparisonRows: ComparisonRow[];
  faq: { question: string; answer: string }[];
  relatedFeatureSlugs: string[];
};
