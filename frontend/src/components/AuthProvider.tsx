"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "../store/authStore";
import { usePaperStore } from "../store/paperStore";
import { supabase } from "../lib/supabase";
import AuthModal from "./AuthModal";

export default function AuthProvider() {
  const { setUser, setSession } = useAuthStore();
  const { clearPapers, fetchCloudPapers, fetchFolders } = usePaperStore();
  // State guard: 追踪上一次登录的 user.id，防止窗口聚焦重复触发清空
  const prevUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // 初始化时同步一次当前 session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUserId = session?.user?.id;
      setSession(session);
      setUser(session?.user ?? null);
      prevUserIdRef.current = currentUserId;

      if (session?.user) {
        // 有有效 session，先清理本地残留，再拉取云端文献
        clearPapers();
        fetchCloudPapers(session.user.id);
        fetchFolders(session.user.id);
      }
    });

    // 实时监听 auth 状态变化
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUserId = session?.user?.id;
      const prevUserId = prevUserIdRef.current;

      setSession(session);
      setUser(session?.user ?? null);

      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        if (session?.user) {
          // 仅当 user.id 真正发生变化时才清理并重新拉取
          // （窗口聚焦时 prevUserId === currentUserId，不会触发清理）
          if (prevUserId !== currentUserId) {
            clearPapers();
            fetchCloudPapers(session.user.id);
            fetchFolders(session.user.id);
          }
          prevUserIdRef.current = currentUserId;
        }
      } else if (event === "SIGNED_OUT") {
        prevUserIdRef.current = undefined;
        // 彻底退回游客模式
        clearPapers();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setSession, clearPapers, fetchCloudPapers, fetchFolders]);

  return <AuthModal />;
}
