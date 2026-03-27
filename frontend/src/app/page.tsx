"use client";

import { useState, useRef, useEffect } from "react";
import {
  FileText,
  Search,
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
} from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { PanelImperativeHandle } from "react-resizable-panels";
import SmartNotesEditor, { SmartNotesEditorHandle } from "../components/SmartNotesEditor";
import SettingsModal from "../components/SettingsModal";
import { SettingsProvider, useSettings } from "../contexts/SettingsContext";
import dynamic from "next/dynamic";
import { useChat } from "@ai-sdk/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

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

const mockPapers = [
  {
    id: 1,
    title: "Attention Is All You Need",
    authors: "Vaswani et al.",
    icon: FileText,
    selected: true,
  },
  {
    id: 2,
    title: "BERT: Pre-training of Deep Bidirectional Transformers",
    authors: "Devlin et al.",
    icon: FileText,
    selected: false,
  },
  {
    id: 3,
    title: "GPT-4 Technical Report",
    authors: "OpenAI",
    icon: FileText,
    selected: false,
  },
  {
    id: 4,
    title: "Llama 2: Open Foundation and Chat Models",
    authors: "Touvron et al.",
    icon: FileText,
    selected: false,
  },
  {
    id: 5,
    title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP",
    authors: "Lewis et al.",
    icon: FileText,
    selected: false,
  },
];

function HomeContent() {
  const [papers] = useState(mockPapers);
  const [selectedPaper, setSelectedPaper] = useState(1);
  const [rightPanelMode, setRightPanelMode] = useState<"chat" | "notes">("chat");
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [showApiKeyToast, setShowApiKeyToast] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const notesEditorRef = useRef<SmartNotesEditorHandle>(null);
  const leftPanelRef = useRef<PanelImperativeHandle>(null);
  const rightPanelRef = useRef<PanelImperativeHandle>(null);
  const { apiKey, baseUrl, modelName, systemPrompt, openSettings } = useSettings();

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
                <div className="flex items-center gap-3 px-2 h-14 border-b border-slate-100 shrink-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-sm">
                    <BookOpen className="h-4 w-4 text-white" />
                  </div>
                  <span className="font-bold text-sm text-slate-900">文献库</span>
                  <button
                    onClick={collapseLeft}
                    className="ml-auto p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                    title="收起"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </button>
                </div>

                {/* 搜索与上传区 */}
                <div className="p-4 shrink-0 space-y-3">
                  <div className="relative flex items-center rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 transition-colors focus-within:bg-white focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-50">
                    <Search className="mr-2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="搜索文献..."
                      className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>
                  <button className="flex w-full items-center justify-center gap-2 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all shadow-sm">
                    <UploadCloud className="h-3.5 w-3.5" />
                    添加文献
                  </button>
                </div>

                {/* 文件列表 */}
                <div className="flex-1 px-4 pb-4 space-y-1.5 overflow-y-auto min-w-0">
                  {papers.map((paper) => {
                    const Icon = paper.icon;
                    const isSelected = selectedPaper === paper.id;
                    return (
                      <div
                        key={paper.id}
                        onClick={() => setSelectedPaper(paper.id)}
                        className={`px-3 py-3 rounded-lg text-xs cursor-pointer transition-all duration-150 ${
                          isSelected
                            ? "bg-indigo-50 text-indigo-700 shadow-sm"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${isSelected ? "text-indigo-600" : "text-slate-400"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-medium leading-snug">{paper.title}</p>
                            <p className={`text-[10px] mt-0.5 ${isSelected ? "text-indigo-400" : "text-slate-400"}`}>
                              {paper.authors}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                  <h1 className="font-bold text-sm text-slate-900 truncate max-w-md">Attention Is All You Need</h1>
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-semibold rounded-md">Reading</span>
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
                <PdfViewer
                  url="/SplaTAM_Splat, Track & Map 3D Gaussians for Dense RGB-D SLAM.pdf"
                  onExplain={handleExplain}
                  onAddToNotes={handleAddToNotes}
                />
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
                  <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-4 py-3 transition-colors focus-within:bg-white focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-50">
                    <button type="button" className="text-slate-400 hover:text-indigo-500 transition-colors shrink-0">
                      <MessageSquare className="h-4 w-4" />
                    </button>
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