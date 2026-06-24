import TermsPage from "@/app/terms/page";
import PrivacyPage from "@/app/privacy/page";
import DataDeletionPage from "@/app/data-deletion/page";
import FeaturesPage from "@/app/features/page";
import AlternativesPage from "@/app/alternatives/page";
import { FeatureDetailPage } from "@/pages/FeatureDetailPage";
import { AlternativeDetailPage } from "@/pages/AlternativeDetailPage";
import { HomeMarketingPage } from "@/pages/HomeMarketingPage";

export const MarketingPages = {
  Terms: TermsPage,
  Privacy: PrivacyPage,
  DataDeletion: DataDeletionPage,
  FeaturesIndex: FeaturesPage,
  FeatureDetail: FeatureDetailPage,
  AlternativesIndex: AlternativesPage,
  AlternativeDetail: AlternativeDetailPage,
  Home: HomeMarketingPage,
};
