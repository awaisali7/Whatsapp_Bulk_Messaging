class WhatsAppMessageSender {
    constructor() {
        this.maxRetries = 15;
        this.retryDelay = 2000;
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

            // Wait for WhatsApp to fully load
            await this.waitForWhatsAppLoad();
            
            // Attempt to send the message
            const success = await this.attemptSendMessage(decodeURIComponent(message));
            
            this.reportStatus(success, success ? 'Message sent successfully' : 'Failed to send message');

        } catch (error) {
            console.error('Error in handleSendURL:', error);
            this.reportStatus(false, error.message);
        }
    }

    async waitForWhatsAppLoad() {
        console.log('Waiting for WhatsApp to load...');
        
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 30;
            
            const checkLoad = () => {
                attempts++;
                
                // Check for various loading indicators
                const isLoading = document.querySelector('[data-icon="logo"]') ||
                                document.querySelector('._2dqk0') ||
                                document.querySelector('.landing-wrapper') ||
                                document.querySelector('[data-icon="laptop"]');
                
                const hasChat = document.querySelector('[data-tab="10"]') ||
                              document.querySelector('footer') ||
                              document.querySelector('[role="textbox"]') ||
                              document.querySelector('div[contenteditable="true"]');
                
                const hasError = document.querySelector('[data-icon="alert-phone"]') ||
                               document.querySelector('._2dqk0._3sdhb') ||
                               window.location.href.includes('unsupported');

                console.log(`Load check ${attempts}: loading=${!!isLoading}, hasChat=${!!hasChat}, hasError=${!!hasError}`);

                if (hasError) {
                    reject(new Error('WhatsApp error detected - invalid number or blocked'));
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

            // Start checking after initial delay
            setTimeout(checkLoad, 2000);
        });
    }

    async attemptSendMessage(message) {
        console.log('Starting message send attempts...');
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`Send attempt ${attempt}/${this.maxRetries}`);
                
                if (await this.trySendMessage(message)) {
                    console.log('Message sent successfully!');
                    return true;
                }
                
                if (attempt < this.maxRetries) {
                    console.log(`Attempt ${attempt} failed, waiting ${this.retryDelay}ms before retry...`);
                    await this.delay(this.retryDelay);
                }
                
            } catch (error) {
                console.error(`Attempt ${attempt} error:`, error);
                if (attempt === this.maxRetries) {
                    throw error;
                }
            }
        }
        
        console.log('All send attempts failed');
        return false;
    }

    async trySendMessage(message) {
        // Step 1: Find the message input
        const messageInput = this.findMessageInput();
        if (!messageInput) {
            console.log('Message input not found');
            return false;
        }

        console.log('Found message input:', messageInput);

        // Step 2: Focus and clear the input
        messageInput.focus();
        await this.delay(100);

        // Step 3: Insert the message using multiple methods
        await this.insertMessage(messageInput, message);

        // Step 4: Wait a moment for the message to be processed
        await this.delay(500);

        // Step 5: Send the message
        const sent = await this.sendMessage(messageInput);
        
        if (sent) {
            // Step 6: Verify the message was sent
            await this.delay(2000);
            return this.verifyMessageSent();
        }

        return false;
    }

    findMessageInput() {
        const selectors = [
            'div[contenteditable="true"][data-tab="10"]',
            'div[contenteditable="true"][title*="message"]',
            'div[contenteditable="true"][title*="Message"]',
            'div[contenteditable="true"].selectable-text',
            'div[contenteditable="true"]._ak1l',
            'div[contenteditable="true"]',
            '[role="textbox"]',
            'footer div[contenteditable="true"]'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.isContentEditable) {
                return element;
            }
        }

        return null;
    }

    async insertMessage(input, message) {
        console.log('Inserting message...');

        // Method 1: Direct text content (most reliable)
        input.textContent = message;
        this.triggerInputEvents(input);
        await this.delay(100);

        // Method 2: innerHTML with proper span structure
        if (input.textContent !== message) {
            input.innerHTML = `<span data-lexical-text="true">${this.escapeHtml(message)}</span>`;
            this.triggerInputEvents(input);
            await this.delay(100);
        }

        // Method 3: execCommand if available
        if (document.execCommand && input.textContent !== message) {
            input.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, message);
            await this.delay(100);
        }

        // Method 4: Simulate typing (last resort)
        if (input.textContent !== message) {
            await this.simulateTyping(input, message);
        }

        console.log('Message inserted, current content:', input.textContent);
    }

    async simulateTyping(input, message) {
        console.log('Simulating typing...');
        input.textContent = '';
        
        for (let i = 0; i < message.length; i++) {
            input.textContent += message[i];
            this.triggerInputEvents(input);
            await this.delay(10);
        }
    }

    triggerInputEvents(element) {
        const events = [
            new Event('focus', { bubbles: true }),
            new Event('input', { bubbles: true }),
            new Event('change', { bubbles: true }),
            new KeyboardEvent('keyup', { bubbles: true })
        ];

        events.forEach(event => {
            try {
                element.dispatchEvent(event);
            } catch (e) {
                // Ignore event dispatch errors
            }
        });
    }

    async sendMessage(input) {
        console.log('Attempting to send message...');

        // Method 1: Find and click send button
        const sendButton = this.findSendButton();
        if (sendButton && !sendButton.disabled) {
            console.log('Found send button, clicking...');
            sendButton.click();
            await this.delay(100);
            
            // Try multiple click events
            sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            return true;
        }

        // Method 2: Enter key simulation
        console.log('Send button not found, trying Enter key...');
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

        enterEvents.forEach(event => input.dispatchEvent(event));
        return true;
    }

    findSendButton() {
        const selectors = [
            'button[data-tab="11"]',
            'button[aria-label*="Send"]',
            'button[aria-label*="send"]',
            'span[data-icon="send"]',
            'button._ak1r',
            'footer button:last-child'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                // If it's a span, find the parent button
                return element.tagName === 'BUTTON' ? element : element.closest('button');
            }
        }

        // Fallback: find button with send icon
        const sendIcons = document.querySelectorAll('[data-icon="send"], [data-testid="send"]');
        for (const icon of sendIcons) {
            const button = icon.closest('button');
            if (button) return button;
        }

        return null;
    }

    verifyMessageSent() {
        // Check if message input is cleared (indicates successful send)
        const input = this.findMessageInput();
        const isEmpty = !input || input.textContent.trim() === '' || input.innerHTML.trim() === '';
        
        // Check for message status indicators
        const statusIndicators = document.querySelectorAll(
            '[data-icon="msg-check"], [data-icon="msg-dblcheck"], [data-icon="msg-time"], .message-out'
        );
        
        const hasStatus = statusIndicators.length > 0;
        
        console.log('Verification: isEmpty =', isEmpty, ', hasStatus =', hasStatus);
        return isEmpty || hasStatus;
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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Auto-initialize when the script loads
console.log('WhatsApp Content Script Loaded');

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new WhatsAppMessageSender();
    });
} else {
    new WhatsAppMessageSender();
}

// Also listen for navigation changes (SPA behavior)
let currentURL = window.location.href;
const observer = new MutationObserver(() => {
    if (window.location.href !== currentURL) {
        currentURL = window.location.href;
        if (currentURL.includes('web.whatsapp.com/send')) {
            console.log('Navigation to send URL detected');
            setTimeout(() => new WhatsAppMessageSender(), 1000);
        }
    }
});

observer.observe(document, { subtree: true, childList: true });