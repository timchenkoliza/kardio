import type { Metadata } from "next";
import "./styles/tokens.css";
import "./styles/specialty-palettes.css";
import "./styles/product-v1.css";
import "./styles/shell-modes.css";
import "./styles/workspace-agent.css";
import "./styles/workspace-case-surface.css";
import "./styles/workspace-integrated.css";
import "./styles/clinical-case-registry.css";
import "./styles/workspace-professional.css";
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
import "./styles/gen-ui.css";
import "./styles/editorial-blocks.css";
import "./styles/oncology-starter.css";
import "./styles/specialty-visual-pass.css";
import "./styles/pixel-reference-v2.css";
import "./styles/feed-art-direction.css";
import "./styles/prototype-media.css";
import "./styles/decision-workspaces.css";
import "./styles/layout-stability.css";

export const metadata: Metadata = { title: "Яндекс Мед · профессиональная навигация", description: "Источники, рекомендации и профессиональные знания врача." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
