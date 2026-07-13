import TermsPage from "@/features/marketing/pages/TermsPage";
import PrivacyPage from "@/features/marketing/pages/PrivacyPage";
import DataDeletionPage from "@/features/marketing/pages/DataDeletionPage";
import FeaturesPage from "@/features/marketing/pages/FeaturesIndexPage";
import AlternativesPage from "@/features/marketing/pages/AlternativesIndexPage";
import { FeatureDetailPage } from "@/pages/FeatureDetailPage";
import { AlternativeDetailPage } from "@/pages/AlternativeDetailPage";
import { HomeMarketingPage } from "@/pages/HomeMarketingPage";
import McpPage from "@/features/marketing/pages/McpPage";

export const MarketingPages = {
  Terms: TermsPage,
  Privacy: PrivacyPage,
  DataDeletion: DataDeletionPage,
  FeaturesIndex: FeaturesPage,
  FeatureDetail: FeatureDetailPage,
  AlternativesIndex: AlternativesPage,
  AlternativeDetail: AlternativeDetailPage,
  Home: HomeMarketingPage,
  Mcp: McpPage,
};
