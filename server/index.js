const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

require("dotenv").config({
  path: path.join(__dirname, ".env"),
  override: true,
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "6mb" }));

const PORT = Number(process.env.PORT || 8080);
const MODEL = process.env.MODEL || "gemini-2.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const DEBUG = process.env.DEBUG === "1";
const RAG_TOPK = Number(process.env.RAG_TOPK || 3);
const DEFAULT_GUIDELINE_MODE =
  process.env.DEFAULT_GUIDELINE_MODE || "primary_prevention";
const RAG_INDEX_PATH =
  process.env.RAG_INDEX_PATH || path.join(__dirname, "rag", "index.json");

console.log(
  "Using GEMINI_API_KEY:",
  GEMINI_API_KEY
    ? `${GEMINI_API_KEY.slice(0, 6)}...${GEMINI_API_KEY.slice(-4)}`
    : "(empty)"
);

if (!GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY in .env");
}

const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR });

const GEN_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/* ------------------------- */
/* helpers                   */
/* ------------------------- */

function uniq(arr) {
  return Array.from(
    new Set((arr || []).map((x) => String(x || "").trim()).filter(Boolean))
  );
}

function arrOfStrings(v, max = 50) {
  if (!Array.isArray(v)) return [];
  return uniq(v).slice(0, max);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPossibleFence(s) {
  return String(s || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    const s = String(text || "");
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start < 0 || end < 0 || end <= start) return fallback;
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {
      return fallback;
    }
  }
}

function friendlyDocNameTh(doc = "") {
  const d = doc.toLowerCase();
  if (d.includes("bushnell") && d.includes("2024")) {
    return "แนวทาง AHA/ASA ปี 2024 (การป้องกัน stroke ในคนทั่วไป)";
  }
  if (d.includes("kleindorfer") && d.includes("2021")) {
    return "แนวทาง AHA/ASA ปี 2021 (การป้องกัน stroke ซ้ำ)";
  }
  return doc.replace(".pdf", "");
}

