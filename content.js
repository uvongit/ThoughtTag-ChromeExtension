(function () {
  const NOTES_CLASS = "pro-note";
  const DEBOUNCE_DELAY = 500;
  let debounceTimer;

  const toolbar = document.createElement("div");
  toolbar.className = "pro-toolbar";
  toolbar.innerHTML = `
  <button id="toggle-dark" class="dark-toggle" title="Toggle Dark Mode">🌙</button>
  <button id="add-note" class="add-note-btn" title="Add Note">➕</button>
`;
  document.body.appendChild(toolbar);
  const storageKey = location.hostname;

  document.getElementById("add-note").onclick = () => {
    createNoteElement({});
    saveNotes();
  };

  document.getElementById("toggle-dark").onclick = () => {
    const btn = document.getElementById("toggle-dark");
    const isDark = btn.dataset.dark !== "true";

    btn.textContent = isDark ? "☀️" : "🌙";
    btn.dataset.dark = isDark;

    const toolbar = document.querySelector(".pro-toolbar");
    const notes = document.querySelectorAll(".pro-note");

    if (isDark) {
      toolbar.classList.add("dark-mode");
      notes.forEach((n) => n.classList.add("dark-mode"));
    } else {
      toolbar.classList.remove("dark-mode");
      notes.forEach((n) => n.classList.remove("dark-mode"));
    }

    try {
      chrome.storage.sync.set({ darkMode: isDark });
    } catch (e) {
      console.error("Failed to save darkMode:", e);
    }
  };

  chrome.storage.sync.get("darkMode", (data) => {
    const btn = document.getElementById("toggle-dark");
    const isDark = !!data.darkMode;
    btn.textContent = isDark ? "☀️" : "🌙";
    btn.dataset.dark = isDark;

    const toolbar = document.querySelector(".pro-toolbar");
    const notes = document.querySelectorAll(".pro-note");

    if (isDark) {
      toolbar.classList.add("dark-mode");
      notes.forEach((n) => n.classList.add("dark-mode"));
    }
  });

  function loadNotes() {
    chrome.storage.sync.get([storageKey], (data) => {
      const notes = data[storageKey] || [];
      notes.forEach(createNoteElement);
    });
  }

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
          pinned: el.style.zIndex === "9999",
          minimized: el.classList.contains("minimized"),
        };
      });
      chrome.storage.sync.set({ [storageKey]: notes });
    }, DEBOUNCE_DELAY);
  }

  function createNoteElement(note = {}) {
    const { id, title, text, x, y, color, pinned, minimized } = note;

    const el = document.createElement("div");
    el.className = NOTES_CLASS;
    el.id = id || `note-${Date.now()}`;
    el.style.left = x || "150px";
    el.style.top = y || "150px";
    el.style.background = color || "";
    el.style.zIndex = pinned ? "9999" : "9998";

    const controls = document.createElement("div");
    controls.className = "control-buttons";
    controls.style.display = "flex";

    const minimizeBtn = document.createElement("button");
    minimizeBtn.textContent = "➖";

    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = " ❌";

    controls.append(minimizeBtn, closeBtn);

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.placeholder = "Title";
    titleInput.value =
      title || `Note ${document.querySelectorAll(".pro-note").length + 1}`;
    titleInput.className = "note-title";

    const noteToolbar = document.createElement("div");
    noteToolbar.className = "note-toolbar";

    const content = document.createElement("div");
    content.contentEditable = "true";
    content.className = "note-content";
    content.innerHTML = text || "";

    let savedSelection = null;

    content.addEventListener("mouseup", () => {
      const selection = window.getSelection();
      if (!selection.isCollapsed) {
        savedSelection = selection.getRangeAt(0);
      }
    });

    content.addEventListener("keyup", () => {
      const selection = window.getSelection();
      if (!selection.isCollapsed) {
        savedSelection = selection.getRangeAt(0);
      }
    });

    const fontSizeSelect = document.createElement("select");
    ["Small", "Medium", "Large"].forEach((size) => {
      const opt = document.createElement("option");
      opt.value = size.toLowerCase();
      opt.textContent = size;
      fontSizeSelect.appendChild(opt);
    });

    const boldBtn = document.createElement("button");
    boldBtn.innerHTML = `<b>B</b>`;

    const italicBtn = document.createElement("button");
    italicBtn.innerHTML = `<i>I</i>`;

    const underlineBtn = document.createElement("button");
    underlineBtn.innerHTML = `<u>U</u>`;

    const pinBtn = document.createElement("button");
    pinBtn.textContent = "📌";

    const exportBtn = document.createElement("button");
    exportBtn.textContent = "📄";
    exportBtn.title = "Export to TXT";

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
      circle.onclick = () => {
        if (savedSelection) {
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(savedSelection);
        }
        content.focus();
        document.execCommand("foreColor", false, c);
        saveNotes();
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

    colorInput.oninput = () => {
      if (savedSelection) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedSelection);
      }
      content.focus();
      document.execCommand("foreColor", false, colorInput.value);
      saveNotes();
    };

    colorPalette.appendChild(customCircle);

    fontSizeSelect.onchange = () => {
      if (savedSelection) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedSelection);
      }
      content.focus();
      const size =
        fontSizeSelect.value === "small"
          ? "2"
          : fontSizeSelect.value === "medium"
          ? "3"
          : "5";
      document.execCommand("fontSize", false, size);
      saveNotes();
    };

    boldBtn.onclick = () => {
      if (savedSelection) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedSelection);
      }
      content.focus();
      document.execCommand("bold");
      saveNotes();
    };

    italicBtn.onclick = () => {
      if (savedSelection) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedSelection);
      }
      content.focus();
      document.execCommand("italic");
      saveNotes();
    };

    underlineBtn.onclick = () => {
      if (savedSelection) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedSelection);
      }
      content.focus();
      document.execCommand("underline");
      saveNotes();
    };

    pinBtn.onclick = () => {
      el.style.zIndex = el.style.zIndex === "9999" ? "9998" : "9999";
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
      el.remove();
      saveNotes();
    };

    minimizeBtn.onclick = () => {
      const isMinimized = el.classList.toggle("minimized");

      minimizeBtn.textContent = isMinimized ? "➕" : "➖";

      if (isMinimized) {
        content.style.display = "none";
        noteToolbar.style.display = "none";
        titleInput.disabled = true;
      } else {
        content.style.display = "";
        noteToolbar.style.display = "";
        titleInput.disabled = false;
      }

      saveNotes();
    };

    titleInput.oninput = saveNotes;
    content.oninput = saveNotes;

    noteToolbar.append(
      colorPalette,
      fontSizeSelect,
      boldBtn,
      italicBtn,
      underlineBtn,
      pinBtn,
      exportBtn
    );
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.append(titleInput, controls);

    el.append(header, noteToolbar, content);
    document.body.appendChild(el);

    makeDraggable(el);
    makeResizable(el);

    if (minimized) minimizeBtn.onclick();
  }
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
        el.style.zIndex = "";
        saveNotes();
      }
    });
  }

  function makeResizable(el) {
    el.style.resize = "both";
    el.style.overflow = "auto";
    el.onmouseup = saveNotes;
  }

  loadNotes();
})();
