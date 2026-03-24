"use client";

import { useState, useEffect } from "react";
import { X, Key, Globe, Cpu, MessageSquare, AlertCircle } from "lucide-react";
import { useSettings } from "../contexts/SettingsContext";

const MODELS = [
  { value: "MiniMax-M2.7", label: "MiniMax-M2.7" },
  { value: "MiniMax-M2.5", label: "MiniMax-M2.5" },
  { value: "MiniMax-M1.5", label: "MiniMax-M1.5" },
];

export default function SettingsModal() {
  const {
    apiKey,
    baseUrl,
    model,
    systemPrompt,
    setApiKey,
    setBaseUrl,
    setModel,
    setSystemPrompt,
    isSettingsOpen,
    closeSettings,
  } = useSettings();

  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [localBaseUrl, setLocalBaseUrl] = useState(baseUrl);
  const [localModel, setLocalModel] = useState(model);
  const [localSystemPrompt, setLocalSystemPrompt] = useState(systemPrompt);
  const [apiKeyError, setApiKeyError] = useState(false);

  // Sync local state when modal opens
  useEffect(() => {
    if (isSettingsOpen) {
      setLocalApiKey(apiKey);
      setLocalBaseUrl(baseUrl);
      setLocalModel(model);
      setLocalSystemPrompt(systemPrompt);
      setApiKeyError(false);
    }
  }, [isSettingsOpen, apiKey, baseUrl, model, systemPrompt]);

  if (!isSettingsOpen) return null;

  const handleSave = () => {
    const trimmedKey = localApiKey.trim();
    if (!trimmedKey) {
      setApiKeyError(true);
      return;
    }
    setApiKey(trimmedKey);
    setBaseUrl(localBaseUrl.trim() || "https://api.minimax.chat/v1");
    setModel(localModel);
    setSystemPrompt(localSystemPrompt.trim() || "你是一位专业的AI学术助手，专注于帮助用户阅读和理解学术论文。请用清晰、专业的语言回答问题。");
    closeSettings();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeSettings();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">⚙️ 设置中心</h2>
          <button
            onClick={closeSettings}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

          {/* API Key - Required */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Key className="h-3.5 w-3.5 text-slate-500" />
              <label className="text-xs font-semibold text-slate-700">
                API Key <span className="text-red-500">*</span>
              </label>
            </div>
            <input
              type="password"
              value={localApiKey}
              onChange={(e) => {
                setLocalApiKey(e.target.value);
                if (e.target.value.trim()) setApiKeyError(false);
              }}
              placeholder="sk-xxxxxxxxxxxxxxxx"
              className={`w-full px-3 py-2.5 text-sm border rounded-lg outline-none transition-colors focus:ring-2 focus:ring-indigo-50 ${
                apiKeyError
                  ? "border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-50"
                  : "border-slate-200 bg-slate-50 focus:border-indigo-400"
              }`}
            />
            {apiKeyError && (
              <div className="flex items-center gap-1.5 text-red-500 text-xs">
                <AlertCircle className="h-3 w-3 shrink-0" />
                <span>⚠️ API Key 不能为空</span>
              </div>
            )}
          </div>

          {/* BaseURL - Optional */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-slate-500" />
              <label className="text-xs font-semibold text-slate-700">
                API 中转地址 <span className="text-slate-400 font-normal">(可选)</span>
              </label>
            </div>
            <input
              type="text"
              value={localBaseUrl}
              onChange={(e) => setLocalBaseUrl(e.target.value)}
              placeholder="https://api.minimax.chat/v1"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-colors"
            />
            <p className="text-[11px] text-slate-400">
              默认使用官方接口。如果您使用 OneAPI 或本地模型，请修改此项。
            </p>
          </div>

          {/* Model Select */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5 text-slate-500" />
              <label className="text-xs font-semibold text-slate-700">模型</label>
            </div>
            <select
              value={localModel}
              onChange={(e) => setLocalModel(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-colors cursor-pointer"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* System Prompt */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-slate-500" />
              <label className="text-xs font-semibold text-slate-700">
                系统提示词 <span className="text-slate-400 font-normal">(可选)</span>
              </label>
            </div>
            <textarea
              value={localSystemPrompt}
              onChange={(e) => setLocalSystemPrompt(e.target.value)}
              rows={4}
              placeholder="你是一位专业的AI学术助手..."
              className="w-full px-3 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button
            onClick={closeSettings}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}