function shortEvidenceSummary(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

function cleanRangeLabel(start, end) {
  if (!start) return "";
  if (!end || end === start) return `หน้า ${start}`;
  return `หน้า ${start}-${end}`;
}

/* ------------------------- */
/* RAG                       */
/* ------------------------- */

function loadRagIndex() {
  try {
    if (!fs.existsSync(RAG_INDEX_PATH)) {
      return {
        ok: false,
        error: `missing index.json at ${RAG_INDEX_PATH}`,
        chunks: [],
        documents: [],
      };
    }

    const raw = fs.readFileSync(RAG_INDEX_PATH, "utf8");
    const parsed = JSON.parse(raw);

    const chunks = Array.isArray(parsed?.chunks) ? parsed.chunks : [];
    const documents = Array.isArray(parsed?.documents)
      ? parsed.documents
      : [];

    return {
      ok: true,
      error: "",
      chunks,
      documents,
      meta: parsed?.meta || {},
      created_at: parsed?.created_at || "",
    };
  } catch (e) {
    return {
      ok: false,
      error: String(e),
      chunks: [],
      documents: [],
    };
  }
}

/* ------------------------- */
/* Thai -> English hints     */
/* retrieval use only        */
/* ------------------------- */

const THAI_TO_EN_HINTS = [
  ["กุ้ง", "shrimp"],
  ["ปลา", "fish"],
  ["ปลาทะเล", "fish"],
  ["อาหารทะเล", "seafood"],
  ["หมู", "pork"],
  ["หมูสับ", "minced pork"],
  ["ไก่", "chicken"],
  ["เนื้อ", "beef"],
  ["ไข่", "egg"],
  ["เห็ด", "mushroom"],
  ["มะนาว", "lime"],
  ["มะเขือเทศ", "tomato"],
  ["หัวหอม", "onion"],
  ["หอมแดง", "shallot"],
  ["พริก", "chili"],
  ["กระเทียม", "garlic"],
  ["ผักชี", "cilantro"],
  ["ตะไคร้", "lemongrass"],
  ["ข่า", "galangal"],
  ["ใบมะกรูด", "kaffir lime leaf"],
  ["โหระพา", "thai basil"],
  ["กะเพรา", "holy basil"],
  ["กะทิ", "coconut milk"],
  ["น้ำปลา", "fish sauce"],
  ["ซีอิ๊ว", "soy sauce"],
  ["เส้น", "noodles"],
  ["ข้าว", "rice"],
  ["ถั่ว", "nuts"],
];

function expandThaiIngredientsToEnglish(items = []) {
  const out = [];
  for (const item of items) {
    const t = normalizeText(item);
    for (const [th, en] of THAI_TO_EN_HINTS) {
      if (t.includes(normalizeText(th))) out.push(en);
    }
  }
  return uniq(out);
}

function normalizeObservedTraits(v) {
  const allowed = new Set([
    "soup_based",
    "broth_or_sauce_present",
    "fried",
    "stir_fried",
    "grilled_or_roasted",
    "steamed_or_boiled",
    "seafood_present",
    "vegetable_present",
    "processed_meat_present",
    "coconut_milk_possible",
    "rice_or_noodle_based",
    "sweetened_drink_or_dessert",
  ]);

  return arrOfStrings(v, 20).filter((x) => allowed.has(String(x)));
}

function deriveNutritionSignals(imageAnalysis) {
  const en = [
    ...(imageAnalysis.visible_ingredients_en || []),
    ...(imageAnalysis.likely_ingredients_en || []),
  ].map(normalizeText);

  const traits = normalizeObservedTraits(imageAnalysis.observed_traits || []);
  const joined = `${en.join(" ")} ${traits.join(" ")}`;

  const signals = [];

  if (
    joined.includes("shrimp") ||
    joined.includes("fish") ||
    joined.includes("seafood") ||
    traits.includes("seafood_present")
  ) {
    signals.push("seafood protein");
  }

  if (
    joined.includes("vegetable") ||
    joined.includes("mushroom") ||
    joined.includes("tomato") ||
    traits.includes("vegetable_present")
  ) {
    signals.push("vegetables");
  }

  if (
    traits.includes("soup_based") ||
    traits.includes("broth_or_sauce_present") ||
    joined.includes("fish sauce") ||
    joined.includes("soy sauce")
  ) {
    signals.push("broth");
    signals.push("sodium risk");
  }

  if (traits.includes("fried") || traits.includes("stir_fried")) {
    signals.push("fried food");
  }

  if (
    traits.includes("coconut_milk_possible") ||
    joined.includes("coconut milk")
  ) {
    signals.push("coconut milk");
  }

  if (traits.includes("processed_meat_present")) {
    signals.push("processed meat");
  }

  if (traits.includes("sweetened_drink_or_dessert")) {
    signals.push("sugary drinks");
  }

  if (traits.includes("rice_or_noodle_based")) {
    signals.push("refined carbohydrate");
  }

  return uniq(signals);
}

function buildQueryTerms(imageAnalysis, mode) {
  const dishTerms = uniq([
    imageAnalysis?.dish_name_en,
    imageAnalysis?.dish_name_th,
    imageAnalysis?.cooking_method,
  ])
    .map(normalizeText)
    .filter(Boolean);

  const rawEng = uniq([
    ...(imageAnalysis?.visible_ingredients_en || []),
    ...(imageAnalysis?.likely_ingredients_en || []),
  ])
    .map(normalizeText)
    .filter(Boolean);

  const thaiAsEng = expandThaiIngredientsToEnglish([
    ...(imageAnalysis?.visible_ingredients_th || []),
    ...(imageAnalysis?.likely_ingredients_th || []),
  ])
    .map(normalizeText)
    .filter(Boolean);

  const traits = normalizeObservedTraits(
    imageAnalysis?.observed_traits || []
  ).map(normalizeText);

  const signals = deriveNutritionSignals(imageAnalysis).map(normalizeText);

  const anchors = [
    "stroke prevention",
    "diet pattern",
    "healthy dietary pattern",
    "mediterranean diet",
    "low sodium",
    "salt",
    "sodium",
    "vegetables",
    "fruit",
    "whole grains",
    "legumes",
    "nuts",
    "fish",
    "olive oil",
    "processed meat",
    "sugary drinks",
  ];

  const modeTerms =
    mode === "secondary_prevention"
      ? ["secondary prevention", "recurrent stroke prevention"]
      : ["primary prevention", "stroke risk reduction"];

  return uniq([
    ...dishTerms,
    ...rawEng,
    ...thaiAsEng,
    ...traits,
    ...signals,
    ...anchors,
    ...modeTerms,
  ]);
}

function buildQueryText(imageAnalysis, mode) {
  const visible = uniq([
    ...(imageAnalysis?.visible_ingredients_en || []),
    ...(imageAnalysis?.visible_ingredients_th || []),
  ]).join(", ");

  const likely = uniq([
    ...(imageAnalysis?.likely_ingredients_en || []),
    ...(imageAnalysis?.likely_ingredients_th || []),
  ]).join(", ");

  const traits = normalizeObservedTraits(
    imageAnalysis?.observed_traits || []
  ).join(", ");
  const dish =
    imageAnalysis?.dish_name_en || imageAnalysis?.dish_name_th || "unknown dish";
  const cooking = imageAnalysis?.cooking_method || "unknown";

  return [
    `guideline_mode: ${mode}`,
    `dish: ${dish}`,
    `cooking_method: ${cooking}`,
    `visible_ingredients: ${visible || "-"}`,
    `likely_ingredients: ${likely || "-"}`,
    `observed_traits: ${traits || "-"}`,
    "Task: find guideline evidence about dietary patterns related to stroke prevention.",
    "Focus on broad dietary pattern signals, not on judging a single menu as medically good or bad.",
    "Prioritize evidence about seafood, vegetables, low sodium, broth/sauce, fried foods, processed foods, Mediterranean-style pattern, and limiting sugary drinks.",
  ].join("\n");
}

function scoreChunk(chunk, queryTerms, mode) {
  const text = normalizeText(chunk?.text || "");
  const section = normalizeText(chunk?.section_title || "");
  const keywords = Array.isArray(chunk?.keywords)
    ? chunk.keywords.map(normalizeText)
    : [];

  let score = 0;
  const matched = [];

  for (const term of queryTerms) {
    const t = normalizeText(term);
    if (!t || t.length < 2) continue;

    let hit = false;

    if (text.includes(t)) {
      score += t.includes(" ") ? 9 : 5;
      hit = true;
    }
    if (section.includes(t)) {
      score += 6;
      hit = true;
    }
    if (keywords.some((k) => k.includes(t) || t.includes(k))) {
      score += 7;
      hit = true;
    }

    if (hit) matched.push(t);
  }

  const broadBoostTerms = [
    "diet",
    "dietary",
    "nutrition",
    "healthy dietary pattern",
    "mediterranean",
    "sodium",
    "salt",
    "fruit",
    "vegetables",
    "whole grains",
    "nuts",
    "fish",
    "olive oil",
    "processed meat",
    "sugary drinks",
  ];

  for (const t of broadBoostTerms) {
    if (text.includes(t) || section.includes(t)) score += 2;
  }

  if (mode === "secondary_prevention") {
    if (
      text.includes("secondary prevention") ||
      text.includes("recurrent stroke")
    ) {
      score += 8;
    }
  } else {
    if (text.includes("primary prevention") || text.includes("risk reduction")) {
      score += 6;
    }
  }

  return { score, matched: uniq(matched) };
}

function retrieveRelevantChunks(rag, imageAnalysis, mode, topK = 3) {
  const queryTerms = buildQueryTerms(imageAnalysis, mode);
  const queryText = buildQueryText(imageAnalysis, mode);

  const ranked = (rag?.chunks || [])
    .map((chunk) => {
      const s = scoreChunk(chunk, queryTerms, mode);
      return {
        ...chunk,
        _score: s.score,
        _matched_terms: s.matched,
      };
    })
    .filter((c) => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, clamp(Number(topK || 3), 1, 6));

  return {
    query_text: queryText,
    query_terms: queryTerms,
    chunks: ranked,
  };
}

/* ------------------------- */
/* Gemini raw + strict JSON  */
/* ------------------------- */

async function geminiRaw(body) {
  const res = await fetch(
    `${GEN_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const txt = await res.text();
  let json;
  try {
    json = JSON.parse(txt);
  } catch {
    throw new Error(`Gemini non-JSON HTTP ${res.status}: ${txt.slice(0, 500)}`);
  }

  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${JSON.stringify(json)}`);
  }

  return json;
}

