import { TIMEFORMAT } from "./config.js"

/**
 * Format transcript entries into string
 * @param {TranscriptBlock[] | []} transcript
 */
export function getTranscriptString(transcript) {
    let transcriptString = ""
    if (transcript.length > 0) {
        transcript.forEach(transcriptBlock => {
            transcriptString += `${transcriptBlock.personName} (${new Date(transcriptBlock.timestamp).toLocaleString("default", TIMEFORMAT).toUpperCase()})\n`
            transcriptString += transcriptBlock.transcriptText
            transcriptString += "\n\n"
        })
        return transcriptString
    }
    return transcriptString
}

/**
 * Format chat messages into string
 * @param {ChatMessage[] | []} chatMessages
 */
export function getChatMessagesString(chatMessages) {
    let chatMessagesString = ""
    if (chatMessages.length > 0) {
        chatMessages.forEach(chatMessage => {
            chatMessagesString += `${chatMessage.personName} (${new Date(chatMessage.timestamp).toLocaleString("default", TIMEFORMAT).toUpperCase()})\n`
            chatMessagesString += chatMessage.chatMessageText
            chatMessagesString += "\n\n"
        })
    }
    return chatMessagesString
}

export function clearTabIdAndApplyUpdate() {
    // Nullify to indicate end of meeting processing
    chrome.storage.local.set({ meetingTabId: null }, function () {
        console.log("Meeting tab id cleared for next meeting")

        // Check if there's a deferred update
        chrome.storage.local.get(["isDeferredUpdatedAvailable"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)

            if (resultLocal.isDeferredUpdatedAvailable) {
                console.log("Applying deferred update")
                chrome.storage.local.set({ isDeferredUpdatedAvailable: false }, function () {
                    chrome.runtime.reload()
                })
            }
        })
    })
}

/**
 * Opens the extension popup programmatically.
 */
export function openExtensionPopup() {
    return new Promise((resolve, reject) => {
        chrome.action.openPopup()
            .then(() => {
                console.log("Popup opened successfully")
                resolve("Popup opened")
            })
            .catch((error) => {
                console.error("Failed to open popup:", error)
                reject("Failed to open popup")
            })
    })
}

/**
 * Opens the side panel programmatically for the active tab
 */
export function openSidePanel() {
    return new Promise((resolve, reject) => {
        // Get the current active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0]
            if (!activeTab || !activeTab.id) {
                console.error("No active tab found.")
                reject("No active tab found")
                return
            }

            // Open the side panel targeting that specific tab ID
            chrome.sidePanel.open({ tabId: activeTab.id })
                .then(() => {
                    console.log("Side panel opened successfully")
                    resolve("Side panel opened")
                })
                .catch((error) => {
                    console.error("Failed to open side panel:", error)
                    reject("Failed to open side panel")
                })
        })
    })
}
