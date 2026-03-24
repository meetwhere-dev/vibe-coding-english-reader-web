import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import ePub from "epubjs";
import { Menu, SlidersHorizontal } from "lucide-react";
import { Button } from "./components/ui/button";
import { Sheet } from "./components/ui/sheet";
import { fetchWordDefinition } from "./services/dictionary";
import type {
  Book,
  LookupEntry,
  PageId,
  ReaderSettings,
  ReviewRating,
  VocabularyItem
} from "./types";

type ReaderSelection = LookupEntry & {
  context: string;
  sourceLabel: string;
};

type BookWithWordCount = Book & {
  wordCount: number;
};

const STORAGE_KEYS = {
  books: "lexiflow.books",
  vocabulary: "lexiflow.vocabulary",
  activeBookId: "lexiflow.activeBookId",
  readerSettings: "lexiflow.readerSettings"
} as const;

const defaultReaderSettings: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.95,
  theme: "paper"
};

const sampleBook: Book = {
  id: "sample-book",
  title: "The Lantern Voyage",
  author: "LexiFlow Studio",
  cover:
    "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80",
  progress: 34,
  lastOpenedAt: "2026-03-23 15:00",
  activeChapterId: "chapter-1",
  chapters: [
    {
      id: "chapter-1",
      label: "Chapter 1",
      content:
        "The harbor shimmered before dawn. Mira lifted her lantern and stepped onto the quiet pier, curious about the voyage waiting beyond the fog. She had always believed that patient readers travel farther than hurried ones, because every unfamiliar word becomes a small map."
    },
    {
      id: "chapter-2",
      label: "Chapter 2",
      content:
        "At noon she opened the captain's journal. Each sentence moved like a wave, carrying old names, hidden routes, and a promise that language could turn fear into direction."
    },
    {
      id: "chapter-3",
      label: "Chapter 3",
      content:
        "By night the crew compared notes. They marked difficult phrases, shared meanings, and laughed when the hardest expressions finally felt simple enough to use."
    }
  ]
};

function formatNow() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

function slugifyWord(word: string) {
  return word.toLowerCase().replace(/[^a-z]+/g, "-");
}

function normalizeWord(word: string) {
  return word
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/[^a-z'-]/g, "");
}

function extractTextFromElement(element: Element | null | undefined) {
  if (!element) {
    return "";
  }

  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("script, style").forEach((node) => node.remove());

  return clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("The EPUB image could not be converted."));
    };
    reader.onerror = () => reject(new Error("The EPUB image could not be read."));
    reader.readAsDataURL(blob);
  });
}

function normalizeArchivePath(path: string) {
  if (!path) {
    return path;
  }

  return path.startsWith("/") ? path : `/${path}`;
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function loadBooks(): Book[] {
  if (typeof window === "undefined") {
    return [sampleBook];
  }

  const parsed = safeParse<Book[]>(localStorage.getItem(STORAGE_KEYS.books), []);
  return parsed.length > 0 ? parsed : [sampleBook];
}

function loadVocabulary(): VocabularyItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  return safeParse<VocabularyItem[]>(localStorage.getItem(STORAGE_KEYS.vocabulary), []);
}

function loadActiveBookId(defaultBookId: string) {
  if (typeof window === "undefined") {
    return defaultBookId;
  }

  return localStorage.getItem(STORAGE_KEYS.activeBookId) || defaultBookId;
}

function loadReaderSettings(): ReaderSettings {
  if (typeof window === "undefined") {
    return defaultReaderSettings;
  }

  return {
    ...defaultReaderSettings,
    ...safeParse<Partial<ReaderSettings>>(
      localStorage.getItem(STORAGE_KEYS.readerSettings),
      defaultReaderSettings
    )
  };
}

