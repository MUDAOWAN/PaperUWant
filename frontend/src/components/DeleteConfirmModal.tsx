"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  paperName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteConfirmModal({
  isOpen,
  paperName,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onCancel]);

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
          {/* Icon */}
          <div className="flex justify-center pt-8 pb-4">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="h-7 w-7 text-red-500" />
            </div>
          </div>

          {/* Content */}
          <div className="px-6 pb-2 text-center">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">
              确定要删除这篇文献吗？
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              删除后将从云端彻底移除，且不可恢复。
            </p>
            {paperName && (
              <p className="mt-2 text-xs text-slate-400 font-medium truncate">
                {paperName}
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3 px-6 py-6">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-sm"
            >
              确认删除
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
