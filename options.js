document.addEventListener("DOMContentLoaded", () => {
  const scopeSelect = document.getElementById("scope");
  const darkModeCheckbox = document.getElementById("darkMode");
  const clearBtn = document.getElementById("clearNotes");

  chrome.storage.sync.get(['scope', 'darkMode'], data => {
    scopeSelect.value = data.scope || 'perSite';
    darkModeCheckbox.checked = !!data.darkMode;
  });

  scopeSelect.onchange = () => {
    chrome.storage.sync.set({ scope: scopeSelect.value });
  };

  darkModeCheckbox.onchange = () => {
    chrome.storage.sync.set({ darkMode: darkModeCheckbox.checked });
  };

  clearBtn.onclick = () => {
    if (confirm("Are you sure you want to delete ALL saved notes?")) {
      chrome.storage.sync.clear(() => {
        alert("All notes have been cleared.");
      });
    }
  };
});
