# Gina frontend fix for SignalHire imports

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
