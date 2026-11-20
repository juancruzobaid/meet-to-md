window.onload = function () {
  chrome.scripting
    .getRegisteredContentScripts()
    .then((scripts) => {
      console.log(scripts)
    })

  const autoModeRadio = document.querySelector("#auto-mode")
  const manualModeRadio = document.querySelector("#manual-mode")
  const versionElement = document.querySelector("#version")
  // const notice = document.querySelector("#notice")


  // Platform Checkboxes
  const googleMeetToggle = /** @type {HTMLInputElement} */ (document.querySelector("#enable-google-meet"))

  const hideCaptionsToggle = /** @type {HTMLInputElement} */ (document.querySelector("#hide-captions"))

  if (versionElement) {
    versionElement.textContent = `v${chrome.runtime.getManifest().version}`
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

  chrome.storage.sync.get(["hideCaptions"], function (resultSyncUntyped) {
    const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
    if (hideCaptionsToggle instanceof HTMLInputElement) {
      hideCaptionsToggle.checked = resultSync.hideCaptions

      hideCaptionsToggle.addEventListener("change", function () {
        chrome.storage.sync.set({ hideCaptions: hideCaptionsToggle.checked }, function () { })
      })
    }
  })

  /**
   * Syncs the Google Meet checkbox with the content script registration status, and shows a warning with a
   * "Grant access" button when the browser does not grant Meet access (Firefox treats host permissions as optional and
   * the user can revoke them at any time).
   * @param {HTMLInputElement} element
   */
  function syncGoogleMeetStatus(element) {
    const accessWarning = document.querySelector("#meet-access-warning")
    const grantAccessButton = document.querySelector("#grant-meet-access")

    function refresh() {
      /** @type {ExtensionMessage} */
      const message = {
        type: "get_platform_enablement_status",
        platform: "google_meet"
      }
      chrome.runtime.sendMessage(message, (responseUntyped) => {
        const response = /** @type {ExtensionResponse} */ (responseUntyped)
        if (response && response.success) {
          element.checked = response.message === "Enabled"
        }
      })

      hasGoogleMeetAccess().then((hasAccess) => {
        accessWarning?.toggleAttribute("hidden", hasAccess)
      }).catch((error) => {
        console.error(error)
      })
    }

    // Must be called synchronously from a click handler (Firefox user-gesture rule for permissions.request)
    function enable() {
      requestGoogleMeetAccess()
        .catch((error) => {
          console.error("Failed to enable google_meet:", error)
        })
        .finally(() => {
          refresh()
        })
    }

    refresh()

    // "click" rather than "change", so the permission request runs inside the user-gesture handler. The checkbox is already toggled when click listeners run (also for keyboard and label activation).
    element.addEventListener("click", () => {
      if (element.checked) {
        enable()
        return
      }

      chrome.storage.sync.set({ wantGoogleMeet: false }, function () { })

      /** @type {ExtensionMessage} */
      const message = {
        type: "disable_platform",
        platform: "google_meet"
      }
      chrome.runtime.sendMessage(message, (responseUntyped) => {
        const response = /** @type {ExtensionResponse} */ (responseUntyped)
        if (!response || !response.success) {
          console.error("Failed to disable google_meet:", response?.message)
        }
        refresh()
      })
    })

    grantAccessButton?.addEventListener("click", () => {
      enable()
    })
  }

  // Initialize Toggles
  if (googleMeetToggle) {
    syncGoogleMeetStatus(googleMeetToggle)
  }

  // notice?.addEventListener("click", () => {
  //   alert("The transcript may not always be accurate and is only intended to aid in improving productivity. It is the responsibility of the user to ensure they comply with any applicable laws/rules.")
  // })
}