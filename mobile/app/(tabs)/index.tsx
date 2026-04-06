import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useRouter } from "expo-router";
import { setLatestResult, type ApiResponse } from "../../lib/result-store";
import {
  C,
  cleanText,
  pct,
  getDisplayVerdict,
  verdictTone,
  shouldShowWarning,
  Pill,
  Card,
  Button,
  HeaderHero,
  FoodGuidePanel,
  WarningBox,
} from "../../components/stroke-ui";

const API_BASE = "http://10.0.2.2:8080";

type GuidelineMode = "primary_prevention" | "secondary_prevention";
type PickedImage = { uri: string };

const SHOULD_EAT = [
  "ผักใบเขียว เช่น คะน้า ตำลึง ผักโขม",
  "ปลา เช่น ปลานึ่ง ปลาต้ม ปลาเผา",
  "ผลไม้หวานไม่จัด เช่น ฝรั่ง แอปเปิล ชมพู่",
  "ธัญพืชและข้าวไม่ขัดสี เช่น ข้าวกล้อง ข้าวโอ๊ต",
  "ถั่วไม่เค็ม และเต้าหู้",
  "อาหารต้ม นึ่ง อบ รสอ่อน",
] as const;

const SHOULD_AVOID = [
  "อาหารเค็มจัด เช่น ปลาเค็ม ไข่เค็ม ของหมักดอง",
  "ของทอด เช่น ไก่ทอด หมูทอด เฟรนช์ฟรายส์",
  "เครื่องดื่มหวาน เช่น น้ำอัดลม ชานม น้ำหวาน",
  "อาหารแปรรูป เช่น ไส้กรอก แฮม เบคอน",
  "บะหมี่กึ่งสำเร็จรูป ขนมกรุบกรอบ",
  "อาหารกะทิ มันจัด หรือใช้น้ำมันมาก",
] as const;

function fetchWithTimeout(url: string, init: RequestInit, ms = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => {
    clearTimeout(t);
  });
}

function GuideSection() {
  return (
    <Card
      title="แนวทางอาหารเบื้องต้นสำหรับผู้เสี่ยง stroke"
      // subtitle="สรุปให้อ่านง่าย เน้นตัวอย่างอาหารและวัตถุดิบที่ควรเลือกกับควรหลีกเลี่ยง"
      icon="nutrition-outline"
    >
      <FoodGuidePanel
        title="ควรทาน"
        subtitle="เน้นอาหารสด ไขมันต่ำ โซเดียมไม่สูง และปรุงรสอ่อน"
        items={SHOULD_EAT}
        tone="good"
        icon="checkmark-circle-outline"
      />

      <View style={{ height: 12 }} />

      <FoodGuidePanel
        title="ควรหลีกเลี่ยง"
        subtitle="หลีกเลี่ยงอาหารเค็มจัด มันจัด หวานจัด และอาหารแปรรูป"
        items={SHOULD_AVOID}
        tone="bad"
        icon="close-circle-outline"
      />
    </Card>
  );
}

