import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LanguageProvider, TranslatedText, useLanguage } from "./language-provider";

function Sample() {
  const { language, t } = useLanguage();
  return <p lang={language}>{t("Students")}</p>;
}

describe("LanguageProvider", () => {
  it("shares the selected language with client UI", () => {
    expect(
      renderToStaticMarkup(
        <LanguageProvider language="ne">
          <Sample />
          <TranslatedText>Settings</TranslatedText>
        </LanguageProvider>,
      ),
    ).toBe('<p lang="ne">विद्यार्थीहरू</p>सेटिङहरू');
  });
});
