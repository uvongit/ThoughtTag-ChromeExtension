document.addEventListener("DOMContentLoaded", async () => {
  const notesList = document.getElementById("notes-list");
  const searchInput = document.getElementById("search");

  let allNotes = [];

  const tab = await getCurrentTab();
  const hostname = new URL(tab.url).hostname;
  const href = tab.url;

  chrome.storage.sync.get(["scope"], (data) => {
    const scope = data.scope || "perSite";
    const storageKey = scope === "perURL" ? href : hostname;

    chrome.storage.sync.get([storageKey], (data) => {
      allNotes = data[storageKey] || [];
      renderNotes(allNotes);
    });
  });

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase();
    const filtered = allNotes.filter(note =>
      note.text.toLowerCase().includes(query) ||
      (note.title && note.title.toLowerCase().includes(query))
    );
    renderNotes(filtered);
  });

  function renderNotes(notes) {
    notesList.innerHTML = "";
    if (!notes.length) {
      notesList.innerHTML = "<p>No notes found.</p>";
      return;
    }
    notes.forEach(note => {
      const div = document.createElement("div");
      div.className = "note-item";
      div.innerHTML = `
        <strong>${note.title || "Untitled"}</strong>
        <button data-id="${note.id}">X</button>
        <p>${note.text.slice(0, 100)}</p>
      `;
      div.querySelector("button").addEventListener("click", () => {
        deleteNote(note.id);
      });
      notesList.appendChild(div);
    });
  }

  function deleteNote(id) {
    allNotes = allNotes.filter(n => n.id !== id);
    chrome.storage.sync.get(["scope"], (data) => {
      const scope = data.scope || "perSite";
      const storageKey = scope === "perURL" ? href : hostname;
      chrome.storage.sync.set({ [storageKey]: allNotes }, () => {
        renderNotes(allNotes);
      });
    });
  }

  function getCurrentTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]);
      });
    });
  }
});
