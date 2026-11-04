import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import type { AnnouncementImageChange } from "../lib/api";
import "../styles/picture-picker.css";

/** The picture being edited: a new file, the saved one taken off, or no change (both empty). */
export interface PictureEdit {
  file: File | null;
  removed: boolean;
}

export const NO_PICTURE_EDIT: PictureEdit = { file: null, removed: false };

const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

/** What to send with the save: only when a file is chosen or the saved one is removed. */
export function pictureChange(edit: PictureEdit, hadPicture: boolean): AnnouncementImageChange | null {
  if (edit.file) return { file: edit.file };
  if (edit.removed && hadPicture) return { remove: true };
  return null;
}

/** The picture to show now: the chosen file (as an object URL), else the saved one unless removed. */
export function usePictureSrc(edit: PictureEdit, savedUrl: string | null | undefined): string | null {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    if (!edit.file) {
      setLocal(null);
      return;
    }
    const url = URL.createObjectURL(edit.file);
    setLocal(url);
    return () => URL.revokeObjectURL(url);
  }, [edit.file]);
  if (edit.file) return local;
  return edit.removed ? null : (savedUrl ?? null);
}

/** "Picture (optional)": PNG, JPG or WebP up to 2 MB, with a thumbnail and Remove. Checked again by the server. */
export function PicturePicker({
  edit,
  savedUrl,
  onChange,
  hint = "PNG, JPG or WebP, up to 2 MB. Wide pictures work best.",
  label = "Picture",
}: {
  edit: PictureEdit;
  savedUrl: string | null | undefined;
  onChange: (edit: PictureEdit) => void;
  hint?: string;
  label?: string;
}): ReactElement {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const src = usePictureSrc(edit, savedUrl);

  const pick = (f: File | null) => {
    setError("");
    if (!f) return;
    if (!TYPES.includes(f.type)) return setError("Use a PNG, JPG or WebP picture.");
    if (f.size > MAX_BYTES) return setError("The picture is too large. The limit is 2 MB.");
    onChange({ file: f, removed: false });
  };
  const remove = () => {
    setError("");
    if (input.current) input.current.value = "";
    onChange({ file: null, removed: true });
  };

  return (
    <div className="pp">
      <label className="lab" htmlFor={id}>
        {label}{" "}
        <span className="k" style={{ fontWeight: 400 }}>
          · optional
        </span>
      </label>
      <div className="pp__row">
        {src ? <img className="pp__thumb" src={src} alt="" /> : <span className="pp__thumb pp__thumb--empty" aria-hidden="true" />}
        <div className="pp__side">
          <input
            ref={input}
            id={id}
            className="pp__file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-describedby={`${id}-hint`}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <span className="k" id={`${id}-hint`}>
            {edit.file ? `${edit.file.name} · ${Math.max(1, Math.round(edit.file.size / 1024))} KB` : hint}
          </span>
          {src ? (
            <button type="button" className="btn pp__rm" onClick={remove}>
              Remove picture
            </button>
          ) : null}
          {error ? (
            <span className="an-err" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
