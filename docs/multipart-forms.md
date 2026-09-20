# TW Framework — Multipart Form Data

This document covers one thing completely: handling `multipart/form-data` requests — file uploads and mixed fields — through the body parser. For size limits, see doc 78.

---

## The Middleware Form

`bodyParse()` handles multipart automatically when the content type matches:

```twm
import { bodyParse } from "@tw/server"

const mw = bodyParse({
  multipart: {
    limit: 10 * 1024 * 1024,   // total body limit (bytes)
    fieldSize: 1024,            // max non-file field value size
    fileSize: 5 * 1024 * 1024,  // max per-file size
    fields: 10,                  // max non-file fields
    files: 5,                    // max file parts
  },
})
```

After the middleware runs, `req.body` is the parsed multipart object:

```twm
// req.body.multipart = {
//   fields: { title: "Holiday photo", album: "2026" },
//   files: [
//     { filename: "beach.jpg", contentType: "image/jpeg", data: Buffer }
//   ]
// }
```

| Property | Contents |
|----------|----------|
| `fields` | Plain text fields by name |
| `files` | Array of `{ filename, contentType, data }` per uploaded file |

Limits are enforced WHILE PARSING — a part that crosses its limit aborts the request with an error rather than buffering to the end.

## Sending Multipart

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "title=Holiday photo" \
  -F "file=@beach.jpg"
```

```twm
const fd = new FormData()
fd.append("title", "Holiday photo")
fd.append("file", fileInput.files[0])
await fetch("/api/upload", { method: "POST", body: fd })
```

## Route Handler

```twm
// home/api/upload/route.twm
fn post(request) {
  const form = request.body.multipart
  const title = form.fields.title
  const file = form.files[0]

  if (!file) {
    return { status: 400, json: { ok: false, error: "file required" } }
  }
  saveUpload(file.filename, file.contentType, file.data)

  return { status: 201, json: { ok: true, title, name: file.filename } }
}
```

## What the Parser Enforces

| Guard | Behavior |
|-------|----------|
| Boundary required | No `boundary=` in the content type → parse error (400 from the middleware) |
| Part count caps | More than `fields`/`files` parts → error |
| Size caps | Per-field `fieldSize`, per-file `fileSize`, total `limit` |
| Chunked bodies | No `Content-Length` header needed — the stream is read and bounded the same way |

## Validation Checklist for Uploads

- Trust the FILE CONTENT, never the filename — derive extension from `contentType` or sniff the bytes.
- Re-encode images through the image pipeline (doc 62) when they will be served back; that also strips any payloads embedded in metadata.
- Keep `fileSize` as close to what your feature truly needs; the limit is your DoS firewall for this endpoint.
