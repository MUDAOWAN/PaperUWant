"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "../lib/supabase";

export interface Paper {
  id: string;
  file_name: string;
  storage_path?: string; // cloud only
  folder_id: string | null;
  is_pinned: boolean;
  isLocal: boolean;
  pdf_url: string;
  created_at: string;
}

export interface Folder {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
}

interface PaperState {
  folders: Folder[];
  papers: Paper[];
  currentPaper: Paper | null;
  currentPdfUrl: string | null;
  isLoadingCloud: boolean;
  usedStorageBytes: number;
  // Context papers for AI chat
  selectedContextPapers: Paper[];
  // Folder actions
  fetchFolders: (userId: string) => Promise<void>;
  createFolder: (name: string, userId: string) => Promise<void>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  // Paper actions
  setCurrentPaper: (paper: Paper | null) => void;
  setCurrentPdfUrl: (url: string | null) => void;
  addPaper: (paper: Paper) => void;
  clearPapers: () => void;
  reset: () => void;
  fetchCloudPapers: (userId: string) => Promise<void>;
  rehydrateUrls: () => Promise<void>;
  updatePaperFolder: (paperId: string, folderId: string | null) => Promise<void>;
  batchUpdatePaperFolder: (paperIds: string[], folderId: string | null) => Promise<void>;
  togglePin: (paperId: string) => Promise<void>;
  deletePaper: (paperId: string) => Promise<void>;
  setUsedStorageBytes: (bytes: number) => void;
  fetchUsedStorage: (userId: string) => Promise<void>;
  // Context paper actions
  addContextPaper: (paper: Paper) => void;
  removeContextPaper: (paperId: string) => void;
  setContextPapers: (papers: Paper[]) => void;
}

