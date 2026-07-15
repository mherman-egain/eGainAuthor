import { useEffect, useRef } from 'react'
import { Editor } from '@tinymce/tinymce-react'
import type { Editor as TinyMCEEditor } from 'tinymce'
import styles from './HtmlEditor.module.css'

type Props = {
  value: string
  editable: boolean
  onChange: (html: string) => void
  /** Reset editor when the loaded article identity changes. */
  contentKey: string
}

/**
 * TinyMCE (GPL) — full authoring toolbar for knowledge articles.
 * Assets are served from /tinymce (copied from the tinymce package).
 */
export function HtmlEditor({ value, editable, onChange, contentKey }: Props) {
  const editorRef = useRef<TinyMCEEditor | null>(null)
  const skipNextChange = useRef(false)

  useEffect(() => {
    const ed = editorRef.current
    if (!ed || ed.destroyed) return
    const current = ed.getContent()
    const next = value || ''
    if (current === next) return
    skipNextChange.current = true
    ed.setContent(next)
  }, [contentKey, value])

  useEffect(() => {
    const ed = editorRef.current
    if (!ed || ed.destroyed) return
    ed.mode.set(editable ? 'design' : 'readonly')
  }, [editable])

  return (
    <div className={styles.wrap}>
      <Editor
        licenseKey="gpl"
        tinymceScriptSrc="/tinymce/tinymce.min.js"
        disabled={!editable}
        initialValue={value || '<p></p>'}
        onInit={(_evt, editor) => {
          editorRef.current = editor
          editor.mode.set(editable ? 'design' : 'readonly')
        }}
        onEditorChange={(html) => {
          if (skipNextChange.current) {
            skipNextChange.current = false
            return
          }
          onChange(html)
        }}
        init={{
          height: '100%',
          min_height: 360,
          resize: false,
          menubar: 'file edit view insert format tools table help',
          branding: false,
          promotion: false,
          statusbar: true,
          elementpath: true,
          plugins: [
            'advlist',
            'autolink',
            'lists',
            'link',
            'image',
            'charmap',
            'preview',
            'anchor',
            'searchreplace',
            'visualblocks',
            'code',
            'codesample',
            'fullscreen',
            'insertdatetime',
            'media',
            'table',
            'help',
            'wordcount',
          ],
          toolbar:
            'undo redo | blocks fontfamily fontsize | ' +
            'bold italic underline strikethrough | forecolor backcolor | ' +
            'alignleft aligncenter alignright alignjustify | ' +
            'bullist numlist outdent indent | ' +
            'link image media table | removeformat | code codesample | fullscreen preview',
          toolbar_mode: 'sliding',
          contextmenu: 'link image table',
          font_family_formats:
            'Andale Mono=andale mono,monospace;' +
            'Arial=arial,helvetica,sans-serif;' +
            'Arial Black=arial black,sans-serif;' +
            'Book Antiqua=book antiqua,palatino,serif;' +
            'Comic Sans MS=comic sans ms,sans-serif;' +
            'Courier New=courier new,courier,monospace;' +
            'Georgia=georgia,palatino,serif;' +
            'Helvetica=helvetica,arial,sans-serif;' +
            'Impact=impact,sans-serif;' +
            'Tahoma=tahoma,arial,helvetica,sans-serif;' +
            'Terminal=terminal,monaco,monospace;' +
            'Times New Roman=times new roman,times,serif;' +
            'Trebuchet MS=trebuchet ms,geneva,sans-serif;' +
            'Verdana=verdana,geneva,sans-serif',
          font_size_formats: '8pt 10pt 12pt 14pt 16pt 18pt 24pt 36pt',
          content_style:
            'body { font-family: "Open Sans", Segoe UI, sans-serif; font-size: 15px; ' +
            'line-height: 1.6; color: #172b4d; max-width: 42rem; margin: 1.25rem auto; padding: 0 1.25rem; } ' +
            'h1,h2,h3 { font-weight: 700; letter-spacing: -0.01em; } ' +
            'img { max-width: 100%; height: auto; } ' +
            'table { border-collapse: collapse; width: 100%; } ' +
            'table td, table th { border: 1px solid #dfe1e6; padding: 0.4rem 0.55rem; } ' +
            'a { color: #b91d8f; }',
          image_title: true,
          automatic_uploads: false,
          file_picker_types: 'image',
          // Data-URL picker keeps authoring self-contained without an upload API
          file_picker_callback: (callback, _value, meta) => {
            if (meta.filetype !== 'image') return
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.onchange = () => {
              const file = input.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => {
                callback(String(reader.result), { title: file.name })
              }
              reader.readAsDataURL(file)
            }
            input.click()
          },
          convert_urls: false,
          relative_urls: false,
          remove_script_host: false,
          browser_spellcheck: true,
        }}
      />
    </div>
  )
}
