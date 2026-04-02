"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { FileText, AlertCircle } from "lucide-react";
import SelectionToolbar from "./SelectionToolbar";
import { usePaperStore } from "../store/paperStore";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url?: string;
  onExplain?: (text: string) => void;
  onAddToNotes?: (text: string) => void;
}

interface PageSize {
  width: number;
  height: number;
  scale: number;
}

export default function PdfViewer({ url, onExplain, onAddToNotes }: PdfViewerProps) {
  const { currentPaper, setCurrentPaper, highlightTarget } = usePaperStore();

  const [numPages, setNumPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfWidth, setPdfWidth] = useState(800);
  // Track each page's rendered size (index = pageNumber - 1)
  const [pageSizes, setPageSizes] = useState<PageSize[]>([]);

  // ── Responsive width ──────────────────────────────────────────────────────
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setPdfWidth(containerRef.current.clientWidth - 64);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // ── Cross-paper switching: when highlightTarget paper differs, switch doc ──
  useEffect(() => {
    if (!highlightTarget) return;
    if (highlightTarget.paperId !== currentPaper?.id) {
      const { papers } = usePaperStore.getState();
      const targetPaper = papers.find((p) => p.id === highlightTarget.paperId);
      if (targetPaper) {
        setCurrentPaper(targetPaper);
      }
    }
  }, [highlightTarget?.paperId]);

  // ── Scroll once currentPdfUrl is available (url loaded → pages rendered) ──
  useEffect(() => {
    if (!url || !containerRef.current) return;
    // Wait for numPages to be set (pages rendered), then scroll
    if (!numPages) return;
    if (!highlightTarget) return;
    if (highlightTarget.paperId !== currentPaper?.id) return;

    const timer = setTimeout(() => {
      const el = containerRef.current?.querySelector(
        `[data-page-number="${highlightTarget.pageNumber}"]`
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [url, numPages, highlightTarget?.paperId, highlightTarget?.pageNumber, currentPaper?.id]);

  // Reset page sizes when URL changes
  useEffect(() => {
    setPageSizes([]);
  }, [url]);

  const handleMouseUp = useCallback(() => {
    const selectionObj = window.getSelection();
    if (!selectionObj || selectionObj.isCollapsed) {
      setSelection(null);
      return;
    }

    const text = selectionObj.toString().trim();
    if (!text) {
      setSelection(null);
      return;
    }

    const range = selectionObj.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    setSelection({
      text,
      rect,
    });
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseUp]);

  function onDocumentLoadSuccess({ numPages: np }: { numPages: number }) {
    setNumPages(np);
    setLoading(false);
    setError(null);
  }

  function onDocumentLoadError(err: Error) {
    setError("Failed to load PDF file");
    setLoading(false);
    console.error("PDF load error:", err);
  }

  const handleExplain = () => {
    if (selection && onExplain) {
      onExplain(selection.text);
    }
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleAddToNotes = () => {
    if (selection && onAddToNotes) {
      onAddToNotes(selection.text);
    }
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  // ── Highlight overlay for a single page ───────────────────────────────────
  function HighlightOverlay({
    pageNumber,
    bbox,
    pageWidth,
    pageHeight,
    scale,
  }: {
    pageNumber: number;
    bbox: number[];
    pageWidth: number;
    pageHeight: number;
    scale: number;
  }) {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
      if (!visible) return;
      const timer = setTimeout(() => setVisible(false), 10_000);
      return () => clearTimeout(timer);
    }, [visible]);

    // Re-show when highlightTarget updates (new citation)
    useEffect(() => {
      if (highlightTarget?.timestamp) {
        setVisible(true);
      }
    }, [highlightTarget?.timestamp]);

    if (!visible) return null;

    // Convert PDF coordinates → pixel offset within the page div.
    // PDF origin is bottom-left; screen origin is top-left.
    // bbox = [x0, y0, x1, y1] in PDF points (origin bottom-left)
    const left = bbox[0] * scale;
    const top = bbox[1] * scale;
    const width = (bbox[2] - bbox[0]) * scale;
    const height = (bbox[3] - bbox[1]) * scale;

    return (
      <div
        className="absolute bg-blue-400/25 border-l-2 border-blue-500 rounded-sm pointer-events-none animate-in fade-in zoom-in-95 duration-500 ease-out"
        style={{ left, top, width, height }}
        aria-hidden="true"
      />
    );
  }

  // ── Render a single page with optional highlight overlay ──────────────────
  function renderPage(pageNum: number, size: PageSize | undefined) {
    const isHighlighted =
      highlightTarget?.paperId === currentPaper?.id &&
      highlightTarget?.pageNumber === pageNum;

    return (
      <div
        key={`page_${pageNum}`}
        data-page-number={pageNum}
        className="relative shadow-lg mb-6 min-w-0"
      >
        <Page
          pageNumber={pageNum}
          width={pdfWidth}
          className="shadow-lg"
          renderTextLayer={true}
          renderAnnotationLayer={true}
          onLoadSuccess={(page) => {
            const viewport = page.getViewport({ scale: 1 });
            setPageSizes((prev) => {
              const next = [...prev];
              next[pageNum - 1] = {
                width: viewport.width,
                height: viewport.height,
                scale: 1,
              };
              return next;
            });
          }}
          loading={
            <div className="h-96 bg-slate-200 animate-pulse rounded-lg flex items-center justify-center min-w-0 w-full">
              <p className="text-sm text-slate-400">Loading page {pageNum}...</p>
            </div>
          }
        />
        {isHighlighted && size && (
          <HighlightOverlay
            pageNumber={pageNum}
            bbox={highlightTarget!.bbox}
            pageWidth={size.width}
            pageHeight={size.height}
            scale={pdfWidth / size.width}
          />
        )}
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!url) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-[#F9FAFB]">
        <FileText className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-sm font-medium text-slate-500">No PDF file loaded</p>
        <p className="text-xs text-slate-400 mt-1">Add a PDF file to public folder to view it here</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto bg-[#525659] flex flex-col items-center relative min-w-0">
      <SelectionToolbar
        referenceRect={selection?.rect ?? null}
        onExplain={handleExplain}
        onAddToNotes={handleAddToNotes}
      />

      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-400">Loading PDF...</p>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
          <p className="text-sm font-medium text-red-500">{error}</p>
        </div>
      )}

      <div className="flex flex-col items-center py-8 gap-6 min-w-0 w-full">
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="flex flex-col items-center justify-center py-20">
              <div className="h-8 w-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
              <p className="text-sm text-slate-400">Loading PDF...</p>
            </div>
          }
          className="flex flex-col items-center"
        >
          {Array.from(new Array(numPages || 0), (el, index) => {
            const pageNum = index + 1;
            return renderPage(pageNum, pageSizes[index]);
          })}
        </Document>

        {numPages && !loading && !error && (
          <div className="py-4 text-xs text-slate-400">
            {numPages} {numPages === 1 ? "page" : "pages"}
          </div>
        )}
      </div>
    </div>
  );
}
