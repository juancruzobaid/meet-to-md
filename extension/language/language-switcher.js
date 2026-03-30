// @ts-check

/**
 * Maps our language codes to Meet's language option text prefixes.
 * Meet has options like "English (United States)", "Spanish (Mexico)", etc.
 * We match by prefix to get the first available variant.
 */
const MEET_LANGUAGE_MAP = {
    "en": "English",
    "es": "Spanish"
}

/**
 * Switches Meet's caption language by automating the Settings UI.
 * Flow: open settings → click Captions tab → open language dropdown → select option → close settings
 * @param {string} languageCode - "en" or "es"
 * @returns {Promise<boolean>} true if successful
 */
async function switchMeetCaptionLanguage(languageCode) {
    const targetLanguage = MEET_LANGUAGE_MAP[languageCode]
    if (!targetLanguage) {
        console.error("meet-to-md: Unknown language code:", languageCode)
        return false
    }

    try {
        const settingsOpened = await openSettingsDialog()
        if (!settingsOpened) {
            console.error("meet-to-md: Could not open Settings dialog")
            return false
        }

        const captionsTabOpened = await clickCaptionsTab()
        if (!captionsTabOpened) {
            console.error("meet-to-md: Could not find Captions tab")
            closeSettingsDialog()
            return false
        }

        const dropdownOpened = await openLanguageDropdown()
        if (!dropdownOpened) {
            console.error("meet-to-md: Could not open language dropdown")
            closeSettingsDialog()
            return false
        }

        await sleep(100)
        const selected = await selectLanguageOption(targetLanguage)
        if (!selected) {
            console.error("meet-to-md: Could not find language option for:", targetLanguage)
            closeSettingsDialog()
            return false
        }

        await sleep(300)
        closeSettingsDialog()
        console.log("meet-to-md: Caption language switched to", targetLanguage)
        return true

    } catch (err) {
        console.error("meet-to-md: Error switching language:", err)
        try { closeSettingsDialog() } catch (e) {}
        return false
    }
}

/**
 * Opens Meet's Settings dialog by clicking the settings button in the bottom bar.
 * @returns {Promise<boolean>}
 */
async function openSettingsDialog() {
    const settingsBtn =
        document.querySelector('[aria-label="Settings"]') ||
        document.querySelector('[data-tooltip="Settings"]') ||
        Array.from(document.querySelectorAll('.google-symbols')).find(el => el.textContent.trim() === 'settings')?.closest('button')

    if (settingsBtn instanceof HTMLElement) {
        settingsBtn.click()
        // Wait up to 2s for dialog to appear
        for (let i = 0; i < 20; i++) {
            await sleep(100)
            if (document.querySelector('[role="dialog"]')) return true
        }
    }
    return false
}

/**
 * Clicks the Captions tab inside the Settings dialog.
 * @returns {Promise<boolean>}
 */
async function clickCaptionsTab() {
    // Wait up to 1s for dialog content to load
    for (let i = 0; i < 10; i++) {
        await sleep(100)
        const allButtons = Array.from(document.querySelectorAll('[role="dialog"] [role="tab"], [role="dialog"] button, [role="dialog"] [role="menuitem"]'))
        const captionsBtn = allButtons.find(el =>
            el.textContent.trim() === 'Captions' ||
            el.textContent.trim() === 'Subtítulos' ||
            el.getAttribute('aria-label')?.includes('Captions')
        )
        if (captionsBtn instanceof HTMLElement) {
            captionsBtn.click()
            await sleep(400)
            return true
        }
        // Maybe already on Captions tab
        if (document.querySelector('[jsname="FbBif"]') || document.querySelector('.rHGeGc-uusGie-fmcmS')) {
            return true
        }
    }
    return false
}

/**
 * Clicks the language dropdown to open it.
 * @returns {Promise<boolean>}
 */
async function openLanguageDropdown() {
    // Poll up to 2s for the dropdown to appear
    let dropdown = null
    for (let i = 0; i < 20; i++) {
        await sleep(100)
        dropdown = document.querySelector('[jsname="FbBif"]') || document.querySelector('.rHGeGc-uusGie-fmcmS')
        if (dropdown instanceof HTMLElement) break
    }
    if (!dropdown) return false

    dropdown.click()

    // Poll up to 2s for options to appear
    for (let i = 0; i < 20; i++) {
        await sleep(100)
        if (document.querySelectorAll('[role="option"]').length > 0) return true
    }
    return false
}

/**
 * Selects a language option from the open dropdown.
 * @param {string} languagePrefix - e.g. "English" or "Spanish"
 * @returns {Promise<boolean>}
 */
async function selectLanguageOption(languagePrefix) {
    const options = Array.from(document.querySelectorAll('[role="option"]'))
    const target = options.find(el => el.textContent.trim().startsWith(languagePrefix))
    if (target instanceof HTMLElement) {
        target.click()
        return true
    }
    return false
}

/**
 * Closes the Settings dialog by clicking the X button or pressing Escape.
 */
function closeSettingsDialog() {
    const closeBtn =
        document.querySelector('[role="dialog"] [aria-label="Close dialog"]') ||
        document.querySelector('[role="dialog"] [aria-label="Close"]') ||
        document.querySelector('[role="dialog"] button[jsname="tQd7Nd"]') ||
        Array.from(document.querySelectorAll('[role="dialog"] button')).find(el =>
            el.getAttribute('aria-label')?.toLowerCase().includes('close') ||
            el.querySelector('.google-symbols')?.textContent.trim() === 'close'
        )
    if (closeBtn instanceof HTMLElement) {
        closeBtn.click()
        return
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

/**
 * Simple sleep helper.
 * @param {number} ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}
