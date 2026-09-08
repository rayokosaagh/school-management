"use client";

import { createContext, useContext } from "react";
import {
  DEFAULT_LANGUAGE,
  translate,
  translateInterface,
  type Language,
} from "@/lib/i18n/translations";

type LanguageContextValue = {
  language: Language;
  t: (source: string) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  t: (source) => source,
});

export function LanguageProvider({
  language,
  children,
}: {
  language: Language;
  children: React.ReactNode;
}) {
  return (
    <LanguageContext.Provider value={{ language, t: (source) => translate(language, source) }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useTranslatedChildren(children: React.ReactNode) {
  const { t } = useLanguage();
  if (Array.isArray(children)) {
    return children.map((child) => (typeof child === "string" ? t(child) : child));
  }
  return typeof children === "string" ? t(children) : children;
}

export function TranslatedText({ children }: { children: string }) {
  const { language } = useLanguage();
  return <>{translateInterface(language, children)}</>;
}
