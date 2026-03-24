"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { forwardRef, useImperativeHandle } from "react";

const initialContent = `
<h2>Research Notes</h2>
<p>This is a <strong>sample note</strong> with academic content to demonstrate the editor.</p>
<ul>
  <li>First observation about the paper</li>
  <li>Second key insight from the methodology</li>
  <li>Methodology notes and observations</li>
</ul>
<p>Here's a LaTeX formula placeholder: E = mc²</p>
<p>And another: A = πr²</p>
<h3>Key Takeaways</h3>
<p>The transformer architecture fundamentally changed NLP by replacing recurrence with self-attention mechanisms.</p>
`;

export interface SmartNotesEditorHandle {
  insertText: (text: string) => void;
}

const SmartNotesEditor = forwardRef<SmartNotesEditorHandle>(function SmartNotesEditor(_, ref) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start taking notes...",
      }),
    ],
    content: initialContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[300px] text-slate-700 leading-relaxed",
      },
    },
  });

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      if (editor) {
        const citation = `\n<p><em>文献引用：${text}</em></p>\n`;
        editor.chain().focus().insertContent(citation).run();
      }
    },
  }));

  if (!editor) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Loading editor...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-6">
        <style jsx>{`
          .ProseMirror {
            outline: none;
          }
          .ProseMirror h2 {
            font-size: 1.25rem;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 0.75rem;
            margin-top: 1.5rem;
          }
          .ProseMirror h2:first-child {
            margin-top: 0;
          }
          .ProseMirror h3 {
            font-size: 1.1rem;
            font-weight: 600;
            color: #334155;
            margin-bottom: 0.5rem;
            margin-top: 1.25rem;
          }
          .ProseMirror p {
            margin-bottom: 0.75rem;
            line-height: 1.7;
          }
          .ProseMirror ul {
            list-style-type: disc;
            padding-left: 1.5rem;
            margin-bottom: 0.75rem;
          }
          .ProseMirror li {
            margin-bottom: 0.375rem;
            line-height: 1.6;
          }
          .ProseMirror strong {
            font-weight: 600;
            color: #1e293b;
          }
          .ProseMirror em {
            color: #64748b;
          }
          .ProseMirror p.is-editor-empty:first-child::before {
            content: attr(data-placeholder);
            float: left;
            color: #94a3b8;
            pointer-events: none;
            height: 0;
          }
        `}</style>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

export default SmartNotesEditor;