async function geminiCallJsonStrict(body, label = "gemini") {
  const json = await geminiRaw(body);

  const cand = json?.candidates?.[0];
  const finishReason = cand?.finishReason || "";
  const rawText = (cand?.content?.parts || []).map((p) => p?.text || "").join("");

  if (DEBUG) {
    console.log(`\n[${label}] finish=${finishReason} len=${rawText.length}`);
    console.log(rawText.slice(0, 4000));
    console.log("[usageMetadata]", json?.usageMetadata || {});
    console.log("---");
  }

  if (!rawText || !rawText.trim()) {
    throw new Error(
      `${label}: empty response (finish=${finishReason || "unknown"})`
    );
  }

  if (finishReason === "MAX_TOKENS") {
    throw new Error(`${label}: response truncated by MAX_TOKENS`);
  }

  const cleaned = stripPossibleFence(rawText);
  let parsed = safeJsonParse(cleaned, null);

  if (!parsed && cleaned.includes("{") && cleaned.includes("}")) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) parsed = safeJsonParse(match[0], null);
  }

  if (!parsed) {
    throw new Error(
      `${label}: invalid JSON response (finish=${finishReason || "unknown"})`
    );
  }

  return parsed;
}

/* ------------------------- */
/* vision schema             */
/* ------------------------- */

