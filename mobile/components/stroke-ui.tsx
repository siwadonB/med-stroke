import React, { type ComponentProps, type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

export const C = {
  bg: "#08111b",
  card: "#0d1724",
  border: "#1a2a40",
  text: "#eef2f7",
  muted: "#9fb0c3",
  accent: "#5aa8ff",
  good: "#22c55e",
  warn: "#f59e0b",
  bad: "#ef4444",
  goodBg: "#0d2218",
  warnBg: "#2a210f",
  badBg: "#2a1216",
  softBlue: "#0f1d2d",
};

export type Tone = "neutral" | "accent" | "good" | "warn" | "bad";
type IconName = ComponentProps<typeof Ionicons>["name"];

export function cleanText(s: string) {
  return String(s || "").replace(/\r/g, "").trim();
}

export function pct(n?: number) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0%";
  return `${Math.max(0, Math.min(100, Math.round(v)))}%`;
}

export function getDisplayVerdict(v?: string) {
  if (v === "ทานได้") return "ทานได้มีความเหมาะสม";
  if (v === "ทานได้ แต่ควรปรับ") return "ทานได้แต่ควรระวัง";
  if (v === "ควรหลีกเลี่ยง") return "ทานได้แต่ควรระวัง";
  return "อยู่ระหว่างประเมิน";
}

export function verdictTone(v?: string): Tone {
  if (v === "ทานได้") return "good";
  if (v === "ทานได้ แต่ควรปรับ") return "warn";
  if (v === "ควรหลีกเลี่ยง") return "bad";
  return "neutral";
}

export function shouldShowWarning(v?: string) {
  return v === "ทานได้ แต่ควรปรับ" || v === "ควรหลีกเลี่ยง";
}

export function Pill({
  text,
  tone = "neutral",
  icon,
}: {
  text: string;
  tone?: Tone;
  icon?: IconName;
}) {
  const bg =
    tone === "accent"
      ? "#13253c"
      : tone === "good"
        ? "#0e2a1a"
        : tone === "warn"
          ? "#2c220f"
          : tone === "bad"
            ? "#2b1013"
            : "#0b1522";

  const bd =
    tone === "accent"
      ? "#29466d"
      : tone === "good"
        ? "#226b3d"
        : tone === "warn"
          ? "#835f19"
          : tone === "bad"
            ? "#7a2830"
            : C.border;

  const fg =
    tone === "accent"
      ? C.accent
      : tone === "good"
        ? C.good
        : tone === "warn"
          ? C.warn
          : tone === "bad"
            ? C.bad
            : C.muted;

  return (
    <View
      style={{
        backgroundColor: bg,
        borderColor: bd,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginRight: 8,
        marginBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
      }}
    >
      {!!icon && (
        <Ionicons
          name={icon}
          size={14}
          color={fg}
          style={{ marginRight: 6 }}
        />
      )}
      <Text style={{ color: fg, fontWeight: "900" }}>{text}</Text>
    </View>
  );
}

