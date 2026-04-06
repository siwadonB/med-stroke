import React, { useMemo } from "react";
import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { getLatestResult } from "../lib/result-store";
import {
  C,
  cleanText,
  getDisplayVerdict,
  verdictTone,
  shouldShowWarning,
  Pill,
  Card,
  Button,
  HeaderHero,
  SectionList,
  WarningBox,
} from "../components/stroke-ui";

export default function ResultDetailScreen() {
  const router = useRouter();
  const data = getLatestResult();

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

  if (!data?.success) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: C.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      >
        <HeaderHero
          badge="Result Detail"
          title="ยังไม่มีข้อมูลผลประเมิน"
          subtitle="กรุณากลับไปที่หน้าแรกแล้ววิเคราะห์รูปอาหารก่อน"
          icon="document-text-outline"
        />

        <View style={{ height: 14 }} />

        <Button
          label="กลับหน้าหลัก"
          onPress={() => router.back()}
          icon="arrow-back-outline"
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
      showsVerticalScrollIndicator={false}
    >
      <HeaderHero
        badge="Result Detail"
        title="รายละเอียดผลการประเมิน"
        subtitle="แสดงเหตุผล วัตถุดิบที่ควรระวัง และแนวทางปรับอาหารในมื้อต่อไป"
        icon="document-text-outline"
      />

      <View style={{ height: 14 }} />

      <Button
        label="กลับหน้าหลัก"
        onPress={() => router.back()}
        icon="arrow-back-outline"
      />

      <View style={{ height: 14 }} />

      <Card
        title="สรุปผลหลัก"
        subtitle={dishName}
        icon="sparkles-outline"
        right={
          <Pill
            text={displayVerdict}
            tone={verdictTone(data.assessment.verdict_tag)}
            icon="shield-checkmark-outline"
          />
        }
      >
        <Text style={{ color: C.text, lineHeight: 22 }}>
          {data.assessment.recommendation_th || "ไม่มีข้อเสนอแนะเพิ่มเติม"}
        </Text>

        <Text style={{ color: C.muted, marginTop: 10, lineHeight: 21 }}>
          {data.assessment.summary_th || "ไม่มีข้อมูลสรุปเพิ่มเติม"}
        </Text>
      </Card>

      {shouldShowWarning(data.assessment.verdict_tag) && (
        <WarningBox
          text={warningReason}
          items={data.assessment.avoid_ingredients_th || []}
          danger={data.assessment.verdict_tag === "ควรหลีกเลี่ยง"}
        />
      )}

      <View style={{ height: 14 }} />

      <Card
        title="เหตุผลที่ระบบใช้ประเมิน"
        subtitle="สรุปประเด็นสำคัญจากการวิเคราะห์เมนูและข้อมูลอ้างอิง"
        icon="bulb-outline"
      >
        <SectionList
          items={data.interpretation.evidence_based_findings_th || []}
          tone="accent"
          emptyText="ยังไม่มีข้อมูลส่วนนี้"
        />
      </Card>

      <View style={{ height: 14 }} />

      <Card
        title="แนวทางปรับมื้อถัดไป"
        subtitle="ข้อเสนอแนะเพื่อทำให้มื้อนี้เหมาะสมขึ้น"
        icon="leaf-outline"
      >
        <SectionList
          items={data.interpretation.suggested_improvements_th || []}
          tone="good"
          emptyText="ยังไม่มีคำแนะนำเพิ่มเติม"
        />
      </Card>

      <View style={{ height: 14 }} />

      <Card
        title="สิ่งที่ยังไม่แน่ชัด"
        subtitle="บางจุดอาจประเมินได้ไม่ครบจากภาพเพียงอย่างเดียว"
        icon="help-circle-outline"
      >
        <SectionList
          items={data.interpretation.uncertain_points_th || []}
          tone="warn"
          emptyText="ไม่มีประเด็นสำคัญเพิ่มเติม"
        />
      </Card>

      {!!data.references?.length && (
        <>
          <View style={{ height: 14 }} />

          <Card
            title="ข้อมูลอ้างอิง"
            subtitle="เอกสารหรือหัวข้อที่ระบบใช้ประกอบการสรุปผล"
            icon="library-outline"
          >
            {data.references.map((ref, idx) => (
              <View
                key={`${ref.section_title}-${idx}`}
                style={{
                  backgroundColor: "#0a1320",
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: C.border,
                  padding: 14,
                  marginBottom: idx === data.references.length - 1 ? 0 : 10,
                }}
              >
                <Text style={{ color: C.text, fontWeight: "900", fontSize: 15 }}>
                  {ref.section_title || "ไม่มีชื่อหัวข้อ"}
                </Text>

                {!!ref.source_label_th && (
                  <Text style={{ color: C.accent, marginTop: 6 }}>
                    {ref.source_label_th}
                  </Text>
                )}

                {!!ref.page_label_th && (
                  <Text style={{ color: C.muted, marginTop: 4 }}>
                    {ref.page_label_th}
                  </Text>
                )}

                {!!ref.evidence_summary && (
                  <Text style={{ color: C.text, marginTop: 8, lineHeight: 22 }}>
                    {ref.evidence_summary}
                  </Text>
                )}
              </View>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}