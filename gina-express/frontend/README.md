# Gina frontend patches

`App.jsx` is too large / easy to save to the wrong path in chat. Prefer Terminal.

## Resume intake UI

```bash
node patch-app-resumes.mjs ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx
grep -n "ResumeUploadPanel" ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx | head
```

See also `../RESUMES.md`.

## SignalHire import handler

`App.jsx` is too large to paste safely in chat. Do this instead:

## On GitHub (Gina repo)

1. Open `frontend/App.jsx`
2. Click the pencil (Edit)
3. Find:

```js
if (type === "create_candidate") {
```

4. Change that line to:

```js
if (type === "create_candidate" || type === "import_candidate") {
```

5. Find (inside that same `if` block):

```js
source: payload.source || "Gina",
```

6. Change to:

```js
source: payload.source || (type === "import_candidate" ? "SignalHire" : "Gina"),
```

7. Commit → wait for Railway → Agent tab → **Check for actions**

## Full function replace (optional)

See `applyAgentAction.replacement.js` — replace the entire `applyAgentAction` function with that body for job-title matching too.
