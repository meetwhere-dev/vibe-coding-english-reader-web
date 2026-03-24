export type PageId = "library" | "reader" | "vocabulary" | "review";

export type Chapter = {
  id: string;
  label: string;
  content: string;
  images?: string[];
  isImageHeavy?: boolean;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  cover: string;
  progress: number;
  lastOpenedAt: string;
  chapters: Chapter[];
  activeChapterId: string;
  sourceFileName?: string;
};

export type LookupEntry = {
  word: string;
  phonetic: string;
  meaning: string;
  englishMeaning: string;
  example: string;
};

export type VocabularyItem = LookupEntry & {
  id: string;
  bookId: string;
  bookTitle: string;
  context: string;
  addedAt: string;
  familiarity: "new" | "learning" | "known";
  reviewCount: number;
};

export type ReviewRating = "again" | "hard" | "good";

export type ReaderTheme = "paper" | "mist" | "night";

export type ReaderSettings = {
  fontSize: number;
  lineHeight: number;
  theme: ReaderTheme;
};
