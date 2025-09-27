document.addEventListener("DOMContentLoaded", () => {
  // Cache settings controls within the options page.
  const scopeSelect = document.getElementById("scope");
  const darkModeCheckbox = document.getElementById("darkMode");
  const clearBtn = document.getElementById("clearNotes");

  const syncArea = chrome.storage?.sync;
  const localArea = chrome.storage?.local;

  // Helper that chooses sync storage when available, falling back to local.
  const getStorageArea = () => syncArea || localArea;

  const storage = getStorageArea();
  if (!storage) {
    console.warn("ThoughtTags options: no storage area available");
    return;
  }

  storage.get(["scope", "darkMode"], (data) => {
    if (chrome.runtime?.lastError) {
      console.warn("ThoughtTags options: failed to read settings", chrome.runtime.lastError);
      return;
    }
    scopeSelect.value = data.scope || "perSite";
    darkModeCheckbox.checked = !!data.darkMode;
  });

  scopeSelect.onchange = () => {
    storage.set({ scope: scopeSelect.value });
  };

  darkModeCheckbox.onchange = () => {
    storage.set({ darkMode: darkModeCheckbox.checked });
  };

  clearBtn.onclick = () => {
    if (confirm("Are you sure you want to delete ALL saved notes?")) {
      storage.clear(() => {
        if (chrome.runtime?.lastError) {
          console.warn("ThoughtTags options: failed to clear notes", chrome.runtime.lastError);
          return;
        }
        alert("All notes have been cleared.");
      });
    }
  };
});
