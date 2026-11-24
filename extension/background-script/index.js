import { processLastMeeting, recoverLastMeeting } from "./meetings.js"
import { downloadTranscript, postTranscriptToWebhook, WEBHOOK_FAILED_NOTIFICATION_PREFIX } from "./exporters.js"
import {
    getPermissionStatus,
    getContentScriptStatus,
    registerContentScript,
    deregisterContentScript,
    reRegisterContentScripts,
} from "./platforms.js"
import {
    clearTabIdAndApplyUpdate,
    openExtensionPopup,
    openSidePanel
} from "./utils.js"

/** @type {ExtensionMessage["type"][]} */
const ASYNC_RESPONSE_MESSAGE_TYPES = [
    "meeting_ended",
    "download_transcript_at_index",
    "post_webhook_at_index",
    "recover_last_meeting",
    "get_platform_enablement_status",
    "get_platform_permission_status",
    "enable_platform",
    "disable_platform",
    "open_popup",
    "open_side_panel"
]

/**
 * Tabs whose meeting end is being (or was) handled. Set synchronously before any storage call, so "meeting_ended" and the tab being closed right after cannot both pass the check. The storage based guard (meetingTabId: "processing") is kept for service worker restarts.
 * @type {Set<number>}
 */
const handledMeetingTabIds = new Set()

// Number of meeting end triggers still being processed
let activeMeetingEndCount = 0

/**
 * @throws error codes: 009, 010, 011, 012, 013, 014
 */
function handleMeetingEnd() {
    activeMeetingEndCount++

    return new Promise((resolve) => {
        // Prevent misfires of onRemoved until next meeting. Also prevents available update from being applied, during meeting post processing.
        chrome.storage.local.set({ meetingTabId: "processing" }, function () {
            console.log("Meeting tab id set to processing meeting")
            resolve(undefined)
        })
    })
        .then(() => processLastMeeting())
        .finally(() => {
            activeMeetingEndCount--
            // Only once all triggers are done, otherwise a deferred update could reload the extension while another one is still processing
            if (activeMeetingEndCount === 0) {
                clearTabIdAndApplyUpdate()
            }
        })
}