const VISION_SCHEMA = {
  type: "object",
  properties: {
    dish_name_th: { type: "string" },
    dish_name_en: { type: "string" },
    visible_ingredients_th: {
      type: "array",
      items: { type: "string" },
    },
    visible_ingredients_en: {
      type: "array",
      items: { type: "string" },
    },
    likely_ingredients_th: {
      type: "array",
      items: { type: "string" },
    },
    likely_ingredients_en: {
      type: "array",
      items: { type: "string" },
    },
    cooking_method: { type: "string" },
    observed_traits: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "soup_based",
          "broth_or_sauce_present",
          "fried",
          "stir_fried",
          "grilled_or_roasted",
          "steamed_or_boiled",
          "seafood_present",
          "vegetable_present",
          "processed_meat_present",
          "coconut_milk_possible",
          "rice_or_noodle_based",
          "sweetened_drink_or_dessert",
        ],
      },
    },
    confidence: { type: "number" },
    image_notes_th: { type: "string" },
  },
  required: [
    "dish_name_th",
    "dish_name_en",
    "visible_ingredients_th",
    "visible_ingredients_en",
    "likely_ingredients_th",
    "likely_ingredients_en",
    "cooking_method",
    "observed_traits",
    "confidence",
    "image_notes_th",
  ],
};

/* ------------------------- */
/* interpret schema          */
/* ------------------------- */

const INTERPRET_SCHEMA = {
  type: "object",
  properties: {
    verdict_tag: {
      type: "string",
      enum: ["ทานได้", "ทานได้ แต่ควรปรับ", "ควรหลีกเลี่ยง"],
    },
    recommendation_th: { type: "string" },
    avoid_reason_th: { type: "string" },
    avoid_ingredients_th: {
      type: "array",
      items: { type: "string" },
    },
    headline_th: { type: "string" },
    summary_th: { type: "string" },
    evidence_based_findings_th: {
      type: "array",
      items: { type: "string" },
    },
    uncertain_points_th: {
      type: "array",
      items: { type: "string" },
    },
    suggested_improvements_th: {
      type: "array",
      items: { type: "string" },
    },
    evidence_sufficiency: {
      type: "string",
      enum: ["strong", "moderate", "limited"],
    },
    disclaimer_th: { type: "string" },
  },
  required: [
    "verdict_tag",
    "recommendation_th",
    "avoid_reason_th",
    "avoid_ingredients_th",
    "headline_th",
    "summary_th",
    "evidence_based_findings_th",
    "uncertain_points_th",
    "suggested_improvements_th",
    "evidence_sufficiency",
    "disclaimer_th",
  ],
};