export const usePaperStore = create<PaperState>()(
  persist(
    (set, get) => ({
      folders: [],
      papers: [],
      currentPaper: null,
      currentPdfUrl: null,
      isLoadingCloud: false,
      usedStorageBytes: 0,
      selectedContextPapers: [],

      setCurrentPaper: (paper) => {
        // Focus Sync: auto-replace selectedContextPapers with the newly selected paper
        set({
          currentPaper: paper,
          currentPdfUrl: paper?.pdf_url ?? null,
          selectedContextPapers: paper ? [paper] : [],
        });
      },

      setCurrentPdfUrl: (url) => set({ currentPdfUrl: url }),

      addPaper: (paper) =>
        set((state) => ({
          papers: [paper, ...state.papers],
          currentPaper: paper,
          currentPdfUrl: paper.pdf_url,
        })),

      clearPapers: () =>
        set({ folders: [], papers: [], currentPaper: null, currentPdfUrl: null, usedStorageBytes: 0 }),

      reset: () =>
        set({ folders: [], papers: [], currentPaper: null, currentPdfUrl: null, usedStorageBytes: 0, isLoadingCloud: false, selectedContextPapers: [] }),

      // ================= Folders =================
      fetchFolders: async (userId: string) => {
        try {
          const { data, error } = await supabase
            .from("folders")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: true });
          if (error) {
            console.error("[paperStore] fetchFolders error:", error.message);
            return;
          }
          set({ folders: data ?? [] });
        } catch (err) {
          console.error("[paperStore] fetchFolders exception:", err);
        } finally {
          // no loading state for folders, kept for consistency
        }
      },

      createFolder: async (name: string, userId: string) => {
        try {
          const { data, error } = await supabase
            .from("folders")
            .insert({ name, user_id: userId })
            .select()
            .single();
          if (error) {
            console.error("[paperStore] createFolder error:", error.message);
            return;
          }
          set((state) => ({ folders: [...state.folders, data as Folder] }));
        } catch (err) {
          console.error("[paperStore] createFolder exception:", err);
        }
      },

      renameFolder: async (folderId: string, name: string) => {
        try {
          const { error } = await supabase
            .from("folders")
            .update({ name })
            .eq("id", folderId);
          if (error) {
            console.error("[paperStore] renameFolder error:", error.message);
            return;
          }
          set((state) => ({
            folders: state.folders.map((f) =>
              f.id === folderId ? { ...f, name } : f
            ),
          }));
        } catch (err) {
          console.error("[paperStore] renameFolder exception:", err);
        }
      },

      deleteFolder: async (folderId: string) => {
        // Move all papers in this folder to root
        const { papers } = get();
        const papersInFolder = papers.filter((p) => p.folder_id === folderId);
        for (const paper of papersInFolder) {
          await get().updatePaperFolder(paper.id, null);
        }
        try {
          const { error } = await supabase
            .from("folders")
            .delete()
            .eq("id", folderId);
          if (error) {
            console.error("[paperStore] deleteFolder error:", error.message);
            return;
          }
          set((state) => ({
            folders: state.folders.filter((f) => f.id !== folderId),
          }));
        } catch (err) {
          console.error("[paperStore] deleteFolder exception:", err);
        }
      },

      // ================= Papers =================
      fetchCloudPapers: async (userId: string) => {
        set({ isLoadingCloud: true });
        try {
          const { data, error } = await supabase
            .from("papers")
            .select("*")
            .eq("user_id", userId)
            .order("is_pinned", { ascending: false })
            .order("created_at", { ascending: false });

          if (error) {
            console.error("[paperStore] fetchCloudPapers error:", error.message);
            return;
          }

          const cloudPapers: Paper[] = (data ?? []).map((row: any) => ({
            id: row.id,
            file_name: row.file_name,
            storage_path: row.storage_path,
            folder_id: row.folder_id ?? null,
            is_pinned: row.is_pinned ?? false,
            isLocal: false,
            pdf_url: "",
            created_at: row.created_at,
          }));

          set({ papers: cloudPapers });
        } catch (err) {
          console.error("[paperStore] fetchCloudPapers exception:", err);
        } finally {
          set({ isLoadingCloud: false });
        }
      },

      rehydrateUrls: async () => {
        const { currentPaper, papers } = get();
        if (!currentPaper) return;

        if (currentPaper.isLocal) {
          const updated: Paper = { ...currentPaper, pdf_url: "" };
          set({ currentPaper: updated, currentPdfUrl: null });
          return;
        }

        if (!currentPaper.storage_path) {
          set({ currentPaper: { ...currentPaper, pdf_url: "" }, currentPdfUrl: null });
          return;
        }

        try {
          const { data, error } = await supabase.storage
            .from("PaperUWant_PDFS")
            .createSignedUrl(currentPaper.storage_path, 3600);

          if (error || !data?.signedUrl) {
            set({ currentPaper: { ...currentPaper, pdf_url: "" }, currentPdfUrl: null });
            return;
          }

          const updated: Paper = { ...currentPaper, pdf_url: data.signedUrl };
          const updatedPapers = papers.map((p) =>
            p.id === updated.id ? updated : p
          );
          set({ currentPaper: updated, currentPdfUrl: data.signedUrl, papers: updatedPapers });
        } catch {
          set({ currentPaper: { ...currentPaper, pdf_url: "" }, currentPdfUrl: null });
        }
      },

      batchUpdatePaperFolder: async (paperIds: string[], folderId: string | null) => {
        try {
          const { error } = await supabase
            .from("papers")
            .update({ folder_id: folderId })
            .in("id", paperIds);
          if (error) {
            console.error("[paperStore] batchUpdatePaperFolder error:", error.message);
            return;
          }
          set((state) => ({
            papers: state.papers.map((p) =>
              paperIds.includes(p.id) ? { ...p, folder_id: folderId } : p
            ),
          }));
        } catch (err) {
          console.error("[paperStore] batchUpdatePaperFolder exception:", err);
        }
      },

      updatePaperFolder: async (paperId: string, folderId: string | null) => {
        try {
          const { error } = await supabase
            .from("papers")
            .update({ folder_id: folderId })
            .eq("id", paperId);
          if (error) {
            console.error("[paperStore] updatePaperFolder error:", error.message);
            return;
          }
          set((state) => ({
            papers: state.papers.map((p) =>
              p.id === paperId ? { ...p, folder_id: folderId } : p
            ),
          }));
        } catch (err) {
          console.error("[paperStore] updatePaperFolder exception:", err);
        }
      },

      togglePin: async (paperId: string) => {
        const { papers } = get();
        const paper = papers.find((p) => p.id === paperId);
        if (!paper) return;
        const newPinned = !paper.is_pinned;
        try {
          const { error } = await supabase
            .from("papers")
            .update({ is_pinned: newPinned })
            .eq("id", paperId);
          if (error) {
            console.error("[paperStore] togglePin error:", error.message);
            return;
          }
          // Re-sort: pinned first, then by created_at desc
          const updatedPapers = papers
            .map((p) => (p.id === paperId ? { ...p, is_pinned: newPinned } : p))
            .sort((a, b) => {
              if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
          const updatedCurrent =
            get().currentPaper?.id === paperId
              ? { ...get().currentPaper!, is_pinned: newPinned }
              : get().currentPaper;
          set({ papers: updatedPapers, currentPaper: updatedCurrent });
        } catch (err) {
          console.error("[paperStore] togglePin exception:", err);
        }
      },

      deletePaper: async (paperId: string) => {
        const { papers, currentPaper } = get();
        const paper = papers.find((p) => p.id === paperId);
        if (!paper) return;
        try {
          // Delete from DB
          const { error: dbError } = await supabase
            .from("papers")
            .delete()
            .eq("id", paperId);
          if (dbError) {
            console.error("[paperStore] deletePaper DB error:", dbError.message);
            return;
          }
          // Delete from Storage if cloud paper
          if (!paper.isLocal && paper.storage_path) {
            await supabase.storage
              .from("PaperUWant_PDFS")
              .remove([paper.storage_path]);
          }
          // Remove from store
          const remaining = papers.filter((p) => p.id !== paperId);
          const isCurrentDeleted = currentPaper?.id === paperId;
          set({
            papers: remaining,
            currentPaper: isCurrentDeleted ? null : currentPaper,
            currentPdfUrl: isCurrentDeleted ? null : get().currentPdfUrl,
          });
        } catch (err) {
          console.error("[paperStore] deletePaper exception:", err);
        }
      },

      setUsedStorageBytes: (bytes) => set({ usedStorageBytes: bytes }),

      fetchUsedStorage: async (userId: string) => {
        try {
          const { data, error } = await supabase.storage
            .from("PaperUWant_PDFS")
            .list(userId, { limit: 1000 });
          if (error) {
            console.error("[paperStore] fetchUsedStorage error:", error.message);
            set({ usedStorageBytes: 0 });
            return;
          }
          const totalBytes = (data ?? []).reduce(
            (sum: number, f: any) => sum + (f.metadata?.size ?? 0),
            0
          );
          set({ usedStorageBytes: totalBytes });
        } catch (err) {
          console.error("[paperStore] fetchUsedStorage exception:", err);
          set({ usedStorageBytes: 0 });
        }
      },

      // ================= Context Papers =================
      addContextPaper: (paper) =>
        set((state) => {
          if (state.selectedContextPapers.some((p) => p.id === paper.id)) return state;
          return { selectedContextPapers: [...state.selectedContextPapers, paper] };
        }),

      removeContextPaper: (paperId) =>
        set((state) => ({
          selectedContextPapers: state.selectedContextPapers.filter((p) => p.id !== paperId),
        })),

      setContextPapers: (papers) => set({ selectedContextPapers: papers }),
    }),
    {
      name: "paper-u-want-storage",
      partialize: (state) => ({ currentPaper: state.currentPaper, usedStorageBytes: state.usedStorageBytes }),
    }
  )
);
