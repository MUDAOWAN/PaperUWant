"use client";

import { useEffect, useState, useRef } from "react";
import { Bot, FileText } from "lucide-react";
import { useFloating, offset, flip, shift, autoUpdate } from "@floating-ui/react";

interface SelectionToolbarProps {
  referenceRect: DOMRect | null;
  onExplain: () => void;
  onAddToNotes: () => void;
}

export default function SelectionToolbar({ referenceRect, onExplain, onAddToNotes }: SelectionToolbarProps) {
  const [visible, setVisible] = useState(false);
  const virtualElementRef = useRef<HTMLElement | null>(null);

  const { refs, floatingStyles } = useFloating({
    placement: "top",
    middleware: [
      offset(10),
      flip(),
      shift({ padding: 10 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (referenceRect) {
      // Create a stable virtual element using the DOMRect values
      virtualElementRef.current = {
        getBoundingClientRect: () => referenceRect,
      } as unknown as HTMLElement;
      refs.setPositionReference(virtualElementRef.current);
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [referenceRect, refs]);

  if (!visible) return null;

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className="z-50 flex items-center gap-1 bg-white rounded-xl shadow-lg border border-slate-200 px-2 py-1.5 whitespace-nowrap min-w-max"
    >
      <button
        onClick={onExplain}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors whitespace-nowrap"
      >
        <Bot className="h-3.5 w-3.5" />
        <span>解释这句</span>
      </button>
      <div className="w-px h-5 bg-slate-200 shrink-0" />
      <button
        onClick={onAddToNotes}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors whitespace-nowrap"
      >
        <FileText className="h-3.5 w-3.5" />
        <span>写入笔记</span>
      </button>
    </div>
  );
}
