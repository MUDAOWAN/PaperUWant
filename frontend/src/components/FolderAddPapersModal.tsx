"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, FolderInput, FileText, Check } from "lucide-react";
import { Paper, Folder } from "../store/paperStore";

interface FolderAddPapersModalProps {
  isOpen: boolean;
  folder: Folder | null;
  papers: Paper[];
  onCancel: () => void;
  onConfirm: (selectedIds: string[]) => void;
}

export default function FolderAddPapersModal({
  isOpen,
  folder,
  papers,
  onCancel,
  onConfirm,
}: FolderAddPapersModalProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // Reset when opened
  useEffect(() => {
    if (isOpen && folder) {
      setQuery("");
      // Pre-select papers already in this folder
      const preSelected = new Set(
        papers.filter((p) => p.folder_id === folder.id).map((p) => p.id)
      );
      setSelected(preSelected);
    }
  }, [isOpen, folder, papers]);

  // Escape key
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

  const handleConfirm = async () => {
    if (selected.size === 0) {
      onCancel();
      return;
    }
    setIsLoading(true);
    await onConfirm(Array.from(selected));
    setIsLoading(false);
  };

  if (!isOpen || !folder) return null;

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
          style={{ maxHeight: "85vh" }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 pt-6 pb-4 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <FolderInput className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">添加文献至文件夹</h2>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {folder.name}
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="px-6 pb-3 shrink-0">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索文献名称..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all"
              />
            </div>
          </div>

          {/* Paper List */}
          <div className="flex-1 overflow-y-auto px-6 min-h-0" style={{ maxHeight: "55vh" }}>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <FileText className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs">没有找到匹配的文献</p>
              </div>
            ) : (
              <div className="space-y-1 py-1">
                {filtered.map((paper) => {
                  const isChecked = selected.has(paper.id);
                  const isInThisFolder = paper.folder_id === folder.id;
                  return (
                    <button
                      key={paper.id}
                      onClick={() => toggle(paper.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 ${
                        isChecked
                          ? "bg-indigo-50 text-indigo-700"
                          : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      {/* Checkbox */}
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-150 ${
                          isChecked
                            ? "bg-indigo-500 border-indigo-500"
                            : isInThisFolder
                            ? "border-amber-400 bg-amber-50"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {isChecked && <Check className="h-3 w-3 text-white" />}
                        {isInThisFolder && !isChecked && (
                          <Check className="h-3 w-3 text-amber-500" />
                        )}
                      </div>
                      {/* File icon */}
                      <FileText className={`h-4 w-4 shrink-0 ${isChecked ? "text-indigo-400" : "text-slate-400"}`} />
                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate font-medium leading-snug">{paper.file_name}</p>
                        {isInThisFolder && (
                          <p className="text-[10px] text-amber-500 mt-0.5">已在该文件夹</p>
                        )}
                      </div>
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
              disabled={isLoading}
              className="flex-1 py-2.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading}
              className="flex-1 py-2.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>处理中...</span>
                </>
              ) : (
                <span>确定 ({selected.size})</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
