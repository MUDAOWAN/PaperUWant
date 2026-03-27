"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

interface FolderRenameModalProps {
  isOpen: boolean;
  currentName: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}

export default function FolderRenameModal({ isOpen, currentName, onCancel, onConfirm }: FolderRenameModalProps) {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, currentName]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onCancel]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) {
      onCancel();
      return;
    }
    onConfirm(trimmed);
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[300] bg-black/20 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onCancel}
      />
      <div className="fixed inset-0 z-[301] flex items-center justify-center">
        <div
          className="bg-white rounded-2xl shadow-2xl shadow-black/20 border border-black/5 w-full max-w-sm mx-4 animate-in zoom-in-95 fade-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-6 pt-6 pb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <Pencil className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">重命名文件夹</h2>
              <p className="text-xs text-slate-400 mt-0.5">修改文件夹名称</p>
            </div>
          </div>
          <div className="px-6 pb-4">
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
              }}
              placeholder="输入新文件夹名称..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 transition-all"
            />
          </div>
          <div className="flex gap-3 px-6 pb-6">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!name.trim() || name.trim() === currentName}
              className="flex-1 py-2.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
