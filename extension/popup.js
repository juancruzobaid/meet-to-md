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

  // notice?.addEventListener("click", () => {
  //   alert("The transcript may not always be accurate and is only intended to aid in improving productivity. It is the responsibility of the user to ensure they comply with any applicable laws/rules.")
  // })
}