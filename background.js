class BulkSendManager {
    constructor() {
        this.isProcessing = false;
        this.currentProcess = null;
        this.stats = { sent: 0, failed: 0, total: 0 };
        this.setupMessageListener();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep the message channel open for async responses
        });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'START_BULK_SEND':
                    await this.startBulkSend(message.data, sendResponse);
                    break;
                case 'STOP_BULK_SEND':
                    this.stopBulkSend(sendResponse);
                    break;
                case 'MESSAGE_STATUS':
                    this.handleMessageStatus(message.data);
                    break;
                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async startBulkSend(data, sendResponse) {
        if (this.isProcessing) {
            sendResponse({ success: false, error: 'Already processing' });
            return;
        }

        try {
            // Check if WhatsApp is open
            const whatsappTabs = await chrome.tabs.query({
                url: 'https://web.whatsapp.com/*'
            });

            if (whatsappTabs.length === 0) {
                // Open WhatsApp Web
                await chrome.tabs.create({
                    url: 'https://web.whatsapp.com',
                    active: true
                });
                await this.delay(5000); // Increased wait time for WhatsApp to load
            }

            this.isProcessing = true;
            this.stats = { sent: 0, failed: 0, total: data.phoneNumbers.length };
            
            sendResponse({ success: true });
            
            // Start processing
            this.currentProcess = this.processNumbers(data);
            await this.currentProcess;

        } catch (error) {
            console.error('Error starting bulk send:', error);
            sendResponse({ success: false, error: error.message });
            this.isProcessing = false;
        }
    }

    stopBulkSend(sendResponse) {
        this.isProcessing = false;
        if (this.currentProcess) {
            this.currentProcess = null;
        }
        sendResponse({ success: true });
        this.notifyPopup('SEND_COMPLETE', this.stats);
    }

    async processNumbers(data) {
        const { phoneNumbers, message, delay } = data;

        for (let i = 0; i < phoneNumbers.length && this.isProcessing; i++) {
            const phoneNumber = phoneNumbers[i];
            
            try {
                console.log(`Processing ${i + 1}/${phoneNumbers.length}: ${phoneNumber}`);
                
                const success = await this.sendMessageEnhanced(phoneNumber, message);
                
                if (success) {
                    this.stats.sent++;
                } else {
                    this.stats.failed++;
                }

                // Update progress
                this.notifyPopup('SEND_PROGRESS', {
                    sent: this.stats.sent,
                    failed: this.stats.failed,
                    current: i + 1,
                    total: phoneNumbers.length,
                    currentNumber: phoneNumber
                });

                // Wait between messages (except for the last one)
                if (i < phoneNumbers.length - 1 && this.isProcessing) {
                    await this.delay(delay);
                }

            } catch (error) {
                console.error(`Error sending to ${phoneNumber}:`, error);
                this.stats.failed++;
            }
        }

        this.isProcessing = false;
        this.notifyPopup('SEND_COMPLETE', this.stats);
        
        // Show completion notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2325D366"><circle cx="12" cy="12" r="10"/><path fill="white" d="m9 12 2 2 4-4"/></svg>',
            title: 'WhatsApp Bulk Sender',
            message: `Process complete! Sent: ${this.stats.sent}, Failed: ${this.stats.failed}`
        });
    }

    async sendMessageEnhanced(phoneNumber, message) {
        return new Promise(async (resolve) => {
            let tabId = null;
            let messageListener = null;
            let timeout = null;
            let checkInterval = null;
            
            try {
                const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
                const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`;
                
                console.log(`Creating enhanced tab for ${cleanNumber}...`);
                
                // Create new tab
                const tab = await chrome.tabs.create({
                    url: whatsappUrl,
                    active: false
                });
                
                tabId = tab.id;
                console.log(`Enhanced tab created with ID: ${tabId}`);

                // Enhanced timeout - increased to 90 seconds
                timeout = setTimeout(() => {
                    console.log(`Enhanced timeout reached for tab ${tabId}`);
                    cleanup();
                    resolve(false);
                }, 90000);

                // Enhanced message listener with better status tracking
                messageListener = (msg, sender) => {
                    if (sender.tab?.id === tabId) {
                        console.log(`Enhanced: Received message from tab ${tabId}:`, msg.type);
                        
                        if (msg.type === 'MESSAGE_SENT') {
                            console.log(`Enhanced: Message sent successfully for tab ${tabId}`);
                            cleanup();
                            resolve(true);
                        } else if (msg.type === 'MESSAGE_FAILED') {
                            console.log(`Enhanced: Message failed for tab ${tabId}`);
                            cleanup();
                            resolve(false);
                        }
                    }
                };

                chrome.runtime.onMessage.addListener(messageListener);
                
                // Enhanced tab status checking
                let tabCheckAttempts = 0;
                const maxTabCheckAttempts = 45; // Check for 45 seconds
                
                checkInterval = setInterval(async () => {
                    tabCheckAttempts++;
                    
                    try {
                        // Check if tab still exists and is not loading
                        const tabInfo = await chrome.tabs.get(tabId);
                        console.log(`Enhanced tab check ${tabCheckAttempts}: status=${tabInfo.status}, url=${tabInfo.url}`);
                        
                        // If tab has navigated away from send URL, it might indicate completion
                        if (tabInfo.url && !tabInfo.url.includes('/send?') && tabInfo.url.includes('web.whatsapp.com')) {
                            console.log(`Enhanced: Tab navigated away from send URL, considering as potential success`);
                            // Give it more time to complete the send process
                            setTimeout(() => {
                                if (messageListener) { // Only resolve if we haven't already
                                    console.log(`Enhanced: Assuming success after navigation`);
                                    cleanup();
                                    resolve(true);
                                }
                            }, 8000);
                        }
                        
                        // Check for too many attempts
                        if (tabCheckAttempts >= maxTabCheckAttempts) {
                            console.log(`Enhanced: Tab check timeout after ${tabCheckAttempts} attempts`);
                            cleanup();
                            resolve(false);
                        }
                        
                    } catch (tabError) {
                        console.log(`Enhanced: Tab ${tabId} no longer exists or error:`, tabError.message);
                        // Tab might have been closed, which could indicate completion
                        cleanup();
                        resolve(false);
                    }
                }, 2000); // Check every 2 seconds
                
                // Function to clean up resources
                const cleanup = () => {
                    if (timeout) {
                        clearTimeout(timeout);
                        timeout = null;
                    }
                    
                    if (checkInterval) {
                        clearInterval(checkInterval);
                        checkInterval = null;
                    }
                    
                    if (messageListener) {
                        chrome.runtime.onMessage.removeListener(messageListener);
                        messageListener = null;
                    }
                    
                    if (tabId) {
                        // Increased delay before closing tab to ensure message is fully processed
                        setTimeout(() => {
                            chrome.tabs.remove(tabId).catch((error) => {
                                console.log(`Enhanced: Tab ${tabId} already closed or error:`, error.message);
                            });
                        }, 8000); // Increased delay to 8 seconds
                    }
                };

            } catch (error) {
                console.error('Enhanced error in sendMessage:', error);
                
                // Clean up on error
                if (timeout) clearTimeout(timeout);
                if (checkInterval) clearInterval(checkInterval);
                if (messageListener) chrome.runtime.onMessage.removeListener(messageListener);
                if (tabId) {
                    setTimeout(() => {
                        chrome.tabs.remove(tabId).catch(() => {});
                    }, 2000);
                }
                
                resolve(false);
            }
        });
    }

    // Legacy method for backward compatibility
    async sendMessage(phoneNumber, message) {
        return this.sendMessageEnhanced(phoneNumber, message);
    }

    handleMessageStatus(data) {
        // This is called when content script reports message status
        console.log('Enhanced message status:', data);
    }

    notifyPopup(type, data) {
        // Send message to popup if it's open
        chrome.runtime.sendMessage({ type, data }).catch(() => {
            // Popup might be closed, which is fine
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the enhanced manager
const bulkSendManager = new BulkSendManager();

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('Enhanced WhatsApp Bulk Sender started');
});

chrome.runtime.onInstalled.addListener(() => {
    console.log('Enhanced WhatsApp Bulk Sender installed');
});