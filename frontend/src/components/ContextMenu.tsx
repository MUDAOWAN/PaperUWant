"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Pin, PinOff, FolderInput, Trash2, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { Paper, Folder as FolderType } from "../store/paperStore";

interface ContextMenuProps {
  x: number;
  y: number;
  paper: Paper;
  folders: FolderType[];
  onClose: () => void;
  onOpen: () => void;
  onTogglePin: () => void;
  onMoveTo: (folderId: string | null) => void;
  onDelete: () => void;
}

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  action?: () => void;
  danger?: boolean;
  subMenu?: { label: string; icon: React.ReactNode; action: () => void }[];
  separator?: boolean;
}

export default function ContextMenu({
  x,
  y,
  paper,
  folders,
  onClose,
  onOpen,
  onTogglePin,
  onMoveTo,
  onDelete,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [subMenuId, setSubMenuId] = useState<string | null>(null);
  const [pos, setPos] = useState({ x, y });

  // Auto-adjust position near viewport edges
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let px = x;
    let py = y;
    if (px + rect.width > vw - 8) px = vw - rect.width - 8;
    if (py + rect.height > vh - 8) py = vh - rect.height - 8;
    setPos({ x: px, y: py });
  }, [x, y]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on scroll
  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener("scroll", handler, true);
    return () => window.removeEventListener("scroll", handler, true);
  }, [onClose]);

  const items: MenuItem[] = [
    {
      label: "打开文献",
      icon: <FileText className="h-3.5 w-3.5" />,
      action: onOpen,
    },
    {
      label: paper.is_pinned ? "取消置顶" : "置顶文献",
      icon: paper.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />,
      action: onTogglePin,
    },
    {
      label: "移动至...",
      icon: <FolderInput className="h-3.5 w-3.5" />,
      subMenu: [
        {
          label: "移出文件夹",
          icon: <Folder className="h-3.5 w-3.5" />,
          action: () => onMoveTo(null),
        },
        ...folders.map((f) => ({
          label: f.name,
          icon: <FolderOpen className="h-3.5 w-3.5" />,
          action: () => onMoveTo(f.id),
        })),
      ],
    },
    { label: "", icon: null, separator: true },
    {
      label: "删除文献",
      icon: <Trash2 className="h-3.5 w-3.5" />,
      action: onDelete,
      danger: true,
    },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] animate-in fade-in zoom-in-95 duration-150"
      style={{ left: pos.x, top: pos.y }}
      onMouseLeave={() => setSubMenuId(null)}
    >
      <div
        className="bg-white/80 backdrop-blur-xl border border-black/5 shadow-xl shadow-black/10 rounded-xl py-1 min-w-[160px]"
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item, idx) =>
          item.separator ? (
            <div key={idx} className="border-t border-black/5 my-1" />
          ) : (
            <div
              key={idx}
              className="relative"
              onMouseEnter={() => item.subMenu && setSubMenuId(item.label)}
              onMouseLeave={() => item.subMenu && setSubMenuId(null)}
            >
              <button
                onClick={() => {
                  if (!item.subMenu) {
                    item.action?.();
                    onClose();
                  }
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                  item.danger
                    ? "text-red-500 hover:bg-red-50"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className={item.danger ? "text-red-400" : "text-slate-400"}>{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {item.subMenu && (
                  <ChevronRight className="h-3 w-3 text-slate-400" />
                )}
              </button>

              {/* Sub-menu */}
              {item.subMenu && subMenuId === item.label && (
                <div className="absolute left-full top-0 ml-1 bg-white/80 backdrop-blur-xl border border-black/5 shadow-xl shadow-black/10 rounded-xl py-1 min-w-[140px]">
                  {item.subMenu.map((sub, si) => (
                    <button
                      key={si}
                      onClick={() => {
                        sub.action();
                        onClose();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <span className="text-slate-400">{sub.icon}</span>
                      <span className="flex-1 text-left">{sub.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
