import type { Metadata } from "next";

export const metadata: Metadata = { title: "Яндекс Мед · профессиональная навигация", description: "Источники, рекомендации и профессиональные знания врача." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
