import { lookupWord } from "../data/mockDictionary";
import type { LookupEntry } from "../types";

type DictionaryApiEntry = {
  phonetics?: Array<{
    text?: string;
  }>;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{
      definition?: string;
      example?: string;
    }>;
  }>;
};

function normalizeWord(rawWord: string) {
  return rawWord.toLowerCase().replace(/[^a-z'-]/g, "");
}

export async function fetchWordDefinition(rawWord: string): Promise<LookupEntry> {
  const normalized = normalizeWord(rawWord);

  if (!normalized) {
    return lookupWord(rawWord);
  }

  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalized)}`
    );

    if (!response.ok) {
      throw new Error(`Dictionary lookup failed with status ${response.status}`);
    }

    const data = (await response.json()) as DictionaryApiEntry[];
    const firstEntry = data[0];
    const firstMeaning = firstEntry?.meanings?.[0];
    const firstDefinition = firstMeaning?.definitions?.[0];
    const backup = lookupWord(rawWord);

    return {
      word: normalized,
      phonetic:
        firstEntry?.phonetics?.find((item) => item.text?.trim())?.text || backup.phonetic,
      meaning: firstDefinition?.definition || backup.meaning,
      englishMeaning: firstMeaning?.partOfSpeech
        ? `${firstMeaning.partOfSpeech}: ${firstDefinition?.definition || backup.englishMeaning}`
        : backup.englishMeaning,
      example: firstDefinition?.example || backup.example
    };
  } catch {
    return lookupWord(rawWord);
  }
}
