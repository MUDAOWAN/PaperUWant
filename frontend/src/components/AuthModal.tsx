"use client";

import { useState, useEffect } from "react";
import { X, Mail, Lock, Loader2, CloudOff, ArrowRight, User, CheckCircle } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";

type Mode = "login" | "register" | "forgot_password";

interface FormErrors {
  email: string;
  password: string;
  username: string;
  general: string;
}

interface ForgotPasswordState {
  email: string;
  submitted: boolean;
  error: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,15}$/;

export default function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, isAuthLoading, setAuthLoading, setUser, setSession } =
    useAuthStore();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [errors, setErrors] = useState<FormErrors>({
    email: "",
    password: "",
    username: "",
    general: "",
  });
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [forgotPassword, setForgotPassword] = useState<ForgotPasswordState>({
    email: "",
    submitted: false,
    error: "",
  });

  useEffect(() => {
    if (isAuthModalOpen) {
      setMode("login");
      setEmail("");
      setPassword("");
      setUsername("");
      setErrors({ email: "", password: "", username: "", general: "" });
      setRegisterSuccess(false);
      setRegisteredEmail("");
      setForgotPassword({ email: "", submitted: false, error: "" });
    }
  }, [isAuthModalOpen]);

  if (!isAuthModalOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeAuthModal();
  };

  const clearError = (field: keyof FormErrors) => {
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setUsername("");
    setErrors({ email: "", password: "", username: "", general: "" });
    setForgotPassword({ email: "", submitted: false, error: "" });
  };

  const toggleMode = (newMode: Mode) => {
    setMode(newMode);
    resetForm();
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setErrors((prev) => ({ ...prev, email: "请填写邮箱" }));
      return;
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setErrors((prev) => ({ ...prev, email: "邮箱格式不正确" }));
      return;
    }

    setAuthLoading(true);
    setErrors({ email: "", password: "", username: "", general: "" });
    setForgotPassword({ email: "", submitted: false, error: "" });

    try {
      const redirectTo = `${window.location.origin}/update-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });

      if (error) {
        setForgotPassword({ email: "", submitted: false, error: translateError(error.message) });
      } else {
        setForgotPassword({ email: cleanEmail, submitted: true, error: "" });
      }
    } catch {
      setForgotPassword({ email: "", submitted: false, error: "网络错误，请稍后重试" });
    } finally {
      setAuthLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = { email: "", password: "", username: "", general: "" };
    let hasError = false;

    if (!email.trim()) {
      newErrors.email = "请填写邮箱";
      hasError = true;
    } else if (!EMAIL_REGEX.test(email.trim())) {
      newErrors.email = "邮箱格式不正确";
      hasError = true;
    }

    if (!password) {
      newErrors.password = "请填写密码";
      hasError = true;
    } else if (password.length < 6) {
      newErrors.password = "密码至少为 6 位";
      hasError = true;
    }

    if (mode === "register") {
      if (!username.trim()) {
        newErrors.username = "请填写用户名";
        hasError = true;
      } else if (!USERNAME_REGEX.test(username.trim())) {
        newErrors.username = "用户名为 2-15 位，可包含中文、英文、数字和下划线";
        hasError = true;
      }
    }

    setErrors(newErrors);
    return !hasError;
  };

  const translateError = (msg: string): string => {
    if (msg === "Invalid login credentials") return "邮箱或密码错误";
    if (msg === "Email not confirmed") return "请先验证您的邮箱后再登录";
    return msg;
  };

  const isDuplicateEmailError = (msg: string): boolean => {
    const lower = msg.toLowerCase();
    return (
      lower.includes("already registered") ||
      lower.includes("already exists") ||
      lower.includes("already been used")
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    // 第一道护盾：输入数据清洗
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();

    setAuthLoading(true);
    setErrors({ email: "", password: "", username: "", general: "" });

    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) {
          setErrors((prev) => ({ ...prev, general: translateError(error.message) }));
        } else {
          setUser(data.user);
          setSession(data.session);
          toast.success("登录成功！");
          closeAuthModal();
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { username: cleanUsername },
          },
        });

        // 第二道护盾：显式错误拦截
        if (error) {
          const msg = error.message;
          const is422 = error.status === 422;
          if (is422 || isDuplicateEmailError(msg)) {
            setErrors((prev) => ({ ...prev, email: "该邮箱已被注册" }));
          } else {
            setErrors((prev) => ({ ...prev, general: translateError(msg) }));
          }
          return;
        }

        // 第三道护盾：隐式"假成功"拦截（防枚举）
        if (!data.user || !data.user.identities?.length) {
          setErrors((prev) => ({ ...prev, email: "该邮箱已被注册" }));
          return;
        }

        // 真正注册成功
        await supabase.auth.signOut();
        setRegisteredEmail(cleanEmail);
        setRegisterSuccess(true);
      }
    } catch {
      setErrors((prev) => ({ ...prev, general: "网络错误，请稍后重试" }));
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20"
      onClick={handleOverlayClick}
    >
      <div className="w-full max-w-sm mx-4 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-10 pb-6 text-center">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {mode === "login" ? "欢迎回来" : mode === "register" ? "创建账号" : "重置密码"}
            </h2>
            <p className="mt-1.5 text-xs text-slate-400">
              {mode === "login"
                ? "登录以开启云端文献库与跨设备同步"
                : mode === "register"
                ? "注册以开启云端文献库与跨设备同步"
                : "输入您注册的邮箱，我们将发送重置链接"}
            </p>
          </div>
          <button
            onClick={closeAuthModal}
            className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        {mode === "forgot_password" ? (
          /* 忘记密码表单 */
          <form onSubmit={handleForgotPassword} noValidate className="px-6 pb-6 space-y-5">
            {/* Email */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                <label className="text-xs font-medium text-slate-500">邮箱</label>
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                placeholder="you@example.com"
                autoComplete="email"
                className={`w-full px-3 py-2.5 text-sm text-slate-800 bg-slate-50 border rounded-xl outline-none transition-all placeholder:text-slate-300 ${
                  errors.email ? "border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-50" : "border-slate-200 focus:border-indigo-400 focus:ring-indigo-50"
                }`}
              />
              {errors.email && (
                <p className="text-xs text-red-400 animate-fade-in">{errors.email}</p>
              )}
            </div>

            {/* Error */}
            {forgotPassword.error && (
              <p className="text-xs text-red-400 animate-fade-in">{forgotPassword.error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isAuthLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>发送中...</span>
                </>
              ) : (
                <>
                  <span>发送重置链接</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {/* Back to login */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => toggleMode("login")}
                className="text-xs text-slate-400 hover:text-indigo-500 transition-colors"
              >
                想起密码了？返回登录
              </button>
            </div>
          </form>
        ) : (
          /* 登录/注册表单 */
          <form onSubmit={handleSubmit} noValidate className="px-6 pb-6 space-y-5">
            {/* Username - only in register */}
            {mode === "register" && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <label className="text-xs font-medium text-slate-500">用户名</label>
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); clearError("username"); }}
                  placeholder="设置您的用户名"
                  autoComplete="username"
                  className={`w-full px-3 py-2.5 text-sm text-slate-800 bg-slate-50 border rounded-xl outline-none transition-all placeholder:text-slate-300 ${
                    errors.username ? "border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-50" : "border-slate-200 focus:border-indigo-400 focus:ring-indigo-50"
                  }`}
                />
                {errors.username && (
                  <p className="text-xs text-red-400 animate-fade-in">{errors.username}</p>
                )}
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                <label className="text-xs font-medium text-slate-500">邮箱</label>
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                placeholder="you@example.com"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className={`w-full px-3 py-2.5 text-sm text-slate-800 bg-slate-50 border rounded-xl outline-none transition-all placeholder:text-slate-300 ${
                  errors.email ? "border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-50" : "border-slate-200 focus:border-indigo-400 focus:ring-indigo-50"
                }`}
              />
              {errors.email && (
                <p className="text-xs text-red-400 animate-fade-in">{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                <label className="text-xs font-medium text-slate-500">密码</label>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
                placeholder={mode === "register" ? "至少 6 位字符" : "••••••••"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className={`w-full px-3 py-2.5 text-sm text-slate-800 bg-slate-50 border rounded-xl outline-none transition-all placeholder:text-slate-300 ${
                  errors.password ? "border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-50" : "border-slate-200 focus:border-indigo-400 focus:ring-indigo-50"
                }`}
              />
              {errors.password && (
                <p className="text-xs text-red-400 animate-fade-in">{errors.password}</p>
              )}
            </div>

            {/* 忘记密码链接 - 仅登录模式 */}
            {mode === "login" && (
              <div className="text-right -mt-2">
                <button
                  type="button"
                  onClick={() => toggleMode("forgot_password")}
                  className="text-xs text-slate-400 hover:text-indigo-500 transition-colors"
                >
                  忘记密码？
                </button>
              </div>
            )}

            {/* General error */}
            {errors.general && (
              <p className="text-xs text-red-400 animate-fade-in">{errors.general}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isAuthLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{mode === "login" ? "登录中..." : "注册中..."}</span>
                </>
              ) : (
                <>
                  <span>{mode === "login" ? "登录" : "注册"}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {/* Toggle */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => toggleMode(mode === "login" ? "register" : "login")}
                className="text-xs text-slate-400 hover:text-indigo-500 transition-colors"
              >
                {mode === "login" ? "还没有账号？立即注册" : "已有账号？去登录"}
              </button>
            </div>

            {/* Skip hint */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={closeAuthModal}
                className="flex items-center justify-center gap-1.5 w-full text-xs text-slate-400/60 hover:text-slate-500 transition-colors"
              >
                <CloudOff className="h-3 w-3" />
                <span>暂不登录，继续使用本地功能</span>
              </button>
            </div>
          </form>
        )}

        {/* 注册成功确认页 */}
        {registerSuccess && (
          <div className="px-6 pb-8 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="flex items-center justify-center w-14 h-14 mb-4 bg-teal-50 rounded-full">
                <CheckCircle className="h-7 w-7 text-teal-500" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">注册成功！</h3>
              <p className="text-xs text-slate-500 mb-1">验证邮件已发送至</p>
              <p className="text-xs font-semibold text-indigo-600 mb-5">{registeredEmail}</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                请前往邮箱查收验证邮件，点击邮件中的链接完成账号激活。
              </p>
            </div>
            <button
              onClick={() => {
                setRegisterSuccess(false);
                closeAuthModal();
              }}
              className="w-full mt-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all"
            >
              我知道了
            </button>
          </div>
        )}

        {/* 忘记密码成功确认页 */}
        {forgotPassword.submitted && (
          <div className="px-6 pb-8 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="flex items-center justify-center w-14 h-14 mb-4 bg-teal-50 rounded-full">
                <CheckCircle className="h-7 w-7 text-teal-500" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">重置链接已发送！</h3>
              <p className="text-xs text-slate-500 mb-1">密码重置邮件已发送至</p>
              <p className="text-xs font-semibold text-indigo-600 mb-5">{forgotPassword.email}</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                请前往邮箱查收邮件，点击链接重置您的密码。
              </p>
            </div>
            <button
              onClick={() => {
                setForgotPassword({ email: "", submitted: false, error: "" });
                toggleMode("login");
              }}
              className="w-full mt-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all"
            >
              返回登录
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
