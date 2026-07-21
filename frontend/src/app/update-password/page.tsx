"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, CheckCircle, AlertCircle, ArrowRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("您的密码已成功更新");
  const [isHydrated, setIsHydrated] = useState(false);

  // Check if user has a valid session (they should arrive via email link)
  useEffect(() => {
    setIsHydrated(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // No session means they didn't arrive via a valid reset link
        toast.error("请通过有效的密码重置链接访问此页面");
        router.push("/");
      }
    });
  }, [router]);

  const validate = (): boolean => {
    if (!password) {
      setError("请填写新密码");
      return false;
    }
    if (password.length < 6) {
      setError("密码至少为 6 位");
      return false;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return false;
    }
    return true;
  };

  const isSamePasswordError = (message: string): boolean => {
    const lower = message.toLowerCase();
    return lower.includes("password") && (
      lower.includes("same") ||
      lower.includes("different") ||
      lower.includes("unchanged")
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    setError("");

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        if (isSamePasswordError(updateError.message)) {
          setSuccessMessage("该密码已是当前密码，当前账号已登录");
          setIsSuccess(true);
          toast.success("当前账号已登录");
          return;
        }
        setError(updateError.message);
      } else {
        setSuccessMessage("您的密码已成功更新");
        setIsSuccess(true);
        toast.success("密码修改成功！");
      }
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isHydrated) {
    return null;
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="w-full max-w-sm mx-4 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden">
          <div className="px-6 pt-10 pb-8">
            <div className="flex flex-col items-center text-center">
              <div className="flex items-center justify-center w-14 h-14 mb-4 bg-teal-50 rounded-full">
                <CheckCircle className="h-7 w-7 text-teal-500" />
              </div>
              <h2 className="text-base font-bold text-slate-900 mb-1">密码状态已确认</h2>
              <p className="text-xs text-slate-500 mb-5">{successMessage}</p>
            </div>
            <button
              onClick={() => router.push("/")}
              className="w-full py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <span>返回首页</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-sm mx-4 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-10 pb-6 text-center">
          <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-indigo-50 rounded-full">
            <Lock className="h-6 w-6 text-indigo-500" />
          </div>
          <h2 className="text-base font-bold text-slate-900">设置新密码</h2>
          <p className="mt-1.5 text-xs text-slate-400">请输入您的新密码，至少 6 位字符</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="px-6 pb-6 space-y-5">
          {/* New Password */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-slate-400" />
              <label className="text-xs font-medium text-slate-500">新密码</label>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              placeholder="至少 6 位字符"
              autoComplete="new-password"
              className="w-full px-3 py-2.5 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-colors"
            />
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-slate-400" />
              <label className="text-xs font-medium text-slate-500">确认密码</label>
            </div>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError("");
              }}
              placeholder="再次输入新密码"
              autoComplete="new-password"
              className="w-full px-3 py-2.5 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-colors"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-1.5 text-red-500 text-xs">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>修改中...</span>
              </>
            ) : (
              <>
                <span>确认修改</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
