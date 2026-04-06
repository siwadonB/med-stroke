export type ApiResponse = {
  success: boolean;
  assessment: {
    dish_name_th: string;
    dish_name_en: string;
    dish_confidence: number;
    verdict_tag: "ทานได้" | "ทานได้ แต่ควรปรับ" | "ควรหลีกเลี่ยง";
    recommendation_th: string;
    avoid_reason_th: string;
    avoid_ingredients_th: string[];
    headline_th: string;
    summary_th: string;
  };
  image_analysis: {
    visible_ingredients_th: string[];
    likely_ingredients_th: string[];
    cooking_method: string;
    observed_traits: string[];
    image_notes_th: string;
  };
  interpretation: {
    evidence_based_findings_th: string[];
    uncertain_points_th: string[];
    suggested_improvements_th: string[];
    evidence_sufficiency: "strong" | "moderate" | "limited";
    disclaimer_th: string;
  };
  references: {
    source_label_th: string;
    section_title: string;
    page_label_th: string;
    evidence_summary: string;
  }[];
  error?: any;
};

let latestResult: ApiResponse | null = null;

export function setLatestResult(result: ApiResponse | null) {
  latestResult = result;
}

export function getLatestResult() {
  return latestResult;
}