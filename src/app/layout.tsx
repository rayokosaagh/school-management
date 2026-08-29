import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_Devanagari, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { getLetterhead } from "@/lib/registry/school";

const sans = Plus_Jakarta_Sans({
  variable: "--font-ui-sans",
  subsets: ["latin"],
  display: "swap",
});

// Nepali names and BS dates appear throughout; without a Devanagari face they
// fall back to whatever the operating system happens to have installed.
const devanagari = Noto_Sans_Devanagari({
  variable: "--font-ui-devanagari",
  subsets: ["devanagari"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-ui-mono",
  subsets: ["latin"],
  display: "swap",
});

/// Read at request time so renaming the school in Settings shows in the browser
/// tab without a rebuild.
export async function generateMetadata(): Promise<Metadata> {
  const school = await getLetterhead();
  return {
    title: school.configured ? school.name : "School Management",
    description: "Students, staff, classes, subjects, attendance and exams.",
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${devanagari.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