function App() {
  const [page, setPage] = useState<PageId>("library");
  const [books, setBooks] = useState<Book[]>(() => loadBooks());
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>(() => loadVocabulary());
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => loadReaderSettings());
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [activeBookId, setActiveBookId] = useState<string>(() =>
    loadActiveBookId(loadBooks()[0]?.id || sampleBook.id)
  );
  const [dragging, setDragging] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [vocabularyStatus, setVocabularyStatus] = useState<"all" | "new" | "learning" | "known">(
    "all"
  );
  const [vocabularyBookId, setVocabularyBookId] = useState<"all" | string>("all");
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isChapterSheetOpen, setIsChapterSheetOpen] = useState(false);
  const [isReaderSettingsOpen, setIsReaderSettingsOpen] = useState(false);
  const [isDesktopContentsVisible, setIsDesktopContentsVisible] = useState(true);
  const [isDesktopLookupVisible, setIsDesktopLookupVisible] = useState(true);
  const [isLookupPanelOpen, setIsLookupPanelOpen] = useState(true);
  const [isReaderChromeVisible, setIsReaderChromeVisible] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lookupRequestId = useRef(0);
  const lastScrollY = useRef(0);
  const touchStartX = useRef<number | null>(null);
  const lookupContainerRef = useRef<HTMLDivElement | null>(null);
  const readerSettingsRef = useRef<HTMLDivElement | null>(null);

  const activeBook = books.find((book) => book.id === activeBookId) ?? books[0];
  const activeChapter =
    activeBook?.chapters.find((chapter) => chapter.id === activeBook.activeChapterId) ??
    activeBook?.chapters[0];
  const activeChapterIndex =
    activeBook?.chapters.findIndex((chapter) => chapter.id === activeBook.activeChapterId) ?? -1;
  const dueReview = vocabulary.filter((item) => item.familiarity !== "known");
  const currentReview = dueReview[0];
  const savedWordsCount = activeBook
    ? vocabulary.filter((item) => item.bookId === activeBook.id).length
    : 0;

  const vocabularyByBook = useMemo<BookWithWordCount[]>(() => {
    return books.map((book) => ({
      ...book,
      wordCount: vocabulary.filter((item) => item.bookId === book.id).length
    }));
  }, [books, vocabulary]);

  const filteredVocabulary = useMemo(() => {
    return vocabulary.filter((item) => {
      const matchesStatus = vocabularyStatus === "all" || item.familiarity === vocabularyStatus;
      const matchesBook = vocabularyBookId === "all" || item.bookId === vocabularyBookId;

      return matchesStatus && matchesBook;
    });
  }, [vocabulary, vocabularyBookId, vocabularyStatus]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.books, JSON.stringify(books));
  }, [books]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.vocabulary, JSON.stringify(vocabulary));
  }, [vocabulary]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.activeBookId, activeBookId);
  }, [activeBookId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.readerSettings, JSON.stringify(readerSettings));
  }, [readerSettings]);

  useEffect(() => {
    if (!books.some((book) => book.id === activeBookId) && books[0]) {
      setActiveBookId(books[0].id);
    }
  }, [activeBookId, books]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncViewport = () => {
      const mobile = window.innerWidth < 900;
      setIsMobile(mobile);
      setIsLookupPanelOpen(!mobile);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (page !== "reader" || !isMobile) {
      setIsReaderChromeVisible(true);
      return;
    }

    const handleScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;

      if (currentY < 40 || delta < -8) {
        setIsReaderChromeVisible(true);
      } else if (delta > 8) {
        setIsReaderChromeVisible(false);
      }

      lastScrollY.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isMobile, page]);

  useEffect(() => {
    if (typeof window === "undefined" || !selection) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target) {
        return;
      }

      if (target.closest(".word-chip")) {
        return;
      }

      if (lookupContainerRef.current?.contains(target)) {
        return;
      }

      setSelection(null);
      setIsLookupPanelOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [selection]);

  useEffect(() => {
    if (typeof window === "undefined" || !isReaderSettingsOpen || isMobile) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target) {
        return;
      }

      if (readerSettingsRef.current?.contains(target)) {
        return;
      }

      setIsReaderSettingsOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isMobile, isReaderSettingsOpen]);

  function speakWord(word: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !word) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  async function handleImport(file: File) {
    setImportError(null);
    setIsImporting(true);

    try {
      console.groupCollapsed(`[LexiFlow] Importing EPUB: ${file.name}`);
      const arrayBuffer = await file.arrayBuffer();
      const epubBook = ePub(arrayBuffer);

      const metadata = await epubBook.loaded.metadata;
      const navigation = await epubBook.loaded.navigation;
      const spine = await epubBook.loaded.spine;
      const spineItems = Array.isArray(spine)
        ? spine
        : Array.isArray((spine as { spineItems?: unknown[] }).spineItems)
          ? ((spine as { spineItems: unknown[] }).spineItems as unknown[])
          : [];

      if (spineItems.length === 0) {
        throw new Error("This EPUB does not expose readable spine sections.");
      }

      const chapters = await Promise.all(
        spineItems.map(async (rawItem, index) => {
          const item = rawItem as {
            idref?: string;
            href?: string;
            document?: Document;
            load?: (loader?: typeof epubBook.load) => Promise<Element> | Element;
            unload?: () => void;
          };

          const loadedSection = item.load?.(epubBook.load.bind(epubBook));
          const rootElement =
            loadedSection instanceof Promise ? await loadedSection : loadedSection;
          const bodyElement =
            item.document?.body || rootElement?.querySelector?.("body") || rootElement;
          const text = extractTextFromElement(bodyElement);
          const imageCount = bodyElement?.querySelectorAll?.("img, image").length ?? 0;
          const hasMeaningfulText = text.length > 120;
          const imageElements = Array.from(bodyElement?.querySelectorAll?.("img, image") ?? []);
          const imageDebug: {
            rawHref: string;
            resolvedPath: string | null;
            ok: boolean;
            reason?: string;
          }[] = [];
          const images = (
            await Promise.all(
              imageElements.map(async (imageNode) => {
                const href =
                  imageNode.getAttribute("src") ||
                  imageNode.getAttribute("href") ||
                  imageNode.getAttribute("xlink:href");

                if (!href) {
                  imageDebug.push({
                    rawHref: "",
                    resolvedPath: null,
                    ok: false,
                    reason: "missing image href"
                  });
                  return null;
                }

                try {
                  const resolvedPath = item.href
                    ? decodeURIComponent(
                        new URL(href, `https://epub.local/${item.href}`).pathname.slice(1)
                      )
                    : href;
                  const archivePath = normalizeArchivePath(resolvedPath);
                  const blob = await epubBook.archive?.getBlob(archivePath);

                  if (!blob) {
                    imageDebug.push({
                      rawHref: href,
                      resolvedPath: archivePath,
                      ok: false,
                      reason: "archive.getBlob returned null"
                    });
                    return null;
                  }

                  const dataUrl = await blobToDataUrl(blob);
                  imageDebug.push({
                    rawHref: href,
                    resolvedPath: archivePath,
                    ok: true
                  });
                  return dataUrl;
                } catch (error) {
                  imageDebug.push({
                    rawHref: href,
                    resolvedPath: normalizeArchivePath(
                      item.href
                        ? decodeURIComponent(
                            new URL(href, `https://epub.local/${item.href}`).pathname.slice(1)
                          )
                        : href
                    ),
                    ok: false,
                    reason: error instanceof Error ? error.message : "unknown image error"
                  });
                  return null;
                }
              })
            )
          ).filter((value): value is string => Boolean(value));

          item.unload?.();

          const label =
            (item.href ? navigation.get(item.href)?.label : undefined) || `Chapter ${index + 1}`;

          console.groupCollapsed(
            `[LexiFlow] Chapter import: ${label} (${item.href || item.idref || index + 1})`
          );
          console.log("textLength", text.length);
          console.log("hasMeaningfulText", hasMeaningfulText);
          console.log("imageNodeCount", imageCount);
          console.log("imagesExtracted", images.length);
          if (imageDebug.length > 0) {
            console.table(imageDebug);
          }
          console.groupEnd();

          const fallbackContent =
            imageCount > 0
              ? `${label}\n\nThis section is primarily image-based in the source EPUB, so there is little or no extractable text to display in the plain-text reader yet.`
              : `${label}\n\nThis section could not be extracted as plain text yet.`;

          return {
            id: item.idref || `chapter-${index + 1}`,
            label,
            content: hasMeaningfulText ? text : fallbackContent,
            images,
            isImageHeavy: images.length > 0 && !hasMeaningfulText
          };
        })
      );

      const importedBook: Book = {
        id: `book-${Date.now()}`,
        title: metadata.title || file.name.replace(/\.epub$/i, ""),
        author: metadata.creator || "Unknown author",
        cover:
          "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=800&q=80",
        progress: 0,
        lastOpenedAt: formatNow(),
        activeChapterId: chapters[0]?.id || "chapter-1",
        chapters:
          chapters.length > 0
            ? chapters
            : [
                {
                  id: "chapter-1",
                  label: "Imported Chapter",
                  content: "The EPUB was imported, but no readable text section was found."
                }
              ],
        sourceFileName: file.name
      };

      setBooks((current) => [importedBook, ...current]);
      setActiveBookId(importedBook.id);
      setPage("reader");
      console.log("[LexiFlow] Imported chapters", importedBook.chapters);
      console.groupEnd();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The EPUB import failed unexpectedly.";
      setImportError(message);
      console.error("[LexiFlow] EPUB import failed", error);
      console.groupEnd();
    } finally {
      setIsImporting(false);
    }
  }

  function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void handleImport(file);
    event.target.value = "";
  }

  async function triggerLookup(word: string, sentence: string) {
    if (!activeBook || !word) {
      return;
    }

    const normalizedWord = normalizeWord(word);
    const context = sentence.trim();
    const requestId = Date.now();
    lookupRequestId.current = requestId;
    setIsLookingUp(true);
    setSelection({
      word: normalizedWord || word,
      phonetic: "/.../",
      meaning: "Loading definition...",
      englishMeaning: "Fetching dictionary entry",
      example: "Please wait while we look up this word.",
      context,
      sourceLabel: "Looking up"
    });

    try {
      const entry = await fetchWordDefinition(word);
      const existingItem = vocabulary.find(
        (item) => item.bookId === activeBook.id && item.word === entry.word
      );
      const shouldHideSavedHint =
        Boolean(existingItem) && /saved for later review/i.test(entry.example);
      const nextExample = shouldHideSavedHint ? "" : entry.example;

      if (lookupRequestId.current !== requestId) {
        return;
      }

      setSelection({
        ...entry,
        example: nextExample,
        context,
        sourceLabel: existingItem
          ? "Already in vocabulary"
          : entry.phonetic === "/auto/"
            ? "Saved from fallback glossary"
            : "Live dictionary"
      });
      setIsLookupPanelOpen(true);

      setVocabulary((current) => {
        const exists = current.find((item) => item.bookId === activeBook.id && item.word === entry.word);

        if (exists) {
          return current.map((item) =>
            item.id === exists.id
              ? {
                  ...item,
                  ...entry,
                  context,
                  addedAt: formatNow()
                }
              : item
          );
        }

        return [
          {
            ...entry,
            id: `${activeBook.id}-${slugifyWord(entry.word)}`,
            bookId: activeBook.id,
            bookTitle: activeBook.title,
            context,
            addedAt: formatNow(),
            familiarity: "new",
            reviewCount: 0
          },
          ...current
        ];
      });
    } finally {
      if (lookupRequestId.current === requestId) {
        setIsLookingUp(false);
      }
    }
  }

  function openBook(bookId: string) {
    setActiveBookId(bookId);
    setSelection(null);
    setIsMobileMenuOpen(false);
    setIsChapterSheetOpen(false);
    setIsLookupPanelOpen(!isMobile);
    setIsDesktopContentsVisible(true);
    setIsDesktopLookupVisible(true);
    setPage("reader");
  }

  function deleteBook(bookId: string) {
    setBooks((current) => {
      const nextBooks = current.filter((book) => book.id !== bookId);

      if (nextBooks.length === 0) {
        setActiveBookId(sampleBook.id);
        setPage("library");
        return [sampleBook];
      }

      if (bookId === activeBookId) {
        setActiveBookId(nextBooks[0].id);
        setPage("library");
      }

      return nextBooks;
    });

    setVocabulary((current) => current.filter((item) => item.bookId !== bookId));
    setSelection(null);
  }

  function deleteBookWords(bookId: string) {
    setVocabulary((current) => current.filter((item) => item.bookId !== bookId));

    if (activeBookId === bookId) {
      setSelection(null);
    }
  }

  function selectChapter(chapterId: string) {
    setBooks((current) =>
      current.map((book) =>
        book.id === activeBookId
          ? {
              ...book,
              activeChapterId: chapterId,
              progress: Math.min(
                100,
                Math.round(
                  ((book.chapters.findIndex((chapter) => chapter.id === chapterId) + 1) /
                    Math.max(book.chapters.length, 1)) *
                    100
                )
              ),
              lastOpenedAt: formatNow()
            }
          : book
      )
    );
    setSelection(null);
    setIsChapterSheetOpen(false);
    setIsReaderSettingsOpen(false);

    if (typeof window !== "undefined" && isMobile) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function goToAdjacentChapter(direction: "prev" | "next") {
    if (!activeBook || activeChapterIndex < 0) {
      return;
    }

    const nextIndex = direction === "prev" ? activeChapterIndex - 1 : activeChapterIndex + 1;
    const nextChapter = activeBook.chapters[nextIndex];

    if (nextChapter) {
      selectChapter(nextChapter.id);
    }
  }

  function updateVocabularyStatus(wordId: string, familiarity: VocabularyItem["familiarity"]) {
    setVocabulary((current) =>
      current.map((item) => (item.id === wordId ? { ...item, familiarity } : item))
    );
  }

  function removeVocabularyWord(wordId: string) {
    setVocabulary((current) => current.filter((item) => item.id !== wordId));
    setSelection((current) => (current && slugifyWord(current.word) === wordId.split("-").pop() ? null : current));
  }

  function exportVocabulary(format: "csv" | "json") {
    if (format === "json") {
      const blob = new Blob([JSON.stringify(vocabulary, null, 2)], {
        type: "application/json;charset=utf-8;"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "lexiflow-vocabulary.json";
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    const header = ["word", "phonetic", "meaning", "book", "context", "status", "addedAt"];
    const rows = vocabulary.map((item) =>
      [
        item.word,
        item.phonetic,
        item.meaning,
        item.bookTitle,
        item.context,
        item.familiarity,
        item.addedAt
      ]
        .map((cell) => `"${cell.replace(/"/g, "\"\"")}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], {
      type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lexiflow-vocabulary.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function reviewWord(rating: ReviewRating) {
    if (!currentReview) {
      return;
    }

    setVocabulary((current) =>
      current.map((item) => {
        if (item.id !== currentReview.id) {
          return item;
        }

        const familiarity =
          rating === "good" ? "known" : rating === "hard" ? "learning" : "new";

        return {
          ...item,
          familiarity,
          reviewCount: item.reviewCount + 1
        };
      })
    );
  }

  function renderSentence(sentence: string, sentenceIndex: number) {
    const words = sentence.split(/(\s+|(?=[,.;:!?()"“”‘’—–])|(?<=[,.;:!?()"“”‘’—–]))/);

    return (
      <p
        key={`${sentenceIndex}-${sentence.slice(0, 16)}`}
        className="reader-paragraph"
        style={{
          fontSize: `${readerSettings.fontSize}px`,
          lineHeight: readerSettings.lineHeight
        }}
      >
        {words.map((part, index) => {
          const trimmed = part.trim();
          const normalized = normalizeWord(trimmed);
          const isWord = /^[a-z][a-z'-]*$/i.test(normalized);
          const isSelected = normalizeWord(selection?.word || "") === normalized;

          if (!isWord) {
            return <span key={`${sentenceIndex}-${index}`}>{part}</span>;
          }

          return (
            <button
              key={`${sentenceIndex}-${index}`}
              className={`word-chip ${isSelected ? "selected" : ""}`}
              onClick={() => void triggerLookup(trimmed, sentence)}
            >
              {part}
            </button>
          );
        })}
      </p>
    );
  }

  function renderLookupCard() {
    if (!selection) {
      return (
        <div className="empty-card lookup-surface" ref={lookupContainerRef}>
          <p>Tap a word to see its meaning, hear pronunciation, and save it automatically.</p>
        </div>
      );
    }

    return (
      <div className="lookup-card lookup-surface" ref={lookupContainerRef}>
        <div className="lookup-heading">
          <h3>{selection.word}</h3>
          <span className="status-pill learning">{selection.sourceLabel}</span>
        </div>
        <span className="phonetic">{selection.phonetic}</span>
        <p>{selection.meaning}</p>
        <p className="muted">{selection.englishMeaning}</p>
        {selection.example ? <blockquote>{selection.example}</blockquote> : null}
        <div className="context-box">
          <span className="eyebrow">Source sentence</span>
          <p>{selection.context}</p>
        </div>
        <div className="lookup-actions">
          <button className="ghost-button" onClick={() => speakWord(selection.word)}>
            Pronounce
          </button>
          <button className="ghost-button" onClick={() => setPage("vocabulary")}>
            Open vocabulary
          </button>
          {isMobile && (
            <button className="primary-button" onClick={() => setIsLookupPanelOpen(false)}>
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderReaderSettingsControls() {
    return (
      <div className="reader-settings-grid">
        <div className="toolbar-control">
          <label htmlFor="font-size">Type Size</label>
          <input
            id="font-size"
            type="range"
            min="16"
            max="26"
            value={readerSettings.fontSize}
            onChange={(event) =>
              setReaderSettings((current) => ({
                ...current,
                fontSize: Number(event.target.value)
              }))
            }
          />
          <span className="settings-value">{readerSettings.fontSize}px</span>
        </div>
        <div className="toolbar-control">
          <label htmlFor="line-height">Leading</label>
          <input
            id="line-height"
            type="range"
            min="1.5"
            max="2.4"
            step="0.05"
            value={readerSettings.lineHeight}
            onChange={(event) =>
              setReaderSettings((current) => ({
                ...current,
                lineHeight: Number(event.target.value)
              }))
            }
          />
          <span className="settings-value">{readerSettings.lineHeight.toFixed(2)}</span>
        </div>
        <div className="toolbar-control">
          <label>Theme</label>
          <div className="theme-swatch-group">
            {[
              ["paper", "Paper"],
              ["mist", "Mist"],
              ["night", "Night"]
            ].map(([themeId, label]) => (
              <Button
                key={themeId}
                variant={readerSettings.theme === themeId ? "default" : "outline"}
                size="sm"
                className="theme-swatch-button"
                onClick={() =>
                  setReaderSettings((current) => ({
                    ...current,
                    theme: themeId as ReaderSettings["theme"]
                  }))
                }
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function handleReaderTouchStart(event: React.TouchEvent<HTMLElement>) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  }

  function handleReaderTouchEnd(event: React.TouchEvent<HTMLElement>) {
    const startX = touchStartX.current;
    const endX = event.changedTouches[0]?.clientX ?? null;
    touchStartX.current = null;

    if (startX === null || endX === null || Math.abs(endX - startX) < 70) {
      return;
    }

    if (endX < startX) {
      goToAdjacentChapter("next");
      return;
    }

    goToAdjacentChapter("prev");
  }

  return (
    <div className="app-shell app-shell-single">
      <main className="main-panel shell-panel">
        <header
          className={`topbar app-header ${
            page === "reader" && isMobile && !isReaderChromeVisible ? "chrome-hidden" : ""
          }`}
        >
          <div className="header-brand">
            <div className="brand-mark">LF</div>
            {!isMobile && (
              <div>
                <span className="eyebrow">English Reading Lab</span>
                <h2>
                  {page === "library" && "Bookshelf"}
                  {page === "reader" && (activeBook ? activeBook.title : "Reader")}
                  {page === "vocabulary" && "Vocabulary Notebook"}
                  {page === "review" && "Review Session"}
                </h2>
              </div>
            )}
          </div>

          <div className="topbar-actions">
            <nav className="header-nav desktop-only-nav">
              {[
                ["library", "Bookshelf"],
                ["vocabulary", "Words"],
                ["review", "Review"]
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={`header-nav-button ${page === id ? "active" : ""}`}
                  onClick={() => setPage(id as PageId)}
                >
                  {label}
                </button>
                ))}
            </nav>
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu-button"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} />
            </Button>
            <Button
              variant="default"
              className="desktop-import-button"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
            >
              {isImporting ? "Importing..." : "Import Book"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub"
              hidden
              onChange={onFileSelected}
            />
          </div>
        </header>

        {page === "library" && (
          <section className="page-grid">
            <div className="home-strip">
              <article className="metric-card">
                <span className="eyebrow">Books</span>
                <strong>{books.length}</strong>
                <p>imported into your shelf</p>
              </article>
              <article className="metric-card">
                <span className="eyebrow">Words</span>
                <strong>{vocabulary.length}</strong>
                <p>captured from reading taps</p>
              </article>
              <article className="metric-card">
                <span className="eyebrow">Review Due</span>
                <strong>{dueReview.length}</strong>
                <p>items waiting for practice</p>
              </article>
            </div>

            <section className="books-grid">
              {vocabularyByBook.map((book) => (
                <article
                  key={book.id}
                  className="book-card clickable-card"
                  onClick={() => openBook(book.id)}
                >
                  <img src={book.cover} alt={book.title} />
                  <div className="book-card-body">
                    <div>
                      <h3>{book.title}</h3>
                      <p>{book.author}</p>
                    </div>
                    <div className="book-meta">
                      <span>{book.progress}% read</span>
                      <span>{book.wordCount} words saved</span>
                    </div>
                    <div className="book-card-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteBookWords(book.id);
                        }}
                      >
                        Delete words
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteBook(book.id);
                        }}
                      >
                        Delete book
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
            {importError && <p className="error-text">{importError}</p>}
          </section>
        )}

        {page === "reader" && activeBook && activeChapter && (
          <section
            className={`reader-shell ${!isMobile ? "reader-shell-desktop" : ""} ${
              !isMobile && !isDesktopContentsVisible ? "reader-shell-contents-hidden" : ""
            } ${!isMobile && !isDesktopLookupVisible ? "reader-shell-lookup-hidden" : ""}`}
            onTouchStart={handleReaderTouchStart}
            onTouchEnd={handleReaderTouchEnd}
          >
            {!isMobile && (
              <>
                {isDesktopContentsVisible ? (
                  <aside className="desktop-rail desktop-contents-rail">
                    <div className="desktop-rail-card">
                      <div className="desktop-rail-header">
                        <div className="panel-header">
                          <span className="eyebrow">Contents</span>
                          <strong>{activeBook.title}</strong>
                        </div>
                        <button
                          className="ghost-button rail-toggle-button"
                          onClick={() => setIsDesktopContentsVisible(false)}
                        >
                          Hide
                        </button>
                      </div>
                      <div className="chapter-list">
                        {activeBook.chapters.map((chapter) => (
                          <button
                            key={chapter.id}
                            className={`chapter-button ${
                              chapter.id === activeBook.activeChapterId ? "active" : ""
                            }`}
                            onClick={() => selectChapter(chapter.id)}
                          >
                            {chapter.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </aside>
                ) : (
                  <button
                    className="desktop-rail-reveal desktop-rail-reveal-left"
                    onClick={() => setIsDesktopContentsVisible(true)}
                  >
                    Contents
                  </button>
                )}
              </>
            )}
            <div className={`reader-panel theme-${readerSettings.theme}`}>
              <div className="reader-toolbar">
                <div className="reader-toolbar-top">
                  <div className="reader-meta-stack">
                    <div className="reader-meta-line">
                      <span className="reader-meta-primary">{activeBook.title}</span>
                      <span>{activeChapter.label}</span>
                      <span>{savedWordsCount} saved words</span>
                    </div>
                    <div className="reader-progress-line">
                      <span>{activeBook.progress}% completed</span>
                      <div
                        className="reader-progress-track"
                        aria-hidden="true"
                      >
                        <div
                          className="reader-progress-fill"
                          style={{ width: `${activeBook.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="reader-settings-wrap" ref={readerSettingsRef}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="reader-settings-trigger"
                      onClick={() => setIsReaderSettingsOpen((current) => !current)}
                    >
                      <SlidersHorizontal size={16} />
                      Settings
                    </Button>
                    {!isMobile && isReaderSettingsOpen && (
                      <div className="reader-settings-popover">
                        {renderReaderSettingsControls()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="reader-reading-layout">
                <article className="reader-surface">
                  <span className="eyebrow">{activeBook.author}</span>
                  <h3>{activeChapter.label}</h3>
                  {activeChapter.images && activeChapter.images.length > 0 && (
                    <div className="chapter-images">
                      {activeChapter.images.map((image, index) => (
                        <figure key={`${activeChapter.id}-image-${index}`} className="chapter-image-card">
                          <img src={image} alt={`${activeChapter.label} illustration ${index + 1}`} />
                        </figure>
                      ))}
                    </div>
                  )}
                  {activeChapter.isImageHeavy &&
                    activeChapter.images &&
                    activeChapter.images.length > 0 && (
                    <div className="image-heavy-note">
                      This section is image-led in the source EPUB. The images are shown above, and
                      the extracted text may be minimal.
                    </div>
                  )}
                  {activeChapter.content
                    .split(/(?<=[.!?])\s+/)
                    .filter(Boolean)
                    .map((sentence, index) => renderSentence(sentence, index))}
                  {!isMobile && (
                    <div className="reader-bottom-nav">
                      <Button
                        variant="outline"
                        disabled={activeChapterIndex <= 0}
                        onClick={() => goToAdjacentChapter("prev")}
                      >
                        Previous chapter
                      </Button>
                      <Button
                        variant="outline"
                        disabled={activeChapterIndex >= activeBook.chapters.length - 1}
                        onClick={() => goToAdjacentChapter("next")}
                      >
                        Next chapter
                      </Button>
                    </div>
                  )}
                </article>
              </div>
            </div>

            {!isMobile && (
              <>
                {isDesktopLookupVisible ? (
                  <aside className="desktop-rail desktop-lookup-rail">
                    <div className="desktop-rail-card">
                      <div className="desktop-rail-header">
                        <div className="panel-header">
                          <span className="eyebrow">Meaning</span>
                          <strong>{selection ? selection.word : "Tap a word"}</strong>
                        </div>
                        <button
                          className="ghost-button rail-toggle-button"
                          onClick={() => setIsDesktopLookupVisible(false)}
                        >
                          Hide
                        </button>
                      </div>
                      {renderLookupCard()}
                    </div>
                  </aside>
                ) : (
                  <button
                    className="desktop-rail-reveal desktop-rail-reveal-right"
                    onClick={() => setIsDesktopLookupVisible(true)}
                  >
                    Meaning
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {page === "vocabulary" && (
          <section className="vocabulary-layout">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Notebook</span>
                <h3>Every looked-up word in one place</h3>
              </div>
              <div className="topbar-actions">
                <button className="ghost-button" onClick={() => setPage("review")}>
                  Start review
                </button>
                <button className="ghost-button" onClick={() => exportVocabulary("json")}>
                  Export JSON
                </button>
                <button className="primary-button" onClick={() => exportVocabulary("csv")}>
                  Export CSV
                </button>
              </div>
            </div>

            <div className="filters-row">
              <select
                value={vocabularyStatus}
                onChange={(event) =>
                  setVocabularyStatus(
                    event.target.value as "all" | "new" | "learning" | "known"
                  )
                }
              >
                <option value="all">All statuses</option>
                <option value="new">New</option>
                <option value="learning">Learning</option>
                <option value="known">Known</option>
              </select>
              <select
                value={vocabularyBookId}
                onChange={(event) => setVocabularyBookId(event.target.value)}
              >
                <option value="all">All books</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="vocabulary-list">
              {filteredVocabulary.length === 0 && (
                <div className="empty-card">
                  <p>No words match the current filters yet.</p>
                </div>
              )}

              {filteredVocabulary.map((item) => (
                <article key={item.id} className="vocabulary-card">
                  <div className="vocabulary-main">
                    <div>
                      <div className="word-row">
                        <h3>{item.word}</h3>
                        <span className={`status-pill ${item.familiarity}`}>{item.familiarity}</span>
                      </div>
                      <p className="phonetic">{item.phonetic}</p>
                      <p>{item.meaning}</p>
                    </div>
                    <p className="muted">{item.englishMeaning}</p>
                    <div className="card-actions">
                      <button
                        className="ghost-button"
                        onClick={() => updateVocabularyStatus(item.id, "learning")}
                      >
                        Mark learning
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => updateVocabularyStatus(item.id, "known")}
                      >
                        Mark known
                      </button>
                      <button
                        className="danger-button"
                        onClick={() => removeVocabularyWord(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="vocabulary-side">
                    <span className="eyebrow">{item.bookTitle}</span>
                    <p>{item.context}</p>
                    <small>
                      Added {item.addedAt} · Reviewed {item.reviewCount} times
                    </small>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {page === "review" && (
          <section className="review-layout">
            <div className="review-summary">
              <span className="eyebrow">Session</span>
              <h3>{dueReview.length > 0 ? "Review due words" : "You're all caught up"}</h3>
              <p>
                Your review progress is now stored locally too, so the queue stays stable between
                sessions.
              </p>
            </div>

            {currentReview ? (
              <article className="review-card">
                <span className="eyebrow">{currentReview.bookTitle}</span>
                <h2>{currentReview.word}</h2>
                <p className="phonetic">{currentReview.phonetic}</p>
                <p>{currentReview.context}</p>
                <details>
                  <summary>Show meaning</summary>
                  <p>{currentReview.meaning}</p>
                  <p className="muted">{currentReview.englishMeaning}</p>
                </details>
                <div className="review-actions">
                  <button className="danger-button" onClick={() => reviewWord("again")}>
                    Again
                  </button>
                  <button className="ghost-button" onClick={() => reviewWord("hard")}>
                    Hard
                  </button>
                  <button className="primary-button" onClick={() => reviewWord("good")}>
                    Good
                  </button>
                </div>
              </article>
            ) : (
              <div className="empty-card">
                <p>Add more vocabulary or come back after your next reading session.</p>
              </div>
            )}
          </section>
        )}
        {page === "reader" && activeBook && (
          <>
            {isChapterSheetOpen && (
              <Sheet
                open={isChapterSheetOpen}
                onOpenChange={setIsChapterSheetOpen}
                side="left"
                title="Contents"
                description={activeBook.title}
                className="toc-sheet"
              >
                  <div className="chapter-list">
                    {activeBook.chapters.map((chapter) => (
                      <button
                        key={chapter.id}
                        className={`chapter-button ${
                          chapter.id === activeBook.activeChapterId ? "active" : ""
                        }`}
                        onClick={() => selectChapter(chapter.id)}
                      >
                        {chapter.label}
                      </button>
                    ))}
                  </div>
              </Sheet>
            )}

            {isMobile && isReaderSettingsOpen && (
              <Sheet
                open={isReaderSettingsOpen}
                onOpenChange={setIsReaderSettingsOpen}
                side="bottom"
                title="Reader settings"
                description="Adjust type, leading, and theme"
                className="reader-settings-sheet"
              >
                {renderReaderSettingsControls()}
              </Sheet>
            )}

            {isMobile && isLookupPanelOpen && (
              <div className="mobile-lookup-sheet">{renderLookupCard()}</div>
            )}

            {isMobile && (
              <>
                <Button
                  className={`toc-fab ${!isReaderChromeVisible ? "chrome-hidden" : ""}`}
                  onClick={() => setIsChapterSheetOpen(true)}
                >
                  Contents
                </Button>
                <Button
                  variant="outline"
                  className={`settings-fab ${!isReaderChromeVisible ? "chrome-hidden" : ""}`}
                  onClick={() => setIsReaderSettingsOpen(true)}
                >
                  <SlidersHorizontal size={16} />
                  Aa
                </Button>
              </>
            )}
          </>
        )}

        {isMobileMenuOpen && (
          <Sheet
            open={isMobileMenuOpen}
            onOpenChange={setIsMobileMenuOpen}
            side="right"
            title="Navigation"
            description="Jump anywhere"
            className="mobile-nav-sheet"
          >
              <div className="mobile-menu-list">
                {[
                  ["library", "Bookshelf"],
                  ["reader", activeBook ? `Continue ${activeBook.title}` : "Reader"],
                  ["vocabulary", "Vocabulary"],
                  ["review", "Review"],
                  ["import_action", "Import EPUB"]
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className="chapter-button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      if (id === "import_action") {
                        fileInputRef.current?.click();
                        return;
                      }
                      if (id === "reader" && activeBook) {
                        openBook(activeBook.id);
                        return;
                      }
                      setPage(id as PageId);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
          </Sheet>
        )}
      </main>
    </div>
  );
}

export default App;
