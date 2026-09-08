import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Geist,
  Geist_Mono,
  Noto_Sans_Devanagari,
} from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeBootstrap } from "@/components/ui/theme-bootstrap";
import { getLetterhead } from "@/lib/registry/school";
import { LanguageProvider } from "@/components/i18n/language-provider";

const display = Bricolage_Grotesque({
  variable: "--font-display-face",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
});

const body = Geist({
  variable: "--font-body-face",
  subsets: ["latin"],
  display: "swap",
});

// Nepali names and BS dates appear throughout; without a Devanagari face they
// fall back to whatever the operating system happens to have installed.
const devanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari-face",
  subsets: ["devanagari"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  display: "swap",
});

/// Read at request time so renaming the school in Settings shows in the browser
/// tab without a rebuild.
export async function generateMetadata(): Promise<Metadata> {
  const school = await getLetterhead();
  return {
    title: school.configured ? school.displayName : "School Management",
    description:
      school.language === "ne"
        ? "विद्यार्थी, कर्मचारी, कक्षा, विषय, हाजिरी र परीक्षाको व्यवस्थापन।"
        : "Students, staff, classes, subjects, attendance and exams.",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const school = await getLetterhead();
  return (
    <html
      lang={school.language}
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${devanagari.variable} ${mono.variable} h-full`}
      >
      <body className="flex min-h-full flex-col">
        <ThemeBootstrap />
        <LanguageProvider language={school.language}>
          <ToastProvider>{children}</ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
