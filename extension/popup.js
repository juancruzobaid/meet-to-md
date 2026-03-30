// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

window.onload = function () {
  const autoModeRadio = document.querySelector("#auto-mode")
  const manualModeRadio = document.querySelector("#manual-mode")
  const versionElement = document.querySelector("#version")
  // const notice = document.querySelector("#notice")


  // Platform Checkboxes
  const googleMeetToggle = /** @type {HTMLInputElement} */ (document.querySelector("#enable-google-meet"))
  const teamsToggle = /** @type {HTMLInputElement} */ (document.querySelector("#enable-teams"))
  const zoomToggle = /** @type {HTMLInputElement} */ (document.querySelector("#enable-zoom"))

  if (versionElement) {
    versionElement.innerHTML = `v${chrome.runtime.getManifest().version}`
  }

  chrome.storage.sync.get(["operationMode"], function (resultSyncUntyped) {
    const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
    if (autoModeRadio instanceof HTMLInputElement && manualModeRadio instanceof HTMLInputElement) {
      if (resultSync.operationMode === "manual") {
        manualModeRadio.checked = true
      }
      else {
        autoModeRadio.checked = true
      }

      autoModeRadio.addEventListener("change", function () {
        chrome.storage.sync.set({ operationMode: "auto" }, function () { })
      })
      manualModeRadio.addEventListener("change", function () {
        chrome.storage.sync.set({ operationMode: "manual" }, function () { })
      })
    }
  })

  /**
   * Syncs checkbox UI with actual background script registration status
   * @param {HTMLInputElement} element 
   * @param {Platform} platform 
   */
  function syncPlatformStatus(element, platform) {
    /** @type {ExtensionMessage} */
    const message = {
      type: "get_platform_status",
      platform: platform
    }
    chrome.runtime.sendMessage(message, (responseUntyped) => {
      const response = /** @type {ExtensionResponse} */ (responseUntyped)
      if (response && response.success) {
        element.checked = response.message === "Enabled"
      }
    })

    element.addEventListener("change", () => {
      const type = element.checked ? "enable_platform" : "disable_platform"

      /** @type {ExtensionMessage} */
      const message = {
        type: type,
        platform: platform
      }
      chrome.runtime.sendMessage(message, (responseUntyped) => {
        const response = /** @type {ExtensionResponse} */ (responseUntyped)
        if (response.success) {
          switch (platform) {
            case "google_meet":
              chrome.storage.sync.set({ wantGoogleMeet: element.checked }, function () { })
              break
            case "teams":
              chrome.storage.sync.set({ wantTeams: element.checked }, function () { })
              break
            case "zoom":
              chrome.storage.sync.set({ wantZoom: element.checked }, function () { })
              break
            default:
              break
          }
        }
        else {
          element.checked = !element.checked // Revert on failure
          console.error(`Failed to toggle ${platform}:`, response.message)
        }
      })
    })
  }

  // Initialize Toggles
  if (googleMeetToggle) {
    syncPlatformStatus(googleMeetToggle, "google_meet")
  }
  if (teamsToggle) {
    syncPlatformStatus(teamsToggle, "teams")
  }
  if (zoomToggle) {
    syncPlatformStatus(zoomToggle, "zoom")
  }

  // Language toggle
  const langEnBtn = document.querySelector("#lang-en")
  const langEsBtn = document.querySelector("#lang-es")

  function setActiveLanguage(lang) {
    if (langEnBtn instanceof HTMLButtonElement && langEsBtn instanceof HTMLButtonElement) {
      langEnBtn.classList.toggle("active", lang === "en")
      langEsBtn.classList.toggle("active", lang === "es")
    }
  }

  // Load saved language on popup open, default to "en"
  chrome.storage.sync.get(["captionLanguage"], function (result) {
    setActiveLanguage(result.captionLanguage || "en")
  })

  // Save language on click
  if (langEnBtn instanceof HTMLButtonElement) {
    langEnBtn.addEventListener("click", function () {
      chrome.storage.sync.set({ captionLanguage: "en" }, function () {
        setActiveLanguage("en")
      })
    })
  }

  if (langEsBtn instanceof HTMLButtonElement) {
    langEsBtn.addEventListener("click", function () {
      chrome.storage.sync.set({ captionLanguage: "es" }, function () {
        setActiveLanguage("es")
      })
    })
  }

  // Folder picker
  const chooseFolderBtn = document.querySelector("#choose-folder-btn")
  const folderNameSpan = document.querySelector("#folder-name")

  // IndexedDB helpers for popup context (folder-storage.js is for service worker via importScripts)
  function getHandleFromPopup() {
      return new Promise((resolve) => {
          const request = indexedDB.open("meet-to-md-storage", 1)
          request.onupgradeneeded = function(e) {
              const db = e.target.result
              if (!db.objectStoreNames.contains("folder-handles")) {
                  db.createObjectStore("folder-handles")
              }
          }
          request.onsuccess = function(e) {
              const db = e.target.result
              const tx = db.transaction("folder-handles", "readonly")
              const store = tx.objectStore("folder-handles")
              const getReq = store.get("obsidian-folder")
              getReq.onsuccess = function(e) { resolve(e.target.result || null) }
              getReq.onerror = function() { resolve(null) }
          }
          request.onerror = function() { resolve(null) }
      })
  }

  function saveHandleFromPopup(handle) {
      return new Promise((resolve) => {
          const request = indexedDB.open("meet-to-md-storage", 1)
          request.onupgradeneeded = function(e) {
              const db = e.target.result
              if (!db.objectStoreNames.contains("folder-handles")) {
                  db.createObjectStore("folder-handles")
              }
          }
          request.onsuccess = function(e) {
              const db = e.target.result
              const tx = db.transaction("folder-handles", "readwrite")
              const store = tx.objectStore("folder-handles")
              store.put(handle, "obsidian-folder")
              tx.oncomplete = () => resolve()
              tx.onerror = () => resolve()
          }
          request.onerror = function() { resolve() }
      })
  }

  // Load folder name on popup open
  getHandleFromPopup().then(handle => {
      if (handle && folderNameSpan) {
          folderNameSpan.textContent = "\u{1F4C1} " + handle.name
      } else if (folderNameSpan) {
          folderNameSpan.textContent = "No folder selected \u2014 using Downloads"
      }
  })

  // Choose folder on click
  if (chooseFolderBtn instanceof HTMLButtonElement) {
      chooseFolderBtn.addEventListener("click", async function () {
          try {
              // @ts-ignore — showDirectoryPicker is not in all TS defs
              const handle = await window.showDirectoryPicker({ mode: "readwrite" })
              await saveHandleFromPopup(handle)
              if (folderNameSpan) {
                  folderNameSpan.textContent = "\u{1F4C1} " + handle.name
              }
          } catch (err) {
              // User cancelled or permission denied — do nothing
              console.log("Folder picker cancelled or failed:", err)
          }
      })
  }

  // notice?.addEventListener("click", () => {
  //   alert("The transcript may not always be accurate and is only intended to aid in improving productivity. It is the responsibility of the user to ensure they comply with any applicable laws/rules.")
  // })
}

// Handle permission request from background service worker.
// Background cannot call requestPermission() — it has no window.
// Popup handles it here when it's open.
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === "request_folder_permission") {
        const request = indexedDB.open("meet-to-md-storage", 1)
        request.onsuccess = function (e) {
            const db = e.target.result
            const tx = db.transaction("folder-handles", "readonly")
            const store = tx.objectStore("folder-handles")
            const getReq = store.get("obsidian-folder")
            getReq.onsuccess = function (e) {
                const handle = e.target.result
                if (!handle) {
                    sendResponse({ granted: false })
                    return
                }
                handle.requestPermission({ mode: "readwrite" })
                    .then(result => {
                        sendResponse({ granted: result === "granted" })
                    })
                    .catch(() => {
                        sendResponse({ granted: false })
                    })
            }
            getReq.onerror = function () {
                sendResponse({ granted: false })
            }
        }
        request.onerror = function () {
            sendResponse({ granted: false })
        }
        return true // Keep message channel open for async response
    }
})