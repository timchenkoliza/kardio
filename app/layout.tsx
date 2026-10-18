import type { Metadata } from "next";
import "./styles/tokens.css";
import "./styles/specialty-palettes.css";
import "./styles/product-v1.css";
import "./styles/shell-modes.css";
import "./styles/workspace-agent.css";
import "./styles/guidance.css";
import "./styles/pbz-context.css";
import "./styles/pixel-pass-v1.css";
import "./styles/detail-media.css";
import "./styles/lavka-pass-v2.css";
import "./styles/lavka-pass-v3.css";
import "./styles/lavka-pass-v4.css";
import "./styles/clinical-tools.css";
import "./styles/content-completeness.css";
import "./styles/education.css";

export const metadata: Metadata = { title: "Яндекс Мед · профессиональная навигация", description: "Источники, рекомендации и профессиональные знания врача." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