chrome.runtime.onMessage.addListener(function (messageUnTyped, sender, sendResponse) {
    const message = /** @type {ExtensionMessage} */ (messageUnTyped)
    console.log(message.type)

    if (message.type === "new_meeting_started") {
        // Saving the meeting tab id, to download transcript when this tab is closed. The sender tab is the Meet tab itself; the active tab query is only a fallback.
        /** @param {number | undefined} tabId */
        const saveMeetingTabId = (tabId) => {
            if (typeof tabId !== "number") {
                console.error("Could not determine meeting tab id")
                return
            }
            // New meeting in this tab, so its end has to be handled again
            handledMeetingTabIds.delete(tabId)
            chrome.storage.local.set({ meetingTabId: tabId }, function () {
                console.log("Meeting tab id saved")
            })
        }

        if (sender.tab && (typeof sender.tab.id === "number")) {
            saveMeetingTabId(sender.tab.id)
        }
        else {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                saveMeetingTabId(tabs[0]?.id)
            })
        }
    }

    if (message.type === "meeting_ended") {
        // Prevents double downloading of transcript from tab closed event listener
        if (sender.tab && (typeof sender.tab.id === "number")) {
            handledMeetingTabIds.add(sender.tab.id)
        }

        handleMeetingEnd()
            .then(() => {
                /** @type {ExtensionResponse} */
                const response = { success: true }
                sendResponse(response)
            })
            .catch((error) => {
                // Fails with error codes: 009, 010, 011, 012, 013, 014
                const parsedError = /** @type {ErrorObject} */ (error)

                /** @type {ExtensionResponse} */
                const response = { success: false, message: parsedError }
                sendResponse(response)
            })
    }

    if (message.type === "download_transcript_at_index") {
        if ((typeof message.index === "number") && (message.index >= 0)) {
            // Download the requested item
            downloadTranscript(message.index, false)
                .then(() => {
                    /** @type {ExtensionResponse} */
                    const response = { success: true }
                    sendResponse(response)
                })
                .catch((error) => {
                    // Fails with error codes: 009, 010
                    const parsedError = /** @type {ErrorObject} */ (error)

                    /** @type {ExtensionResponse} */
                    const response = { success: false, message: parsedError }
                    sendResponse(response)
                })
        }
        else {
            /** @type {ExtensionResponse} */
            const response = { success: false, message: { errorCode: "015", errorMessage: "Invalid index" } }
            sendResponse(response)
        }
    }

    if (message.type === "post_webhook_at_index") {
        if ((typeof message.index === "number") && (message.index >= 0)) {
            // Handle webhook retry
            postTranscriptToWebhook(message.index)
                .then(() => {
                    /** @type {ExtensionResponse} */
                    const response = { success: true }
                    sendResponse(response)
                })
                .catch(error => {
                    // Fails with error codes: 009, 010, 011, 012
                    const parsedError = /** @type {ErrorObject} */ (error)

                    console.error("Webhook retry failed:", parsedError)
                    /** @type {ExtensionResponse} */
                    const response = { success: false, message: parsedError }
                    sendResponse(response)
                })
        }
        else {
            /** @type {ExtensionResponse} */
            const response = { success: false, message: { errorCode: "015", errorMessage: "Invalid index" } }
            sendResponse(response)
        }
    }

    if (message.type === "recover_last_meeting") {
        recoverLastMeeting().then((message) => {
            /** @type {ExtensionResponse} */
            const response = { success: true, message: message }
            sendResponse(response)
        })
            .catch((error) => {
                // Fails with error codes: 009, 010, 011, 012, 013, 014
                const parsedError = /** @type {ErrorObject} */ (error)

                /** @type {ExtensionResponse} */
                const response = { success: false, message: parsedError }
                sendResponse(response)
            })
    }

    if (message.type === "get_platform_enablement_status") {
        /** @type {Platform | Platform[]} */
        let platform = message.platform || "google_meet"

        getContentScriptStatus(platform)
            .then((status) => {
                /** @type {ExtensionResponse} */
                const response = {
                    success: true,
                    message: status
                }
                sendResponse(response)
            })
            .catch((error) => {
                const parsedError = /** @type {ErrorObject} */ (error)
                /** @type {ExtensionResponse} */
                const response = { success: false, message: parsedError }
                sendResponse(response)
            })
    }

    if (message.type === "get_platform_permission_status") {
        /** @type {Platform | Platform[]} */
        let platform = message.platform || "google_meet"

        getPermissionStatus(platform)
            .then((status) => {
                /** @type {ExtensionResponse} */
                const response = {
                    success: true,
                    message: status
                }
                sendResponse(response)
            })
            .catch((error) => {
                const parsedError = /** @type {ErrorObject} */ (error)
                /** @type {ExtensionResponse} */
                const response = { success: false, message: parsedError }
                sendResponse(response)
            })
    }

    if ((message.type === "enable_platform")) {
        /** @type {Platform | Platform[]} */
        let platform = message.platform || "google_meet"

        // Permissions are requested by the UI (shared/meet-access.js) inside the click handler, because Firefox only allows permissions.request() during a user gesture, which does not survive this message hop. Here we only register the content script; it fails with "Insufficient permissions" if access was not granted.
        registerContentScript(platform).then((result) => {
            /** @type {ExtensionResponse} */
            const response = { success: true, message: result }
            sendResponse(response)
        }).catch((error) => {
            // Fails with error codes: not defined
            const parsedError = /** @type {ErrorObject} */ (error)

            /** @type {ExtensionResponse} */
            const response = { success: false, message: parsedError }
            sendResponse(response)
        })
    }

    if (message.type === "disable_platform") {
        /** @type {Platform | Platform[]} */
        let platform = message.platform || "google_meet"

        // To disable, we simply unregister the content script
        deregisterContentScript(platform).then((result) => {
            /** @type {ExtensionResponse} */
            const response = { success: true, message: result }
            sendResponse(response)
        }).catch((error) => {
            const parsedError = /** @type {ErrorObject} */ (error)

            /** @type {ExtensionResponse} */
            const response = { success: false, message: parsedError }
            sendResponse(response)
        })
    }

    if (message.type === "open_popup") {
        /** @type {Platform} */

        openExtensionPopup().then((message) => {
            /** @type {ExtensionResponse} */
            const response = { success: true, message: message }
            sendResponse(response)
        }).catch((error) => {
            const parsedError = /** @type {ErrorObject} */ (error)

            /** @type {ExtensionResponse} */
            const response = { success: false, message: parsedError }
            sendResponse(response)
        })
    }

    if (message.type === "open_side_panel") {
        /** @type {Platform} */

        openSidePanel(sender.tab).then((message) => {
            /** @type {ExtensionResponse} */
            const response = { success: true, message: message }
            sendResponse(response)
        }).catch((error) => {
            const parsedError = /** @type {ErrorObject} */ (error)

            /** @type {ExtensionResponse} */
            const response = { success: false, message: parsedError }
            sendResponse(response)
        })
    }

    // Keep the message channel open only for messages answered asynchronously above. Returning true for everything (e.g. the frequent broadcast_live_buffer, which only the side panel consumes) leaves the sender's response pending forever.
    return ASYNC_RESPONSE_MESSAGE_TYPES.includes(message.type)
})

