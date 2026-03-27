"use client";

import { useState, useEffect } from "react";
import { X, Key, Globe, MessageSquare, AlertCircle, User, Loader2 } from "lucide-react";
import { useSettings } from "../contexts/SettingsContext";
import { useAuthStore } from "../store/authStore";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";

const USERNAME_REGEX = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,15}$/;

export default function SettingsModal() {
  const { user, openAuthModal } = useAuthStore();
  const {
    apiKey,
    baseUrl,
    modelName,
    systemPrompt,
    setApiKey,
    setBaseUrl,
    setModelName,
    setSystemPrompt,
    isSettingsOpen,
    closeSettings,
  } = useSettings();

  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [localBaseUrl, setLocalBaseUrl] = useState(baseUrl);
  const [localModelName, setLocalModelName] = useState(modelName);
  const [localSystemPrompt, setLocalSystemPrompt] = useState(systemPrompt);
  const [apiKeyError, setApiKeyError] = useState(false);

  // Popup states
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Username popup state
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameLoading, setUsernameLoading] = useState(false);

  // Password popup state
  const [originalPassword, setOriginalPassword] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  const isLoggedIn = !!user;
  const currentUsername = (user?.user_metadata as any)?.username || "";

  // Sync local state when modal opens
  useEffect(() => {
    if (isSettingsOpen) {
      setLocalApiKey(apiKey);
      setLocalBaseUrl(baseUrl);
      setLocalModelName(modelName);
      setLocalSystemPrompt(systemPrompt);
      setApiKeyError(false);
    }
  }, [isSettingsOpen, apiKey, baseUrl, modelName, systemPrompt]);

  if (!isSettingsOpen) return null;

  const handleSave = () => {
    const trimmedKey = localApiKey.trim();
    if (!trimmedKey) {
      setApiKeyError(true);
      return;
    }
    setApiKey(trimmedKey);
    setBaseUrl(localBaseUrl.trim());
    setModelName(localModelName.trim());
    setSystemPrompt(localSystemPrompt.trim());
    closeSettings();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeSettings();
    }
  };

  const openUsernameModal = () => {
    setUsernameInput(currentUsername);
    setUsernameError("");
    setShowUsernameModal(true);
  };

  const openPasswordModal = () => {
    setOriginalPassword("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");
    setPasswordError("");
    setShowPasswordModal(true);
  };

  const handleConfirmUsername = async () => {
    const trimmed = usernameInput.trim();
    if (!trimmed) {
      setUsernameError("请填写用户名");
      return;
    }
    if (!USERNAME_REGEX.test(trimmed)) {
      setUsernameError("用户名为 2-15 位，可包含中文、英文、数字和下划线");
      return;
    }
    if (trimmed === currentUsername) {
      setUsernameError("新用户名与当前一致，无需修改");
      return;
    }

    setUsernameLoading(true);
    setUsernameError("");

    try {
      const { error } = await supabase.auth.updateUser({
        data: { username: trimmed },
      });

      if (error) {
        setUsernameError(error.message);
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          useAuthStore.getState().setUser(session.user);
        }
        toast.success("用户名已更新");
        setShowUsernameModal(false);
      }
    } catch {
      setUsernameError("网络错误，请稍后重试");
    } finally {
      setUsernameLoading(false);
    }
  };

  const handleConfirmPassword = async () => {
    if (!originalPassword) {
      setPasswordError("请填写原密码");
      return;
    }
    if (!newPasswordInput) {
      setPasswordError("请填写新密码");
      return;
    }
    if (newPasswordInput.length < 6) {
      setPasswordError("密码至少为 6 位");
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordError("两次输入的新密码不一致");
      return;
    }

    // Verify original password first
    const email = user?.email;
    if (!email) {
      setPasswordError("无法获取账户信息，请重新登录");
      return;
    }

    setPasswordLoading(true);
    setPasswordError("");

    try {
      // Verify original password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: originalPassword,
      });

      if (signInError) {
        setPasswordError("原密码错误");
        setPasswordLoading(false);
        return;
      }

      // Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPasswordInput,
      });

      if (updateError) {
        setPasswordError(updateError.message);
      } else {
        toast.success("密码已更新");
        setShowPasswordModal(false);
      }
    } catch {
      setPasswordError("网络错误，请稍后重试");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-bold text-slate-900">⚙️ 设置中心</h2>
          <button
            onClick={closeSettings}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto flex-1">

          {/* 账户管理区块 - 仅登录用户可见 */}
          {isLoggedIn ? (
            <>
              {/* 个性化欢迎语 */}
              <div className="text-center pb-2">
                <h3 className="text-xl font-semibold text-slate-900">
                  {currentUsername}，感谢支持使用 PaperUWant
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  管理您的账户信息
                </p>
              </div>

              {/* 修改用户名 - 文本展示 + 修改按钮 */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-slate-500" />
                  <label className="text-xs font-semibold text-slate-700">用户名</label>
                </div>
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                  <span className="text-sm text-slate-800">{currentUsername}</span>
                  <button
                    onClick={openUsernameModal}
                    className="px-3 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    修改
                  </button>
                </div>
              </div>

              {/* 修改密码 - 文本展示 + 修改按钮 */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-slate-500" />
                  <label className="text-xs font-semibold text-slate-700">密码</label>
                </div>
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                  <span className="text-sm text-slate-800">••••••••</span>
                  <button
                    onClick={openPasswordModal}
                    className="px-3 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    修改
                  </button>
                </div>
              </div>

              {/* 分隔线 */}
              <div className="border-t border-slate-100" />
            </>
          ) : (
            /* 游客提示 */
            <div className="text-center py-4">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-3 bg-slate-100 rounded-full">
                <User className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 mb-4">登录后可解锁云端账户设置</p>
              <button
                onClick={() => {
                  closeSettings();
                  openAuthModal();
                }}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
              >
                登录
              </button>
            </div>
          )}

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
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-colors"
            />
            <p className="text-[11px] text-slate-400">
              OpenAI 兼容接口地址，如使用中转服务请填入对应地址。
            </p>
          </div>

          {/* Model Name */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-slate-500" />
              <label className="text-xs font-semibold text-slate-700">模型名称 (Model Name)</label>
            </div>
            <input
              type="text"
              value={localModelName}
              onChange={(e) => setLocalModelName(e.target.value)}
              placeholder="gpt-3.5-turbo"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-colors"
            />
            <p className="text-xs text-slate-400">
              输入服务商对应的模型代码，如 gpt-4o、deepseek-chat、qwen-plus
            </p>
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
              placeholder="请输入自定义系统提示词，留空则无预设人设"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
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

      {/* 修改用户名弹窗 */}
      {showUsernameModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setShowUsernameModal(false); }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs mx-4 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-sm font-bold text-slate-900 mb-1">修改用户名</h3>
              <p className="text-xs text-slate-400">2-15 位，可包含中文、英文、数字和下划线</p>
            </div>
            <div className="px-6 pb-6 space-y-4">
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => { setUsernameInput(e.target.value); setUsernameError(""); }}
                placeholder="输入新用户名"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-colors"
              />
              {usernameError && (
                <p className="text-xs text-red-400">{usernameError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowUsernameModal(false)}
                  className="flex-1 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmUsername}
                  disabled={usernameLoading}
                  className="flex-1 py-2.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {usernameLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "确定"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 修改密码弹窗 */}
      {showPasswordModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPasswordModal(false); }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs mx-4 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-sm font-bold text-slate-900 mb-4">修改密码</h3>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">原密码</label>
                  <input
                    type="password"
                    value={originalPassword}
                    onChange={(e) => { setOriginalPassword(e.target.value); setPasswordError(""); }}
                    placeholder="请输入原密码"
                    autoComplete="current-password"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">新密码</label>
                  <input
                    type="password"
                    value={newPasswordInput}
                    onChange={(e) => { setNewPasswordInput(e.target.value); setPasswordError(""); }}
                    placeholder="至少 6 位字符"
                    autoComplete="new-password"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">确认新密码</label>
                  <input
                    type="password"
                    value={confirmPasswordInput}
                    onChange={(e) => { setConfirmPasswordInput(e.target.value); setPasswordError(""); }}
                    placeholder="再次输入新密码"
                    autoComplete="new-password"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 bg-slate-50 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-colors"
                  />
                </div>
              </div>

              {passwordError && (
                <p className="text-xs text-red-400 mt-2">{passwordError}</p>
              )}
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="flex-1 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmPassword}
                disabled={passwordLoading}
                className="flex-1 py-2.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "确定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
