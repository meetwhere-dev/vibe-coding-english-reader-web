import type { LookupEntry } from "../types";

const baseDictionary: Record<string, LookupEntry> = {
  curious: {
    word: "curious",
    phonetic: "/'kjʊriəs/",
    meaning: "好奇的；求知欲强的",
    englishMeaning: "eager to know or learn something",
    example: "A curious reader notices how every new word opens another door."
  },
  voyage: {
    word: "voyage",
    phonetic: "/'vɔɪɪdʒ/",
    meaning: "航行；旅行",
    englishMeaning: "a long journey, especially by sea or through space",
    example: "Their voyage began with a single page and a brave question."
  },
  lantern: {
    word: "lantern",
    phonetic: "/'læntərn/",
    meaning: "灯笼；提灯",
    englishMeaning: "a lamp with a transparent case protecting the flame or bulb",
    example: "The lantern glowed across the quiet harbor."
  },
  harbor: {
    word: "harbor",
    phonetic: "/'hɑːrbər/",
    meaning: "港口；庇护所",
    englishMeaning: "a place on the coast where vessels may find shelter",
    example: "The small harbor was calm before sunrise."
  },
  patient: {
    word: "patient",
    phonetic: "/'peɪʃənt/",
    meaning: "耐心的",
    englishMeaning: "able to accept delays without becoming upset",
    example: "A patient learner returns to difficult words with confidence."
  },
  shimmered: {
    word: "shimmer",
    phonetic: "/'ʃɪmər/",
    meaning: "闪烁；微微发光",
    englishMeaning: "to shine with a soft trembling light",
    example: "The water shimmered under the afternoon sun."
  }
};

const fallbackMeanings = [
  "与上下文有关的重点词",
  "阅读时值得记录的表达",
  "建议结合原句继续理解"
];

export function lookupWord(rawWord: string): LookupEntry {
  const normalized = rawWord.toLowerCase().replace(/[^a-z'-]/g, "");

  if (baseDictionary[normalized]) {
    return baseDictionary[normalized];
  }

  const lemma = normalized.replace(/(ing|ed|es|s)$/, "");
  if (baseDictionary[lemma]) {
    return {
      ...baseDictionary[lemma],
      word: normalized
    };
  }

  const meaningIndex = normalized.length % fallbackMeanings.length;

  return {
    word: normalized || rawWord,
    phonetic: "/auto/",
    meaning: fallbackMeanings[meaningIndex],
    englishMeaning: "A context-based word captured from your reading session",
    example: `You tapped "${rawWord}" while reading, so it was saved for later review.`
  };
}
