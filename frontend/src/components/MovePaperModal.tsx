"use client";

import { useEffect, useState } from "react";
import { FolderInput, Folder, Check } from "lucide-react";
import { Folder as FolderType } from "../store/paperStore";

interface MovePaperModalProps {
  isOpen: boolean;
  paperName: string;
  folders: FolderType[];
  onCancel: () => void;
  onConfirm: (folderId: string) => void;
}

export default function MovePaperModal({
  isOpen,
  paperName,
  folders,
  onCancel,
  onConfirm,
}: MovePaperModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) setSelectedId(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onCancel]);

  const handleConfirm = async () => {
    if (!selectedId) return;
    setIsLoading(true);
    await onConfirm(selectedId);
    setIsLoading(false);
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
          className="bg-white rounded-2xl shadow-2xl shadow-black/20 border border-black/5 w-full max-w-sm mx-4 animate-in zoom-in-95 fade-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 pt-6 pb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <FolderInput className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">移入文件夹</h2>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{paperName}</p>
            </div>
          </div>

          {/* Folder list */}
          <div className="px-6 pb-4 max-h-64 overflow-y-auto">
            {folders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Folder className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs text-center">暂无文件夹，请先创建</p>
              </div>
            ) : (
              <div className="space-y-1">
                {folders.map((folder) => {
                  const isSelected = selectedId === folder.id;
                  return (
                    <button
                      key={folder.id}
                      onClick={() => setSelectedId(folder.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 ${
                        isSelected
                          ? "bg-indigo-50 text-indigo-700"
                          : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                          isSelected ? "border-indigo-500 bg-indigo-500" : "border-slate-300"
                        }`}
                      >
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <Folder className={`h-4 w-4 shrink-0 ${isSelected ? "text-indigo-400" : "text-amber-500"}`} />
                      <span className="text-sm font-medium truncate">{folder.name}</span>
                      {isSelected && <Check className="ml-auto h-4 w-4 text-indigo-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 pb-6">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 py-2.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedId || isLoading}
              className="flex-1 py-2.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm"
            >
              {isLoading ? "移动中..." : "确定"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
