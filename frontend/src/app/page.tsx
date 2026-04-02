"use client";

import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { usePaperStore } from "../store/paperStore";
import { toast } from "sonner";
import {
  FileText,
  User,
  BookOpen,
  Sparkles,
  Send,
  Settings,
  MessageSquare,
  MoreVertical,
  UploadCloud,
  LayoutGrid,
  StickyNote,
  Download,
  Loader2,
  PanelLeftClose,
  PanelRightClose,
  PanelLeftOpen,
  PanelRightOpen,
  Square,
  Pencil,
  AlertTriangle,
  LogOut,
  FolderPlus,
  Folder,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronDown,
  Edit2,
  Trash2,
  FilePlus,
  FolderInput,
  Clock,
  Pin,
  PinOff,
  PlusCircle,
  X,
  ChevronUp,
} from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { PanelImperativeHandle } from "react-resizable-panels";
import SmartNotesEditor, { SmartNotesEditorHandle } from "../components/SmartNotesEditor";
import SettingsModal from "../components/SettingsModal";
import FolderCreateModal from "../components/FolderCreateModal";
import FolderRenameModal from "../components/FolderRenameModal";
import DeleteConfirmModal from "../components/DeleteConfirmModal";
import FolderAddPapersModal from "../components/FolderAddPapersModal";
import MovePaperModal from "../components/MovePaperModal";
import PaperSelectModal from "../components/PaperSelectModal";
import { SettingsProvider, useSettings } from "../contexts/SettingsContext";
import dynamic from "next/dynamic";
import { useChat } from "@ai-sdk/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { parsePdfWithAI } from "../lib/api";

const PdfViewer = dynamic(() => import("../components/PdfViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#525659]">
      <div className="h-8 w-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
      <p className="text-sm text-slate-400">Loading PDF viewer...</p>
    </div>
  ),
});

// 预处理：转换 LaTeX 界定符 \(...\) → $...$，\[...\] → $$...$$
function preprocessMarkdownContent(text: string): string {
  return text
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, '$$$1$$')
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, '$$1$');
}