function validateRequiredFields(obj, requiredFields) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  return requiredFields.every((key) =>
    Object.prototype.hasOwnProperty.call(obj, key)
  );
}

async function geminiVisionAnalyze({ mimeType, b64 }) {
  const prompt = [
    "วิเคราะห์ภาพอาหารและตอบเป็น JSON เท่านั้นตาม schema",
    "รายงานเฉพาะสิ่งที่เห็นหรือคาดได้จากภาพแบบสั้นมาก",
    "ห้ามอธิบายเกินจำเป็น",
    "ห้ามใส่ข้อความนอก JSON",
    "",
    "allowed observed_traits:",
    "- soup_based",
    "- broth_or_sauce_present",
    "- fried",
    "- stir_fried",
    "- grilled_or_roasted",
    "- steamed_or_boiled",
    "- seafood_present",
    "- vegetable_present",
    "- processed_meat_present",
    "- coconut_milk_possible",
    "- rice_or_noodle_based",
    "- sweetened_drink_or_dessert",
    "",
    "กติกา:",
    "- dish_name_th / dish_name_en = ชื่อเมนูที่คาดว่าใกล้ที่สุด",
    "- visible_ingredients_* = สิ่งที่เห็นชัด",
    "- likely_ingredients_* = สิ่งที่คาดว่าอาจมีแต่ไม่ชัด",
    "- cooking_method = วิธีปรุงหลักหรือรูปแบบจาน",
    "- confidence = 0-100",
    "- image_notes_th = ข้อสังเกตสั้นๆ",
  ].join("\n");

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: mimeType, data: b64 } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 800,
      thinkingConfig: {
        thinkingBudget: 0,
      },
      responseMimeType: "application/json",
      responseJsonSchema: VISION_SCHEMA,
    },
  };

  if (DEBUG) {
    console.log("[vision config]", body.generationConfig);
  }

  const parsed = await geminiCallJsonStrict(body, "vision");

  if (!validateRequiredFields(parsed, VISION_SCHEMA.required)) {
    throw new Error("vision: JSON missing required fields");
  }

  return parsed;
}

function sanitizeVision(raw) {
  return {
    dish_name_th: String(raw?.dish_name_th || "").trim(),
    dish_name_en: String(raw?.dish_name_en || "").trim(),
    visible_ingredients_th: arrOfStrings(raw?.visible_ingredients_th, 25),
    visible_ingredients_en: arrOfStrings(raw?.visible_ingredients_en, 25)
      .map(normalizeText)
      .filter(Boolean),
    likely_ingredients_th: arrOfStrings(raw?.likely_ingredients_th, 25),
    likely_ingredients_en: arrOfStrings(raw?.likely_ingredients_en, 25)
      .map(normalizeText)
      .filter(Boolean),
    cooking_method: String(raw?.cooking_method || "").trim(),
    observed_traits: normalizeObservedTraits(raw?.observed_traits || []),
    confidence: clamp(Number(raw?.confidence || 0), 0, 100),
    image_notes_th: String(raw?.image_notes_th || "").trim(),
  };
}

