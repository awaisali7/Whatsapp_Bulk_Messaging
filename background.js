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
                await this.delay(3000); // Wait for WhatsApp to load
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
                
                const success = await this.sendMessage(phoneNumber, message);
                
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

    async sendMessage(phoneNumber, message) {
        return new Promise(async (resolve) => {
            try {
                const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
                const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`;
                
                // Create new tab
                const tab = await chrome.tabs.create({
                    url: whatsappUrl,
                    active: false
                });

                // Set up timeout
                const timeout = setTimeout(() => {
                    chrome.tabs.remove(tab.id).catch(() => {});
                    resolve(false);
                }, 30000); // 30 second timeout

                // Listen for message status
                const messageListener = (msg, sender) => {
                    if (sender.tab?.id === tab.id) {
                        clearTimeout(timeout);
                        chrome.runtime.onMessage.removeListener(messageListener);
                        
                        // Close tab after a short delay
                        setTimeout(() => {
                            chrome.tabs.remove(tab.id).catch(() => {});
                        }, 2000);
                        
                        resolve(msg.type === 'MESSAGE_SENT');
                    }
                };

                chrome.runtime.onMessage.addListener(messageListener);

            } catch (error) {
                console.error('Error in sendMessage:', error);
                resolve(false);
            }
        });
    }

    handleMessageStatus(data) {
        // This is called when content script reports message status
        console.log('Message status:', data);
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

// Initialize the manager
const bulkSendManager = new BulkSendManager();

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('WhatsApp Bulk Sender started');
});

chrome.runtime.onInstalled.addListener(() => {
    console.log('WhatsApp Bulk Sender installed');
});