export function Card({
  title,
  subtitle,
  right,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: C.card,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: C.border,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: "#142233",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {!!icon && (
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  backgroundColor: "#122238",
                  borderWidth: 1,
                  borderColor: "#29466d",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 10,
                }}
              >
                <Ionicons name={icon} size={15} color={C.accent} />
              </View>
            )}

            <Text style={{ color: C.text, fontSize: 17, fontWeight: "900", flex: 1 }}>
              {title}
            </Text>
          </View>

          {!!subtitle && (
            <Text style={{ color: C.muted, marginTop: 8, lineHeight: 19 }}>
              {subtitle}
            </Text>
          )}
        </View>

        {right}
      </View>

      <View style={{ padding: 16 }}>{children}</View>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "secondary",
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  icon?: IconName;
  disabled?: boolean;
}) {
  const bg = disabled
    ? "#1c2838"
    : variant === "primary"
      ? C.accent
      : "#122238";

  const fg = variant === "primary" ? "#071019" : C.accent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: bg,
        borderRadius: 18,
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        borderWidth: variant === "secondary" ? 1 : 0,
        borderColor: variant === "secondary" ? "#284664" : "transparent",
        opacity: disabled ? 0.8 : 1,
      }}
    >
      {!!icon && (
        <Ionicons
          name={icon}
          size={16}
          color={fg}
          style={{ marginRight: 8 }}
        />
      )}
      <Text style={{ color: fg, fontWeight: "900", fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function HeaderHero({
  badge,
  title,
  subtitle,
  icon = "sparkles-outline",
}: {
  badge: string;
  title: string;
  subtitle: string;
  icon?: IconName;
}) {
  return (
    <View
      style={{
        backgroundColor: C.softBlue,
        borderColor: "#1a3150",
        borderWidth: 1,
        borderRadius: 28,
        padding: 18,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Pill text={badge} tone="accent" icon="sparkles-outline" />
          <Text
            style={{
              color: C.text,
              fontSize: 24,
              fontWeight: "900",
              marginTop: 2,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              color: C.muted,
              marginTop: 8,
              lineHeight: 21,
              fontSize: 14,
            }}
          >
            {subtitle}
          </Text>
        </View>

        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 18,
            backgroundColor: "#122238",
            borderWidth: 1,
            borderColor: "#29466d",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={26} color={C.accent} />
        </View>
      </View>
    </View>
  );
}

export function DotRow({
  text,
  color,
}: {
  text: string;
  color: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: 10,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          backgroundColor: color,
          marginTop: 7,
          marginRight: 10,
        }}
      />
      <Text style={{ color: C.text, flex: 1, lineHeight: 22 }}>{text}</Text>
    </View>
  );
}

export function SectionList({
  items,
  tone = "accent",
  emptyText = "ยังไม่มีข้อมูลส่วนนี้",
}: {
  items: string[];
  tone?: "accent" | "good" | "warn" | "bad";
  emptyText?: string;
}) {
  const color =
    tone === "good"
      ? C.good
      : tone === "warn"
        ? C.warn
        : tone === "bad"
          ? C.bad
          : C.accent;

  if (!items.length) {
    return <Text style={{ color: C.muted }}>{emptyText}</Text>;
  }

  return (
    <View>
      {items.map((item, idx) => (
        <DotRow key={`${item}-${idx}`} text={item} color={color} />
      ))}
    </View>
  );
}

export function FoodGuidePanel({
  title,
  subtitle,
  items,
  tone,
  icon,
}: {
  title: string;
  subtitle: string;
  items: readonly string[];
  tone: "good" | "bad";
  icon: IconName;
}) {
  const panelBg = tone === "good" ? C.goodBg : C.badBg;
  const borderColor = tone === "good" ? "#1e6b42" : "#7a2830";
  const titleColor = tone === "good" ? "#92f0b7" : "#ffb8c0";
  const dotColor = tone === "good" ? C.good : C.bad;

  return (
    <View
      style={{
        backgroundColor: panelBg,
        borderRadius: 20,
        borderWidth: 1,
        borderColor,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            backgroundColor: tone === "good" ? "#123321" : "#34151a",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
          }}
        >
          <Ionicons name={icon} size={18} color={titleColor} />
        </View>

        <Text style={{ color: titleColor, fontSize: 16, fontWeight: "900", flex: 1 }}>
          {title}
        </Text>
      </View>

      <Text
        style={{
          color: C.muted,
          marginBottom: 12,
          lineHeight: 20,
        }}
      >
        {subtitle}
      </Text>

      {items.map((item, idx) => (
        <DotRow key={`${title}-${idx}`} text={item} color={dotColor} />
      ))}
    </View>
  );
}

export function WarningBox({
  title = "ควรระวังอะไร",
  text,
  items = [],
  danger = false,
}: {
  title?: string;
  text: string;
  items?: string[];
  danger?: boolean;
}) {
  const borderColor = danger ? "#7a2830" : "#835f19";
  const bgColor = danger ? "#2b1013" : "#2c220f";
  const titleColor = danger ? "#ffb8c0" : "#ffd48a";
  const pillTone: Tone = danger ? "bad" : "warn";

  return (
    <View
      style={{
        marginTop: 14,
        padding: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor,
        backgroundColor: bgColor,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <Ionicons
          name={danger ? "warning-outline" : "alert-circle-outline"}
          size={18}
          color={titleColor}
          style={{ marginRight: 8 }}
        />
        <Text
          style={{
            color: titleColor,
            fontWeight: "900",
            fontSize: 15,
          }}
        >
          {title}
        </Text>
      </View>

      <Text style={{ color: C.text, lineHeight: 22 }}>{text}</Text>

      {!!items.length && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
          {items.map((item, idx) => (
            <Pill key={`${item}-${idx}`} text={item} tone={pillTone} />
          ))}
        </View>
      )}
    </View>
  );
}