async function geminiInterpretWithRag({
  imageAnalysis,
  retrievedChunks,
  guidelineMode,
}) {
  const chunkText = retrievedChunks
    .map((c, idx) =>
      [
        `Chunk ${idx + 1}`,
        `source_doc: ${c.source_doc}`,
        `section_title: ${c.section_title}`,
        `pages: ${c.page_start}-${c.page_end}`,
        `text: ${shortEvidenceSummary(c.text)}`,
      ].join("\n")
    )
    .join("\n\n");

const prompt = [
  "คุณเป็นผู้ช่วยสรุปผลการประเมินอาหารจากภาพสำหรับลูกค้าทั่วไป",
  "ตอบเป็น JSON เท่านั้นตาม schema",
  "ให้ใช้ภาษาง่าย ตรง และโยงกลับมาที่ความเสี่ยง stroke โดยตรง",
  "ห้ามใช้ศัพท์วิจัยยาก",
  "ให้สรุปชัดเจนว่าเมนูนี้ทานได้ ทานได้ แต่ควรปรับ หรือควรหลีกเลี่ยง",
  "ถ้าหลักฐานยังไม่พอ ห้ามฟันธงว่าปลอดภัย ให้ใช้คำว่า ทานได้ แต่ควรปรับ",
  "",
  `guideline_mode: ${guidelineMode}`,
  "",
  "ข้อมูลจากภาพ:",
  JSON.stringify(imageAnalysis),
  "",
  "หลักฐาน:",
  chunkText || "ไม่มีหลักฐาน",
  "",
  "กติกา:",
  "- verdict_tag = ทานได้ / ทานได้ แต่ควรปรับ / ควรหลีกเลี่ยง",
  "- recommendation_th = ประโยคสั้นที่บอกผลหลักกับความเสี่ยง stroke โดยตรง",
  "- avoid_reason_th = ถ้าควรหลีกเลี่ยงหรือทานได้ แต่ควรปรับ ให้บอกเหตุผลสั้น ๆ ว่าเพราะอะไร",
  "- avoid_ingredients_th = ระบุวัตถุดิบจากในรูปหรือวัตถุดิบที่น่าจะมีในเมนูนี้ที่ควรระวัง/ควรเลี่ยง ไม่เกิน 4 รายการ",
  "- headline_th = ประโยคสั้นเข้าใจง่าย",
  "- summary_th = ไม่เกิน 2 ประโยค",
  "- evidence_based_findings_th = ไม่เกิน 3 ข้อ",
  "- uncertain_points_th = ไม่เกิน 2 ข้อ",
  "- suggested_improvements_th = ไม่เกิน 3 ข้อ",
  "",
  "สำคัญ:",
  "- ให้เน้นสิ่งที่เห็นจริงในรูป เช่น น้ำซุป ของทอด กะทิ น้ำพริกเผา เครื่องปรุงเค็ม",
  "- ถ้ารูประบุไม่ได้ชัด ให้ใส่ไว้ใน uncertain_points_th",
  "- ถ้าไม่มีวัตถุดิบที่ควรระวังชัดเจน ให้ avoid_ingredients_th เป็น []",
].join("\n");

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2200,
      thinkingConfig: {
        thinkingBudget: 256,
      },
      responseMimeType: "application/json",
      responseJsonSchema: INTERPRET_SCHEMA,
    },
  };

  if (DEBUG) {
    console.log("[interpret config]", body.generationConfig);
  }

  const parsed = await geminiCallJsonStrict(body, "interpret");

  if (!validateRequiredFields(parsed, INTERPRET_SCHEMA.required)) {
    throw new Error("interpret: JSON missing required fields");
  }

  return parsed;
}

function sanitizeInterpretation(raw) {
  const verdictTag = [
    "ทานได้",
    "ทานได้ แต่ควรปรับ",
    "ควรหลีกเลี่ยง",
  ].includes(String(raw?.verdict_tag))
    ? String(raw?.verdict_tag)
    : null;

  const evidenceSufficiency = ["strong", "moderate", "limited"].includes(
    String(raw?.evidence_sufficiency)
  )
    ? String(raw?.evidence_sufficiency)
    : null;

  if (!verdictTag || !evidenceSufficiency) {
    throw new Error("interpret: invalid schema values");
  }

  return {
    verdict_tag: verdictTag,
    recommendation_th: String(raw?.recommendation_th || "").trim(),
    avoid_reason_th: String(raw?.avoid_reason_th || "").trim(),
    avoid_ingredients_th: arrOfStrings(raw?.avoid_ingredients_th, 4),
    headline_th: String(raw?.headline_th || "").trim(),
    summary_th: String(raw?.summary_th || "").trim(),
    evidence_based_findings_th: arrOfStrings(
      raw?.evidence_based_findings_th,
      8
    ),
    uncertain_points_th: arrOfStrings(raw?.uncertain_points_th, 8),
    suggested_improvements_th: arrOfStrings(
      raw?.suggested_improvements_th,
      8
    ),
    evidence_sufficiency: evidenceSufficiency,
    disclaimer_th: String(raw?.disclaimer_th || "").trim(),
  };
}

