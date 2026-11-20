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
 * action.openPopup() is missing or user-gesture gated in some browsers (Firefox), so failures resolve to a clean rejection.
 */
export function openExtensionPopup() {
    return new Promise((resolve, reject) => {
        if (!chrome.action || (typeof chrome.action.openPopup !== "function")) {
            reject("Opening the popup is not supported in this browser")
            return
        }

        try {
            chrome.action.openPopup()
                .then(() => {
                    console.log("Popup opened successfully")
                    resolve("Popup opened")
                })
                .catch((error) => {
                    console.error("Failed to open popup:", error)
                    reject("Failed to open popup")
                })
        } catch (error) {
            console.error("Failed to open popup:", error)
            reject("Failed to open popup")
        }
    })
}

/**
 * Opens the transcript side panel (Chromium) or sidebar (Firefox) for the given tab, falling back to the active tab.
 * Never throws: always settles the promise.
 * - Chromium: chrome.sidePanel.open()
 * - Firefox: sidebarAction.open() is only allowed inside a user-action handler, and a message from a content script is not one, so it usually fails. It then rejects with error code 017, and the content script tells the user to open the sidebar from the browser's sidebar menu.
 * @param {chrome.tabs.Tab} [senderTab] tab that asked for the panel (the Meet tab)
 * @returns {Promise<string>}
 */
export function openSidePanel(senderTab) {
    return new Promise((resolve, reject) => {
        // Firefox sidebar
        // @ts-ignore - browser and sidebarAction exist only in Firefox
        const sidebarAction = (typeof browser !== "undefined" && browser.sidebarAction) || chrome.sidebarAction
        if (!chrome.sidePanel && sidebarAction && (typeof sidebarAction.open === "function")) {
            /** @type {ErrorObject} */
            const sidebarError = { errorCode: "017", errorMessage: "Open the Meet to MD sidebar from the browser sidebar menu" }
            try {
                Promise.resolve(sidebarAction.open())
                    .then(() => {
                        console.log("Sidebar opened successfully")
                        resolve("Sidebar opened")
                    })
                    .catch((/** @type {any} */ error) => {
                        console.log("Could not open sidebar programmatically:", error)
                        reject(sidebarError)
                    })
            } catch (error) {
                console.log("Could not open sidebar programmatically:", error)
                reject(sidebarError)
            }
            return
        }

        if (!chrome.sidePanel || (typeof chrome.sidePanel.open !== "function")) {
            reject({ errorCode: "018", errorMessage: "Side panel is not supported in this browser" })
            return
        }

        /** @param {number} tabId */
        const openForTab = (tabId) => {
            try {
                chrome.sidePanel.open({ tabId: tabId })
                    .then(() => {
                        console.log("Side panel opened successfully")
                        resolve("Side panel opened")
                    })
                    .catch((error) => {
                        console.error("Failed to open side panel:", error)
                        reject({ errorCode: "018", errorMessage: "Failed to open side panel" })
                    })
            } catch (error) {
                console.error("Failed to open side panel:", error)
                reject({ errorCode: "018", errorMessage: "Failed to open side panel" })
            }
        }

        // Open synchronously for the sender tab when known, so the user gesture from the in-page button is preserved
        if (senderTab && (typeof senderTab.id === "number")) {
            openForTab(senderTab.id)
            return
        }

        // Fallback: the current active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0]
            if (!activeTab || (typeof activeTab.id !== "number")) {
                console.error("No active tab found.")
                reject({ errorCode: "018", errorMessage: "No active tab found" })
                return
            }
            openForTab(activeTab.id)
        })
    })
}
