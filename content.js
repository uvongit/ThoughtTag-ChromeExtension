(function () {
  // Initialize the ThoughtTag overlay within each page context.
  const NOTES_CLASS = "pro-note";
  const DEBOUNCE_DELAY = 500;
  let debounceTimer;

  // Build floating toolbar that anchors the note creation controls.
  const toolbar = document.createElement("div");
  toolbar.className = "pro-toolbar";

  const toolbarHandle = document.createElement("button");
  toolbarHandle.type = "button";
  toolbarHandle.className = "pro-toolbar__handle";
  toolbarHandle.title = "Drag toolbar";
  toolbarHandle.setAttribute("aria-label", "Drag toolbar");
  toolbarHandle.innerHTML = `<span aria-hidden="true">⋮⋮</span>`;

  const darkToggleBtn = document.createElement("button");
  darkToggleBtn.id = "toggle-dark";
  darkToggleBtn.className = "dark-toggle";
  darkToggleBtn.title = "Toggle Dark Mode";
  darkToggleBtn.textContent = "🌙";

  const addNoteBtn = document.createElement("button");
  addNoteBtn.id = "add-note";
  addNoteBtn.className = "add-note-btn";
  addNoteBtn.title = "Add Note";
  addNoteBtn.textContent = "➕";

  toolbar.append(toolbarHandle, darkToggleBtn, addNoteBtn);
  document.body.appendChild(toolbar);

  let toolbarDragActive = false;
  let toolbarDragOffsetX = 0;
  let toolbarDragOffsetY = 0;

  // Keep the toolbar within the viewport bounds while dragging.
  const clampToolbarPosition = (left, top) => {
    const maxLeft = Math.max(0, window.innerWidth - toolbar.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - toolbar.offsetHeight);
    return {
      left: Math.min(Math.max(0, left), maxLeft),
      top: Math.min(Math.max(0, top), maxTop),
    };
  };

  const setToolbarPosition = (left, top) => {
    const { left: clampedLeft, top: clampedTop } = clampToolbarPosition(left, top);
    toolbar.style.left = `${clampedLeft}px`;
    toolbar.style.top = `${clampedTop}px`;
    toolbar.style.right = "auto";
    toolbar.style.bottom = "auto";
  };

  const toolbarPositionStorageKey = "__thoughttags__toolbar_position";

  // Persist the toolbar placement so users find it where they left it.
  const persistToolbarPosition = (left, top) => {
    const payload = { left, top };
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(toolbarPositionStorageKey, JSON.stringify(payload));
    } catch (err) {
      console.warn("ThoughtTags toolbar: failed to persist position", err);
    }
  };

  const restoreToolbarPosition = () => {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(toolbarPositionStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.left !== "number" || typeof parsed?.top !== "number") {
        return;
      }
      setToolbarPosition(parsed.left, parsed.top);
    } catch (err) {
      console.warn("ThoughtTags toolbar: failed to restore position", err);
    }
  };

  // Handle pointer dragging for the toolbar handle.
  const startToolbarDrag = (clientX, clientY) => {
    const rect = toolbar.getBoundingClientRect();
    toolbarDragActive = true;
    toolbarDragOffsetX = clientX - rect.left;
    toolbarDragOffsetY = clientY - rect.top;
    toolbar.classList.add("is-dragging");
    setToolbarPosition(rect.left, rect.top);
  };

  const moveToolbarDuringDrag = (clientX, clientY) => {
    if (!toolbarDragActive) return;
    const left = clientX - toolbarDragOffsetX;
    const top = clientY - toolbarDragOffsetY;
    setToolbarPosition(left, top);
  };

  const stopToolbarDrag = () => {
    if (!toolbarDragActive) return;
    toolbarDragActive = false;
    toolbar.classList.remove("is-dragging");
    const left = parseFloat(toolbar.style.left);
    const top = parseFloat(toolbar.style.top);
    if (!Number.isNaN(left) && !Number.isNaN(top)) {
      persistToolbarPosition(left, top);
    }
  };

  toolbarHandle.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    event.preventDefault();
    toolbarHandle.setPointerCapture(event.pointerId);
    const rect = toolbar.getBoundingClientRect();
    setToolbarPosition(rect.left, rect.top);
    startToolbarDrag(event.clientX, event.clientY);
  });

  toolbarHandle.addEventListener("pointermove", (event) => {
    if (!toolbarDragActive) return;
    moveToolbarDuringDrag(event.clientX, event.clientY);
  });

  const endToolbarPointerDrag = () => {
    stopToolbarDrag();
  };

  toolbarHandle.addEventListener("pointerup", (event) => {
    if (toolbarHandle.hasPointerCapture?.(event.pointerId)) {
      toolbarHandle.releasePointerCapture(event.pointerId);
    }
    endToolbarPointerDrag();
  });
  toolbarHandle.addEventListener("pointercancel", (event) => {
    if (toolbarHandle.hasPointerCapture?.(event.pointerId)) {
      toolbarHandle.releasePointerCapture(event.pointerId);
    }
    endToolbarPointerDrag();
  });

  toolbarHandle.addEventListener("click", (event) => {
    event.preventDefault();
  });

  window.addEventListener("resize", () => {
    if (!toolbar.style.left || !toolbar.style.top) {
      return;
    }
    const left = parseFloat(toolbar.style.left);
    const top = parseFloat(toolbar.style.top);
    if (Number.isNaN(left) || Number.isNaN(top)) {
      return;
    }
    setToolbarPosition(left, top);
  });

  restoreToolbarPosition();
  const storageKey = location.hostname;
  const REOPEN_QUEUE_KEY = "__thoughttags__reopen_queue";

  const STORAGE_PREFIX = "__thoughttags__";
  const hasChromeSync =
    typeof chrome !== "undefined" && chrome?.storage?.sync ? true : false;
  const hasChromeLocal =
    typeof chrome !== "undefined" && chrome?.storage?.local ? true : false;

  // Detect whether `localStorage` is accessible for backup persistence.
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

  // Read from in-memory cache first, then `localStorage` if available.
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
        console.warn("ThoughtTags: Failed to persist locally", err);
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

  // Unified storage helper that prefers Chrome sync, then local storage, then a fallback.
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

  // Spawn a fresh note and persist immediately.
  addNoteBtn.addEventListener("click", () => {
    createNoteElement({});
    saveNotes();
  });

  darkToggleBtn.addEventListener("click", () => {
    const isDark = darkToggleBtn.dataset.dark !== "true";

    darkToggleBtn.textContent = isDark ? "☀️" : "🌙";
    darkToggleBtn.dataset.dark = isDark;

    const notes = document.querySelectorAll(".pro-note");

    if (isDark) {
      toolbar.classList.add("dark-mode");
      notes.forEach((n) => n.classList.add("dark-mode"));
    } else {
      toolbar.classList.remove("dark-mode");
      notes.forEach((n) => n.classList.remove("dark-mode"));
    }

    safeStorage.set({ darkMode: isDark });
  });

  safeStorage.get({ darkMode: false }, (data) => {
    const isDark = !!data.darkMode;
    darkToggleBtn.textContent = isDark ? "☀️" : "🌙";
    darkToggleBtn.dataset.dark = isDark;

    const notes = document.querySelectorAll(".pro-note");

    if (isDark) {
      toolbar.classList.add("dark-mode");
      notes.forEach((n) => n.classList.add("dark-mode"));
    }
  });

  // Load notes for the current hostname and then reconcile queued reopen requests.
  function loadNotes() {
    safeStorage.get([storageKey], (data) => {
      const notes = data[storageKey] || [];
      notes.forEach(createNoteElement);
      consumeQueuedReopen();
    });
  }

  // Serialize all visible notes back into storage (debounced).
  function saveNotes() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const noteEls = document.querySelectorAll(`.${NOTES_CLASS}`);
      const notes = Array.from(noteEls).map((el) => {
        const content = el.querySelector(".note-content");
        return {
          id: el.id,
          title: el.querySelector(".note-title").value,
          text: content.innerHTML,
          x: el.style.left,
          y: el.style.top,
          color: el.style.background,
          pinned: el.classList.contains("is-pinned"),
          minimized: el.classList.contains("minimized"),
          closed: el.dataset.closed === "true",
        };
      });
      safeStorage.set({ [storageKey]: notes });
    }, DEBOUNCE_DELAY);
  }

  // Construct a single note card, wire up handlers, and sync its state helpers.
  function createNoteElement(note = {}) {
    const { id, title, text, x, y, color, pinned, minimized, closed } = note;

    const noteId =
      id ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `note-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const isNewlyCreated = !id;

    const el = document.createElement("div");
    el.className = NOTES_CLASS;
    el.id = noteId;
    el.style.left = x || "150px";
    el.style.top = y || "150px";
    el.style.background = color || "";
    el.style.zIndex = pinned ? "9999" : "9998";
    if (pinned) {
      el.classList.add("is-pinned");
    }
    if (minimized) {
      el.classList.add("minimized");
    }
    el.dataset.closed = closed ? "true" : "false";
    if (closed) {
      el.classList.add("is-closed");
      el.setAttribute("aria-hidden", "true");
    }

    const controls = document.createElement("div");
    controls.className = "note-actions";

    const minimizeBtn = document.createElement("button");
    minimizeBtn.textContent = "➖";
    minimizeBtn.className = "note-btn note-btn--minimize";
    minimizeBtn.type = "button";
    minimizeBtn.setAttribute("aria-label", "Toggle note size");

    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "✕";
    closeBtn.className = "note-btn note-btn--close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Delete note");

    const pinBtn = document.createElement("button");
    pinBtn.textContent = "📌";
    pinBtn.className = "note-btn note-btn--pin";
    pinBtn.type = "button";
    pinBtn.setAttribute("aria-label", "Pin note");

    const exportBtn = document.createElement("button");
    exportBtn.innerHTML = '<span aria-hidden="true">📄</span>';
    exportBtn.title = "Export note as .txt";
    exportBtn.className = "note-btn note-btn--export";
    exportBtn.type = "button";
    exportBtn.setAttribute("aria-label", "Export note as text file");

    controls.append(minimizeBtn, pinBtn, exportBtn, closeBtn);

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.placeholder = "Title";
    titleInput.value =
      title || `Note ${document.querySelectorAll(".pro-note").length + 1}`;
    titleInput.className = "note-title";

    const noteToolbar = document.createElement("div");
    noteToolbar.className = "note-toolbar";
    noteToolbar.setAttribute("role", "toolbar");

    const content = document.createElement("div");
    content.contentEditable = "true";
    content.className = "note-content";
    content.innerHTML = text || "";

    let savedSelection = null;

    const isRangeInsideContent = (range) => {
      if (!range) return false;
      const container = range.commonAncestorContainer;
      return container && (container === content || content.contains(container));
    };

    const persistSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        savedSelection = null;
        return;
      }
      const range = selection.getRangeAt(0);
      if (!isRangeInsideContent(range) || range.collapsed) {
        savedSelection = null;
        return;
      }
      savedSelection = range.cloneRange();
    };

    const restoreSelection = () => {
      if (!savedSelection) return false;
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedSelection);
      return true;
    };

    const withSelection = (callback) => {
      persistSelection();
      restoreSelection();
      content.focus({ preventScroll: true });
      callback();
      persistSelection();
      saveNotes();
    };

    ["mouseup", "keyup", "touchend", "pointerup"].forEach((evt) => {
      content.addEventListener(evt, persistSelection);
    });

    const fontSizeSelect = document.createElement("select");
    ["Small", "Medium", "Large"].forEach((size) => {
      const opt = document.createElement("option");
      opt.value = size.toLowerCase();
      opt.textContent = size;
      fontSizeSelect.appendChild(opt);
    });
    fontSizeSelect.value = "medium";
    fontSizeSelect.title = "Change font size";

    const boldBtn = document.createElement("button");
    boldBtn.innerHTML = `<b>B</b>`;
    boldBtn.title = "Bold";

    const italicBtn = document.createElement("button");
    italicBtn.innerHTML = `<i>I</i>`;
    italicBtn.title = "Italic";

    const underlineBtn = document.createElement("button");
    underlineBtn.innerHTML = `<u>U</u>`;
    underlineBtn.title = "Underline";

    const centerBtn = document.createElement("button");
    centerBtn.className = "note-toolbar__icon-btn";
    centerBtn.innerHTML = `<span aria-hidden="true">⇆</span>`;
    centerBtn.title = "Center text";
    centerBtn.setAttribute("aria-label", "Center text");

    const colorPalette = document.createElement("div");
    colorPalette.className = "color-palette";

    const colors = [
      "#000",
      "#f00",
      "#0a0",
      "#00f",
      "#fff",
      "#ffa500",
      "#800080",
    ];

    colors.forEach((c) => {
      const circle = document.createElement("div");
      circle.className = "color-circle";
      circle.style.background = c;
      circle.title = c;
      circle.addEventListener("mousedown", (event) => event.preventDefault());
      circle.onclick = () => {
        withSelection(() => {
          document.execCommand("foreColor", false, c);
        });
      };
      colorPalette.appendChild(circle);
    });

    const customCircle = document.createElement("label");
    customCircle.className = "color-circle";
    customCircle.style.background = "linear-gradient(45deg, #ccc, #eee)";
    customCircle.title = "Custom";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    Object.assign(colorInput.style, {
      opacity: 0,
      width: "100%",
      height: "100%",
      cursor: "pointer",
      position: "absolute",
      left: 0,
      top: 0,
    });

    customCircle.style.position = "relative";
    customCircle.appendChild(colorInput);

    colorInput.addEventListener("mousedown", (event) => event.preventDefault());
    colorInput.oninput = () => {
      withSelection(() => {
        document.execCommand("foreColor", false, colorInput.value);
      });
    };

    colorPalette.appendChild(customCircle);

    fontSizeSelect.addEventListener("change", () => {
      const size =
        fontSizeSelect.value === "small"
          ? "2"
          : fontSizeSelect.value === "medium"
          ? "3"
          : "5";
      withSelection(() => {
        document.execCommand("fontSize", false, size);
      });
    });

    const commandButtons = [
      { btn: boldBtn, command: "bold" },
      { btn: italicBtn, command: "italic" },
      { btn: underlineBtn, command: "underline" },
    ];

    commandButtons.forEach(({ btn, command }) => {
      btn.addEventListener("mousedown", (event) => event.preventDefault());
      btn.addEventListener("click", () => {
        withSelection(() => {
          document.execCommand(command);
        });
      });
    });

    centerBtn.addEventListener("mousedown", (event) => event.preventDefault());
    centerBtn.addEventListener("click", () => {
      withSelection(() => {
        document.execCommand("justifyCenter");
      });
    });

    pinBtn.onclick = () => {
      const nextPinned = !el.classList.contains("is-pinned");
      applyPinnedState(nextPinned);
      saveNotes();
    };

    exportBtn.onclick = () => {
      const textContent = content.innerText;
      const blob = new Blob([textContent], { type: "text/plain" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${titleInput.value || "note"}.txt`;
      link.click();
    };

    closeBtn.onclick = () => {
      applyClosedState(true);
      saveNotes();
    };

    minimizeBtn.onclick = () => {
      const nextState = !el.classList.contains("minimized");
      applyMinimizedState(nextState);
      saveNotes();
    };

    titleInput.oninput = saveNotes;
    content.oninput = saveNotes;

    const colorGroup = document.createElement("div");
    colorGroup.className = "note-toolbar__group note-toolbar__group--colors";
    colorGroup.appendChild(colorPalette);

    const fontGroup = document.createElement("div");
    fontGroup.className = "note-toolbar__group note-toolbar__group--typography";
    fontGroup.appendChild(fontSizeSelect);

    const formatGroup = document.createElement("div");
    formatGroup.className = "note-toolbar__group note-toolbar__group--formatting";
    formatGroup.append(boldBtn, italicBtn, underlineBtn, centerBtn);

    noteToolbar.append(colorGroup, fontGroup, formatGroup);

    const header = document.createElement("div");
    header.className = "note-header";
    const headerMain = document.createElement("div");
    headerMain.className = "note-header__main";

    const headerBadge = document.createElement("div");
    headerBadge.className = "note-header__badge";
    headerBadge.innerHTML = `
      <span class="note-header__icon" aria-hidden="true">✨</span>
      <span class="note-header__label">Note</span>
    `;

    headerMain.append(headerBadge, titleInput);
    header.append(headerMain, controls);

    const noteBody = document.createElement("div");
    noteBody.className = "note-body";
    noteBody.append(noteToolbar, content);

    el.append(header, noteBody);
    document.body.appendChild(el);

    el.addEventListener("focusin", () => {
      el.classList.add("has-focus");
    });

    el.addEventListener("focusout", () => {
      requestAnimationFrame(() => {
        if (!el.contains(document.activeElement)) {
          el.classList.remove("has-focus");
        }
      });
    });

    content.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey) {
        return;
      }

      requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          return;
        }

        const range = selection.getRangeAt(0);
        if (!isRangeInsideContent(range)) {
          return;
        }

        withSelection(() => {
          document.execCommand("justifyLeft");
        });
      });
    });

    if (toolbar?.classList.contains("dark-mode")) {
      el.classList.add("dark-mode");
    }

    makeDraggable(el);
    makeResizable(el);

    const applyPinnedState = (isPinned) => {
      el.classList.toggle("is-pinned", isPinned);
      el.style.zIndex = isPinned ? "9999" : "9998";
      pinBtn.setAttribute("aria-pressed", String(isPinned));
      pinBtn.dataset.state = isPinned ? "pinned" : "unpinned";
      pinBtn.title = isPinned ? "Unpin note" : "Pin note";
    };

    const applyMinimizedState = (isMinimized) => {
      el.classList.toggle("minimized", isMinimized);
      minimizeBtn.dataset.state = isMinimized ? "minimized" : "expanded";
      minimizeBtn.setAttribute("aria-pressed", String(isMinimized));
      minimizeBtn.title = isMinimized ? "Expand note" : "Minimize note";
      minimizeBtn.textContent = isMinimized ? "➕" : "➖";
      content.style.display = isMinimized ? "none" : "";
      noteToolbar.style.display = isMinimized ? "none" : "";
      titleInput.disabled = isMinimized;
    };

    const applyClosedState = (isClosed) => {
      el.dataset.closed = isClosed ? "true" : "false";
      el.classList.toggle("is-closed", isClosed);
      el.setAttribute("aria-hidden", String(isClosed));
      if (isClosed) {
        applyMinimizedState(true);
      }
    };

    el._noteApi = {
      applyClosedState,
      applyMinimizedState,
      applyPinnedState,
    };

    applyPinnedState(!!pinned);
    applyMinimizedState(!!minimized);
    applyClosedState(isNewlyCreated ? false : !!closed);

    if (isNewlyCreated) {
      requestAnimationFrame(() => {
        titleInput.focus({ preventScroll: true });
        titleInput.select();
      });
    }
  }

  // Lightweight resize support that also triggers persistence when finished.
  function makeResizable(el) {
    el.style.resize = "both";
    el.style.overflow = "auto";
    el.onmouseup = saveNotes;
  }

  // Allow users to freely position notes without dragging text inputs.
  function makeDraggable(el) {
    let isDragging = false,
      offsetX,
      offsetY;
    let pending = false;
    let mouseX = 0,
      mouseY = 0;

    el.addEventListener("mousedown", (e) => {
      const invalidTargets = ["TEXTAREA", "INPUT", "BUTTON", "SELECT"];
      if (
        invalidTargets.includes(e.target.tagName) ||
        e.target.closest(".note-toolbar") ||
        e.target.closest(".note-content")
      ) {
        return; // do not start dragging
      }

      isDragging = true;
      offsetX = e.clientX - el.offsetLeft;
      offsetY = e.clientY - el.offsetTop;
      el.style.zIndex = 1000;
      el.classList.add("is-dragging");
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (!pending) {
        pending = true;
        requestAnimationFrame(() => {
          el.style.left = `${mouseX - offsetX}px`;
          el.style.top = `${mouseY - offsetY}px`;
          pending = false;
        });
      }
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        const restorePinned = el.classList.contains("is-pinned");
        el.style.zIndex = restorePinned ? "9999" : "9998";
        el.classList.remove("is-dragging");
        saveNotes();
      }
    });
  }

  loadNotes();

  // Consume pending reopen requests that were queued while the tab was closed.
  function consumeQueuedReopen() {
    if (!(chrome?.storage?.local && chrome.storage.local.get)) {
      return;
    }

    chrome.storage.local.get([REOPEN_QUEUE_KEY], (data) => {
      const payload = data?.[REOPEN_QUEUE_KEY];
      if (!payload || payload.storageKey !== storageKey) {
        return;
      }

      handleReopenPayload(payload.note);
      chrome.storage.local.remove(REOPEN_QUEUE_KEY);
    });
  }

  // Synchronize DOM notes with updated storage payloads.
  const reconcileNotes = (notes = []) => {
    const seenIds = new Set();

    notes.forEach((note) => {
      const existing = document.getElementById(note.id);
      if (existing && existing.classList.contains(NOTES_CLASS)) {
        const titleInput = existing.querySelector(".note-title");
        const contentEl = existing.querySelector(".note-content");
        const api = existing._noteApi;

        if (titleInput && titleInput.value !== note.title) {
          titleInput.value = note.title || "";
        }
        if (contentEl && contentEl.innerHTML !== (note.text || "")) {
          contentEl.innerHTML = note.text || "";
        }

        existing.style.left = note.x || existing.style.left || "150px";
        existing.style.top = note.y || existing.style.top || "150px";
        existing.style.background = note.color || "";

        if (api) {
          api.applyPinnedState(!!note.pinned);
          api.applyMinimizedState(!!note.minimized);
          api.applyClosedState(!!note.closed);
        } else {
          existing.dataset.closed = note.closed ? "true" : "false";
          existing.classList.toggle("is-closed", !!note.closed);
          existing.classList.toggle("minimized", !!note.minimized);
          existing.classList.toggle("is-pinned", !!note.pinned);
          existing.setAttribute("aria-hidden", String(!!note.closed));
        }

        seenIds.add(note.id);
        return;
      }

      createNoteElement(note);
      seenIds.add(note.id);
    });

    const existingEls = document.querySelectorAll(`.${NOTES_CLASS}`);
    existingEls.forEach((el) => {
      if (!seenIds.has(el.id)) {
        el.remove();
      }
    });
  };

  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (!["sync", "local"].includes(areaName)) return;

      if (Object.prototype.hasOwnProperty.call(changes, REOPEN_QUEUE_KEY)) {
        const payload = changes[REOPEN_QUEUE_KEY]?.newValue;
        if (payload?.storageKey === storageKey && payload?.note) {
          handleReopenPayload(payload.note);
          chrome.storage.local.remove(REOPEN_QUEUE_KEY);
        }
        return;
      }

      if (Object.prototype.hasOwnProperty.call(changes, storageKey)) {
        const updatedNotes = changes[storageKey]?.newValue || [];
        reconcileNotes(updatedNotes);
      }
    });
  }

  function handleReopenPayload(note) {
    if (!note || !note.id) {
      return;
    }

    const existing = document.getElementById(note.id);
    if (existing && existing.classList.contains(NOTES_CLASS)) {
      const titleInput = existing.querySelector(".note-title");
      const contentEl = existing.querySelector(".note-content");
      const api = existing._noteApi;

      if (titleInput) {
        titleInput.value = note.title || titleInput.value;
      }
      if (contentEl) {
        contentEl.innerHTML = note.text || contentEl.innerHTML;
      }

      existing.style.left = note.x || existing.style.left || "150px";
      existing.style.top = note.y || existing.style.top || "150px";
      existing.style.background = note.color || existing.style.background;

      if (api) {
        api.applyPinnedState(!!note.pinned);
        api.applyMinimizedState(false);
        api.applyClosedState(false);
      } else {
        existing.classList.remove("is-closed", "minimized");
        existing.dataset.closed = "false";
        existing.removeAttribute("aria-hidden");
      }

      saveNotes();
      return;
    }

    createNoteElement({ ...note, closed: false, minimized: false });
    saveNotes();
  }

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "thoughttags:reopen-note") {
        if (message.storageKey && message.storageKey !== storageKey) {
          return;
        }

        handleReopenPayload(message.note);
      }
    });
  }
})();