export default function HomeScreen() {
  const router = useRouter();

  const [guidelineMode, setGuidelineMode] =
    useState<GuidelineMode>("primary_prevention");
  const [img, setImg] = useState<PickedImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);

  const dishName = useMemo(() => {
    const th = cleanText(data?.assessment?.dish_name_th || "");
    const en = cleanText(data?.assessment?.dish_name_en || "");
    return th || en || "ยังไม่พบชื่อเมนู";
  }, [data]);

  const displayVerdict = useMemo(() => {
    return getDisplayVerdict(data?.assessment?.verdict_tag);
  }, [data]);

  const warningReason = useMemo(() => {
    const reason = cleanText(data?.assessment?.avoid_reason_th || "");
    if (reason) return reason;

    const items = data?.assessment?.avoid_ingredients_th || [];
    if (items.length) {
      return `ควรระวังส่วนประกอบ เช่น ${items.join(", ")}`;
    }

    return "ควรระวังเรื่องปริมาณโซเดียม ไขมัน หรือส่วนประกอบที่อาจเพิ่มความเสี่ยงต่อผู้ป่วย stroke";
  }, [data]);

  async function pickImage() {
    setData(null);
    setLatestResult(null);

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("ต้องอนุญาตก่อน", "กรุณาอนุญาตให้แอปเข้าถึงรูปภาพ");
      return;
    }

    const mediaTypesConfig =
      (ImagePicker as any).MediaType?.Images
        ? [(ImagePicker as any).MediaType.Images]
        : (ImagePicker as any).MediaTypeOptions?.Images;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mediaTypesConfig,
      quality: 1,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    const normalized = await ImageManipulator.manipulateAsync(asset.uri, [], {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    setImg({ uri: normalized.uri });
  }

  async function analyzeImage() {
    if (!img) {
      Alert.alert("ยังไม่ได้เลือกรูป", "กรุณาเลือกรูปอาหารก่อน");
      return;
    }

    setLoading(true);
    setData(null);
    setLatestResult(null);

    try {
      const form = new FormData();
      form.append("image", {
        uri: img.uri,
        name: "food.jpg",
        type: "image/jpeg",
      } as any);
      form.append("guideline_mode", guidelineMode);

      const resp = await fetchWithTimeout(`${API_BASE}/analyze`, {
        method: "POST",
        body: form,
      });

      const text = await resp.text();
      const json = JSON.parse(text);

      if (!resp.ok || !json?.success) {
        throw new Error("analysis_failed");
      }

      setData(json);
      setLatestResult(json);
    } catch {
      setData({
        success: false,
        error: "analysis_failed",
      } as any);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
      showsVerticalScrollIndicator={false}
    >
      <HeaderHero
        badge="Stroke Food Guide"
        title="ประเมินอาหารจากภาพ"
        subtitle="หน้าแรกจะแสดงคำแนะนำอาหารเบื้องต้น และสรุปผลวิเคราะห์ให้เข้าใจง่ายสำหรับผู้ใช้งานบนมือถือ"
        icon="restaurant-outline"
      />

      <View style={{ height: 14 }} />

      <GuideSection />

      <View style={{ height: 14 }} />

      <Card
        title="เลือกกลุ่มเป้าหมาย"
        subtitle="เลือกให้ตรงกับผู้ใช้งาน เพื่อให้ระบบประเมินได้เหมาะสมมากขึ้น"
        icon="people-outline"
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <Pressable onPress={() => setGuidelineMode("primary_prevention")}>
            <Pill
              text="คนทั่วไป"
              tone={guidelineMode === "primary_prevention" ? "good" : "neutral"}
              icon="person-outline"
            />
          </Pressable>

          <Pressable onPress={() => setGuidelineMode("secondary_prevention")}>
            <Pill
              text="เคยมี stroke / TIA มาก่อน"
              tone={guidelineMode === "secondary_prevention" ? "warn" : "neutral"}
              icon="medical-outline"
            />
          </Pressable>
        </View>
      </Card>

      <View style={{ height: 14 }} />

      <Card
        title="เลือกรูปอาหาร"
        subtitle="เลือกรูปที่เห็นอาหารชัดเจน จะช่วยให้ระบบวิเคราะห์ได้ดีขึ้น"
        icon="image-outline"
      >
        <Button
          label="เลือกรูปจากเครื่อง"
          onPress={pickImage}
          disabled={loading}
          variant="secondary"
          icon="images-outline"
        />

        {img?.uri ? (
          <View style={{ marginTop: 14 }}>
            <Image
              source={{ uri: img.uri }}
              style={{
                width: "100%",
                height: 250,
                borderRadius: 20,
                backgroundColor: "#0b1220",
              }}
            />

            <View style={{ height: 12 }} />

            <Button
              label={loading ? "กำลังประเมิน..." : "ประเมินจากภาพ"}
              onPress={analyzeImage}
              disabled={loading}
              variant="primary"
              icon="sparkles-outline"
            />
          </View>
        ) : (
          <View
            style={{
              marginTop: 14,
              borderWidth: 1,
              borderColor: C.border,
              borderStyle: "dashed",
              borderRadius: 18,
              paddingVertical: 24,
              paddingHorizontal: 16,
              alignItems: "center",
              backgroundColor: "#0a1320",
            }}
          >
            <Text style={{ color: C.muted }}>ยังไม่ได้เลือกรูป</Text>
            <Text style={{ color: "#7891ab", marginTop: 6, fontSize: 12 }}>
              รองรับรูปอาหารจากแกลเลอรี
            </Text>
          </View>
        )}
      </Card>

      {loading && (
        <View style={{ marginTop: 18, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ color: C.muted, marginTop: 10 }}>
            กำลังวิเคราะห์และสรุปผล...
          </Text>
        </View>
      )}

      {!!data?.error && (
        <View style={{ marginTop: 14 }}>
          <Card
            title="ยังประเมินไม่สำเร็จ"
            subtitle="กรุณาลองใหม่อีกครั้ง"
            icon="alert-circle-outline"
          >
            <Text style={{ color: "#ffd7dc", lineHeight: 21 }}>
              ระบบยังไม่สามารถสรุปผลจากรูปนี้ได้ในรอบนี้
            </Text>
          </Card>
        </View>
      )}

      {data?.success && (
        <View style={{ marginTop: 14 }}>
          <Card
            title="ผลประเมินหลัก"
            subtitle="สรุปเฉพาะข้อมูลสำคัญ"
            icon="sparkles-outline"
            right={
              <Pill
                text={displayVerdict}
                tone={verdictTone(data.assessment.verdict_tag)}
                icon="shield-checkmark-outline"
              />
            }
          >
            <Text style={{ color: C.muted, marginBottom: 6 }}>
              ระบบคาดว่าเมนูนี้คือ
            </Text>

            <Text style={{ color: C.text, fontSize: 24, fontWeight: "900" }}>
              {dishName}
            </Text>

            <View style={{ marginTop: 10 }}>
              <Pill
                text={`มั่นใจว่าเป็นเมนูนี้ ${pct(data.assessment.dish_confidence)}`}
                tone="accent"
                icon="analytics-outline"
              />
            </View>

            <Text style={{ color: C.text, marginTop: 12, lineHeight: 22 }}>
              {data.assessment.recommendation_th}
            </Text>

            <Text style={{ color: C.muted, marginTop: 10, lineHeight: 21 }}>
              {data.assessment.summary_th}
            </Text>

            {shouldShowWarning(data.assessment.verdict_tag) && (
              <WarningBox
                text={warningReason}
                items={data.assessment.avoid_ingredients_th || []}
                danger={data.assessment.verdict_tag === "ควรหลีกเลี่ยง"}
              />
            )}

            <View style={{ height: 14 }} />

            <Button
              label="ดูข้อมูลเพิ่มเติม"
              onPress={() => router.push("/result-detail")}
              variant="secondary"
              icon="arrow-forward-outline"
            />
          </Card>
        </View>
      )}
    </ScrollView>
  );
}