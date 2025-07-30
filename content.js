class WhatsAppMessageSender {
    constructor() {
        this.maxRetries = 25;
        this.retryDelay = 2000;
        this.sessionDialogHandled = false;
        this.init();
    }

    init() {
        if (this.isWhatsAppSendURL()) {
            console.log('WhatsApp send URL detected, initializing...');
            this.handleSendURL();
        }
    }

    isWhatsAppSendURL() {
        return window.location.href.includes('web.whatsapp.com/send');
    }

    async handleSendURL() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const message = urlParams.get('text');
            const phone = urlParams.get('phone');

            if (!message) {
                this.reportStatus(false, 'No message in URL');
                return;
            }

            console.log(`Preparing to send message to ${phone}: "${message.substring(0, 50)}..."`);

            // First wait for basic page load
            await this.delay(2000);
            
            // Handle session dialog with multiple attempts
            await this.handleSessionDialog();
            
            // Wait for WhatsApp to fully load
            await this.waitForWhatsAppLoad();
            
            // Attempt to send the message with enhanced reliability
            const success = await this.attemptSendMessage(decodeURIComponent(message));
            
            // Wait longer to ensure message is fully processed
            await this.delay(5000);
            
            this.reportStatus(success, success ? 'Message sent successfully' : 'Failed to send message');

        } catch (error) {
            console.error('Error in handleSendURL:', error);
            this.reportStatus(false, error.message);
        }
    }

    async handleSessionDialog() {
        console.log('Checking for session dialog...');
        
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 20;
            
            const checkDialog = async () => {
                attempts++;
                console.log(`Session dialog check attempt ${attempts}/${maxAttempts}`);
                
                // More comprehensive selectors for the "Use here" button
                const useHereSelectors = [
                    'div[role="button"]:contains("Use here")',
                    'div[role="button"]:contains("usar aquí")',
                    'div[role="button"]:contains("यहाँ उपयोग करें")',
                    'button:contains("Use here")',
                    'button:contains("usar aquí")',
                    'button:contains("यहाँ उपयोग करें")',
                    '[data-testid="popup-controls-ok"]',
                    '[data-testid="confirm-popup"]'
                ];
                
                let useHereButton = null;
                
                // Try each selector
                for (const selector of useHereSelectors) {
                    if (selector.includes(':contains')) {
                        const baseSelector = selector.split(':contains')[0];
                        const textToFind = selector.match(/\("([^"]+)"\)/)?.[1];
                        const elements = document.querySelectorAll(baseSelector);
                        
                        for (const element of elements) {
                            if (element.textContent.toLowerCase().includes(textToFind?.toLowerCase() || 'use here')) {
                                useHereButton = element;
                                break;
                            }
                        }
                    } else {
                        useHereButton = document.querySelector(selector);
                    }
                    
                    if (useHereButton) break;
                }
                
                // Also check for generic dialog buttons
                if (!useHereButton) {
                    const allButtons = document.querySelectorAll('div[role="button"], button');
                    for (const button of allButtons) {
                        const text = button.textContent.toLowerCase();
                        if (text.includes('use here') || text.includes('usar aquí') || text.includes('continue') || text.includes('ok')) {
                            useHereButton = button;
                            break;
                        }
                    }
                }
                
                // Check for dialog containers
                const dialogSelectors = [
                    '[role="dialog"]',
                    '.popup-container',
                    '._2dqk0',
                    '[data-testid="popup"]',
                    '.modal'
                ];
                
                let dialogContainer = null;
                for (const selector of dialogSelectors) {
                    dialogContainer = document.querySelector(selector);
                    if (dialogContainer) break;
                }
                
                if (useHereButton && (dialogContainer || useHereButton.closest('[role="dialog"]'))) {
                    console.log('Found session dialog with "Use here" button, clicking...');
                    
                    // Multiple click attempts
                    try {
                        useHereButton.click();
                        await this.delay(500);
                        
                        // Backup click methods
                        useHereButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        await this.delay(500);
                        
                        const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true });
                        const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
                        useHereButton.dispatchEvent(mouseDownEvent);
                        useHereButton.dispatchEvent(mouseUpEvent);
                        
                    } catch (clickError) {
                        console.log('Click error:', clickError);
                    }
                    
                    // Wait for dialog to close
                    setTimeout(() => {
                        this.sessionDialogHandled = true;
                        console.log('Session dialog handled successfully');
                        resolve();
                    }, 3000);
                    return;
                }
                
                // Check if we should continue or timeout
                if (attempts >= maxAttempts) {
                    console.log('Session dialog check timeout - proceeding anyway');
                    resolve();
                    return;
                }
                
                // Check if page has loaded enough to indicate no dialog
                const hasMainInterface = document.querySelector('[data-testid="chat"]') || 
                                       document.querySelector('footer') ||
                                       document.querySelector('[role="textbox"]');
                
                if (hasMainInterface && !dialogContainer) {
                    console.log('Main interface detected, no session dialog present');
                    resolve();
                    return;
                }
                
                setTimeout(checkDialog, 1500);
            };
            
            setTimeout(checkDialog, 1000);
        });
    }

    async waitForWhatsAppLoad() {
        console.log('Waiting for WhatsApp to load...');
        
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 60; // Increased timeout to 60 seconds
            
            const checkLoad = () => {
                attempts++;
                console.log(`Load check attempt ${attempts}/${maxAttempts}`);
                
                // Check for loading indicators
                const loadingSelectors = [
                    '[data-icon="logo"]',
                    '.landing-wrapper', 
                    '[data-icon="laptop"]',
                    '._2dqk0',
                    '.progress-wrapper'
                ];
                
                let isLoading = false;
                for (const selector of loadingSelectors) {
                    if (document.querySelector(selector)) {
                        isLoading = true;
                        break;
                    }
                }
                
                // Check for chat interface elements
                const chatSelectors = [
                    '[data-testid="chat"]',
                    'footer',
                    '[role="textbox"]',
                    'div[contenteditable="true"]',
                    '[data-testid="conversation-header"]'
                ];
                
                let hasChat = false;
                for (const selector of chatSelectors) {
                    if (document.querySelector(selector)) {
                        hasChat = true;
                        break;
                    }
                }
                
                // Check for error states
                const errorSelectors = [
                    '[data-icon="alert-phone"]',
                    '.invalid-number',
                    '[data-testid="alert"]'
                ];
                
                let hasError = false;
                for (const selector of errorSelectors) {
                    if (document.querySelector(selector)) {
                        hasError = true;
                        break;
                    }
                }
                
                const hasUnsupportedUrl = window.location.href.includes('unsupported');
                
                console.log(`Load status: loading=${isLoading}, hasChat=${hasChat}, hasError=${hasError}, unsupported=${hasUnsupportedUrl}`);

                if (hasError || hasUnsupportedUrl) {
                    reject(new Error('WhatsApp error detected - invalid number or unsupported'));
                    return;
                }

                if (!isLoading && hasChat) {
                    console.log('WhatsApp loaded successfully');
                    resolve();
                    return;
                }

                if (attempts >= maxAttempts) {
                    reject(new Error('Timeout waiting for WhatsApp to load'));
                    return;
                }

                setTimeout(checkLoad, 1000);
            };

            setTimeout(checkLoad, 2000);
        });
    }

    async attemptSendMessage(message) {
        console.log('Starting enhanced message send attempts...');
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`Enhanced send attempt ${attempt}/${this.maxRetries}`);
                
                const result = await this.trySendMessageEnhanced(message);
                
                if (result.success) {
                    console.log('Message send process completed successfully!');
                    
                    // Extended wait for message processing
                    await this.delay(6000);
                    
                    // Enhanced verification
                    const verified = await this.verifyMessageSentEnhanced();
                    if (verified) {
                        console.log('Message verified as sent successfully!');
                        return true;
                    } else {
                        console.log(`Verification failed on attempt ${attempt}`);
                        if (attempt === this.maxRetries) {
                            return false;
                        }
                    }
                } else {
                    console.log(`Send attempt ${attempt} failed: ${result.error}`);
                }
                
                if (attempt < this.maxRetries) {
                    console.log(`Waiting ${this.retryDelay}ms before retry...`);
                    await this.delay(this.retryDelay);
                }
                
            } catch (error) {
                console.error(`Attempt ${attempt} error:`, error);
                if (attempt === this.maxRetries) {
                    throw error;
                }
                await this.delay(this.retryDelay);
            }
        }
        
        console.log('All enhanced send attempts failed');
        return false;
    }

    async trySendMessageEnhanced(message) {
        try {
            // Step 1: Find the message input with enhanced selectors
            const messageInput = await this.findMessageInputEnhanced();
            if (!messageInput) {
                return { success: false, error: 'Message input not found' };
            }

            console.log('Found message input:', messageInput);

            // Step 2: Clear any existing content
            await this.clearMessageInput(messageInput);
            
            // Step 3: Insert the message using multiple methods
            const insertResult = await this.insertMessageEnhanced(messageInput, message);
            if (!insertResult.success) {
                return { success: false, error: 'Failed to insert message' };
            }

            // Step 4: Wait for message to be processed
            await this.delay(1500);

            // Step 5: Enhanced send process
            const sendResult = await this.sendMessageEnhanced(messageInput);
            
            return sendResult;

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async findMessageInputEnhanced() {
        const selectors = [
            'div[contenteditable="true"][data-tab="10"]',
            'div[contenteditable="true"][data-testid="conversation-compose-box-input"]',
            'div[contenteditable="true"][title*="message"]',
            'div[contenteditable="true"][title*="Message"]',
            'div[contenteditable="true"].selectable-text',
            'footer div[contenteditable="true"]',
            '[role="textbox"]',
            'div[contenteditable="true"]._ak1l',
            'div[contenteditable="true"]'
        ];

        // Try multiple times to find the input
        for (let i = 0; i < 10; i++) {
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    if (element && 
                        element.isContentEditable && 
                        element.offsetParent !== null &&
                        !element.closest('[aria-hidden="true"]')) {
                        
                        // Additional validation
                        const rect = element.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            return element;
                        }
                    }
                }
            }
            
            if (i < 9) {
                await this.delay(1000);
            }
        }

        return null;
    }

    async clearMessageInput(input) {
        try {
            input.focus();
            await this.delay(200);
            
            // Multiple clearing methods
            input.innerHTML = '';
            input.textContent = '';
            
            // Select all and delete
            if (document.execCommand) {
                document.execCommand('selectAll', false, null);
                document.execCommand('delete', false, null);
            }
            
            // Clear using Range API
            const range = document.createRange();
            range.selectNodeContents(input);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            
            const deleteEvent = new KeyboardEvent('keydown', {
                key: 'Delete',
                code: 'Delete',
                keyCode: 46,
                bubbles: true,
                cancelable: true
            });
            input.dispatchEvent(deleteEvent);
            
            this.triggerInputEvents(input);
            await this.delay(300);
            
        } catch (error) {
            console.log('Error clearing input:', error);
        }
    }

    async insertMessageEnhanced(input, message) {
        console.log('Inserting message with enhanced methods...');

        try {
            // Method 1: Direct textContent
            input.textContent = message;
            this.triggerInputEvents(input);
            await this.delay(500);

            if (this.verifyMessageInInput(input, message)) {
                console.log('Message inserted successfully via textContent');
                return { success: true };
            }

            // Method 2: Character by character with events
            await this.simulateTypingEnhanced(input, message);
            
            if (this.verifyMessageInInput(input, message)) {
                console.log('Message inserted successfully via typing simulation');
                return { success: true };
            }

            // Method 3: Using InputEvent
            input.focus();
            input.textContent = message;
            
            const inputEvent = new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: message
            });
            
            input.dispatchEvent(inputEvent);
            this.triggerInputEvents(input);
            await this.delay(500);
            
            if (this.verifyMessageInInput(input, message)) {
                console.log('Message inserted successfully via InputEvent');
                return { success: true };
            }

            return { success: false };

        } catch (error) {
            console.error('Error in insertMessageEnhanced:', error);
            return { success: false };
        }
    }

    async simulateTypingEnhanced(input, message) {
        console.log('Enhanced typing simulation...');
        
        input.focus();
        input.textContent = '';
        
        for (let i = 0; i < message.length; i++) {
            const char = message[i];
            
            // Add character
            input.textContent += char;
            
            // Trigger events for every character or at intervals
            if (i % 5 === 0 || i === message.length - 1) {
                const keydownEvent = new KeyboardEvent('keydown', {
                    key: char,
                    code: `Key${char.toUpperCase()}`,
                    bubbles: true,
                    cancelable: true
                });
                
                const inputEvent = new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertText',
                    data: char
                });
                
                input.dispatchEvent(keydownEvent);
                input.dispatchEvent(inputEvent);
                
                await this.delay(30);
            }
        }
        
        this.triggerInputEvents(input);
        await this.delay(200);
    }

    async sendMessageEnhanced(input) {
        console.log('Enhanced message sending...');

        // Method 1: Enhanced send button detection
        const sendButton = await this.findSendButtonEnhanced();
        if (sendButton) {
            console.log('Found send button, attempting multiple clicks...');
            
            // Multiple click strategies
            for (let i = 0; i < 3; i++) {
                try {
                    sendButton.focus();
                    await this.delay(100);
                    
                    sendButton.click();
                    await this.delay(200);
                    
                    const clickEvent = new MouseEvent('click', { 
                        bubbles: true, 
                        cancelable: true,
                        view: window,
                        detail: 1
                    });
                    sendButton.dispatchEvent(clickEvent);
                    await this.delay(200);
                    
                    // Touch events for mobile compatibility
                    const touchStart = new TouchEvent('touchstart', { bubbles: true });
                    const touchEnd = new TouchEvent('touchend', { bubbles: true });
                    sendButton.dispatchEvent(touchStart);
                    sendButton.dispatchEvent(touchEnd);
                    
                } catch (clickError) {
                    console.log(`Click attempt ${i + 1} error:`, clickError);
                }
            }
            
            return { success: true };
        }

        // Method 2: Enhanced Enter key simulation
        console.log('Send button not found, trying enhanced Enter key...');
        
        input.focus();
        await this.delay(200);
        
        const enterEvents = [
            new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }),
            new KeyboardEvent('keypress', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }),
            new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            })
        ];

        for (let i = 0; i < enterEvents.length; i++) {
            input.dispatchEvent(enterEvents[i]);
            await this.delay(100);
        }
        
        return { success: true };
    }

    async findSendButtonEnhanced() {
        const selectors = [
            'button[data-tab="11"]',
            'button[data-testid="send"]',
            'button[aria-label*="Send"]',
            'button[aria-label*="send"]',
            'span[data-icon="send"]',
            '[data-icon="send"]',
            'button._ak1r',
            'footer button:last-child',
            'button[type="submit"]'
        ];

        // Try multiple times to find send button
        for (let attempt = 0; attempt < 5; attempt++) {
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                
                for (const element of elements) {
                    let button = element;
                    
                    if (element.tagName !== 'BUTTON') {
                        button = element.closest('button');
                    }
                    
                    if (button && 
                        !button.disabled && 
                        button.offsetParent !== null &&
                        !button.closest('[aria-hidden="true"]')) {
                        
                        const rect = button.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            return button;
                        }
                    }
                }
            }
            
            if (attempt < 4) {
                await this.delay(500);
            }
        }

        return null;
    }

    async verifyMessageSentEnhanced() {
        console.log('Enhanced message verification...');
        
        // Wait for UI to update
        await this.delay(2000);
        
        // Check 1: Input should be cleared
        const input = await this.findMessageInputEnhanced();
        const inputCleared = !input || input.textContent.trim() === '' || input.innerHTML.trim() === '';
        
        // Check 2: Look for outgoing message indicators
        const messageSelectors = [
            '.message-out',
            '._22Msk',
            '[data-testid="msg-container"]',
            '.tail-container.tail-container-out',
            '.copyable-text[data-pre-plain-text]'
        ];
        
        let hasOutgoingMessages = false;
        for (const selector of messageSelectors) {
            if (document.querySelectorAll(selector).length > 0) {
                hasOutgoingMessages = true;
                break;
            }
        }
        
        // Check 3: Look for message status indicators
        const statusSelectors = [
            '[data-icon="msg-check"]',
            '[data-icon="msg-dblcheck"]',
            '[data-icon="msg-time"]',
            '[data-icon="status-v3-unread"]'
        ];
        
        let hasStatusIcon = false;
        for (const selector of statusSelectors) {
            if (document.querySelector(selector)) {
                hasStatusIcon = true;
                break;
            }
        }
        
        // Check 4: Look for recently sent messages (more thorough)
        const allMessages = document.querySelectorAll('[data-testid="conversation-panel-messages"] > div');
        const recentMessages = Array.from(allMessages).slice(-3); // Check last 3 messages
        
        let hasRecentOutgoing = false;
        for (const msg of recentMessages) {
            if (msg.querySelector('.message-out') || 
                msg.querySelector('._22Msk') ||
                msg.classList.contains('message-out') ||
                msg.querySelector('[data-testid="tail-out"]')) {
                hasRecentOutgoing = true;
                break;
            }
        }
        
        console.log('Enhanced verification results:', {
            inputCleared,
            hasOutgoingMessages,
            hasStatusIcon,
            hasRecentOutgoing,
            messageCount: allMessages.length
        });
        
        // Message is considered sent if input is cleared AND we have evidence of outgoing messages
        const isVerified = inputCleared && (hasOutgoingMessages || hasRecentOutgoing || hasStatusIcon);
        
        return isVerified;
    }

    verifyMessageInInput(input, expectedMessage) {
        const currentText = input.textContent.trim();
        const expected = expectedMessage.trim();
        const matches = currentText === expected || currentText.includes(expected);
        
        console.log('Input verification:', {
            expected: expected.substring(0, 50) + '...',
            current: currentText.substring(0, 50) + '...',
            matches
        });
        
        return matches;
    }

    triggerInputEvents(element) {
        const events = [
            new Event('focus', { bubbles: true }),
            new Event('input', { bubbles: true }),
            new Event('change', { bubbles: true }),
            new InputEvent('input', { 
                bubbles: true, 
                cancelable: true,
                inputType: 'insertText'
            }),
            new KeyboardEvent('keyup', { 
                bubbles: true,
                key: 'a',
                code: 'KeyA'
            }),
            new Event('blur', { bubbles: true }),
            new Event('focus', { bubbles: true })
        ];

        events.forEach(event => {
            try {
                element.dispatchEvent(event);
            } catch (e) {
                // Ignore event dispatch errors
            }
        });
    }

    reportStatus(success, message) {
        console.log(`Reporting status: ${success ? 'SUCCESS' : 'FAILED'} - ${message}`);
        
        chrome.runtime.sendMessage({
            type: success ? 'MESSAGE_SENT' : 'MESSAGE_FAILED',
            data: {
                success,
                message,
                url: window.location.href,
                timestamp: Date.now()
            }
        }).catch(error => {
            console.error('Failed to report status:', error);
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Auto-initialize when the script loads
console.log('Enhanced WhatsApp Content Script Loaded');

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new WhatsAppMessageSender();
    });
} else {
    new WhatsAppMessageSender();
}

// Enhanced navigation listener
let currentURL = window.location.href;
const observer = new MutationObserver(() => {
    if (window.location.href !== currentURL) {
        currentURL = window.location.href;
        if (currentURL.includes('web.whatsapp.com/send')) {
            console.log('Navigation to send URL detected - initializing enhanced sender');
            setTimeout(() => new WhatsAppMessageSender(), 1500);
        }
    }
});

observer.observe(document, { subtree: true, childList: true });