function HomeContent() {
  const { user } = useAuthStore();
  const { papers, folders, currentPaper, currentPdfUrl, usedStorageBytes, setCurrentPaper, fetchFolders, fetchCloudPapers, rehydrateUrls, isLoadingCloud, fetchUsedStorage, deletePaper, togglePin, selectedContextPapers, removeContextPaper, setContextPapers } = usePaperStore();
  const [rightPanelMode, setRightPanelMode] = useState<"chat" | "notes">("chat");
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [showApiKeyToast, setShowApiKeyToast] = useState(false);
  const [input, setInput] = useState("");
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [renameModal, setRenameModal] = useState<{ isOpen: boolean; folder: any }>({ isOpen: false, folder: null });
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; folder: any }>({ isOpen: false, folder: null });
  const [addPapersModal, setAddPapersModal] = useState<{ isOpen: boolean; folder: any }>({ isOpen: false, folder: null });
  const [movePaperModal, setMovePaperModal] = useState<{ isOpen: boolean; paper: any }>({ isOpen: false, paper: null });
  const [deletePaperModal, setDeletePaperModal] = useState<{ isOpen: boolean; paper: any }>({ isOpen: false, paper: null });
  const [paperSelectModal, setPaperSelectModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ paperId: string; x: number; y: number } | null>(null);
  const uncategorizedPapers = papers
    .filter((p) => !p.folder_id)
    .sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  const inputRef = useRef<HTMLInputElement>(null);
  const notesEditorRef = useRef<SmartNotesEditorHandle>(null);
  const leftPanelRef = useRef<PanelImperativeHandle>(null);
  const rightPanelRef = useRef<PanelImperativeHandle>(null);
  const { apiKey, baseUrl, modelName, systemPrompt, openSettings } = useSettings();

  // Logout handler
  const handleLogout = async () => {
    const { supabase } = await import("../lib/supabase");
    await supabase.auth.signOut();
    useAuthStore.getState().setUser(null);
    useAuthStore.getState().setSession(null);
    usePaperStore.getState().reset();
  };

  // Create folder handler — composite: create folder then move selected papers
  const handleConfirmNewFolder = async (name: string, selectedPaperIds: string[]) => {
    if (!user) return;
    await usePaperStore.getState().createFolder(name, user.id);
    // Find the newly created folder (most recent with this name)
    const { data: folderRows } = await (await import("../lib/supabase"))
      .supabase.from("folders").select("id").eq("user_id", user.id).eq("name", name).order("created_at", { ascending: false }).limit(1);
    const newFolderId = folderRows?.[0]?.id;
    toast(
      <div className="flex items-center gap-2 text-green-600 font-medium">
        <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
        新建文件夹成功{selectedPaperIds.length > 0 ? `，已移入 ${selectedPaperIds.length} 篇文献` : ""}
      </div>
    );
    if (selectedPaperIds.length > 0 && newFolderId) {
      await usePaperStore.getState().batchUpdatePaperFolder(selectedPaperIds, newFolderId);
    }
    setIsNewFolderModalOpen(false);
  };

  // Rename folder handler
  const handleConfirmRename = async (name: string) => {
    if (renameModal.folder) {
      await usePaperStore.getState().renameFolder(renameModal.folder.id, name);
      toast(
        <div className="flex items-center gap-2 text-green-600 font-medium">
          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          修改成功
        </div>
      );
    }
    setRenameModal({ isOpen: false, folder: null });
  };

  // Delete folder handler
  const handleConfirmDelete = async () => {
    if (deleteModal.folder) {
      const { deleteFolder } = usePaperStore.getState();
      await deleteFolder(deleteModal.folder.id);
      toast(
        <div className="flex items-center gap-2 text-green-600 font-medium">
          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          删除成功
        </div>
      );
    }
    setDeleteModal({ isOpen: false, folder: null });
  };

  // Add papers to folder handler
  const handleConfirmAddPapers = async (selectedIds: string[]) => {
    if (addPapersModal.folder) {
      await usePaperStore.getState().batchUpdatePaperFolder(selectedIds, addPapersModal.folder.id);
      toast(
        <div className="flex items-center gap-2 text-green-600 font-medium">
          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          已移入文件夹
        </div>
      );
    }
    setAddPapersModal({ isOpen: false, folder: null });
  };

  // Move paper handler
  const handleConfirmMovePaper = async (folderId: string) => {
    if (movePaperModal.paper) {
      await usePaperStore.getState().updatePaperFolder(movePaperModal.paper.id, folderId);
      toast(
        <div className="flex items-center gap-2 text-green-600 font-medium">
          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          已移入文件夹
        </div>
      );
    }
    setMovePaperModal({ isOpen: false, paper: null });
  };

  // Delete paper from confirmation modal
  const handleConfirmDeletePaper = async () => {
    if (!deletePaperModal.paper) return;
    await deletePaper(deletePaperModal.paper.id);
    await fetchCloudPapers(user!.id);
    await fetchUsedStorage(user!.id);
    toast(
      <div className="flex items-center gap-2 text-green-600 font-medium">
        <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
        文献已彻底删除
      </div>
    );
    setDeletePaperModal({ isOpen: false, paper: null });
  };

  // Global click to close context menu
  useEffect(() => {
    const handler = () => setContextMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // Folder accordion toggle
  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // Upload Toast fix: replace toast.error() with plain toast(JSX) to avoid double icon
  const toastError = (msg: string) => {
    toast(
      <div className="flex items-center gap-2 text-red-500 font-medium">
        <XCircle className="w-4 h-4 shrink-0" />
        {msg}
      </div>
    );
  };

  // Upload ref & handler
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const isUploadingRef = useRef(false);
  const QUOTA_BYTES = 1000 * 1024 * 1024; // 1000 MB

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !user || isUploadingRef.current) return;
    isUploadingRef.current = true;
    e.target.value = "";

    const totalSelectedBytes = files.reduce((sum, f) => sum + f.size, 0);

    // Pre-upload quota check
    if (usedStorageBytes + totalSelectedBytes > QUOTA_BYTES) {
      toastError("您的云盘空间不足，请删除部分旧文献或绑定个人云盘");
      isUploadingRef.current = false;
      return;
    }

    const { supabase } = await import("../lib/supabase");

    const loadingToastId = toast(
      <div className="flex items-center text-blue-600 font-medium">
        <Loader2 className="animate-spin mr-2 w-4 h-4 text-blue-500" />
        正在将文件上传至云端，请稍等
      </div>,
      { duration: Infinity }
    );

    let successCount = 0;
    let failCount = 0;

    try {
      for (const file of files) {
        // 底层存储用安全的 ASCII 文件名（时间戳 + 随机哈希 + 原始扩展名）
        const fileExt = file.name.split(".").pop() ?? "pdf";
        const safeFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        const storagePath = `${user.id}/${safeFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("PaperUWant_PDFS")
          .upload(storagePath, file);

        if (uploadError) {
          failCount++;
          toast.error(`"${file.name}" 上传失败`, { duration: 4000 });
          continue;
        }

        const { data: insertData, error: insertError } = await supabase
          .from("papers")
          .insert({ file_name: file.name, storage_path: storagePath, user_id: user.id })
          .select()
          .single();

        if (!insertError && insertData) {
          successCount++;
          // Fire-and-forget: 同步调用 FastAPI 空间解析（不阻塞上传流程）
          parsePdfWithAI(file, insertData.id)
            .then((result) => {
              console.log("🎉 AI 后端解析成功，坐标数据:", result);
            })
            .catch((err) => {
              console.warn("[page] FastAPI 解析失败（不影响上传）:", err.message);
            });
        } else {
          failCount++;
        }
      }

      // 统一的最终结果 toast（替换 loading）
      if (failCount === 0 && successCount === files.length) {
        toast.success(`上传成功 (${successCount}/${files.length})`, {
          id: loadingToastId,
          duration: 3000,
        });
      } else if (successCount > 0) {
        toast.warning(`部分成功 ${successCount} 个，失败 ${failCount} 个`, {
          id: loadingToastId,
          duration: 4000,
        });
      } else {
        toast.error("上传失败", { id: loadingToastId, duration: 4000 });
      }

      await fetchCloudPapers(user.id);
      await fetchUsedStorage(user.id);
    } catch (err) {
      console.error("[page] handleUploadFiles error:", err);
      toast.error("上传过程中出现异常", { id: loadingToastId, duration: 4000 });
    } finally {
      isUploadingRef.current = false;
    }
  };

  // Rehydrate ref to prevent concurrent calls
  const isRehydratingRef = useRef(false);

  // Fetch cloud papers & folders — runs on mount + whenever user changes
  useEffect(() => {
    if (!user?.id) {
      return;
    }
    Promise.all([
      fetchCloudPapers(user.id),
      fetchFolders(user.id),
      fetchUsedStorage(user.id),
    ]).catch((err) => {
      console.error("[page] 拉取用户数据失败:", err);
    });
  }, [user?.id]);

  // Rehydrate signed URL when currentPaper id changes (use stable id, not object ref)
  useEffect(() => {
    if (!currentPaper || isRehydratingRef.current) return;
    isRehydratingRef.current = true;
    rehydrateUrls().finally(() => { isRehydratingRef.current = false; });
  }, [currentPaper?.id]);

  // @ts-ignore - AI SDK v6 API mismatch
  const { messages, sendMessage, status, stop } = useChat({
    // @ts-ignore - AI SDK v6 API mismatch
    api: "/api/chat",
  });
  const isLoading = status === 'submitted' || status === 'streaming';

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 停止生成并恢复最后一条用户消息到输入框（彻底阻断事件冒泡防止死循环）
  const handleStop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    stop();
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user") as any;
    if (lastUserMessage) {
      const text = typeof lastUserMessage.content === 'string'
        ? lastUserMessage.content
        : (lastUserMessage.parts?.find((p: any) => p.type === 'text') as any)?.text || '';
      setInput(text);
      inputRef.current?.focus();
    }
  };

  // 将指定消息填回输入框并 focus
  const handleEditMessage = (msgContent: string) => {
    setInput(msgContent);
    inputRef.current?.focus();
  };

  // auto-scroll — 依赖 messages 和 isLoading 确保锚点始终在底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Interceptor: block if apiKey is not configured
    if (!apiKey.trim()) {
      setShowApiKeyToast(true);
      openSettings();
      setTimeout(() => setShowApiKeyToast(false), 3000);
      return;
    }
    if (input.trim()) {
      sendMessage({ text: input }, { body: { apiKey, baseUrl, modelName, systemPrompt } });
      setInput("");
    }
  };

  const handleExplain = (text: string) => {
    setRightPanelMode("chat");
    if (isRightCollapsed && rightPanelRef.current) {
      rightPanelRef.current.expand();
      setIsRightCollapsed(false);
    }
    sendMessage(
      { text: `请解释以下内容：\n\n${text}` },
      { body: { apiKey, baseUrl, modelName, systemPrompt } }
    );
  };

  const handleAddToNotes = (text: string) => {
    setRightPanelMode("notes");
    if (isRightCollapsed && rightPanelRef.current) {
      rightPanelRef.current.expand();
      setIsRightCollapsed(false);
    }
    if (notesEditorRef.current) {
      notesEditorRef.current.insertText(text);
    }
  };

  const collapseLeft = () => {
    leftPanelRef.current?.collapse();
    setIsLeftCollapsed(true);
  };

  const expandLeft = () => {
    leftPanelRef.current?.expand();
    setIsLeftCollapsed(false);
  };

  const collapseRight = () => {
    rightPanelRef.current?.collapse();
    setIsRightCollapsed(true);
  };

  const expandRight = () => {
    rightPanelRef.current?.expand();
    setIsRightCollapsed(false);
  };

  return (
    <div className="h-screen w-screen bg-slate-50 overflow-hidden flex flex-col">

      {/* ================= 顶部导航栏 ================= */}
      <header className="h-12 border-b border-slate-200 bg-white flex items-center px-4 shrink-0 z-10">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-sm">
          <BookOpen className="h-4 w-4 text-white" />
        </div>
        <span className="font-bold text-sm text-slate-900 ml-2">PaperUWant</span>
        <button
          onClick={openSettings}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          <span>设置</span>
        </button>
      </header>

      {/* ================= 可拖拽面板布局 ================= */}
      <div className="relative w-full h-full flex-1 min-h-[600px] min-w-0">
        <Group
          id="paper-u-want-layout-v6"
          orientation="horizontal"
          className="h-full w-full"
        >

          {/* ================= 左栏：文献库 ================= */}
          <Panel
            id="left-panel"
            panelRef={leftPanelRef}
            defaultSize={20}
            minSize={10}
            collapsible
            collapsedSize={40}
            className="min-w-0 relative flex flex-col h-full"
          >
            {isLeftCollapsed ? (
              <div className="h-full flex flex-col items-center bg-slate-50 border-r border-slate-200 py-4">
                <button
                  onClick={expandLeft}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded-md transition-all"
                  title="展开文献库"
                >
                  <PanelLeftOpen className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="min-w-0 relative flex flex-col h-full bg-white rounded-r-2xl shadow-sm border border-slate-100 overflow-hidden">
                {/* Logo 区域 */}
                <div className="flex items-center gap-2 px-2 h-14 border-b border-slate-100 shrink-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-sm">
                    <BookOpen className="h-4 w-4 text-white" />
                  </div>
                  <span className="font-bold text-sm text-slate-900">文献库</span>
                  {user ? (
                    <>
                      <div className="ml-2 w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      <span className="text-xs text-slate-500 truncate max-w-[80px]">
                        {(user.user_metadata as any)?.username || user.email?.split("@")[0]}
                      </span>
                      <button
                        onClick={handleLogout}
                        className="ml-auto p-1 text-gray-400 hover:text-red-500 rounded-md transition-colors"
                        title="退出登录"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => useAuthStore.getState().openAuthModal()}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <User className="h-3.5 w-3.5" />
                        登录 / 注册
                      </button>
                    </>
                  )}
                  <button
                    onClick={collapseLeft}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                    title="收起"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </button>
                </div>

                {/* 操作区 */}
                <div className="p-4 shrink-0 space-y-3">
                  <button
                    onClick={() => uploadInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all shadow-sm"
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    上传文献
                  </button>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    multiple
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleUploadFiles}
                  />
                  <button
                    onClick={() => setIsNewFolderModalOpen(true)}
                    className="flex w-full items-center justify-center gap-2 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    新建文件夹
                  </button>
                </div>

                {/* 列表区 */}
                {user && (
                  <>
                    {/* 可滚动列表区 */}
                    <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
                      {folders.length > 0 && (
                        <div className="pb-2">
                          <p className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">文件夹</p>
                          {folders.map((folder) => {
                            const isExpanded = expandedFolders.has(folder.id);
                            const folderPapers = papers
                            .filter((p) => p.folder_id === folder.id)
                            .sort((a, b) => {
                              if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
                              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                            });
                            return (
                              <div key={folder.id} className="group mb-2 p-2 bg-gray-50 rounded-lg border border-gray-100/80">
                                {/* Folder row */}
                                <div className="flex items-center gap-1 px-2 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors">
                                  <button
                                    onClick={() => toggleFolder(folder.id)}
                                    className="p-0.5 hover:bg-slate-100 rounded transition-colors shrink-0"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                    )}
                                  </button>
                                  <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                                  <span className="flex-1 truncate font-semibold">{folder.name}</span>
                                  {/* Hover action buttons */}
                                  <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                                    <button
                                      onClick={() => setRenameModal({ isOpen: true, folder })}
                                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                      title="重命名"
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setAddPapersModal({ isOpen: true, folder })}
                                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                      title="移入文献"
                                    >
                                      <FilePlus className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setDeleteModal({ isOpen: true, folder })}
                                      className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                      title="删除"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                                {/* Expanded paper list */}
                                {isExpanded && folderPapers.length > 0 && (
                                  <div className="ml-6 space-y-1 mt-1">
                                    {folderPapers.map((paper) => {
                                      const isSelected = currentPaper?.id === paper.id;
                                      return (
                                        <div
                                          key={paper.id}
                                          onClick={() => setCurrentPaper(paper)}
                                          onContextMenu={(e) => { e.preventDefault(); setContextMenu({ paperId: paper.id, x: e.clientX, y: e.clientY }); }}
                                          className={`px-3 py-[15px] rounded-lg text-sm cursor-pointer transition-all duration-150 ${
                                            isSelected
                                              ? "bg-indigo-50 text-indigo-700 shadow-sm"
                                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                          }`}
                                        >
                                          <div className="flex items-start gap-2">
                                            <FileText className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${isSelected ? "text-indigo-600" : "text-slate-400"}`} />
                                            <div className="flex-1 min-w-0">
                                              <p className="truncate font-medium leading-snug">
                                                {paper.is_pinned && <Pin className={`inline h-3 w-3 mr-1 shrink-0 ${isSelected ? "text-indigo-600" : "text-slate-400"}`} />}
                                                {paper.file_name}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <p className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">未分类文献</p>
                      {isLoadingCloud ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        </div>
                      ) : uncategorizedPapers.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-slate-400 text-center">暂无未分类文献</p>
                      ) : (
                        uncategorizedPapers.map((paper) => {
                          const isSelected = currentPaper?.id === paper.id;
                          return (
                            <div
                              key={paper.id}
                              onClick={() => setCurrentPaper(paper)}
                              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ paperId: paper.id, x: e.clientX, y: e.clientY }); }}
                              className={`px-3 py-[17px] rounded-lg text-sm cursor-pointer transition-all duration-150 ${
                                isSelected
                                  ? "bg-indigo-50 text-indigo-700 shadow-sm"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                              }`}
                            >
                              <div className="flex items-start gap-2.5">
                                <FileText className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${isSelected ? "text-indigo-600" : "text-slate-400"}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="truncate font-medium leading-snug">
                                    {paper.is_pinned && <Pin className={`inline h-3 w-3 mr-1 shrink-0 ${isSelected ? "text-indigo-600" : "text-slate-400"}`} />}
                                    {paper.file_name}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* 容量条 — 固定底部 */}
                    {typeof usedStorageBytes === 'number' && usedStorageBytes >= 0 && (
                      <div className="shrink-0 px-4 pt-4 pb-4 border-t border-gray-100 bg-white/90 backdrop-blur-sm">
                        <p className="text-[11px] text-gray-400 mb-2">如需扩容请到设置绑定个人云盘</p>
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              usedStorageBytes / QUOTA_BYTES > 0.9 ? "bg-red-400" : "bg-blue-500"
                            }`}
                            style={{ width: `${Math.min((usedStorageBytes / QUOTA_BYTES) * 100, 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1.5 text-right">
                          已用 {Math.round(usedStorageBytes / 1024 / 1024)} MB / 1000 MB
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </Panel>

          {/* ================= 拖拽手柄 1 ================= */}
          <Separator className="w-2 relative z-50 flex items-center justify-center cursor-col-resize group">
            <div className="w-[2px] h-full bg-slate-200 group-hover:bg-blue-500 transition-colors rounded-full" />
          </Separator>

          {/* ================= 中栏：阅读器 ================= */}
          <Panel
            id="middle-panel"
            defaultSize={50}
            minSize={30}
            className="min-w-0 relative flex flex-col h-full"
          >
            <main className="h-full flex flex-col bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden min-w-0">
              {/* 顶部工具栏 */}
              <header className="flex items-center justify-between px-6 h-14 border-b border-slate-100 shrink-0 bg-white">
                <div className="flex items-center gap-3">
                  <h1 className="font-bold text-sm text-slate-900 truncate max-w-md">
                    {currentPaper ? currentPaper.file_name : "请在左边选择文献打开"}
                  </h1>
                  {currentPaper && (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-semibold rounded-md">Reading</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                    <Settings className="h-4 w-4" />
                  </button>
                  <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
              </header>

              {/* PDF 内容区 */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {currentPaper ? (
                  <PdfViewer
                    url={currentPdfUrl ?? ""}
                    onExplain={handleExplain}
                    onAddToNotes={handleAddToNotes}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full m-4 bg-gray-50/50 border-2 border-dashed border-gray-200 rounded-2xl">
                    <BookOpen className="w-16 h-16 text-gray-300 animate-pulse" />
                    <p className="text-gray-500 font-medium mt-4">请在左侧选择文献</p>
                    <p className="text-gray-400 text-sm mt-2">支持PDF文献的划词翻译与 AI 阅读</p>
                  </div>
                )}
              </div>
            </main>
          </Panel>

          {/* ================= 拖拽手柄 2 ================= */}
          <Separator className="w-2 relative z-50 flex items-center justify-center cursor-col-resize group">
            <div className="w-[2px] h-full bg-slate-200 group-hover:bg-blue-500 transition-colors rounded-full" />
          </Separator>

          {/* ================= 右栏：AI助手 ================= */}
          <Panel
            id="right-panel"
            panelRef={rightPanelRef}
            defaultSize={30}
            minSize={15}
            collapsible
            collapsedSize={40}
            className="min-w-0 relative flex flex-col h-full overflow-hidden"
          >
            {isRightCollapsed ? (
              <div className="h-full flex flex-col items-center bg-slate-50 border-l border-slate-200 py-4">
                <button
                  onClick={expandRight}
                  className="p-2 text-slate-400 hover:text-teal-600 hover:bg-slate-200 rounded-md transition-all"
                  title="展开AI助手"
                >
                  <PanelRightOpen className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="min-w-0 relative flex-1 flex flex-col bg-white border-slate-100 overflow-hidden">
              {/* AI 标题栏 */}
              <div className="flex items-center gap-3 px-2 h-14 border-b border-slate-100 shrink-0 bg-white">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-500 shadow-sm flex-shrink-0 ml-1">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-sm text-slate-900 flex-1">AI 助手</span>
                <button
                  onClick={() => setRightPanelMode(rightPanelMode === "chat" ? "notes" : "chat")}
                  className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                >
                  {rightPanelMode === "chat" ? (
                    <>
                      <StickyNote className="h-3.5 w-3.5" />
                      <span>笔记</span>
                    </>
                  ) : (
                    <>
                      <LayoutGrid className="h-3.5 w-3.5" />
                      <span>对话</span>
                    </>
                  )}
                </button>
                <button
                  onClick={collapseRight}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors mr-1"
                  title="收起"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
              </div>

              {/* 聊天记录区 / 智能笔记模式 */}
              {rightPanelMode === "chat" ? (
                <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col p-4 gap-6 min-w-0">
                  {messages.length === 0 && (
                    <div className="flex w-full justify-start items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-teal-500 shrink-0 mt-0.5 shadow-md flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-white" />
                      </div>
                      <div className="max-w-[85%] min-w-0 bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm text-slate-700 px-5 py-2 text-[13px] leading-[1.7] shadow-sm">
                        Hi! 我是你的 AI 学术助手。选择论文中的文本可以获取解释，或者直接在下方提问。
                      </div>
                    </div>
                  )}
                  {messages.map((msg: any) => {
                    const textContent = typeof msg.content === 'string' ? msg.content : (msg.parts?.find((p: any) => p.type === 'text') as any)?.text || '';
                    // 过滤 <think> 推理标签（流式传输中断时也可能缺少闭合标签）
                    const displayContent = textContent.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "");
                    const isEmptyAssistant = msg.role === "assistant" && !displayContent.trim();
                    return (
                      <div key={msg.id} className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"} items-start gap-3`}>
                        {msg.role === "assistant" && (
                          <div className="w-8 h-8 rounded-full bg-teal-500 shrink-0 mt-0.5 shadow-md flex items-center justify-center">
                            <Sparkles className="h-4 w-4 text-white" />
                          </div>
                        )}
                        <div className={`
                          ${msg.role === "assistant"
                            ? "w-fit max-w-[85%] self-start bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300 ease-out"
                            : "w-fit max-w-[80%] ml-auto bg-sky-50 border border-sky-100 rounded-2xl rounded-tr-sm text-sky-900 group relative"
                          } rounded-2xl px-5 py-2 text-[13px] leading-[1.7] shadow-sm min-h-[40px] transition-all duration-200`}>
                          {msg.role === "user" && (
                            <button
                              onClick={() => handleEditMessage(textContent)}
                              className="absolute top-2 right-2 p-1.5 bg-white/80 border border-slate-200 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-50"
                              title="重新编辑"
                            >
                              <Pencil className="h-3 w-3 text-slate-500" />
                            </button>
                          )}
                          {isEmptyAssistant ? (
                            <span className="flex items-center gap-1 py-0.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:150ms]" />
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:300ms]" />
                            </span>
                          ) : (
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeRaw, rehypeKatex]}
                              components={{
                                pre: ({ children }) => (
                                  <pre className="max-w-full overflow-x-auto bg-slate-100 rounded-lg p-4 my-3 border border-slate-200">
                                    {children}
                                  </pre>
                                ),
                                code: ({ children, ...props }) => {
                                  const { inline } = props as { inline?: boolean };
                                  return inline ? (
                                    <code className="break-words whitespace-pre-wrap bg-slate-100 px-1.5 py-0.5 border border-slate-200 rounded text-slate-800 text-[12px] font-mono">
                                      {children}
                                    </code>
                                  ) : (
                                    <code className="text-slate-800 text-[12px] font-mono">
                                      {children}
                                    </code>
                                  );
                                },
                                table: ({ children }) => (
                                  <div className="overflow-x-auto w-full my-3">
                                    <table className="border-collapse w-full">{children}</table>
                                  </div>
                                ),
                                th: ({ children }) => (
                                  <th className="bg-slate-50 px-4 py-2 border border-slate-200 text-left text-xs font-semibold text-slate-700 whitespace-nowrap">
                                    {children}
                                  </th>
                                ),
                                td: ({ children }) => (
                                  <td className="px-4 py-2 border border-slate-200 text-xs text-slate-600 min-w-[120px]">
                                    {children}
                                  </td>
                                ),
                                h1: ({ children }) => (
                                  <h1 className="mt-8 mb-3 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">{children}</h1>
                                ),
                                h2: ({ children }) => (
                                  <h2 className="mt-8 mb-3 text-base font-bold text-slate-900 border-b border-slate-200 pb-2">{children}</h2>
                                ),
                                h3: ({ children }) => (
                                  <h3 className="mt-6 mb-2 text-sm font-bold text-slate-800">{children}</h3>
                                ),
                                h4: ({ children }) => (
                                  <h4 className="mt-5 mb-2 text-[13px] font-semibold text-slate-700">{children}</h4>
                                ),
                                strong: ({ children }) => (
                                  <strong className="font-semibold text-slate-900">{children}</strong>
                                ),
                                p: ({ children }) => (
                                  <p className="leading-[1.75] text-[13px] text-slate-700">{children}</p>
                                ),
                                ul: ({ children }) => (
                                  <ul className="ml-5 space-y-1">{children}</ul>
                                ),
                                ol: ({ children }) => (
                                  <ol className="ml-5 space-y-1">{children}</ol>
                                ),
                                li: ({ children }) => (
                                  <li className="text-[13px] leading-[1.7] text-slate-700">{children}</li>
                                ),
                                hr: () => (
                                  <hr className="my-6 border-slate-200" />
                                ),
                                a: ({ children, href }) => (
                                  <a href={href} className="text-blue-600 underline hover:text-blue-700" target="_blank" rel="noopener noreferrer">{children}</a>
                                ),
                              }}
                            >
                              {preprocessMarkdownContent(displayContent)}
                            </ReactMarkdown>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* auto-scroll 透明锚点 */}
                  <div ref={messagesEndRef} className="h-0 opacity-0 shrink-0" aria-hidden="true" />
                </div>
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                  {/* 笔记工具栏 */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 shrink-0">
                    <span className="text-xs font-medium text-slate-600">智能笔记</span>
                    <button className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors">
                      <Download className="h-3 w-3" />
                      导出 .md
                    </button>
                  </div>
                  {/* Tiptap 编辑器 */}
                  <div className="flex-1 overflow-hidden">
                    <SmartNotesEditor ref={notesEditorRef} />
                  </div>
                </div>
              )}

              {/* 输入框区域 - 仅聊天模式显示 */}
              {rightPanelMode === "chat" && (
                <div className="relative p-4 border-t border-slate-100 shrink-0 bg-white">
                  {/* 思考中指示器 - 悬浮在输入框正上方 */}
                  {(() => {
                    const lastMsg = messages[messages.length - 1] as any;
                    const lastText = typeof lastMsg?.content === 'string'
                      ? lastMsg.content
                      : (lastMsg?.parts?.find((p: any) => p.type === 'text') as any)?.text || '';
                    const isThinking = (status === 'submitted' || status === 'streaming') && lastMsg && (
                      lastMsg.role === 'user' ||
                      (lastMsg.role === 'assistant' && !lastText.trim())
                    );
                    return isThinking ? (
                      <div className="absolute -top-8 left-4 z-50 flex items-center gap-1.5 animate-pulse pointer-events-none">
                        <Loader2 className="h-3 w-3 animate-spin text-teal-500 shrink-0" />
                        <span className="text-sm text-black font-bold">✨ AI 思考中...</span>
                      </div>
                    ) : null;
                  })()}

                  {/* 胶囊标签区 + 添加按钮：同一行水平排列 */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {/* 添加文献按钮：永远在最左侧 */}
                    <button
                      type="button"
                      onClick={() => setPaperSelectModal(true)}
                      className="inline-flex items-center gap-1 border border-dashed border-blue-400 text-blue-500 bg-transparent hover:bg-blue-50 hover:border-blue-500 text-xs rounded-full px-2.5 py-1 transition-colors"
                    >
                      <PlusCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>添加文献</span>
                    </button>
                    {/* 文献胶囊列表 */}
                    {(isExpanded ? selectedContextPapers : selectedContextPapers.slice(0, 6)).map((paper) => (
                      <span
                        key={paper.id}
                        className="inline-flex items-center bg-blue-50 text-blue-600 text-xs rounded-full px-2.5 py-1"
                      >
                        <span className="max-w-[120px] truncate" title={paper.file_name}>
                          {paper.file_name}
                        </span>
                        <button
                          onClick={() => removeContextPaper(paper.id)}
                          className="ml-1.5 text-blue-400 hover:text-blue-800 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {/* 折叠/展开按钮 */}
                    {selectedContextPapers.length > 6 && (
                      <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="inline-flex items-center text-xs text-blue-500 hover:text-blue-700 cursor-pointer px-1 transition-colors"
                      >
                        {isExpanded ? (
                          <><ChevronUp className="w-3 h-3 mr-0.5" />收起</>
                        ) : (
                          <><ChevronDown className="w-3 h-3 mr-0.5" />展开 (+{selectedContextPapers.length - 6})</>
                        )}
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-4 py-3 transition-colors focus-within:bg-white focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-50">
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="提问关于论文的问题..."
                      className="flex-1 bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-400"
                    />
                    {isLoading ? (
                      <button
                        type="button"
                        onClick={handleStop}
                        className="p-2 bg-indigo-600 text-white rounded-full shadow-sm hover:bg-indigo-700 hover:shadow transition-all shrink-0"
                      >
                        <Square className="h-4 w-4" />
                      </button>
                    ) : (
                      <button type="submit" disabled={isLoading} className="p-2 bg-indigo-600 text-white rounded-full shadow-sm hover:bg-indigo-700 hover:shadow transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </form>
                </div>
              )}
            </div>
            )}
          </Panel>

        </Group>
      </div>

      {/* API Key Toast */}
      {showApiKeyToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl shadow-lg text-xs text-amber-700 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          请先配置 API Key
        </div>
      )}

      <SettingsModal />
      <FolderCreateModal
        isOpen={isNewFolderModalOpen}
        papers={papers}
        onCancel={() => setIsNewFolderModalOpen(false)}
        onConfirm={handleConfirmNewFolder}
      />
      <FolderRenameModal
        isOpen={renameModal.isOpen}
        currentName={renameModal.folder?.name ?? ""}
        onCancel={() => setRenameModal({ isOpen: false, folder: null })}
        onConfirm={handleConfirmRename}
      />
      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        paperName={deleteModal.folder?.name ?? ""}
        onCancel={() => setDeleteModal({ isOpen: false, folder: null })}
        onConfirm={handleConfirmDelete}
      />
      <DeleteConfirmModal
        isOpen={deletePaperModal.isOpen}
        paperName={deletePaperModal.paper?.file_name ?? ""}
        title="确认删除"
        onCancel={() => setDeletePaperModal({ isOpen: false, paper: null })}
        onConfirm={handleConfirmDeletePaper}
      />
      <FolderAddPapersModal
        isOpen={addPapersModal.isOpen}
        folder={addPapersModal.folder}
        papers={papers}
        onCancel={() => setAddPapersModal({ isOpen: false, folder: null })}
        onConfirm={handleConfirmAddPapers}
      />
      <MovePaperModal
        isOpen={movePaperModal.isOpen}
        paperName={movePaperModal.paper?.file_name ?? ""}
        folders={folders}
        onCancel={() => setMovePaperModal({ isOpen: false, paper: null })}
        onConfirm={handleConfirmMovePaper}
      />
      <PaperSelectModal
        isOpen={paperSelectModal}
        papers={papers}
        selectedPapers={selectedContextPapers}
        onCancel={() => setPaperSelectModal(false)}
        onConfirm={(selected) => {
          setContextPapers(selected);
          setPaperSelectModal(false);
        }}
      />

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[500] bg-white/95 backdrop-blur-md shadow-lg border border-black/5 rounded-xl py-1 w-44 animate-in fade-in zoom-in-95 duration-150"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setCurrentPaper(papers.find((p) => p.id === contextMenu.paperId)!); setContextMenu(null); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <FileText className="h-4 w-4 text-slate-400 shrink-0" />
            打开文献
          </button>
          <button
            onClick={() => { setMovePaperModal({ isOpen: true, paper: papers.find((p) => p.id === contextMenu.paperId) ?? null }); setContextMenu(null); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <FolderInput className="h-4 w-4 text-slate-400 shrink-0" />
            移入文件夹
          </button>
          <button
            onClick={() => { const paper = papers.find((p) => p.id === contextMenu.paperId); if (paper?.created_at) toast(`添加时间：${new Date(paper.created_at).toLocaleString("zh-CN")}`); setContextMenu(null); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Clock className="h-4 w-4 text-slate-400 shrink-0" />
            查看添加时间
          </button>
          <button
            onClick={() => { const paper = papers.find((p) => p.id === contextMenu.paperId); if (paper) { togglePin(paper.id); toast(paper.is_pinned ? "已取消置顶" : "已置顶"); } setContextMenu(null); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {papers.find((p) => p.id === contextMenu.paperId)?.is_pinned ? (
              <PinOff className="h-4 w-4 text-slate-400 shrink-0" />
            ) : (
              <Pin className="h-4 w-4 text-slate-400 shrink-0" />
            )}
            {papers.find((p) => p.id === contextMenu.paperId)?.is_pinned ? "取消置顶" : "置顶文献"}
          </button>
          <div className="h-px bg-slate-100 my-1" />
          <button
            onClick={() => { const paper = papers.find((p) => p.id === contextMenu.paperId); if (paper) setDeletePaperModal({ isOpen: true, paper }); setContextMenu(null); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4 text-red-400 shrink-0" />
            删除文献
          </button>
        </div>
      )}
    </div>
  );
}

// Wrap with SettingsProvider
export default function Home() {
  return (
    <SettingsProvider>
      <HomeContent />
    </SettingsProvider>
  );
}