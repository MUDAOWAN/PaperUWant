"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FolderPlus, Search, FileText, Check } from "lucide-react";
import { Paper } from "../store/paperStore";

interface FolderCreateModalProps {
  isOpen: boolean;
  papers: Paper[];
  onCancel: () => void;
  onConfirm: (name: string, selectedPaperIds: string[]) => void;
}

export default function FolderCreateModal({ isOpen, papers, onCancel, onConfirm }: FolderCreateModalProps) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setQuery("");
      setSelected(new Set());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onCancel]);

  const filtered = useMemo(() => {
    if (!query.trim()) return papers;
    const q = query.toLowerCase();
    return papers.filter((p) => p.file_name.toLowerCase().includes(q));
  }, [papers, query]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed, Array.from(selected));
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[300] bg-black/20 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[301] flex items-center justify-center">
        <div
          className="bg-white rounded-2xl shadow-2xl shadow-black/20 border border-black/5 w-full max-w-md mx-4 flex flex-col animate-in zoom-in-95 fade-in duration-200"
          onClick={(e) => e.stopPropagation()}
          style={{ height: "540px" }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 pt-6 pb-4 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <FolderPlus className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">新建文件夹</h2>
              <p className="text-xs text-slate-400 mt-0.5">创建新的文件夹来整理文献</p>
            </div>
          </div>

          {/* Folder name input */}
          <div className="px-6 pb-3 shrink-0">
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
              placeholder="输入新文件夹名称..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all"
            />
          </div>

          {/* Divider label */}
          <div className="px-6 pb-2 shrink-0">
            <p className="text-[11px] text-slate-400 font-medium">同时将文献移入该文件夹</p>
          </div>

          {/* Search */}
          <div className="px-6 pb-3 shrink-0">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索文献..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all"
              />
            </div>
          </div>

          {/* Paper list — fixed height, scrollable */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <FileText className="h-7 w-7 mb-2 opacity-30" />
                <p className="text-xs">暂无文献</p>
              </div>
            ) : (
              <div className="space-y-1 py-1">
                {filtered.map((paper) => {
                  const isChecked = selected.has(paper.id);
                  return (
                    <button
                      key={paper.id}
                      onClick={() => toggle(paper.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                        isChecked
                          ? "bg-indigo-50 text-indigo-700"
                          : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                          isChecked ? "bg-indigo-500 border-indigo-500" : "border-slate-300 bg-white"
                        }`}
                      >
                        {isChecked && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                      <FileText className={`h-3.5 w-3.5 shrink-0 ${isChecked ? "text-indigo-400" : "text-slate-400"}`} />
                      <span className="text-xs truncate font-medium">{paper.file_name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-5 shrink-0 border-t border-slate-100">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!name.trim()}
              className="flex-1 py-2.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm"
            >
              确定{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