/* ------------------------- */
/* routes                    */
/* ------------------------- */

app.get("/", (req, res) => {
  res.send("OK");
});

app.get("/health", (req, res) => {
  const rag = loadRagIndex();

  res.json({
    ok: true,
    model: MODEL,
    key_hint: GEMINI_API_KEY
      ? `${GEMINI_API_KEY.slice(0, 6)}...${GEMINI_API_KEY.slice(-4)}`
      : "(empty)",
    rag_ready: rag.ok && rag.chunks.length > 0,
    guideline_docs: rag.documents.length,
    chunks: rag.chunks.length,
    default_guideline_mode: DEFAULT_GUIDELINE_MODE,
    rag_error: rag.error || "",
  });
});

app.post("/analyze", upload.single("image"), async (req, res) => {
  let tmpPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "missing image",
      });
    }

    tmpPath = req.file.path;
    const mimeType = req.file.mimetype || "image/jpeg";
    const b64 = fs.readFileSync(tmpPath, { encoding: "base64" });

    try {
      fs.unlinkSync(tmpPath);
      tmpPath = null;
    } catch {}

    const guidelineModeRaw = String(
      req.body?.guideline_mode || DEFAULT_GUIDELINE_MODE
    ).trim();

    const guideline_mode =
      guidelineModeRaw === "secondary_prevention"
        ? "secondary_prevention"
        : "primary_prevention";

    const rag = loadRagIndex();
    if (!rag.ok || rag.chunks.length === 0) {
      return res.status(500).json({
        success: false,
        error: "RAG index not ready",
      });
    }

    const visionRaw = await geminiVisionAnalyze({ mimeType, b64 });
    const imageAnalysis = sanitizeVision(visionRaw);

    const retrieval = retrieveRelevantChunks(
      rag,
      imageAnalysis,
      guideline_mode,
      RAG_TOPK
    );

    const interpretRaw = await geminiInterpretWithRag({
      imageAnalysis,
      retrievedChunks: retrieval.chunks,
      guidelineMode: guideline_mode,
    });
    const interpretation = sanitizeInterpretation(interpretRaw);

    const references = retrieval.chunks.map((c) => ({
      source_label_th: friendlyDocNameTh(c.source_doc),
      section_title: c.section_title || "Guideline excerpt",
      page_label_th: cleanRangeLabel(c.page_start, c.page_end),
      evidence_summary: shortEvidenceSummary(c.text),
    }));

return res.json({
  success: true,
assessment: {
  dish_name_th: imageAnalysis.dish_name_th,
  dish_name_en: imageAnalysis.dish_name_en,
  dish_confidence: imageAnalysis.confidence,
  verdict_tag: interpretation.verdict_tag,
  recommendation_th: interpretation.recommendation_th,
  avoid_reason_th: interpretation.avoid_reason_th,
  avoid_ingredients_th: interpretation.avoid_ingredients_th,
  headline_th: interpretation.headline_th,
  summary_th: interpretation.summary_th,
},
  image_analysis: {
    visible_ingredients_th: imageAnalysis.visible_ingredients_th,
    likely_ingredients_th: imageAnalysis.likely_ingredients_th,
    cooking_method: imageAnalysis.cooking_method,
    observed_traits: imageAnalysis.observed_traits,
    image_notes_th: imageAnalysis.image_notes_th,
  },
  interpretation: {
    evidence_based_findings_th: interpretation.evidence_based_findings_th,
    uncertain_points_th: interpretation.uncertain_points_th,
    suggested_improvements_th: interpretation.suggested_improvements_th,
    evidence_sufficiency: interpretation.evidence_sufficiency,
    disclaimer_th: interpretation.disclaimer_th,
  },
  references,
});
  } catch (e) {
    if (tmpPath) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {}
    }

    console.error(e);

    return res.status(500).json({
      success: false,
      error: "analysis_failed",
      message: DEBUG ? String(e?.message || e) : undefined,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});