// Download last meeting if meeting tab is closed
chrome.tabs.onRemoved.addListener(function (tabId) {
    if (handledMeetingTabIds.has(tabId)) {
        console.log("Meeting end already handled for this tab")
        return
    }
    handledMeetingTabIds.add(tabId)

    chrome.storage.local.get(["meetingTabId"], function (resultLocalUntyped) {
        const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)

        if (tabId === resultLocal.meetingTabId) {
            console.log("Successfully intercepted tab close")

            handleMeetingEnd().catch((error) => {
                // Fails with error codes: 009, 010, 011, 012, 013, 014
                console.error("Processing after tab close failed:", error)
            })
        }
        else {
            // Not a meeting tab
            handledMeetingTabIds.delete(tabId)
        }
    })
})

// Listen for extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
    // Check if there is an active meeting
    chrome.storage.local.get(["meetingTabId"], function (resultUntyped) {
        const result = /** @type {ResultLocal} */ (resultUntyped)

        if (result.meetingTabId) {
            // There is an active meeting(values: tabId or processing), defer the update
            chrome.storage.local.set({ isDeferredUpdatedAvailable: true }, function () {
                console.log("Deferred update flag set")
            })
        } else {
            // No active meeting, apply the update immediately. Meeting tab id is nullified only post meeting operations are done, so no race conditions.
            console.log("No active meeting, applying update immediately")
            chrome.runtime.reload()
        }
    })
})

// Re-register on browser start, as a backup in case registered content scripts were not persisted (e.g. Firefox profile or session restore edge cases). No-op if already registered or if the user opted out.
chrome.runtime.onStartup.addListener(() => {
    reRegisterContentScripts()
})

// Re-register the Google Meet content script whenever runtime permissions change—mostly serves as a backup for changes made outside the UI.
chrome.permissions.onAdded.addListener((event) => {
    registerNotificationClickListener()

    // Prevent competing with explicit content script registrations
    setTimeout(() => {
        deregisterContentScript("google_meet")
            .then(() => {
                console.log("De-registered Google Meet content script. Starting re-registration...")
            })
            .catch((error) => {
                console.log(error)
            })
            .finally(() => {
                reRegisterContentScripts()
            })
    }, 2000)
})


chrome.runtime.onInstalled.addListener(() => {
    // Set defaults values
    chrome.storage.sync.get(null, function (resultSyncUntyped) {
        const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

        chrome.storage.sync.set({
            autoPostWebhookAfterMeeting: resultSync.autoPostWebhookAfterMeeting === false ? false : true,
            autoDownloadFileAfterMeeting: resultSync.autoDownloadFileAfterMeeting === false ? false : true,
            operationMode: resultSync.operationMode === "manual" ? "manual" : "auto",
            hideCaptions: resultSync.hideCaptions === true ? true : false,
            webhookBodyType: resultSync.webhookBodyType === "advanced" ? "advanced" : "simple",
            wantGoogleMeet: resultSync.wantGoogleMeet === false ? false : true
        }, function () {
            // Re-register content scripts whenever extension is installed or updated, provided permissions are available. Suppress notification for silent background operation.
            reRegisterContentScripts()
        })
    })
})

// Open the meetings page when a webhook failure notification is clicked. Registered once so listeners do not accumulate.
// chrome.notifications is only defined once the optional "notifications" permission is granted, so this is also retried from permissions.onAdded.
let isNotificationClickListenerRegistered = false
function registerNotificationClickListener() {
    if (isNotificationClickListenerRegistered || !chrome.notifications) {
        return
    }
    chrome.notifications.onClicked.addListener(function (notificationId) {
        if (notificationId.startsWith(WEBHOOK_FAILED_NOTIFICATION_PREFIX)) {
            chrome.tabs.create({ url: "meetings.html" })
        }
    })
    isNotificationClickListenerRegistered = true
}
registerNotificationClickListener()