document.addEventListener("DOMContentLoaded", async () => {
  // Wire up core popup controls once the DOM is ready.
  const notesList = document.getElementById("notes-list");
  const searchInput = document.getElementById("search");
  const noteCountEl = document.getElementById("note-count");

  let allNotes = [];
  let currentScope = "perSite";
  let storageKey = "";

  const STORAGE_PREFIX = "__thoughttags__";
  const hasChromeSync =
    typeof chrome !== "undefined" && chrome?.storage?.sync ? true : false;
  const hasChromeLocal =
    typeof chrome !== "undefined" && chrome?.storage?.local ? true : false;

  // Detect whether localStorage is available within the popup context.
  const hasLocalStorage = (() => {
    try {
      if (typeof localStorage === "undefined") return false;
      const testKey = `${STORAGE_PREFIX}test`;
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      return true;
    } catch (err) {
      return false;
    }
  })();

  const memoryStore = {};
  const localKey = (key) => `${STORAGE_PREFIX}${key}`;

  const readLocalKey = (key, fallback) => {
    if (Object.prototype.hasOwnProperty.call(memoryStore, key)) {
      return memoryStore[key];
    }
    if (!hasLocalStorage) {
      return fallback;
    }
    try {
      const raw = localStorage.getItem(localKey(key));
      if (raw === null) return fallback;
      const parsed = JSON.parse(raw);
      memoryStore[key] = parsed;
      return parsed;
    } catch (err) {
      return fallback;
    }
  };

  const writeLocal = (items) => {
    Object.entries(items).forEach(([key, value]) => {
      memoryStore[key] = value;
      if (!hasLocalStorage) return;
      try {
        localStorage.setItem(localKey(key), JSON.stringify(value));
      } catch (err) {
        console.warn("ThoughtTags popup: Failed to persist locally", err);
      }
    });
  };

  const buildLocalResult = (keys) => {
    const result = {};
    if (Array.isArray(keys)) {
      keys.forEach((key) => {
        result[key] = readLocalKey(key, undefined);
      });
    } else if (typeof keys === "string") {
      result[keys] = readLocalKey(keys, undefined);
    } else if (keys && typeof keys === "object") {
      Object.keys(keys).forEach((key) => {
        result[key] = readLocalKey(key, keys[key]);
      });
    }
    return result;
  };

  const chromeAreas = {
    sync: hasChromeSync ? chrome.storage.sync : null,
    local: hasChromeLocal ? chrome.storage.local : null,
  };

  const runChromeGet = (areaName, keys, onSuccess, onFailure) => {
    const area = chromeAreas[areaName];
    if (!area) {
      onFailure(new Error(`${areaName} storage not available`));
      return;
    }
    try {
      area.get(keys, (data) => {
        if (chrome.runtime?.lastError) {
          onFailure(chrome.runtime.lastError);
          return;
        }
        onSuccess(data || {});
      });
    } catch (err) {
      onFailure(err);
    }
  };

  const runChromeSet = (areaName, items, onSuccess, onFailure) => {
    const area = chromeAreas[areaName];
    if (!area) {
      onFailure(new Error(`${areaName} storage not available`));
      return;
    }
    try {
      area.set(items, () => {
        if (chrome.runtime?.lastError) {
          onFailure(chrome.runtime.lastError);
          return;
        }
        onSuccess();
      });
    } catch (err) {
      onFailure(err);
    }
  };

  // Resilient storage helper that gracefully downgrades between sync, local, and fallback caches.
  const safeStorage = {
    get(keys, callback) {
      if (hasChromeSync) {
        runChromeGet(
          "sync",
          keys,
          (data) => callback(data),
          () => {
            if (hasChromeLocal) {
              runChromeGet(
                "local",
                keys,
                (localData) => callback(localData),
                () => callback(buildLocalResult(keys))
              );
            } else {
              callback(buildLocalResult(keys));
            }
          }
        );
        return;
      }

      if (hasChromeLocal) {
        runChromeGet(
          "local",
          keys,
          (localData) => callback(localData),
          () => callback(buildLocalResult(keys))
        );
        return;
      }

      callback(buildLocalResult(keys));
    },
    set(items, callback = () => {}) {
      const finish = () => {
        writeLocal(items);
        callback();
      };

      if (hasChromeSync) {
        runChromeSet(
          "sync",
          items,
          () => {
            writeLocal(items);
            callback();
          },
          () => {
            if (hasChromeLocal) {
              runChromeSet(
                "local",
                items,
                () => {
                  writeLocal(items);
                  callback();
                },
                finish
              );
            } else {
              finish();
            }
          }
        );
        return;
      }

      if (hasChromeLocal) {
        runChromeSet(
          "local",
          items,
          () => {
            writeLocal(items);
            callback();
          },
          finish
        );
        return;
      }

      finish();
    },
  };

  const tab = await getCurrentTab();
  const parsedUrl = (() => {
    try {
      return new URL(tab?.url || "https://example.com");
    } catch (err) {
      console.warn("ThoughtTags popup: unable to parse tab url", err);
      return null;
    }
  })();
  const hostname = parsedUrl?.hostname || "default";
  const href = parsedUrl?.href || hostname;

  safeStorage.get(["scope"], (data) => {
    currentScope = data.scope || "perSite";
    storageKey = currentScope === "perURL" ? href : hostname;

    safeStorage.get([storageKey], (items) => {
      allNotes = items[storageKey] || [];
      renderNotes(allNotes);
    });
  });

  searchInput.addEventListener("input", () => {
    // Provide a simple text search across titles and body text.
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      renderNotes(allNotes);
      return;
    }

    const filtered = allNotes.filter((note) =>
      getSearchableText(note).includes(query) ||
      (note.title && note.title.toLowerCase().includes(query))
    );
    renderNotes(filtered, { isSearch: true, query });
  });

  function renderNotes(notes, { isSearch = false, query = "" } = {}) {
    notesList.innerHTML = "";

    const sortedNotes = [...notes].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned)
    );
    const closedCount = allNotes.filter((note) => note.closed).length;
    updateNoteCount(
      allNotes.length,
      isSearch ? sortedNotes.length : undefined,
      closedCount
    );

    if (!sortedNotes.length) {
      notesList.appendChild(createEmptyState({ isSearch, query }));
      return;
    }

    sortedNotes.forEach((note) => {
      const card = document.createElement("article");
      card.className = "note-card";
      card.setAttribute("role", "listitem");

      const snippet = createSnippet(note.text);
      const title = note.title?.trim() || "Untitled";
      const wordCount = calculateWordCount(snippet);
      const metaCopy = buildMetaCopy({ note, wordCount });

      if (note.pinned) {
        card.classList.add("note-card--pinned");
      }

      const header = document.createElement("div");
      header.className = "note-card__header";

      const heading = document.createElement("div");
      heading.className = "note-card__heading";

      const titleEl = document.createElement("h2");
      titleEl.className = "note-card__title";
      titleEl.textContent = title;

      const metaEl = document.createElement("p");
      metaEl.className = "note-card__meta";
      metaEl.textContent = metaCopy;

      heading.append(titleEl, metaEl);
      header.appendChild(heading);

      if (note.pinned) {
        const badge = document.createElement("span");
        badge.className = "note-card__badge";
        badge.textContent = "📌 Pinned";
        header.appendChild(badge);
      }

      const snippetEl = document.createElement("p");
      snippetEl.className = "note-card__snippet";
      snippetEl.textContent = snippet || "No content yet.";
      if (note.closed) {
        snippetEl.classList.add("note-card__snippet--closed");
      }

      const actions = document.createElement("div");
      actions.className = "note-card__actions";

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "note-card__delete";
      deleteBtn.setAttribute("type", "button");
      deleteBtn.setAttribute("data-id", note.id);
      deleteBtn.innerHTML = '<span aria-hidden="true">🗑</span> Remove';
      deleteBtn.addEventListener("click", () => deleteNote(note.id));

      if (note.closed) {
        const restoreBtn = document.createElement("button");
        restoreBtn.className = "note-card__restore";
        restoreBtn.setAttribute("type", "button");
        restoreBtn.setAttribute("data-id", note.id);
        restoreBtn.innerHTML = '<span aria-hidden="true">↩</span> Reopen';
        restoreBtn.addEventListener("click", () => reopenNote(note.id));
        actions.append(deleteBtn, restoreBtn);
      } else {
        actions.append(deleteBtn);
      }

      card.append(header, snippetEl, actions);
      notesList.appendChild(card);
    });
  }

  function updateNoteCount(total, subset, closedCount = 0) {
    if (!noteCountEl) return;

    if (!total) {
      noteCountEl.textContent = "No notes yet";
      noteCountEl.classList.add("is-empty");
      return;
    }

    noteCountEl.classList.remove("is-empty");
    if (typeof subset === "number") {
      noteCountEl.textContent = `Showing ${subset} of ${total} notes`;
    } else {
      noteCountEl.textContent = `${total} note${total === 1 ? "" : "s"}`;
    }

    if (closedCount) {
      const suffix = closedCount === 1 ? "note" : "notes";
      noteCountEl.title = `${closedCount} closed ${suffix}`;
    } else {
      noteCountEl.removeAttribute("title");
    }
  }

  function createEmptyState({ isSearch, query }) {
    const wrapper = document.createElement("div");
    wrapper.className = "empty-state";

    if (isSearch) {
      wrapper.innerHTML = `
        <strong>No matches found</strong>
        <span>We couldn\'t find any notes containing “${sanitize(query)}”. Try a different keyword.</span>
      `;
    } else {
      const closedCount = allNotes.filter((note) => note.closed).length;
      if (closedCount) {
        wrapper.innerHTML = `
          <strong>No active notes</strong>
          <span>You have ${closedCount} note${closedCount === 1 ? "" : "s"} closed in the editor. Reopen them from here when you need them again.</span>
        `;
      } else {
        wrapper.innerHTML = `
          <strong>Save your first thought</strong>
          <span>Your highlights and ideas from this site will appear here once you create a note.</span>
        `;
      }
    }

    return wrapper;
  }

  function getSearchableText(note) {
    const temp = document.createElement("div");
    temp.innerHTML = note.text || "";
    return temp.textContent?.toLowerCase() || "";
  }

  function createSnippet(text) {
    const temp = document.createElement("div");
    temp.innerHTML = text || "";
    const trimmed = temp.textContent?.replace(/\s+/g, " ").trim() || "";
    if (trimmed.length <= 150) return trimmed;
    return `${trimmed.slice(0, 147)}…`;
  }

  function calculateWordCount(snippet) {
    if (!snippet) return 0;
    return snippet.split(/\s+/).filter(Boolean).length;
  }

  function buildMetaCopy({ note, wordCount }) {
    const parts = [];
    if (note.pinned) parts.push("Pinned");
    if (note.minimized) parts.push("Minimized on page");
    if (note.closed) parts.push("Closed in editor");

    if (wordCount) {
      parts.push(`${wordCount} word${wordCount === 1 ? "" : "s"}`);
    } else {
      parts.push("No content yet");
    }

    return parts.join(" · ");
  }

  function sanitize(value = "") {
    const temp = document.createElement("div");
    temp.textContent = value;
    return temp.innerHTML;
  }

  const persistNotes = (afterPersist) => {
    if (!storageKey) {
      storageKey = currentScope === "perURL" ? href : hostname;
    }

    safeStorage.set({ [storageKey]: allNotes }, () => {
      renderNotes(allNotes);
      if (typeof afterPersist === "function") {
        afterPersist();
      }
    });
  };

  function deleteNote(id) {
    allNotes = allNotes.filter((note) => note.id !== id);
    persistNotes();
  }

  function reopenNote(id) {
    let reopenedNote = null;
    allNotes = allNotes.map((note) => {
      if (note.id === id) {
        reopenedNote = { ...note, closed: false, minimized: false };
        return reopenedNote;
      }
      return note;
    });

    if (!reopenedNote) {
      return;
    }

    persistNotes(() => {
      sendReopenMessage(reopenedNote, storageKey);
    });
  }

  function sendReopenMessage(note, storageKey) {
    try {
      if (!tab?.id) {
        queueReopenRequest(note, storageKey);
        return;
      }

      chrome.tabs.sendMessage(
        tab.id,
        {
          type: "thoughttags:reopen-note",
          note,
          storageKey,
        },
        () => {
          if (chrome.runtime?.lastError) {
            queueReopenRequest(note, storageKey);
          }
        }
      );
    } catch (err) {
      queueReopenRequest(note, storageKey);
    }
  }

  function queueReopenRequest(note, storageKey) {
    try {
      chrome.storage.local.set({
        "__thoughttags__reopen_queue": {
          note,
          storageKey,
          at: Date.now(),
        },
      });
    } catch (err) {
      console.warn("ThoughtTags popup: failed to queue reopen request", err);
    }
  }

  function getCurrentTab() {
    // Chrome API helper that resolves with the active tab.
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]);
      });
    });
  }
});
