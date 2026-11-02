import { useEffect, useRef, type ReactElement } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";

export interface RichTextValue {
  /** Semantic HTML (real <ul>/<ol>, no Quill classes) — what the email / article uses. */
  html: string;
  /** Plain text, to tell whether anything was written. */
  text: string;
}

/** Email: only what an email carries well (the server allow-list matches this). */
const EMAIL_TOOLBAR = [
  [{ header: [2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }, "blockquote"],
  ["link", "clean"],
];

/** Outreach: a personal note, so no headings or quotes. Pasting can't bring in anything else (`NOTE_FORMATS`). */
const NOTE_TOOLBAR = [["bold", "italic", "underline"], [{ list: "ordered" }, { list: "bullet" }], ["link", "clean"]];
const NOTE_FORMATS = ["bold", "italic", "underline", "list", "link"];

/** Article: headings, code and images too (z_blog's allow-list matches this). */
const ARTICLE_TOOLBAR = [
  [{ header: [2, 3, 4, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }, "blockquote", "code-block"],
  ["link", "image"],
  ["clean"],
];

/**
 * Quill 2 rich-text editor, mounted directly (react-quill doesn't support React 19).
 * Uncontrolled: `onChange` reports the content; remount with a new `key` (and `initialHtml`) to
 * load different content, e.g. a template.
 */
export function RichTextEditor({
  onChange,
  placeholder,
  label,
  initialHtml,
  variant = "email",
  onImageUpload,
  inserts,
}: {
  onChange: (value: RichTextValue) => void;
  placeholder?: string;
  /** Accessible name for the editing area. */
  label: string;
  /** Content to start with (read once, on mount). */
  initialHtml?: string;
  /** "email" (default), "note" (outreach: simple formatting only) or "article" (headings, code, images). */
  variant?: "email" | "note" | "article";
  /** Article images: upload the picked file and return its URL (inserted at the cursor). */
  onImageUpload?: (file: File) => Promise<string>;
  /** Buttons that type a piece of text at the cursor, such as {{FirstName}}. */
  inserts?: { label: string; text: string }[];
}): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<Quill | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const uploadRef = useRef(onImageUpload);
  uploadRef.current = onImageUpload;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const editorDiv = document.createElement("div");
    el.appendChild(editorDiv);
    const toolbar = variant === "article" ? ARTICLE_TOOLBAR : variant === "note" ? NOTE_TOOLBAR : EMAIL_TOOLBAR;
    const quill = new Quill(editorDiv, {
      theme: "snow",
      placeholder,
      ...(variant === "note" ? { formats: NOTE_FORMATS } : {}),
      modules: {
        toolbar: {
          container: toolbar,
          handlers: {
            // Upload instead of Quill's default base64 data URL (huge, and bad for SEO).
            image: () => {
              const upload = uploadRef.current;
              if (!upload) return;
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/png,image/jpeg,image/webp,image/gif";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                const at = quill.getSelection(true)?.index ?? quill.getLength();
                try {
                  const url = await upload(file);
                  quill.insertEmbed(at, "image", url, "user");
                  quill.setSelection(at + 1, 0);
                } catch {
                  /* the caller shows its own error */
                }
              };
              input.click();
            },
          },
        },
      },
    });
    editor.current = quill;
    quill.root.setAttribute("aria-label", label);
    quill.root.setAttribute("aria-multiline", "true");
    quill.root.setAttribute("role", "textbox");
    // getSemanticHTML() writes every space as &nbsp;, which stops text wrapping.
    const emit = () =>
      onChangeRef.current({ html: quill.getSemanticHTML().replace(/&nbsp;/g, " "), text: quill.getText().trim() });
    quill.on("text-change", emit);
    if (initialHtml) {
      // Not dangerouslyPasteHTML: it selects the start of the text, which pulls keyboard focus into the editor on load.
      quill.setContents(quill.clipboard.convert({ html: initialHtml }), "silent");
      emit();
    }
    return () => {
      // StrictMode mounts twice: remove this instance's toolbar + editor so only one remains.
      quill.off("text-change", emit);
      el.innerHTML = "";
    };
    // initialHtml is read once on purpose: callers remount (new key) to load other content.
  }, [placeholder, label, variant]);

  const insert = (text: string) => {
    const quill = editor.current;
    if (!quill) return;
    const at = quill.getSelection(true)?.index ?? quill.getLength() - 1;
    quill.insertText(at, text, "user");
    quill.setSelection(at + text.length, 0);
  };
  const box = <div className={"rte" + (variant === "article" ? " rte--article" : "")} ref={host} />;
  if (!inserts?.length) return box;
  return (
    <div>
      {box}
      <div className="rte__inserts" role="group" aria-label="Insert a detail">
        <span>Insert:</span>
        {inserts.map((i) => <button key={i.label} type="button" className="btn sm" onClick={() => insert(i.text)}>{i.label}</button>)}
      </div>
    </div>
  );
}
