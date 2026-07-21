"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { FileText, AlertCircle } from "lucide-react";
import SelectionToolbar from "./SelectionToolbar";
import { usePaperStore } from "../store/paperStore";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

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

interface HighlightOverlayProps {
  bbox: number[];
  scale: number;
}

function HighlightOverlay({ bbox, scale }: HighlightOverlayProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 10_000);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

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

export default function PdfViewer({ url, onExplain, onAddToNotes }: PdfViewerProps) {
  const { currentPaper, setCurrentPaper, highlightTarget } = usePaperStore();

  const [numPages, setNumPages] = useState<number | null>(null);
  const [visiblePageCount, setVisiblePageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfWidth, setPdfWidth] = useState(800);
  const [pageSizes, setPageSizes] = useState<PageSize[]>([]);

  const targetPaperId = highlightTarget?.paperId;
  const targetPageNumber = highlightTarget?.pageNumber;
  const targetTimestamp = highlightTarget?.timestamp;
  const targetBbox = highlightTarget?.bbox;

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

  useEffect(() => {
    if (!targetPaperId) return;
    if (targetPaperId !== currentPaper?.id) {
      const { papers } = usePaperStore.getState();
      const targetPaper = papers.find((p) => p.id === targetPaperId);
      if (targetPaper) {
        setCurrentPaper(targetPaper);
      }
    }
  }, [targetPaperId, currentPaper?.id, setCurrentPaper]);

  useEffect(() => {
    if (!url || !containerRef.current) return;
    if (!numPages) return;
    if (!targetPaperId || !targetPageNumber) return;
    if (targetPaperId !== currentPaper?.id) return;

    const timer = setTimeout(() => {
      const el = containerRef.current?.querySelector(
        `[data-page-number="${targetPageNumber}"]`
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [url, numPages, targetPaperId, targetPageNumber, currentPaper?.id]);

  useEffect(() => {
    setNumPages(null);
    setVisiblePageCount(0);
    setPageSizes([]);
    setError(null);
    setLoading(Boolean(url));
  }, [url]);

  useEffect(() => {
    if (!numPages || loading || error) return;
    if (visiblePageCount >= numPages) return;

    const nextCount = Math.min(numPages, Math.max(visiblePageCount + 2, 3));
    const timer = window.setTimeout(() => {
      setVisiblePageCount(nextCount);
    }, 80);

    return () => window.clearTimeout(timer);
  }, [numPages, visiblePageCount, loading, error]);

  useEffect(() => {
    if (!targetPageNumber) return;
    const nextCount = numPages
      ? Math.min(numPages, targetPageNumber)
      : targetPageNumber;
    setVisiblePageCount((prev) => Math.max(prev, nextCount));
  }, [targetPageNumber, targetTimestamp, numPages]);

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
    setVisiblePageCount(Math.min(np, 3));
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

  function renderPage(pageNum: number, size: PageSize | undefined) {
    const isHighlighted =
      targetPaperId === currentPaper?.id &&
      targetPageNumber === pageNum;

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
        {isHighlighted && size && targetBbox && (
          <HighlightOverlay
            key={targetTimestamp ?? 0}
            bbox={targetBbox}
            scale={pdfWidth / size.width}
          />
        )}
      </div>
    );
  }

  if (!url && currentPaper) {
    return (
      <div className="h-full bg-[#525659] flex flex-col items-center justify-center text-slate-300">
        <div className="h-8 w-8 border-3 border-slate-300/50 border-t-indigo-400 rounded-full animate-spin mb-4" />
        <p className="text-sm">正在准备 PDF 链接...</p>
      </div>
    );
  }

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

      {loading && !error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#525659]">
          <div className="h-8 w-8 border-3 border-slate-300/50 border-t-indigo-400 rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-300">正在加载 PDF...</p>
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
          loading={null}
          className="flex flex-col items-center"
        >
          {Array.from(new Array(visiblePageCount || 0), (_el, index) => {
            const pageNum = index + 1;
            return renderPage(pageNum, pageSizes[index]);
          })}
        </Document>

        {numPages && visiblePageCount < numPages && !loading && !error && (
          <div className="py-2 text-xs text-slate-300">
            正在渲染剩余页面 {visiblePageCount}/{numPages}
          </div>
        )}

        {numPages && visiblePageCount >= numPages && !loading && !error && (
          <div className="py-4 text-xs text-slate-400">
            {numPages} {numPages === 1 ? "page" : "pages"}
          </div>
        )}
      </div>
    </div>
  );
}
