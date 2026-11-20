// @ts-check
/// <reference path="../../types/chrome.d.ts" />
/// <reference path="../../types/index.js" />

// Shared by the popup and the meetings page (classic script, loaded before the page script).
//
// Firefox only allows permissions.request() while a user-gesture handler is running, and the gesture is lost when a
// message is relayed to the background script. So the request is made here, synchronously from the click handler, and
// the background is only asked to register the content script afterwards.
// In Firefox the popup may close while the permission prompt is open; the page script then dies before it can message
// the background. That case is covered by the background's permissions.onAdded listener, which re-registers the content
// script because wantGoogleMeet is stored *before* the prompt is shown.

// Keep in sync with PLATFORM_CONFIGS.google_meet (matches + permissions) in background-script/config.js
const GOOGLE_MEET_ACCESS = {
    origins: ["https://meet.google.com/*"],
    /** @type {chrome.runtime.ManifestPermissions[]} */
    permissions: ["notifications"]
}

/**
 * Whether the browser currently grants the host and API permissions Google Meet capture needs.
 * Firefox treats host_permissions as optional and the user can revoke them at any time, so this can be false even
 * right after install.
 * @returns {Promise<boolean>}
 */
function hasGoogleMeetAccess() {
    return chrome.permissions.contains(GOOGLE_MEET_ACCESS)
}

/**
 * Asks for Google Meet access and, once granted, registers the content script.
 * MUST be called synchronously from a click/keyboard handler, before any await or callback.
 * @returns {Promise<string>} resolves with the background's message, rejects with a string/ErrorObject
 */
function requestGoogleMeetAccess() {
    // Persist the intent first, so the background's permissions.onAdded listener registers the script even if this page
    // is closed by the permission prompt (Firefox popup)
    chrome.storage.sync.set({ wantGoogleMeet: true })

    /** @type {Promise<boolean>} */
    let permissionRequest
    try {
        permissionRequest = chrome.permissions.request(GOOGLE_MEET_ACCESS)
    } catch (error) {
        permissionRequest = Promise.reject(error)
    }

    return permissionRequest.then((granted) => {
        if (!granted) {
            throw "Permissions denied"
        }
        return new Promise((resolve, reject) => {
            /** @type {ExtensionMessage} */
            const message = { type: "enable_platform", platform: "google_meet" }
            chrome.runtime.sendMessage(message, (responseUntyped) => {
                const response = /** @type {ExtensionResponse | undefined} */ (responseUntyped)
                if (chrome.runtime.lastError || !response) {
                    reject(chrome.runtime.lastError?.message || "No response from background script")
                }
                else if (response.success) {
                    resolve(/** @type {string} */(response.message))
                }
                else {
                    reject(response.message)
                }
            })
        })
    })
}
