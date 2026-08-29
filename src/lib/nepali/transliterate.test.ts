import { describe, expect, it } from "vitest";
import { isDevanagari, transliterateName } from "./transliterate";

describe("transliterateName", () => {
  it("uses the dictionary for names the rules would spell wrongly", () => {
    // Rule-based these come out with short vowels; the conventional spelling is long.
    expect(transliterateName("Sita")).toBe("सीता");
    expect(transliterateName("Gita")).toBe("गीता");
    expect(transliterateName("Puja")).toBe("पूजा");
  });

  it("handles a full name word by word", () => {
    expect(transliterateName("Sita Sharma")).toBe("सीता शर्मा");
    expect(transliterateName("Ramesh Bahadur Thapa")).toBe("रमेश बहादुर थापा");
  });

  it("is case insensitive", () => {
    expect(transliterateName("SITA SHARMA")).toBe("सीता शर्मा");
    expect(transliterateName("sita sharma")).toBe("सीता शर्मा");
  });

  it("falls back to letter rules for names not in the dictionary", () => {
    // Not a listed name; the rules should still produce readable Devanagari.
    expect(transliterateName("Kamal")).toBe("कमल");
    expect(transliterateName("Bimal")).toBe("बिमल");
  });

  it("keeps a word-final consonant without a halant", () => {
    // राम, not राम्.
    expect(transliterateName("Kamal").endsWith("्")).toBe(false);
  });

  it("gives a word-initial vowel its standalone form", () => {
    expect(transliterateName("Anil").startsWith("अ")).toBe(true);
    expect(transliterateName("Om").startsWith("ओ")).toBe(true);
  });

  it("prefers longer digraphs over shorter ones", () => {
    // "chh" must not be read as "ch" + "h".
    expect(transliterateName("Chhiring").startsWith("छ")).toBe(true);
    // "kh" must not be read as "k" + "h".
    expect(transliterateName("Khadka").startsWith("ख")).toBe(true);
  });

  it("collapses whitespace and ignores punctuation in the key", () => {
    expect(transliterateName("  Sita   Sharma  ")).toBe("सीता शर्मा");
  });

  it("returns empty for empty input", () => {
    expect(transliterateName("")).toBe("");
    expect(transliterateName("   ")).toBe("");
  });

  it("produces only Devanagari and spaces for ordinary names", () => {
    const out = transliterateName("Ramesh Thapa");
    expect(/^[ऀ-ॿ\s]+$/.test(out)).toBe(true);
  });
});

describe("isDevanagari", () => {
  it("detects Devanagari text", () => {
    expect(isDevanagari("सीता शर्मा")).toBe(true);
  });

  it("rejects plain Latin", () => {
    expect(isDevanagari("Sita Sharma")).toBe(false);
    expect(isDevanagari("")).toBe(false);
  });
});
