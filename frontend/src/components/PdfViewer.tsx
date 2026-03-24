"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { FileText, AlertCircle } from "lucide-react";
import SelectionToolbar from "./SelectionToolbar";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url?: string;
  onExplain?: (text: string) => void;
  onAddToNotes?: (text: string) => void;
}

export default function PdfViewer({ url, onExplain, onAddToNotes }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfWidth, setPdfWidth] = useState(800);

  // 动态获取容器宽度，用于响应式 PDF 页面
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setPdfWidth(containerRef.current.clientWidth - 64); // 减去 padding
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  if (!url) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-[#F9FAFB]">
        <FileText className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-sm font-medium text-slate-500">No PDF file loaded</p>
        <p className="text-xs text-slate-400 mt-1">Add a PDF file to public folder to view it here</p>
      </div>
    );
  }

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

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
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
          {Array.from(new Array(numPages || 0), (el, index) => (
            <Page
              key={`page_${index + 1}`}
              pageNumber={index + 1}
              width={pdfWidth}
              className="shadow-lg mb-6 min-w-0"
              renderTextLayer={true}
              renderAnnotationLayer={true}
              loading={
                <div className="h-96 bg-slate-200 animate-pulse rounded-lg flex items-center justify-center min-w-0 w-full">
                  <p className="text-sm text-slate-400">Loading page {index + 1}...</p>
                </div>
              }
            />
          ))}
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
